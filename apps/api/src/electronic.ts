import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { db } from "./db.js";
import { canReadBranch, requireAuth } from "./auth.js";

const APISUNAT_URL = "https://back.apisunat.com";
const seriesSchema = z.string().trim().toUpperCase().regex(/^B[A-Z0-9]{3}$/,
  "La serie de boleta debe iniciar con B y tener 4 caracteres (ej.: B001)");
const ownerParams = z.object({ branchId: z.coerce.number().int().positive() });
const settingsBody = z.object({
  enabled: z.boolean(),
  emissionMode: z.enum(["CLOSURE", "OPERATION"]),
  personaId: z.string().trim().max(80).optional().default(""),
  personaToken: z.string().trim().max(500).optional().default(""),
  series: seriesSchema.default("B001"),
  maxAmountPerReceipt: z.coerce.number().positive().max(999999999).default(500)
});

type EmissionResult = { status: string; message?: string; documentId?: string; series?: string; correlativo?: number; amount?: number; partNumber?: number; partCount?: number };

function encryptionKey() {
  const secret = process.env.ZFLOW_CREDENTIAL_KEY;
  if (!secret || secret.length < 32) throw new Error("Falta ZFLOW_CREDENTIAL_KEY para guardar credenciales de forma cifrada.");
  return createHash("sha256").update(secret).digest();
}

function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}

function decryptSecret(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("La credencial cifrada no tiene un formato válido.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
}

function money(value: unknown) {
  const amount = Number(value ?? 0);
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function localDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function localTime(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date);
}

function documentBody(input: {
  ruc: string; issuer: string; address?: string | null; series: string; number: string; date: string; time: string;
  amount: number; description: string; customerName?: string | null; customerDocumentType?: string | null;
  customerDocumentNumber?: string | null;
}) {
  const customerNumber = input.customerDocumentNumber?.trim() ?? "";
  const customerName = input.customerName?.trim() || "CLIENTES VARIOS";
  const party: Record<string, unknown> = {
    // ApiSunat expects this UBL node even when SUNAT does not require buyer identification.
    // Keep cbc:ID empty for consumidor final; do not invent a DNI or document type.
    "cac:PartyIdentification": { "cbc:ID": customerNumber ? {
      "_attributes": { schemeID: input.customerDocumentType === "RUC" ? "6" : input.customerDocumentType === "CE" ? "4" : input.customerDocumentType === "PASSPORT" ? "7" : "1" },
      "_text": customerNumber
    } : { "_attributes": {}, "_text": "" } },
    "cac:PartyLegalEntity": { "cbc:RegistrationName": { "_text": customerName } }
  };
  const amount = money(input.amount);
  return {
    "cbc:UBLVersionID": { "_text": "2.1" },
    "cbc:CustomizationID": { "_text": "2.0" },
    "cbc:ID": { "_attributes": {}, "_text": `${input.series ?? "B001"}-${input.number}` },
    "cbc:IssueDate": { "_text": input.date },
    "cbc:IssueTime": { "_text": input.time },
    "cbc:InvoiceTypeCode": { "_attributes": { listID: "0113" }, "_text": "03" },
    "cbc:Note": [{ "_text": `COMISION POR SERVICIO: ${input.description}`, "_attributes": { languageLocaleID: "1000" } }],
    "cbc:DocumentCurrencyCode": { "_text": "PEN" },
    "cac:AccountingSupplierParty": { "cac:Party": {
      "cac:PartyIdentification": { "cbc:ID": { "_attributes": { schemeID: "6" }, "_text": input.ruc } },
      "cac:PartyLegalEntity": { "cbc:RegistrationName": { "_text": input.issuer }, "cac:RegistrationAddress": {
        "cbc:AddressTypeCode": { "_text": "0000" }, ...(input.address ? { "cbc:Line": { "_text": input.address } } : {})
      } }
    } },
    "cac:AccountingCustomerParty": { "cac:Party": party },
    "cac:TaxTotal": { "cbc:TaxAmount": { "_attributes": { currencyID: "PEN" }, "_text": 0 }, "cac:TaxSubtotal": [{
      "cbc:TaxableAmount": { "_attributes": { currencyID: "PEN" }, "_text": amount },
      "cbc:TaxAmount": { "_attributes": { currencyID: "PEN" }, "_text": 0 },
      "cac:TaxCategory": { "cac:TaxScheme": { "cbc:ID": { "_attributes": {}, "_text": "1000" }, "cbc:Name": { "_text": "IGV" }, "cbc:TaxTypeCode": { "_text": "VAT" } } }
    }] },
    "cac:LegalMonetaryTotal": {
      "cbc:LineExtensionAmount": { "_attributes": { currencyID: "PEN" }, "_text": amount },
      "cbc:TaxInclusiveAmount": { "_attributes": { currencyID: "PEN" }, "_text": amount },
      "cbc:PayableAmount": { "_attributes": { currencyID: "PEN" }, "_text": amount }
    },
    "cac:InvoiceLine": [{
      "cbc:ID": { "_attributes": {}, "_text": 1 }, "cbc:InvoicedQuantity": { "_attributes": { unitCode: "ZZ" }, "_text": 1 },
      "cbc:LineExtensionAmount": { "_attributes": { currencyID: "PEN" }, "_text": amount },
      "cac:PricingReference": { "cac:AlternativeConditionPrice": {
        "cbc:PriceAmount": { "_attributes": { currencyID: "PEN" }, "_text": amount }, "cbc:PriceTypeCode": { "_text": "01" }
      } },
      "cac:TaxTotal": { "cbc:TaxAmount": { "_attributes": { currencyID: "PEN" }, "_text": 0 }, "cac:TaxSubtotal": [{
        "cbc:TaxableAmount": { "_attributes": { currencyID: "PEN" }, "_text": amount },
        "cbc:TaxAmount": { "_attributes": { currencyID: "PEN" }, "_text": 0 },
        "cac:TaxCategory": { "cbc:Percent": { "_text": 0 }, "cbc:TaxExemptionReasonCode": { "_text": "10" },
          "cac:TaxScheme": { "cbc:ID": { "_attributes": {}, "_text": "1000" }, "cbc:Name": { "_text": "IGV" }, "cbc:TaxTypeCode": { "_text": "VAT" } } }
      }] },
      "cac:Item": { "cbc:Description": { "_text": input.description } },
      "cac:Price": { "cbc:PriceAmount": { "_attributes": { currencyID: "PEN" }, "_text": amount } }
    }]
  };
}

export async function ensureElectronicSchema() {
  await db.query(`CREATE TABLE IF NOT EXISTS branch_electronic_settings (
    branch_id BIGINT UNSIGNED NOT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 0,
    emission_mode ENUM('CLOSURE','OPERATION') NOT NULL DEFAULT 'CLOSURE',
    persona_id VARCHAR(80) NULL,
    persona_token_cipher TEXT NULL,
    series VARCHAR(4) NOT NULL DEFAULT 'B001',
    max_amount_per_receipt DECIMAL(14,2) NOT NULL DEFAULT 500.00,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (branch_id),
    CONSTRAINT fk_branch_electronic_settings_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.query(`CREATE TABLE IF NOT EXISTS electronic_documents (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    branch_id BIGINT UNSIGNED NOT NULL,
    closure_id BIGINT UNSIGNED NULL,
    operation_id BIGINT UNSIGNED NULL,
    series VARCHAR(4) NOT NULL,
    correlativo BIGINT UNSIGNED NULL,
    part_number INT UNSIGNED NOT NULL DEFAULT 1,
    part_count INT UNSIGNED NOT NULL DEFAULT 1,
    customer_document_type VARCHAR(8) NULL,
    customer_document_number VARCHAR(20) NULL,
    customer_name VARCHAR(140) NOT NULL,
    description VARCHAR(250) NOT NULL DEFAULT 'Comision por servicio',
    amount DECIMAL(14,2) NOT NULL,
    status ENUM('QUEUED','PENDING','ACCEPTED','REJECTED','EXCEPTION','ERROR','UNKNOWN') NOT NULL DEFAULT 'PENDING',
    provider_document_id VARCHAR(80) NULL,
    provider_code VARCHAR(40) NULL,
    provider_message VARCHAR(1000) NULL,
    file_name VARCHAR(100) NOT NULL,
    created_by_user_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_electronic_closure_part (closure_id,part_number),
    UNIQUE KEY uq_electronic_operation_part (operation_id,part_number),
    UNIQUE KEY uq_electronic_branch_number (branch_id, series, correlativo),
    KEY idx_electronic_branch_created (branch_id, created_at),
    CONSTRAINT fk_electronic_document_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [settingsColumns] = await db.query<any[]>("SHOW COLUMNS FROM branch_electronic_settings");
  if (!settingsColumns.some((column) => column.Field === "max_amount_per_receipt")) {
    await db.query("ALTER TABLE branch_electronic_settings ADD COLUMN max_amount_per_receipt DECIMAL(14,2) NOT NULL DEFAULT 500.00 AFTER series");
  }
  const [documentColumns] = await db.query<any[]>("SHOW COLUMNS FROM electronic_documents");
  if (!documentColumns.some((column) => column.Field === "part_number")) await db.query("ALTER TABLE electronic_documents ADD COLUMN part_number INT UNSIGNED NOT NULL DEFAULT 1 AFTER correlativo");
  if (!documentColumns.some((column) => column.Field === "part_count")) await db.query("ALTER TABLE electronic_documents ADD COLUMN part_count INT UNSIGNED NOT NULL DEFAULT 1 AFTER part_number");
  if (!documentColumns.some((column) => column.Field === "description")) await db.query("ALTER TABLE electronic_documents ADD COLUMN description VARCHAR(250) NOT NULL DEFAULT 'Comision por servicio' AFTER customer_name");
  if (documentColumns.some((column) => column.Field === "correlativo" && String(column.Null) !== "YES")) await db.query("ALTER TABLE electronic_documents MODIFY correlativo BIGINT UNSIGNED NULL");
  const statusColumn = documentColumns.find((column) => column.Field === "status");
  if (statusColumn && !String(statusColumn.Type).includes("QUEUED")) {
    await db.query("ALTER TABLE electronic_documents MODIFY status ENUM('QUEUED','PENDING','ACCEPTED','REJECTED','EXCEPTION','ERROR','UNKNOWN') NOT NULL DEFAULT 'PENDING'");
  }
  const [indexes] = await db.query<any[]>("SHOW INDEX FROM electronic_documents");
  const indexNames = new Set(indexes.map((index) => String(index.Key_name)));
  if (indexNames.has("uq_electronic_closure")) await db.query("ALTER TABLE electronic_documents DROP INDEX uq_electronic_closure");
  if (indexNames.has("uq_electronic_operation")) await db.query("ALTER TABLE electronic_documents DROP INDEX uq_electronic_operation");
  if (!indexNames.has("uq_electronic_closure_part")) await db.query("ALTER TABLE electronic_documents ADD UNIQUE KEY uq_electronic_closure_part (closure_id,part_number)");
  if (!indexNames.has("uq_electronic_operation_part")) await db.query("ALTER TABLE electronic_documents ADD UNIQUE KEY uq_electronic_operation_part (operation_id,part_number)");
}

async function apiJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
  const raw = await response.text();
  let data: any;
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error("ApiSunat respondió con un formato inesperado."); }
  if (!response.ok) throw new Error(String(data?.error?.message ?? data?.message ?? `ApiSunat respondió ${response.status}.`).slice(0, 700));
  return data;
}

async function getCredentials(branchId: number) {
  const [rows] = await db.query<any[]>(`SELECT s.enabled,s.emission_mode,s.persona_id,s.persona_token_cipher,s.series,
      bbs.business_name,bbs.legal_name,bbs.ruc,bbs.address
    FROM branch_electronic_settings s
    JOIN branch_business_settings bbs ON bbs.branch_id=s.branch_id
    WHERE s.branch_id=? LIMIT 1`, [branchId]);
  if (!rows.length) return { error: "Falta configurar ApiSunat para esta filial." };
  const row = rows[0];
  if (!row.enabled) return { error: "La emisión electrónica está desactivada para esta filial." };
  if (!row.persona_id || !row.persona_token_cipher) return { error: "Completa el ID y token de ApiSunat en Integraciones." };
  if (!row.ruc || !/^\d{11}$/.test(String(row.ruc))) return { error: "Completa un RUC de 11 dígitos en Mi Negocio antes de emitir." };
  try {
    const personaToken = decryptSecret(String(row.persona_token_cipher));
    if (!personaToken.startsWith("DEV_")) return { error: "La emisión actual solo admite tokens de Desarrollo de ApiSunat (prefijo DEV_)." };
    return { settings: { ...row, persona_token: personaToken } };
  }
  catch { return { error: "No se pudo descifrar el token. Revisa la clave de seguridad de Z-FLOW." }; }
}

const issueLocks = new Map<number, Promise<unknown>>();
async function withBranchIssueLock<T>(branchId: number, work: () => Promise<T>): Promise<T> {
  const previous = issueLocks.get(branchId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  issueLocks.set(branchId, queued);
  await previous;
  try { return await work(); }
  finally { release(); if (issueLocks.get(branchId) === queued) issueLocks.delete(branchId); }
}

async function saveProviderFiles(branchId: number, sourceType: "CLOSURE" | "OPERATION", sourceId: number, series: string, correlativo: number, documentId: string, fileName: string) {
  const sourceFolder = sourceType === "CLOSURE" ? `cierre-${sourceId}` : `operacion-${sourceId}`;
  const baseDir = join(process.env.ZFLOW_BACKUP_DIR || "/backups", "boletas-electronicas", `filial-${branchId}`, sourceFolder);
  await mkdir(baseDir, { recursive: true, mode: 0o700 });
  const pdfUrl = `${APISUNAT_URL}/documents/${encodeURIComponent(documentId)}/getPDF/A4/${encodeURIComponent(fileName)}.pdf`;
  const pdfResponse = await fetch(pdfUrl, { signal: AbortSignal.timeout(30000) });
  if (pdfResponse.ok) await writeFile(join(baseDir, `${series}-${String(correlativo).padStart(8, "0")}.pdf`), Buffer.from(await pdfResponse.arrayBuffer()), { mode: 0o600 });

  const info = await apiJson(`${APISUNAT_URL}/documents/${encodeURIComponent(documentId)}/getById`);
  for (const [key, ext] of [["xml", "xml"], ["cdr", "cdr.zip"]] as const) {
    const url = info?.[key];
    if (typeof url !== "string") continue;
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !(parsed.hostname === "apisunat.com" || parsed.hostname.endsWith(".apisunat.com"))) continue;
    const response = await fetch(parsed, { signal: AbortSignal.timeout(30000) });
    if (response.ok) await writeFile(join(baseDir, `${series}-${String(correlativo).padStart(8, "0")}.${ext}`), Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
  }
}

async function issueDocument(input: {
  branchId: number; sourceType: "CLOSURE" | "OPERATION"; sourceId: number; amount: number; description: string;
  createdBy: number; customerName?: string | null; customerDocumentType?: string | null; customerDocumentNumber?: string | null;
  partNumber?: number; partCount?: number;
}): Promise<EmissionResult> {
  if (money(input.amount) <= 0) return { status: "SKIPPED", message: "No se emitió boleta porque la comisión es S/ 0.00." };
  if (money(input.amount) > 700 && (!input.customerDocumentNumber || !input.customerDocumentType || !input.customerName?.trim())) {
    return { status: "ERROR", message: "Esta boleta supera S/ 700.00. SUNAT exige nombre, tipo y número de documento del cliente." };
  }
  return withBranchIssueLock(input.branchId, async () => {
    const credentials = await getCredentials(input.branchId);
    if (credentials.error) return { status: "ERROR", message: credentials.error };
    const c = credentials.settings!;
    const duplicateField = input.sourceType === "CLOSURE" ? "closure_id" : "operation_id";
    const partNumber = input.partNumber ?? 1;
    const partCount = input.partCount ?? 1;
    const [existing] = await db.query<any[]>(`SELECT id,series,correlativo,status,provider_document_id,provider_message,amount,part_number,part_count FROM electronic_documents WHERE ${duplicateField}=? AND part_number=? LIMIT 1`, [input.sourceId, partNumber]);
    const retryRecordId = existing[0]?.status === "QUEUED" || (existing[0]?.status === "ERROR" && !existing[0]?.provider_document_id) ? Number(existing[0].id) : null;
    if (existing.length && !retryRecordId) return { status: existing[0].status, series: existing[0].series, correlativo: existing[0].correlativo == null ? undefined : Number(existing[0].correlativo), documentId: existing[0].provider_document_id ?? undefined, message: existing[0].provider_message ?? undefined, amount: Number(existing[0].amount), partNumber, partCount: Number(existing[0].part_count) };

    let last: any;
    try {
      last = await apiJson(`${APISUNAT_URL}/personas/lastDocument`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personaId: c.persona_id, personaToken: c.persona_token, type: "03", serie: c.series }) });
    } catch (error) {
      const message = (error instanceof Error ? error.message : "ApiSunat no pudo consultar el correlativo.").slice(0, 900);
      if (retryRecordId) await db.execute("UPDATE electronic_documents SET provider_message=? WHERE id=? AND status IN ('QUEUED','ERROR')", [message, retryRecordId]);
      return { status: "ERROR", message, amount: money(input.amount), partNumber, partCount };
    }
    const next = String(last?.suggestedNumber ?? "").padStart(8, "0");
    if (!/^\d{8}$/.test(next) || Number(next) < 1) {
      const message = "ApiSunat no devolvió un correlativo válido para la serie " + c.series + ".";
      if (retryRecordId) await db.execute("UPDATE electronic_documents SET provider_message=? WHERE id=? AND status IN ('QUEUED','ERROR')", [message, retryRecordId]);
      return { status: "ERROR", message, amount: money(input.amount), partNumber, partCount };
    }
    const number = String(Number(next)).padStart(8, "0");
    const collisionSql = `SELECT id,closure_id,operation_id,status,provider_document_id FROM electronic_documents WHERE branch_id=? AND series=? AND correlativo=?${retryRecordId ? " AND id<>?" : ""} LIMIT 1`;
    const [collisions] = await db.query<any[]>(collisionSql, retryRecordId ? [input.branchId, c.series, Number(number), retryRecordId] : [input.branchId, c.series, Number(number)]);
    if (collisions.length) {
      const collision = collisions[0];
      const earlierSource = collision.operation_id ? `Operación #${collision.operation_id}` : collision.closure_id ? `Cierre #${collision.closure_id}` : "otra boleta";
      const message = `El correlativo ${c.series}-${number} está reservado por ${earlierSource}. Reintenta primero esa boleta.`;
      if (retryRecordId) await db.execute("UPDATE electronic_documents SET provider_message=? WHERE id=? AND status IN ('QUEUED','ERROR')", [message, retryRecordId]);
      return { status: "ERROR", message, series: c.series, amount: money(input.amount), partNumber, partCount };
    }
    const fileName = `${String(c.ruc)}-03-${c.series}-${number}`;
    const date = new Date();
    const body = documentBody({ ruc: String(c.ruc), issuer: String(c.legal_name || c.business_name), address: c.address, series: c.series, number, date: localDate(date), time: localTime(date), amount: money(input.amount), description: input.description, customerName: input.customerName, customerDocumentType: input.customerDocumentType, customerDocumentNumber: input.customerDocumentNumber });
    const payload = { personaId: c.persona_id, personaToken: c.persona_token, fileName, documentBody: body };
    try {
      const response = await apiJson(`${APISUNAT_URL}/personas/v1/sendBill`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const status = response?.status === "PENDIENTE" ? "PENDING" : "ERROR";
      const documentId = typeof response?.documentId === "string" ? response.documentId : null;
      const message = status === "PENDING" ? "Enviada a ApiSunat; esperando validación." : String(response?.error?.message ?? response?.message ?? "ApiSunat no confirmó la emisión.").slice(0, 900);
      if (retryRecordId) {
        await db.execute(`UPDATE electronic_documents SET series=?,correlativo=?,part_count=?,description=?,amount=?,status=?,provider_document_id=?,provider_message=?,file_name=?,created_by_user_id=? WHERE id=? AND status IN ('QUEUED','ERROR')`, [c.series, Number(number), partCount, input.description.slice(0, 250), money(input.amount), status, documentId, message, fileName, input.createdBy, retryRecordId]);
      } else {
        await db.execute(`INSERT INTO electronic_documents (branch_id,closure_id,operation_id,series,correlativo,part_number,part_count,customer_document_type,customer_document_number,customer_name,description,amount,status,provider_document_id,provider_message,file_name,created_by_user_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [input.branchId, input.sourceType === "CLOSURE" ? input.sourceId : null, input.sourceType === "OPERATION" ? input.sourceId : null, c.series, Number(number), partNumber, partCount, input.customerDocumentType ?? null, input.customerDocumentNumber ?? null, input.customerName || "CLIENTES VARIOS", input.description.slice(0, 250), money(input.amount), status, documentId, message, fileName, input.createdBy]);
      }
      if (status === "PENDING" && documentId) void refreshDocument(input.branchId, input.sourceId, input.sourceType, partNumber, documentId, c.series, Number(number), fileName);
      return { status, message, documentId: documentId ?? undefined, series: c.series, correlativo: Number(number), amount: money(input.amount), partNumber, partCount };
    } catch (error) {
      const message = (error instanceof Error ? error.message : "No se pudo conectar con ApiSunat.").slice(0, 900);
      if (retryRecordId) {
        await db.execute(`UPDATE electronic_documents SET series=?,correlativo=?,part_count=?,description=?,amount=?,status='ERROR',provider_message=?,file_name=?,created_by_user_id=? WHERE id=? AND status IN ('QUEUED','ERROR')`, [c.series, Number(number), partCount, input.description.slice(0, 250), money(input.amount), message, fileName, input.createdBy, retryRecordId]);
      } else {
        await db.execute(`INSERT INTO electronic_documents (branch_id,closure_id,operation_id,series,correlativo,part_number,part_count,customer_document_type,customer_document_number,customer_name,description,amount,status,provider_message,file_name,created_by_user_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'ERROR',?,?,?)`, [input.branchId, input.sourceType === "CLOSURE" ? input.sourceId : null, input.sourceType === "OPERATION" ? input.sourceId : null, c.series, Number(number), partNumber, partCount, input.customerDocumentType ?? null, input.customerDocumentNumber ?? null, input.customerName || "CLIENTES VARIOS", input.description.slice(0, 250), money(input.amount), message, fileName, input.createdBy]);
      }
      return { status: "ERROR", message, series: c.series, correlativo: Number(number), amount: money(input.amount), partNumber, partCount };
    }
  });
}

async function refreshDocument(branchId: number, sourceId: number, sourceType: "CLOSURE" | "OPERATION", partNumber: number, documentId: string, series: string, number: number, fileName: string) {
  const key = sourceType === "CLOSURE" ? "closure_id" : "operation_id";
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await new Promise((resolve) => setTimeout(resolve, attempt ? 5000 : 2500));
      const result = await apiJson(`${APISUNAT_URL}/documents/${encodeURIComponent(documentId)}/getById`);
      const status = result.status === "ACEPTADO" ? "ACCEPTED" : result.status === "RECHAZADO" ? "REJECTED" : result.status === "EXCEPCION" ? "EXCEPTION" : "PENDING";
      const message = [...(Array.isArray(result.faults) ? result.faults : []), ...(Array.isArray(result.notes) ? result.notes : [])].map((item: any) => typeof item === "string" ? item : JSON.stringify(item)).join(" · ").slice(0, 900) || (status === "ACCEPTED" ? "Boleta aceptada en el ambiente de ApiSunat." : "Estado informado por ApiSunat: " + status);
      await db.execute(`UPDATE electronic_documents SET status=?,provider_message=? WHERE ${key}=? AND part_number=? AND branch_id=?`, [status, message, sourceId, partNumber, branchId]);
      if (status === "ACCEPTED") {
        try { await saveProviderFiles(branchId, sourceType, sourceId, series, number, documentId, fileName); } catch { /* Keep the accepted record; archive download can be retried from the panel. */ }
        return;
      }
      if (status !== "PENDING") return;
    } catch { /* Retry transient provider responses. */ }
  }
}

export async function issueClosureDocument(branchId: number, closureId: number, createdBy: number, customer?: { name?: string; documentType?: string; documentNumber?: string }): Promise<EmissionResult | null> {
  const [settings] = await db.query<any[]>("SELECT enabled,emission_mode,max_amount_per_receipt,series FROM branch_electronic_settings WHERE branch_id=? LIMIT 1", [branchId]);
  if (!settings.length || !settings[0].enabled || settings[0].emission_mode !== "CLOSURE") return null;
  const [rows] = await db.query<any[]>(`SELECT dc.commission_total,dc.closed_at,dc.branch_id,b.name AS branch_name
    FROM daily_closures dc JOIN branches b ON b.id=dc.branch_id WHERE dc.id=? AND dc.branch_id=? LIMIT 1`, [closureId, branchId]);
  if (!rows.length) return { status: "ERROR", message: "No se encontró el cierre para emitir." };
  const row = rows[0];
  const date = new Date(row.closed_at);
  const dateText = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
  return issueSplitDocuments({ branchId, sourceType: "CLOSURE", sourceId: closureId, amount: Number(row.commission_total), maxAmount: Number(settings[0].max_amount_per_receipt), series: String(settings[0].series), description: `Comisión por cierre de caja del ${dateText}`, createdBy, customerName: customer?.name, customerDocumentType: customer?.documentType, customerDocumentNumber: customer?.documentNumber });
}

export async function issueOperationDocument(branchId: number, operationId: number, createdBy: number, customerDocumentType?: string, customerDocumentNumber?: string): Promise<EmissionResult | null> {
  const [settings] = await db.query<any[]>("SELECT enabled,emission_mode,max_amount_per_receipt,series FROM branch_electronic_settings WHERE branch_id=? LIMIT 1", [branchId]);
  if (!settings.length || !settings[0].enabled || settings[0].emission_mode !== "OPERATION") return null;
  const [rows] = await db.query<any[]>(`SELECT commission,customer_name,created_at FROM operations WHERE id=? AND branch_id=? AND status='COMPLETED' LIMIT 1`, [operationId, branchId]);
  if (!rows.length) return { status: "ERROR", message: "No se encontró la operación para emitir." };
  const row = rows[0];
  const dateText = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(row.created_at));
  return issueSplitDocuments({ branchId, sourceType: "OPERATION", sourceId: operationId, amount: Number(row.commission), maxAmount: Number(settings[0].max_amount_per_receipt), series: String(settings[0].series), description: `Comisión por operación del ${dateText}`, createdBy, customerName: row.customer_name, customerDocumentType, customerDocumentNumber });
}

async function issueSplitDocuments(input: {
  branchId: number; sourceType: "CLOSURE" | "OPERATION"; sourceId: number; amount: number; maxAmount: number; series: string; description: string;
  createdBy: number; customerName?: string | null; customerDocumentType?: string | null; customerDocumentNumber?: string | null;
}): Promise<EmissionResult> {
  const totalCents = Math.round(money(input.amount) * 100);
  const capCents = Math.round(money(input.maxAmount) * 100);
  if (totalCents <= 0) return { status: "SKIPPED", message: "No se emitió boleta porque la comisión es S/ 0.00." };
  if (capCents <= 0) return { status: "ERROR", message: "El tope por boleta debe ser mayor que cero." };
  const parts: number[] = [];
  for (let left = totalCents; left > 0; left -= capCents) parts.push(Math.min(left, capCents));
  const results: EmissionResult[] = [];
  for (let index = 0; index < parts.length; index++) {
    const partNumber = index + 1;
    let result: EmissionResult;
    try { result = await issueDocument({ ...input, amount: parts[index] / 100, partNumber, partCount: parts.length }); }
    catch (error) { result = { status: "ERROR", message: (error instanceof Error ? error.message : "No se pudo emitir la boleta.").slice(0, 900), amount: parts[index] / 100, partNumber, partCount: parts.length }; }
    results.push(result);
    if (result.status === "ERROR") {
      const firstQueuedIndex = result.correlativo ? index + 1 : index;
      for (let queuedIndex = firstQueuedIndex; queuedIndex < parts.length; queuedIndex++) {
        await db.execute(`INSERT IGNORE INTO electronic_documents (branch_id,closure_id,operation_id,series,correlativo,part_number,part_count,customer_document_type,customer_document_number,customer_name,description,amount,status,provider_message,file_name,created_by_user_id)
          VALUES (?,?,?, ?,NULL,?,?,?,?,?,?,?,'QUEUED',?,'pendiente',?)`, [
          input.branchId, input.sourceType === "CLOSURE" ? input.sourceId : null, input.sourceType === "OPERATION" ? input.sourceId : null,
          input.series, queuedIndex + 1, parts.length, input.customerDocumentType ?? null, input.customerDocumentNumber ?? null,
          input.customerName || "CLIENTES VARIOS", input.description.slice(0, 250), parts[queuedIndex] / 100,
          queuedIndex === index ? (result.message ?? "Error al solicitar la emisión; pendiente de reintento.").slice(0, 900) : "En espera de resolver el error de emisión de una parte anterior.", input.createdBy
        ]);
      }
      break;
    }
  }
  const firstError = results.find((item) => item.status === "ERROR");
  const status = firstError ? "PARTIAL" : results.every((item) => item.status === "ACCEPTED") ? "ACCEPTED" : "PENDING";
  return { ...results[0], status, amount: money(input.amount), partNumber: results.length, partCount: parts.length,
    message: firstError
      ? `${results.length} de ${parts.length} boleta(s) procesada(s). El resto quedó pendiente. ${firstError.message ?? ""}`
      : parts.length > 1 ? `Comisión dividida en ${parts.length} boletas, ninguna supera ${currencyText(input.maxAmount)}.` : results[0]?.message };
}

function currencyText(amount: number) { return `S/ ${money(amount).toFixed(2)}`; }

async function processQueuedDocuments(branchId: number, sourceType: "CLOSURE" | "OPERATION", sourceId: number, createdBy: number) {
  const sourceField = sourceType === "CLOSURE" ? "closure_id" : "operation_id";
  const [queued] = await db.query<any[]>(`SELECT id,part_number,part_count,amount,customer_document_type,customer_document_number,customer_name,description FROM electronic_documents WHERE branch_id=? AND ${sourceField}=? AND (status='QUEUED' OR (status='ERROR' AND provider_document_id IS NULL)) ORDER BY part_number`, [branchId, sourceId]);
  const results: EmissionResult[] = [];
  for (const item of queued) {
    const result = await issueDocument({ branchId, sourceType, sourceId, amount: Number(item.amount), description: String(item.description), createdBy,
      customerName: item.customer_name, customerDocumentType: item.customer_document_type, customerDocumentNumber: item.customer_document_number,
      partNumber: Number(item.part_number), partCount: Number(item.part_count) });
    results.push(result);
    if (result.status === "ERROR") break;
  }
  return results;
}

async function requireOwner(request: FastifyRequest, reply: FastifyReply) {
  const auth = await requireAuth(request, reply);
  if (!auth) return null;
  if (auth.roleCode !== "OWNER") { reply.code(403).send({ error: "Esta función requiere acceso de propietario" }); return null; }
  return auth;
}

export async function registerElectronicRoutes(app: FastifyInstance) {
  app.get("/api/admin/branches/:branchId/electronic-settings", async (request, reply) => {
    const parsed = ownerParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Filial inválida" });
    if (!await requireOwner(request, reply)) return;
    const [rows] = await db.query<any[]>("SELECT enabled,emission_mode,persona_id,persona_token_cipher,series,max_amount_per_receipt,updated_at FROM branch_electronic_settings WHERE branch_id=? LIMIT 1", [parsed.data.branchId]);
    if (!rows.length) return { enabled: false, emissionMode: "CLOSURE", personaId: "", tokenConfigured: false, series: "B001", maxAmountPerReceipt: 500 };
    return { enabled: Boolean(rows[0].enabled), emissionMode: rows[0].emission_mode, personaId: rows[0].persona_id ?? "", tokenConfigured: Boolean(rows[0].persona_token_cipher), series: rows[0].series, maxAmountPerReceipt: Number(rows[0].max_amount_per_receipt), updatedAt: rows[0].updated_at };
  });

  app.get("/api/branches/:branchId/operations/:operationId/electronic-document/:format", async (request, reply) => {
    const parsed = z.object({ branchId: z.coerce.number().int().positive(), operationId: z.coerce.number().int().positive(), format: z.enum(["pdf", "xml", "cdr"]) }).safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Archivo inválido" });
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    if (!canReadBranch(auth, parsed.data.branchId)) return reply.code(403).send({ error: "Acceso denegado" });
    const [rows] = await db.query<any[]>("SELECT series,correlativo,status FROM electronic_documents WHERE branch_id=? AND operation_id=? AND status='ACCEPTED' ORDER BY part_number LIMIT 1", [parsed.data.branchId, parsed.data.operationId]);
    if (!rows.length || rows[0].status !== "ACCEPTED") return reply.code(409).send({ error: "No hay una boleta aceptada para descargar." });
    const ext = parsed.data.format === "cdr" ? "cdr.zip" : parsed.data.format;
    const filePath = join(process.env.ZFLOW_BACKUP_DIR || "/backups", "boletas-electronicas", `filial-${parsed.data.branchId}`, `operacion-${parsed.data.operationId}`, `${rows[0].series}-${String(rows[0].correlativo).padStart(8, "0")}.${ext}`);
    let data: Buffer;
    try { data = await readFile(filePath); }
    catch { return reply.code(404).send({ error: "El archivo todavía no está archivado en el servidor." }); }
    reply.header("Content-Type", parsed.data.format === "pdf" ? "application/pdf" : parsed.data.format === "xml" ? "application/xml" : "application/zip");
    reply.header("Content-Disposition", parsed.data.format === "pdf" ? "inline" : "attachment");
    return reply.send(data);
  });

  app.post("/api/admin/branches/:branchId/electronic-settings", async (request, reply) => {
    const parsed = ownerParams.safeParse(request.params);
    const body = settingsBody.safeParse(request.body);
    if (!parsed.success || !body.success) return reply.code(400).send({ error: body.success ? "Filial inválida" : body.error.issues[0]?.message ?? "Configuración inválida" });
    const auth = await requireOwner(request, reply);
    if (!auth) return;
    const [branches] = await db.query<any[]>("SELECT id FROM branches WHERE id=? AND active=1 LIMIT 1", [parsed.data.branchId]);
    if (!branches.length) return reply.code(404).send({ error: "Filial no encontrada" });
    const [current] = await db.query<any[]>("SELECT persona_token_cipher FROM branch_electronic_settings WHERE branch_id=? LIMIT 1", [parsed.data.branchId]);
    const tokenCipher = body.data.personaToken ? encryptSecret(body.data.personaToken) : current[0]?.persona_token_cipher ?? null;
    if (body.data.enabled && (!body.data.personaId || !tokenCipher)) return reply.code(422).send({ error: "Para activar la emisión ingresa personaId y el token de ApiSunat." });
    if (body.data.enabled && body.data.personaToken && !body.data.personaToken.startsWith("DEV_")) return reply.code(422).send({ error: "Por seguridad, esta primera conexión acepta únicamente tokens de DESARROLLO (prefijo DEV_)." });
    await db.execute(`INSERT INTO branch_electronic_settings (branch_id,enabled,emission_mode,persona_id,persona_token_cipher,series,max_amount_per_receipt)
      VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),emission_mode=VALUES(emission_mode),persona_id=VALUES(persona_id),persona_token_cipher=VALUES(persona_token_cipher),series=VALUES(series),max_amount_per_receipt=VALUES(max_amount_per_receipt)`,
      [parsed.data.branchId, body.data.enabled ? 1 : 0, body.data.emissionMode, body.data.personaId || null, tokenCipher, body.data.series, body.data.maxAmountPerReceipt]);
    await db.execute(`INSERT INTO audit_logs (branch_id,user_id,action,entity_type,entity_id,details,ip_address,user_agent)
      VALUES (?,?, 'ELECTRONIC_SETTINGS_UPDATED','BRANCH',?, ?, ?, ?)`, [parsed.data.branchId, auth.userId, parsed.data.branchId, JSON.stringify({ enabled: body.data.enabled, emissionMode: body.data.emissionMode, personaIdConfigured: Boolean(body.data.personaId), tokenChanged: Boolean(body.data.personaToken), series: body.data.series, maxAmountPerReceipt: body.data.maxAmountPerReceipt }), request.ip, String(request.headers["user-agent"] ?? "").slice(0, 255)]);
    return { ok: true, tokenConfigured: Boolean(tokenCipher) };
  });

  app.post("/api/admin/branches/:branchId/electronic-documents/:sourceType/:sourceId/process-pending", async (request, reply) => {
    const parsed = z.object({ branchId: z.coerce.number().int().positive(), sourceType: z.enum(["closure", "operation"]), sourceId: z.coerce.number().int().positive() }).safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Solicitud inválida" });
    const auth = await requireOwner(request, reply);
    if (!auth) return;
    const sourceType = parsed.data.sourceType === "closure" ? "CLOSURE" : "OPERATION";
    const results = await processQueuedDocuments(parsed.data.branchId, sourceType, parsed.data.sourceId, auth.userId);
    const [remaining] = await db.query<any[]>(`SELECT COUNT(*) AS count FROM electronic_documents WHERE branch_id=? AND ${sourceType === "CLOSURE" ? "closure_id" : "operation_id"}=? AND (status='QUEUED' OR (status='ERROR' AND provider_document_id IS NULL))`, [parsed.data.branchId, parsed.data.sourceId]);
    return { results, remaining: Number(remaining[0]?.count ?? 0) };
  });

  app.get("/api/admin/branches/:branchId/electronic-documents", async (request, reply) => {
    const parsed = ownerParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Filial inválida" });
    if (!await requireOwner(request, reply)) return;
    const [rows] = await db.query<any[]>(`SELECT id,closure_id,operation_id,series,correlativo,part_number,part_count,amount,status,provider_message,provider_document_id,created_at,0 AS legacy
      FROM electronic_documents WHERE branch_id=?
      UNION ALL
      SELECT id,closure_id,NULL AS operation_id,series,correlativo,1 AS part_number,1 AS part_count,amount,status,provider_message,NULL AS provider_document_id,created_at,1 AS legacy
      FROM factiliza_documents WHERE branch_id=?
      ORDER BY created_at DESC,id DESC LIMIT 300`, [parsed.data.branchId, parsed.data.branchId]);
    const documents = await Promise.all(rows.map(async (row) => {
      const sourceFolder = row.closure_id ? `cierre-${row.closure_id}` : `operacion-${row.operation_id}`;
      const folder = join(process.env.ZFLOW_BACKUP_DIR || "/backups", "boletas-electronicas", `filial-${parsed.data.branchId}`, sourceFolder);
      const number = row.correlativo == null ? "" : `${row.series}-${String(row.correlativo).padStart(row.legacy ? 6 : 8, "0")}`;
      const exists = async (ext: string) => { try { await access(join(folder, `${number}.${ext}`)); return true; } catch { return false; } };
      return { ...row, canRetry: !row.legacy && (row.status === "QUEUED" || (row.status === "ERROR" && row.provider_document_id == null)), storedFiles: row.status === "ACCEPTED" && row.correlativo != null
        ? { pdf: await exists("pdf"), xml: await exists("xml"), cdr: await exists("cdr.zip"), folder: `boletas-electronicas/filial-${parsed.data.branchId}/${sourceFolder}` }
        : { pdf: false, xml: false, cdr: false, folder: `boletas-electronicas/filial-${parsed.data.branchId}/${sourceFolder}` } };
    }));
    return { documents };
  });

  app.get("/api/branches/:branchId/electronic-documents/:documentId/:format", async (request, reply) => {
    const parsed = z.object({ branchId: z.coerce.number().int().positive(), documentId: z.coerce.number().int().positive(), format: z.enum(["pdf", "xml", "cdr"]) }).safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Archivo inválido" });
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    if (!canReadBranch(auth, parsed.data.branchId)) return reply.code(403).send({ error: "Acceso denegado" });
    const [rows] = await db.query<any[]>("SELECT closure_id,operation_id,series,correlativo,status FROM electronic_documents WHERE id=? AND branch_id=? LIMIT 1", [parsed.data.documentId, parsed.data.branchId]);
    if (!rows.length || rows[0].status !== "ACCEPTED" || rows[0].correlativo == null) return reply.code(409).send({ error: "La boleta aún no está aceptada." });
    const sourceFolder = rows[0].closure_id ? `cierre-${rows[0].closure_id}` : `operacion-${rows[0].operation_id}`;
    const ext = parsed.data.format === "cdr" ? "cdr.zip" : parsed.data.format;
    const filePath = join(process.env.ZFLOW_BACKUP_DIR || "/backups", "boletas-electronicas", `filial-${parsed.data.branchId}`, sourceFolder, `${rows[0].series}-${String(rows[0].correlativo).padStart(8, "0")}.${ext}`);
    let data: Buffer;
    try { data = await readFile(filePath); } catch { return reply.code(404).send({ error: "El archivo aún no está archivado en el servidor." }); }
    reply.header("Content-Type", parsed.data.format === "pdf" ? "application/pdf" : parsed.data.format === "xml" ? "application/xml" : "application/zip");
    reply.header("Content-Disposition", parsed.data.format === "pdf" ? "inline" : "attachment");
    return reply.send(data);
  });

}

