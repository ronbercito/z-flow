import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
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

export async function registerReportRoutes(app: FastifyInstance) {
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
