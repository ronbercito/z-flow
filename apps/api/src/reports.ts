import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { db } from "./db.js";
import { canReadBranch, requireAuth } from "./auth.js";

const reportQuery = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const branchParams = z.object({
  branchId: z.coerce.number().int().positive()
});

const receiptParams = z.object({
  branchId: z.coerce.number().int().positive(),
  operationId: z.coerce.number().int().positive()
});

const closureParams = z.object({
  branchId: z.coerce.number().int().positive(),
  closureId: z.coerce.number().int().positive()
});

const closureBoletaBody = z.object({
  customerDocumentType: z.enum(["1", "6"]),
  customerDocumentNumber: z.string().trim().regex(/^\d{8}$|^\d{11}$/),
  customerName: z.string().trim().min(2).max(140),
  customerAddress: z.string().trim().max(255).optional().default("")
});

type ReportFilters = z.infer<typeof reportQuery>;

function money(value: unknown) {
  const n = Number(value ?? 0);
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function pen(value: unknown) {
  return `S/ ${money(value).toFixed(2)}`;
}

function buildConditions(filters: ReportFilters, forcedBranchId?: number) {
  const conditions = ["o.status = 'COMPLETED'"];
  const params: unknown[] = [];
  const branchId = forcedBranchId ?? filters.branchId;

  if (branchId) {
    conditions.push("o.branch_id = ?");
    params.push(branchId);
  }
  if (filters.from) {
    conditions.push("DATE(o.created_at) >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push("DATE(o.created_at) <= ?");
    params.push(filters.to);
  }

  return { where: `WHERE ${conditions.join(" AND ")}`, params };
}

async function fetchReport(filters: ReportFilters, forcedBranchId?: number) {
  const { where, params } = buildConditions(filters, forcedBranchId);

  const [operations] = await db.query<any[]>(`
    SELECT o.id, o.operation_type, o.reference_code, o.customer_name,
           o.amount, o.commission, o.staff_share_amount, o.partner_share_amount,
           o.net_amount, DATE_FORMAT(o.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
           b.id AS branch_id, b.code AS branch_code, b.name AS branch_name,
           u.full_name AS registered_by,
           r.series, r.sequence_number
    FROM operations o
    JOIN branches b ON b.id = o.branch_id
    LEFT JOIN users u ON u.id = o.user_id
    LEFT JOIN receipts r ON r.operation_id = o.id
    ${where}
    ORDER BY o.created_at DESC
    LIMIT 5000
  `, params);

  const [summaryRows] = await db.query<any[]>(`
    SELECT
      COUNT(*) AS operation_count,
      COALESCE(SUM(o.amount),0) AS amount_total,
      COALESCE(SUM(o.commission),0) AS commission_total,
      COALESCE(SUM(o.staff_share_amount),0) AS staff_share_total,
      COALESCE(SUM(o.partner_share_amount),0) AS partner_share_total,
      SUM(CASE WHEN o.operation_type='YAPE_TO_CASH' THEN 1 ELSE 0 END) AS yape_to_cash_count,
      SUM(CASE WHEN o.operation_type='CASH_TO_YAPE' THEN 1 ELSE 0 END) AS cash_to_yape_count
    FROM operations o
    ${where}
  `, params);

  const [branchRows] = await db.query<any[]>(`
    SELECT b.id, b.code, b.name,
           COUNT(*) AS operation_count,
           COALESCE(SUM(o.amount),0) AS amount_total,
           COALESCE(SUM(o.commission),0) AS commission_total,
           COALESCE(SUM(o.staff_share_amount),0) AS staff_share_total,
           COALESCE(SUM(o.partner_share_amount),0) AS partner_share_total
    FROM operations o
    JOIN branches b ON b.id = o.branch_id
    ${where}
    GROUP BY b.id, b.code, b.name
    ORDER BY amount_total DESC
  `, params);

  const comparisonFilter = forcedBranchId
    ? { where, params }
    : buildConditions({ ...filters, branchId: undefined });
  const [branchComparisonRows] = await db.query<any[]>(`
    SELECT b.id, b.code, b.name,
           COUNT(*) AS operation_count,
           COALESCE(SUM(o.amount),0) AS amount_total,
           COALESCE(SUM(o.commission),0) AS commission_total,
           COALESCE(SUM(o.staff_share_amount),0) AS staff_share_total,
           COALESCE(SUM(o.partner_share_amount),0) AS partner_share_total
    FROM operations o
    JOIN branches b ON b.id = o.branch_id
    ${comparisonFilter.where}
    GROUP BY b.id, b.code, b.name
    ORDER BY amount_total DESC
  `, comparisonFilter.params);

  const [brandingRows] = await db.query<any[]>("SELECT business_name FROM system_settings WHERE id=1 LIMIT 1");
  const businessName = String(brandingRows[0]?.business_name ?? "Z-FLOW");
  const summary = summaryRows[0] ?? {};
  const commissionTotal = money(summary.commission_total);
  const staffShareTotal = money(summary.staff_share_total);
  const partnerShareTotal = money(summary.partner_share_total);

  return {
    businessName,
    filters: {
      branchId: forcedBranchId ?? filters.branchId,
      from: filters.from,
      to: filters.to
    },
    summary: {
      operationCount: Number(summary.operation_count ?? 0),
      amountTotal: money(summary.amount_total),
      commissionTotal,
      staffShareTotal,
      partnerShareTotal,
      unassignedCommission: money(Math.max(0, commissionTotal - staffShareTotal - partnerShareTotal)),
      yapeToCashCount: Number(summary.yape_to_cash_count ?? 0),
      cashToYapeCount: Number(summary.cash_to_yape_count ?? 0)
    },
    branches: branchRows.map((row) => ({
      id: Number(row.id),
      code: row.code,
      name: row.name,
      operationCount: Number(row.operation_count ?? 0),
      amountTotal: money(row.amount_total),
      commissionTotal: money(row.commission_total),
      staffShareTotal: money(row.staff_share_total),
      partnerShareTotal: money(row.partner_share_total)
    })),
    branchComparison: branchComparisonRows.map((row) => ({
      id: Number(row.id),
      code: row.code,
      name: row.name,
      operationCount: Number(row.operation_count ?? 0),
      amountTotal: money(row.amount_total),
      commissionTotal: money(row.commission_total),
      staffShareTotal: money(row.staff_share_total),
      partnerShareTotal: money(row.partner_share_total)
    })),
    operations
  };
}

function dateLabel(filters: ReportFilters) {
  if (filters.from && filters.to) return `${filters.from} a ${filters.to}`;
  if (filters.from) return `Desde ${filters.from}`;
  if (filters.to) return `Hasta ${filters.to}`;
  return "Todo el historial";
}

async function excelBuffer(report: Awaited<ReturnType<typeof fetchReport>>, title: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = report.businessName;
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Resumen");
  summary.addRow([report.businessName + " · " + title]);
  summary.addRow(["Periodo", dateLabel(report.filters)]);
  summary.addRow([]);
  summary.addRow(["Indicador", "Valor"]);
  summary.addRow(["Operaciones", report.summary.operationCount]);
  summary.addRow(["Monto movilizado", report.summary.amountTotal]);
  summary.addRow(["Ganancia del encargado", report.summary.commissionTotal]);
  summary.addRow(["Yape → Efectivo", report.summary.yapeToCashCount]);
  summary.addRow(["Efectivo → Yape", report.summary.cashToYapeCount]);
  summary.columns = [{ width: 28 }, { width: 20 }];
  summary.getRow(1).font = { bold: true, size: 16 };
  summary.getRow(4).font = { bold: true };

  const branches = workbook.addWorksheet("Filiales");
  branches.columns = [
    { header: "Filial", key: "name", width: 24 },
    { header: "Código", key: "code", width: 12 },
    { header: "Operaciones", key: "operationCount", width: 14 },
    { header: "Monto", key: "amountTotal", width: 16 },
    { header: "Ganancia encargado", key: "commissionTotal", width: 20 }
  ];
  report.branches.forEach((row) => branches.addRow(row));
  branches.getRow(1).font = { bold: true };
  ["D","E"].forEach((col) => { branches.getColumn(col).numFmt = '"S/" #,##0.00'; });

  const operations = workbook.addWorksheet("Operaciones");
  operations.columns = [
    { header: "Fecha / hora", key: "created_at", width: 22 },
    { header: "Filial", key: "branch_name", width: 22 },
    { header: "N.º operación", key: "operation_id", width: 14 },
    { header: "Referencia Yape", key: "reference_code", width: 20 },
    { header: "Concepto", key: "operation_type", width: 20 },
    { header: "Cliente", key: "customer_name", width: 22 },
    { header: "Entrada (Yape / efectivo)", key: "entry_amount", width: 22 },
    { header: "Salida (efectivo / Yape)", key: "exit_amount", width: 22 },
    { header: "Comisión / ingreso real", key: "commission", width: 20 },
    { header: "Comprobante interno", key: "receipt", width: 22 }
  ];
  report.operations.forEach((row: any) => operations.addRow({
    ...row,
    operation_id: row.id,
    operation_type: row.operation_type === "YAPE_TO_CASH" ? "Yape → Efectivo" : "Efectivo → Yape",
    entry_amount: row.amount,
    exit_amount: row.net_amount,
    receipt: row.series && row.sequence_number ? `${row.series}-${String(row.sequence_number).padStart(6,"0")}` : ""
  }));
  operations.getRow(1).font = { bold: true };
  ["G","H","I"].forEach((col) => { operations.getColumn(col).numFmt = '"S/" #,##0.00'; });

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}

function pdfBuffer(report: Awaited<ReturnType<typeof fetchReport>>, title: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 38 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text(report.businessName, { continued: true }).fontSize(11).text(`  ·  ${title}`);
    doc.moveDown(0.4);
    doc.fontSize(9).fillColor("#667085").text(`Periodo: ${dateLabel(report.filters)}`);
    doc.fillColor("#111827");
    doc.moveDown();

    const cards = [
      ["Operaciones", String(report.summary.operationCount)],
      ["Monto movilizado", pen(report.summary.amountTotal)],
      ["Ganancia encargados", pen(report.summary.commissionTotal)]
    ];
    cards.forEach(([label, value]) => {
      doc.fontSize(9).fillColor("#667085").text(`${label}: `, { continued: true });
      doc.fillColor("#111827").font("Helvetica-Bold").text(value);
      doc.font("Helvetica");
    });

    doc.moveDown();
    doc.font("Helvetica-Bold").fontSize(11).text("Resumen por filial");
    doc.font("Helvetica").moveDown(0.4);
    report.branches.forEach((row) => {
      doc.fontSize(8).text(
        `${row.name}  ·  ${row.operationCount} ops  ·  Monto ${pen(row.amountTotal)}  ·  Ganancia encargado ${pen(row.commissionTotal)}`
      );
      doc.moveDown(0.25);
    });

    doc.moveDown();
    doc.font("Helvetica-Bold").fontSize(11).text("Operaciones");
    doc.font("Helvetica").moveDown(0.4);
    report.operations.slice(0, 250).forEach((row: any) => {
      const receipt = row.series && row.sequence_number ? `${row.series}-${String(row.sequence_number).padStart(6,"0")}` : "—";
      doc.fontSize(7.5).text(
        `${row.created_at} · Op. ${row.id} · ${row.branch_name} · ${row.operation_type === "YAPE_TO_CASH" ? "Yape → Efectivo" : "Efectivo → Yape"} · ${row.customer_name ?? "Sin nombre"} · Entrada ${pen(row.amount)} · Entrega ${pen(row.net_amount)} · Comisión ${pen(row.commission)} · Comprobante interno ${receipt}`
      );
      doc.moveDown(0.15);
    });

    if (report.operations.length > 250) {
      doc.moveDown().fontSize(8).fillColor("#667085").text(
        `El PDF muestra las primeras 250 operaciones. El Excel contiene las ${report.operations.length} operaciones del periodo.`
      );
    }

    doc.end();
  });
}

async function requireOwner(request: FastifyRequest, reply: FastifyReply) {
  const auth = await requireAuth(request, reply);
  if (!auth) return null;
  if (auth.roleCode !== "OWNER") {
    reply.code(403).send({ error: "Esta función requiere acceso de propietario" });
    return null;
  }
  return auth;
}

function contentDisposition(filename: string) {
  return `attachment; filename="${filename}"`;
}

type ElectronicArtifactFormat = "pdf" | "xml";

function electronicDocumentPaths(branchId: number, closureId: number, series: string, correlativo: number | string) {
  const safeSeries = series.toUpperCase().replace(/[^A-Z0-9_-]/g, "") || "BOLETA";
  const number = String(correlativo).padStart(6, "0");
  const folder = join(
    process.env.ZFLOW_BACKUP_DIR || "/backups",
    "boletas-electronicas",
    `filial-${branchId}`,
    `cierre-${closureId}`
  );
  const stem = `${safeSeries}-${number}`;
  return {
    folder,
    relativeFolder: join("boletas-electronicas", `filial-${branchId}`, `cierre-${closureId}`),
    pdf: join(folder, `${stem}.pdf`),
    xml: join(folder, `${stem}.xml`),
    cdr: join(folder, `${stem}.cdr.zip`)
  };
}

function isExpectedArtifact(data: Buffer, format: ElectronicArtifactFormat) {
  if (format === "pdf") return data.subarray(0, 5).toString("ascii") === "%PDF-";
  return data.toString("utf8").replace(/^\uFEFF/, "").trimStart().startsWith("<");
}

function extractBase64Artifact(value: unknown, format: ElectronicArtifactFormat): Buffer | null {
  const candidates: string[] = [];
  const visit = (item: unknown, key = "") => {
    if (typeof item === "string" && /(base64|content|archivo|documento|pdf|xml|data)/i.test(key)) candidates.push(item);
    else if (item && typeof item === "object") {
      for (const [childKey, child] of Object.entries(item as Record<string, unknown>)) visit(child, childKey);
    }
  };
  visit(value);
  for (const candidate of candidates) {
    const encoded = candidate.replace(/^data:[^;]+;base64,/i, "").trim();
    if (!encoded || encoded.length % 4 === 1) continue;
    const decoded = Buffer.from(encoded, "base64");
    if (isExpectedArtifact(decoded, format)) return decoded;
  }
  return null;
}

async function fetchAndStoreFactilizaArtifact(
  baseUrl: string,
  token: string,
  issuerRuc: string,
  branchId: number,
  closureId: number,
  series: string,
  correlativo: number | string,
  format: ElectronicArtifactFormat
) {
  const paths = electronicDocumentPaths(branchId, closureId, series, correlativo);
  await mkdir(paths.folder, { recursive: true });
  const response = await fetch(`${baseUrl}/invoice/${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ empresa_Ruc: issuerRuc, tipo_Doc: "03", serie: series, correlativo: String(correlativo) }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) return false;
  const data = Buffer.from(await response.arrayBuffer());
  let artifact = isExpectedArtifact(data, format) ? data : null;
  if (!artifact) {
    try { artifact = extractBase64Artifact(JSON.parse(data.toString("utf8")), format); } catch { artifact = null; }
  }
  if (!artifact) return false;
  await writeFile(paths[format], artifact);
  return true;
}

async function storedElectronicFiles(branchId: number, closureId: number, series: string, correlativo: number | string) {
  const paths = electronicDocumentPaths(branchId, closureId, series, correlativo);
  const exists = async (filePath: string) => {
    try { await access(filePath); return true; } catch { return false; }
  };
  const [pdf, xml, cdr] = await Promise.all([exists(paths.pdf), exists(paths.xml), exists(paths.cdr)]);
  return { pdf, xml, cdr, folder: paths.relativeFolder };
}

export async function registerReportRoutes(app: FastifyInstance) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS factiliza_documents (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      branch_id BIGINT UNSIGNED NOT NULL,
      closure_id BIGINT UNSIGNED NOT NULL,
      series VARCHAR(20) NOT NULL,
      correlativo BIGINT UNSIGNED NOT NULL,
      customer_document_type VARCHAR(2) NOT NULL,
      customer_document_number VARCHAR(20) NOT NULL,
      customer_name VARCHAR(140) NOT NULL,
      customer_address VARCHAR(255) NULL,
      amount DECIMAL(14,2) NOT NULL,
      status ENUM('PENDING','ACCEPTED','REJECTED','UNKNOWN') NOT NULL,
      provider_document_id VARCHAR(80) NULL,
      provider_code VARCHAR(40) NULL,
      provider_message VARCHAR(500) NULL,
      created_by_user_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_factiliza_closure (closure_id),
      UNIQUE KEY uq_factiliza_series_number (series, correlativo),
      KEY idx_factiliza_branch (branch_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS factiliza_document_sequences (
      series VARCHAR(20) NOT NULL,
      next_number BIGINT UNSIGNED NOT NULL DEFAULT 1,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (series)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  app.get("/api/admin/factiliza/status", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;
    const [settings] = await db.query<any[]>(
      "SELECT ruc FROM system_settings WHERE id=1 LIMIT 1"
    );
    return {
      provider: "Factiliza",
      documentType: "BOLETA",
      endpointMode: process.env.FACTILIZA_API_BASE_URL?.includes("qa") ? "PRUEBAS" : "CONFIGURADO",
      hasToken: Boolean(process.env.FACTILIZA_API_TOKEN?.trim()),
      hasRuc: Boolean(String(settings[0]?.ruc ?? "").trim()),
      hasSeries: Boolean(process.env.FACTILIZA_BOLETA_SERIES?.trim()),
      rusActivityConfirmed: process.env.FACTILIZA_RUS_ACTIVITY_CONFIRMED === "true"
    };
  });

  app.get("/api/branches/:branchId/closures/:closureId/electronic-document", async (request, reply) => {
    const parsed = closureParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Cierre inválido" });
    const auth = await requireOwner(request, reply);
    if (!auth) return;
    if (!canReadBranch(auth, parsed.data.branchId)) return reply.code(403).send({ error: "Acceso denegado" });

    const [rows] = await db.query<any[]>(
      `SELECT id, status, series, correlativo, customer_document_type,
              customer_document_number, customer_name, amount, provider_document_id,
              provider_code, provider_message, created_at
       FROM factiliza_documents WHERE closure_id=? AND branch_id=? LIMIT 1`,
      [parsed.data.closureId, parsed.data.branchId]
    );
    const document = rows[0] ?? null;
    const storedFiles = document?.status === "ACCEPTED"
      ? await storedElectronicFiles(parsed.data.branchId, parsed.data.closureId, document.series, document.correlativo)
      : null;
    return { document: document ? { ...document, storedFiles } : null };
  });

  app.post("/api/branches/:branchId/closures/:closureId/electronic-document", async (request, reply) => {
    const parsedParams = closureParams.safeParse(request.params);
    const parsedBody = closureBoletaBody.safeParse(request.body);
    if (!parsedParams.success || !parsedBody.success) return reply.code(400).send({ error: "Datos de boleta inválidos" });

    const auth = await requireOwner(request, reply);
    if (!auth) return;
    if (!canReadBranch(auth, parsedParams.data.branchId)) return reply.code(403).send({ error: "Acceso denegado" });

    const token = process.env.FACTILIZA_API_TOKEN?.trim();
    const baseUrl = (process.env.FACTILIZA_API_BASE_URL || "https://apife-qa.factiliza.com/api/v1").replace(/\/$/, "");
    const series = process.env.FACTILIZA_BOLETA_SERIES?.trim().toUpperCase();
    const [settingsRows] = await db.query<any[]>(
      "SELECT ruc FROM system_settings WHERE id=1 LIMIT 1"
    );
    const issuerRuc = String(settingsRows[0]?.ruc ?? "").replace(/\D/g, "");
    if (!token || !series || issuerRuc.length !== 11) {
      return reply.code(503).send({ error: "Completa el token, la serie de boleta y el RUC emisor en la configuración segura del servidor." });
    }
    if (process.env.FACTILIZA_RUS_ACTIVITY_CONFIRMED !== "true") {
      return reply.code(409).send({ error: "Confirma con tu contador que la actividad registrada del emisor es compatible con el Nuevo RUS antes de emitir." });
    }

    const customer = parsedBody.data;
    if (
      (customer.customerDocumentType === "1" && customer.customerDocumentNumber.length !== 8)
      || (customer.customerDocumentType === "6" && customer.customerDocumentNumber.length !== 11)
    ) return reply.code(422).send({ error: "El número no coincide con el tipo de documento elegido." });

    const connection = await db.getConnection();
    let documentId = 0;
    let correlativo = 0;
    let amount = 0;
    try {
      await connection.beginTransaction();
      const [closureRows] = await connection.execute<any[]>(
        `SELECT dc.id, dc.commission_total, dc.branch_id,
                DATE_FORMAT(dc.closed_at, '%d/%m/%Y') AS closed_date, b.name AS branch_name
         FROM daily_closures dc JOIN branches b ON b.id=dc.branch_id
         WHERE dc.id=? AND dc.branch_id=? LIMIT 1 FOR UPDATE`,
        [parsedParams.data.closureId, parsedParams.data.branchId]
      );
      if (!closureRows.length) {
        await connection.rollback();
        return reply.code(404).send({ error: "Cierre no encontrado." });
      }
      const closure = closureRows[0];
      amount = money(closure.commission_total);
      if (amount <= 0) {
        await connection.rollback();
        return reply.code(422).send({ error: "Este cierre no tiene comisión para emitir una boleta." });
      }

      const [existingRows] = await connection.execute<any[]>(
        "SELECT id, status, provider_document_id FROM factiliza_documents WHERE closure_id=? LIMIT 1 FOR UPDATE",
        [parsedParams.data.closureId]
      );
      if (existingRows.length) {
        await connection.rollback();
        return reply.code(409).send({
          error: "Ya existe un intento de emisión para este cierre. No se volverá a enviar para evitar duplicados.",
          document: existingRows[0]
        });
      }

      await connection.execute(
        "INSERT IGNORE INTO factiliza_document_sequences (series, next_number) VALUES (?, 1)",
        [series]
      );
      const [sequenceRows] = await connection.execute<any[]>(
        "SELECT next_number FROM factiliza_document_sequences WHERE series=? FOR UPDATE",
        [series]
      );
      correlativo = Number(sequenceRows[0]?.next_number ?? 1);
      await connection.execute(
        "UPDATE factiliza_document_sequences SET next_number=? WHERE series=?",
        [correlativo + 1, series]
      );

      const [insertResult] = await connection.execute<any>(
        `INSERT INTO factiliza_documents
         (branch_id, closure_id, series, correlativo, customer_document_type,
          customer_document_number, customer_name, customer_address, amount,
          status, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
        [
          parsedParams.data.branchId, parsedParams.data.closureId, series, correlativo,
          customer.customerDocumentType, customer.customerDocumentNumber,
          customer.customerName, customer.customerAddress || null, amount, auth.userId
        ]
      );
      documentId = Number(insertResult.insertId);
      await connection.commit();
    } catch (error: any) {
      await connection.rollback();
      if (error?.code === "ER_DUP_ENTRY") {
        return reply.code(409).send({ error: "Este cierre ya tiene un comprobante asociado." });
      }
      throw error;
    } finally {
      connection.release();
    }

    const now = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().replace("Z", "-05:00");
    const number = String(correlativo).padStart(6, "0");
    const invoicePayload = {
      tipo_Operacion: "0101",
      tipo_Doc: "03",
      serie: series,
      correlativo: String(correlativo),
      tipo_Moneda: "PEN",
      fecha_Emision: now,
      empresa_Ruc: issuerRuc,
      cliente_Tipo_Doc: customer.customerDocumentType,
      cliente_Num_Doc: customer.customerDocumentNumber,
      cliente_Razon_Social: customer.customerName,
      cliente_Direccion: customer.customerAddress || "",
      monto_Igv: 0,
      total_Impuestos: 0,
      valor_Venta: amount,
      monto_Oper_Gravadas: 0,
      monto_Oper_Exoneradas: amount,
      sub_Total: amount,
      monto_Imp_Venta: amount,
      estado_Documento: "0",
      manual: false,
      id_Base_Dato: `zflow-closure-${parsedParams.data.branchId}-${parsedParams.data.closureId}`,
      detalle: [{
        unidad: "NIU",
        cantidad: 1,
        cod_Producto: "COMISION_CIERRE",
        descripcion: "Comisión generada por las operaciones del turno del " + closure.closed_date + ", filial " + closure.branch_name + " · cierre #" + parsedParams.data.closureId,
        monto_Valor_Unitario: amount,
        monto_Base_Igv: amount,
        porcentaje_Igv: 0,
        igv: 0,
        tip_Afe_Igv: "20",
        total_Impuestos: 0,
        monto_Precio_Unitario: amount,
        monto_Valor_Venta: amount,
        factor_Icbper: 0
      }],
      forma_pago: [{ tipo: "Contado", monto: amount, cuota: 0, fecha_Pago: now }],
      legend: [{ legend_Code: "1000", legend_Value: `SON ${amount.toFixed(2)} SOLES` }]
    };

    try {
      const response = await fetch(`${baseUrl}/invoice/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(invoicePayload),
        signal: AbortSignal.timeout(30000)
      });
      const result: any = await response.json().catch(() => ({}));
      const cdr = result?.data?.sunatResponse?.cdrResponse ?? {};
      const accepted = response.ok && result?.success === true && String(cdr.code) === "0";
      const status = accepted ? "ACCEPTED" : "REJECTED";
      const providerMessage = String(cdr.description ?? result?.message ?? "Factiliza no aceptó la boleta.").slice(0, 500);
      await db.execute(
        `UPDATE factiliza_documents SET status=?, provider_document_id=?, provider_code=?, provider_message=?
         WHERE id=?`,
        [status, cdr.id ?? null, cdr.code == null ? null : String(cdr.code), providerMessage, documentId]
      );
      if (!accepted) {
        return reply.code(response.ok ? 422 : 502).send({ error: providerMessage, document: { id: documentId, status, series, correlativo: number } });
      }

      const paths = electronicDocumentPaths(parsedParams.data.branchId, parsedParams.data.closureId, series, correlativo);
      let cdrSaved = false;
      try {
        await mkdir(paths.folder, { recursive: true });
        const cdrZip = result?.data?.cdrZip;
        if (typeof cdrZip === "string" && cdrZip.trim()) {
          const encoded = cdrZip.replace(/^data:application\\/zip;base64,/i, "").trim();
          const cdrBuffer = Buffer.from(encoded, "base64");
          if (cdrBuffer.length) {
            await writeFile(paths.cdr, cdrBuffer);
            cdrSaved = true;
          }
        }
      } catch {
        cdrSaved = false;
      }
      const [pdfSaved, xmlSaved] = await Promise.all([
        fetchAndStoreFactilizaArtifact(baseUrl, token, issuerRuc, parsedParams.data.branchId, parsedParams.data.closureId, series, correlativo, "pdf").catch(() => false),
        fetchAndStoreFactilizaArtifact(baseUrl, token, issuerRuc, parsedParams.data.branchId, parsedParams.data.closureId, series, correlativo, "xml").catch(() => false)
      ]);
      const storedFiles = await storedElectronicFiles(parsedParams.data.branchId, parsedParams.data.closureId, series, correlativo);
      return reply.code(201).send({
        document: {
          id: documentId,
          status,
          series,
          correlativo: number,
          provider_document_id: cdr.id ?? `${series}-${number}`,
          provider_code: String(cdr.code),
          provider_message: providerMessage,
          storedFiles: { ...storedFiles, pdf: pdfSaved || storedFiles.pdf, xml: xmlSaved || storedFiles.xml, cdr: cdrSaved || storedFiles.cdr }
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se recibió respuesta de Factiliza.";
      await db.execute(
        "UPDATE factiliza_documents SET status='UNKNOWN', provider_message=? WHERE id=?",
        [`Estado incierto; no reintentar sin consultar a Factiliza. ${message}`.slice(0, 500), documentId]
      );
      return reply.code(502).send({ error: "La respuesta de Factiliza no llegó. El intento quedó bloqueado para evitar una boleta duplicada; consulta su estado antes de actuar." });
    }
  });

  app.get("/api/branches/:branchId/closures/:closureId/electronic-document/:format", async (request, reply) => {
    const parsed = closureParams.extend({ format: z.enum(["pdf", "xml"]) }).safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Comprobante inválido" });
    const auth = await requireOwner(request, reply);
    if (!auth) return;
    if (!canReadBranch(auth, parsed.data.branchId)) return reply.code(403).send({ error: "Acceso denegado" });
    const token = process.env.FACTILIZA_API_TOKEN?.trim();
    if (!token) return reply.code(503).send({ error: "Factiliza no está configurada en el servidor." });

    const [settingsRows] = await db.query<any[]>("SELECT ruc FROM system_settings WHERE id=1 LIMIT 1");
    const issuerRuc = String(settingsRows[0]?.ruc ?? "").replace(/\D/g, "");
    const [rows] = await db.query<any[]>(
      `SELECT series, correlativo, status FROM factiliza_documents
       WHERE branch_id=? AND closure_id=? LIMIT 1`,
      [parsed.data.branchId, parsed.data.closureId]
    );
    if (!rows.length || rows[0].status !== "ACCEPTED") return reply.code(409).send({ error: "No hay una boleta aceptada para descargar." });

    const baseUrl = (process.env.FACTILIZA_API_BASE_URL || "https://apife-qa.factiliza.com/api/v1").replace(/\/$/, "");
    try {
      const response = await fetch(`${baseUrl}/invoice/${parsed.data.format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ empresa_Ruc: issuerRuc, tipo_Doc: "03", serie: rows[0].series, correlativo: String(rows[0].correlativo) }),
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) return reply.code(502).send({ error: `Factiliza no pudo generar el archivo ${parsed.data.format.toUpperCase()}.` });
      const data = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") || (parsed.data.format === "pdf" ? "application/pdf" : "application/xml");
      reply.header("Content-Type", contentType);
      reply.header("Content-Disposition", `attachment; filename="boleta-${rows[0].series}-${String(rows[0].correlativo).padStart(6,"0")}.${parsed.data.format}"`);
      return reply.send(data);
    } catch {
      return reply.code(502).send({ error: "No se pudo descargar el documento desde Factiliza." });
    }
  });


  app.get("/api/admin/reports/summary", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;
    const parsed = reportQuery.safeParse(request.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Filtros inválidos" });
    return fetchReport(parsed.data);
  });

  app.get("/api/admin/reports/export.xlsx", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;
    const parsed = reportQuery.safeParse(request.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Filtros inválidos" });
    const report = await fetchReport(parsed.data);
    const buffer = await excelBuffer(report, "Reporte consolidado");
    reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    reply.header("Content-Disposition", contentDisposition("z-flow-reporte.xlsx"));
    return reply.send(buffer);
  });

  app.get("/api/admin/reports/export.pdf", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;
    const parsed = reportQuery.safeParse(request.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Filtros inválidos" });
    const report = await fetchReport(parsed.data);
    const buffer = await pdfBuffer(report, "Reporte consolidado");
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", contentDisposition("z-flow-reporte.pdf"));
    return reply.send(buffer);
  });

  app.get("/api/branches/:branchId/reports/summary", async (request, reply) => {
    const parsedParams = branchParams.safeParse(request.params);
    const parsedQuery = reportQuery.safeParse(request.query ?? {});
    if (!parsedParams.success || !parsedQuery.success) return reply.code(400).send({ error: "Filtros inválidos" });

    const auth = await requireAuth(request, reply);
    if (!auth) return;
    if (!canReadBranch(auth, parsedParams.data.branchId)) return reply.code(403).send({ error: "Acceso denegado" });

    return fetchReport(parsedQuery.data, parsedParams.data.branchId);
  });

  app.get("/api/branches/:branchId/reports/export.xlsx", async (request, reply) => {
    const parsedParams = branchParams.safeParse(request.params);
    const parsedQuery = reportQuery.safeParse(request.query ?? {});
    if (!parsedParams.success || !parsedQuery.success) return reply.code(400).send({ error: "Filtros inválidos" });

    const auth = await requireAuth(request, reply);
    if (!auth) return;
    if (!canReadBranch(auth, parsedParams.data.branchId)) return reply.code(403).send({ error: "Acceso denegado" });

    const report = await fetchReport(parsedQuery.data, parsedParams.data.branchId);
    const buffer = await excelBuffer(report, "Reporte de filial");
    reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    reply.header("Content-Disposition", contentDisposition("z-flow-filial.xlsx"));
    return reply.send(buffer);
  });

  app.get("/api/branches/:branchId/reports/export.pdf", async (request, reply) => {
    const parsedParams = branchParams.safeParse(request.params);
    const parsedQuery = reportQuery.safeParse(request.query ?? {});
    if (!parsedParams.success || !parsedQuery.success) return reply.code(400).send({ error: "Filtros inválidos" });

    const auth = await requireAuth(request, reply);
    if (!auth) return;
    if (!canReadBranch(auth, parsedParams.data.branchId)) return reply.code(403).send({ error: "Acceso denegado" });

    const report = await fetchReport(parsedQuery.data, parsedParams.data.branchId);
    const buffer = await pdfBuffer(report, "Reporte de filial");
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", contentDisposition("z-flow-filial.pdf"));
    return reply.send(buffer);
  });

  app.get("/api/branches/:branchId/closures/:closureId/detail", async (request, reply) => {
    const parsed = closureParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Cierre inválido" });

    const auth = await requireAuth(request, reply);
    if (!auth) return;
    if (!canReadBranch(auth, parsed.data.branchId)) return reply.code(403).send({ error: "Acceso denegado" });

    const [closureRows] = await db.query<any[]>(`
      SELECT dc.id, dc.cash_session_id, dc.operation_count, dc.commission_total,
             dc.expected_cash, dc.declared_cash, dc.expected_wallet, dc.declared_wallet,
             dc.difference_cash, dc.difference_wallet, dc.notes, dc.closed_at,
             b.name AS branch_name, u.full_name AS closed_by
      FROM daily_closures dc
      JOIN branches b ON b.id=dc.branch_id
      LEFT JOIN users u ON u.id=dc.closed_by_user_id
      WHERE dc.id=? AND dc.branch_id=?
      LIMIT 1
    `, [parsed.data.closureId, parsed.data.branchId]);

    if (!closureRows.length) return reply.code(404).send({ error: "Cierre no encontrado" });
    const closure = closureRows[0];

    const [operationRows] = await db.query<any[]>(`
      SELECT o.id, o.operation_type, o.reference_code, o.customer_name,
             o.amount, o.commission, o.net_amount, o.status, o.notes,
             o.created_at, u.full_name AS registered_by,
             r.series AS receipt_series, r.sequence_number AS receipt_number,
             oe.action AS latest_event_action, oe.reason AS latest_event_reason,
             oe.created_at AS latest_event_at
      FROM operations o
      LEFT JOIN users u ON u.id=o.user_id
      LEFT JOIN receipts r ON r.operation_id=o.id
      LEFT JOIN operation_events oe ON oe.id=(
        SELECT MAX(event.id) FROM operation_events event WHERE event.operation_id=o.id
      )
      WHERE o.branch_id=? AND o.cash_session_id=?
      ORDER BY o.created_at ASC, o.id ASC
    `, [parsed.data.branchId, closure.cash_session_id]);

    return { closure, operations: operationRows };
  });

  app.get("/api/branches/:branchId/closures/:closureId/pdf", async (request, reply) => {
    const parsed = closureParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Cierre inválido" });

    const auth = await requireAuth(request, reply);
    if (!auth) return;
    if (!canReadBranch(auth, parsed.data.branchId)) return reply.code(403).send({ error: "Acceso denegado" });

    const [rows] = await db.query<any[]>(`
      SELECT dc.id, dc.operation_count, dc.commission_total,
             dc.staff_share_total, dc.partner_share_total,
             dc.expected_cash, dc.declared_cash, dc.expected_wallet,
             dc.declared_wallet, dc.difference_cash, dc.difference_wallet,
             dc.notes, DATE_FORMAT(dc.closed_at, '%d/%m/%Y %H:%i') AS closed_at,
             b.code AS branch_code, b.name AS branch_name, b.address AS branch_address,
             u.full_name AS closed_by,
             DATE_FORMAT(cs.started_at, '%d/%m/%Y %H:%i') AS started_at
      FROM daily_closures dc
      JOIN branches b ON b.id=dc.branch_id
      JOIN cash_sessions cs ON cs.id=dc.cash_session_id
      LEFT JOIN users u ON u.id=dc.closed_by_user_id
      WHERE dc.id=? AND dc.branch_id=?
      LIMIT 1
    `, [parsed.data.closureId, parsed.data.branchId]);

    if (!rows.length) return reply.code(404).send({ error: "Cierre no encontrado" });
    const row = rows[0];

    const [settingRows] = await db.query<any[]>(`
      SELECT business_name, legal_name, ruc, address, phone, logo_data_url
      FROM system_settings WHERE id=1 LIMIT 1
    `);
    const branding = settingRows[0] ?? {};

    const resultLabel =
      Math.abs(Number(row.difference_cash)) < 0.005 && Math.abs(Number(row.difference_wallet)) < 0.005
        ? "CUADRA"
        : Number(row.difference_cash) < 0 || Number(row.difference_wallet) < 0
          ? (Number(row.difference_cash) > 0 || Number(row.difference_wallet) > 0 ? "DIFERENCIAS MIXTAS" : "FALTANTE")
          : "SOBRANTE";

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margins: { top: 34, bottom: 34, left: 42, right: 42 } });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      if (branding.logo_data_url) {
        try {
          const base64 = String(branding.logo_data_url).split(",")[1] ?? "";
          if (base64) doc.image(Buffer.from(base64, "base64"), 42, 34, { fit: [80, 42] });
        } catch {
          // Continue without logo.
        }
      }

      doc.font("Helvetica-Bold").fontSize(18).text(String(branding.business_name ?? "Z-FLOW"), { align: "right" });
      if (branding.legal_name) doc.font("Helvetica").fontSize(8).text(String(branding.legal_name), { align: "right" });
      if (branding.ruc) doc.fontSize(8).text(`RUC: ${branding.ruc}`, { align: "right" });
      if (branding.phone) doc.fontSize(8).text(`Tel: ${branding.phone}`, { align: "right" });

      doc.moveDown(1.7);
      doc.font("Helvetica-Bold").fontSize(15).fillColor("#172235").text("REPORTE DE CIERRE DIARIO");
      doc.font("Helvetica").fontSize(9).fillColor("#667085")
        .text(`Cierre N.° ${row.id} - ${row.branch_name}`);
      doc.moveDown(0.9);

      const left = 42;
      const width = 511;
      doc.roundedRect(left, doc.y, width, 58, 6).fillAndStroke("#F8FAFC", "#E4E7EC");
      const top = doc.y + 10;
      doc.fillColor("#667085").fontSize(8).text("Turno iniciado", left + 12, top);
      doc.fillColor("#101828").font("Helvetica-Bold").fontSize(9).text(row.started_at ?? "—", left + 12, top + 15);
      doc.fillColor("#667085").font("Helvetica").fontSize(8).text("Cierre", left + 180, top);
      doc.fillColor("#101828").font("Helvetica-Bold").fontSize(9).text(row.closed_at ?? "—", left + 180, top + 15);
      doc.fillColor("#667085").font("Helvetica").fontSize(8).text("Responsable", left + 330, top);
      doc.fillColor("#101828").font("Helvetica-Bold").fontSize(9).text(row.closed_by ?? "—", left + 330, top + 15);
      doc.y += 72;

      doc.font("Helvetica-Bold").fontSize(11).fillColor("#172235").text("Resumen operativo");
      doc.moveDown(0.5);

      const items = [
        ["Operaciones", String(row.operation_count ?? 0)],
        ["Ganancia del encargado", pen(row.commission_total)]
      ];
      const y = doc.y;
      items.forEach(([label, value], index) => {
        const x = left + index * 255;
        doc.roundedRect(x, y, 238, 42, 5).stroke("#E4E7EC");
        doc.fillColor("#667085").font("Helvetica").fontSize(8).text(label, x + 10, y + 8);
        doc.fillColor("#101828").font("Helvetica-Bold").fontSize(12).text(value, x + 10, y + 21);
      });
      doc.y = y + 56;

      doc.font("Helvetica-Bold").fontSize(11).fillColor("#172235").text("Conciliación");
      doc.moveDown(0.5);

      const rowsData = [
        ["Efectivo", pen(row.expected_cash), pen(row.declared_cash), pen(row.difference_cash)],
        ["Yape", pen(row.expected_wallet), pen(row.declared_wallet), pen(row.difference_wallet)]
      ];
      const tx = left;
      const col = [150, 115, 115, 115];
      const headers = ["Concepto", "Esperado", "Declarado", "Diferencia"];
      let tableY = doc.y;
      let x = tx;
      headers.forEach((h, i) => {
        doc.rect(x, tableY, col[i], 24).fillAndStroke("#EEF2F6", "#DDE3EA");
        doc.fillColor("#344054").font("Helvetica-Bold").fontSize(8).text(h, x + 7, tableY + 8);
        x += col[i];
      });
      tableY += 24;
      rowsData.forEach((data) => {
        x = tx;
        data.forEach((value, i) => {
          doc.rect(x, tableY, col[i], 28).stroke("#E4E7EC");
          doc.fillColor("#344054").font(i === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(8.5)
            .text(value, x + 7, tableY + 9);
          x += col[i];
        });
        tableY += 28;
      });
      doc.y = tableY + 16;

      const balanced = resultLabel === "CUADRA";
      doc.roundedRect(left, doc.y, width, 48, 6)
        .fillAndStroke(balanced ? "#ECFDF3" : "#FFF4E5", balanced ? "#ABEFC6" : "#FEC84B");
      doc.fillColor(balanced ? "#067647" : "#B54708").font("Helvetica-Bold").fontSize(11)
        .text(`Resultado: ${resultLabel}`, left + 12, doc.y + 10);
      doc.font("Helvetica").fontSize(8)
        .text(balanced ? "No se registraron diferencias en el cierre." : "El cierre registra diferencias y requiere revisión.", left + 12, doc.y + 27);
      doc.y += 62;

      doc.font("Helvetica-Bold").fontSize(9).fillColor("#344054").text("Observación");
      doc.font("Helvetica").fontSize(8.5).fillColor("#667085")
        .text(row.notes || "Sin observaciones.", { width });

      doc.moveDown(2);
      doc.font("Helvetica").fontSize(7).fillColor("#98A2B3")
        .text(`Documento interno de control de caja generado por ${String(branding.business_name ?? "Z-FLOW")}.`, { align: "center" });

      doc.end();
    });

    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `inline; filename="cierre-${row.branch_code}-${row.id}.pdf"`);
    return reply.send(buffer);
  });

  app.get("/api/branches/:branchId/receipts/:operationId/pdf", async (request, reply) => {
    const parsed = receiptParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Comprobante inválido" });

    const auth = await requireAuth(request, reply);
    if (!auth) return;
    if (!canReadBranch(auth, parsed.data.branchId)) return reply.code(403).send({ error: "Acceso denegado" });

    const [rows] = await db.query<any[]>(`
      SELECT o.id, o.operation_type, o.reference_code, o.customer_name, o.amount,
             o.commission, o.staff_share_amount, o.partner_share_amount, o.net_amount,
             DATE_FORMAT(o.created_at, '%d/%m/%Y %H:%i') AS created_at,
             b.code AS branch_code, b.name AS branch_name, b.address AS branch_address,
             u.full_name AS registered_by,
             r.series, r.sequence_number, r.receipt_type, r.status
      FROM operations o
      JOIN branches b ON b.id = o.branch_id
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN receipts r ON r.operation_id = o.id
      WHERE o.id = ? AND o.branch_id = ?
      LIMIT 1
    `, [parsed.data.operationId, parsed.data.branchId]);

    if (!rows.length) return reply.code(404).send({ error: "Operación no encontrada" });
    const row = rows[0];
    if (!row.series) return reply.code(409).send({ error: "La operación todavía no tiene comprobante interno asignado" });

    const [settingRows] = await db.query<any[]>(`
      SELECT business_name, legal_name, ruc, address, phone, logo_data_url, ticket_footer
      FROM system_settings WHERE id=1 LIMIT 1
    `);
    const branding = settingRows[0] ?? {};

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: [226.77, 500], margins: { top: 18, bottom: 18, left: 16, right: 16 } });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const receiptNo = `${row.series}-${String(row.sequence_number).padStart(6,"0")}`;
      if (branding.logo_data_url) {
        try {
          const base64 = String(branding.logo_data_url).split(",")[1] ?? "";
          if (base64) {
            doc.image(Buffer.from(base64, "base64"), { fit: [70, 40], align: "center" });
            doc.moveDown(0.2);
          }
        } catch {
          // If the stored image is invalid, continue rendering the text-only ticket.
        }
      }
      doc.font("Helvetica-Bold").fontSize(15).text(String(branding.business_name ?? "Z-FLOW"), { align: "center" });
      if (branding.legal_name) doc.font("Helvetica").fontSize(7).text(String(branding.legal_name), { align: "center" });
      if (branding.ruc) doc.fontSize(7).text(`RUC: ${branding.ruc}`, { align: "center" });
      doc.font("Helvetica-Bold").fontSize(9).text(row.branch_name, { align: "center" });
      if (row.branch_address || branding.address) doc.font("Helvetica").fontSize(7).text(String(row.branch_address ?? branding.address), { align: "center" });
      if (branding.phone) doc.fontSize(7).text(`Tel: ${branding.phone}`, { align: "center" });
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").fontSize(8).text("COMPROBANTE INTERNO", { align: "center" });
      doc.font("Helvetica").fontSize(6.8).fillColor("#555555").text("No es comprobante de pago electrónico SUNAT", { align: "center" });
      doc.fillColor("#000000").moveDown(0.7);
      doc.fontSize(7.5).text(`N°: ${receiptNo}`);
      doc.text(`Fecha: ${row.created_at}`);
      doc.text(`Operación: ${row.operation_type === "YAPE_TO_CASH" ? "Yape → Efectivo" : "Efectivo → Yape"}`);
      doc.text(`Referencia: ${row.reference_code ?? "—"}`);
      doc.text(`Cliente: ${row.customer_name ?? "—"}`);
      doc.text(`Registró: ${row.registered_by ?? "—"}`);
      doc.moveDown(0.7);
      doc.font("Helvetica-Bold").fontSize(8).text(`Monto: ${pen(row.amount)}`);
      doc.font("Helvetica").text(`Comisión: ${pen(row.commission)}`);
      doc.font("Helvetica-Bold").fontSize(10).text(`Entregado: ${pen(row.net_amount)}`);
      doc.moveDown(1);
      doc.font("Helvetica").fontSize(6.5).fillColor("#666666")
        .text(String(branding.ticket_footer ?? "Documento interno de control de operación. Conservar para conciliación."), { align: "center" });
      doc.end();
    });

    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `inline; filename="comprobante-${row.series}-${row.sequence_number}.pdf"`);
    return reply.send(buffer);
  });
}
