import type { PoolConnection } from "mysql2/promise";
import { db } from "./db.js";

export async function ensureBusinessSchema() {
  await db.query(`
    ALTER TABLE operations
      ADD COLUMN IF NOT EXISTS staff_share_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER commission,
      ADD COLUMN IF NOT EXISTS partner_share_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER staff_share_amount
  `);

  await db.query(`
    ALTER TABLE daily_closures
      ADD COLUMN IF NOT EXISTS operation_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER cash_session_id,
      ADD COLUMN IF NOT EXISTS commission_total DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER operation_count,
      ADD COLUMN IF NOT EXISTS staff_share_total DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER commission_total,
      ADD COLUMN IF NOT EXISTS partner_share_total DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER staff_share_total
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS receipt_sequences (
      branch_id BIGINT UNSIGNED NOT NULL,
      next_number BIGINT UNSIGNED NOT NULL DEFAULT 1,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (branch_id),
      CONSTRAINT fk_receipt_sequences_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [indexes] = await db.query<any[]>(
    "SHOW INDEX FROM receipts WHERE Key_name = 'uq_receipts_operation'"
  );
  if (!indexes.length) {
    await db.query("ALTER TABLE receipts ADD UNIQUE KEY uq_receipts_operation (operation_id)");
  }
}

function safeSeries(code: string) {
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "BR";
  return `ZF-${normalized}`;
}

export async function issueInternalReceipt(
  connection: PoolConnection,
  branchId: number,
  branchCode: string,
  operationId: number
) {
  const [existingRows] = await connection.query<any[]>(
    "SELECT id, series, sequence_number, receipt_type, status, issued_at FROM receipts WHERE operation_id = ? LIMIT 1",
    [operationId]
  );
  if (existingRows.length) return existingRows[0];

  await connection.execute(
    `INSERT INTO receipt_sequences (branch_id, next_number)
     VALUES (?, 1)
     ON DUPLICATE KEY UPDATE branch_id = VALUES(branch_id)`,
    [branchId]
  );

  const [sequenceRows] = await connection.query<any[]>(
    "SELECT next_number FROM receipt_sequences WHERE branch_id = ? FOR UPDATE",
    [branchId]
  );

  const sequenceNumber = Number(sequenceRows[0]?.next_number ?? 1);
  const series = safeSeries(branchCode);

  const [result] = await connection.execute<any>(
    `INSERT INTO receipts
      (branch_id, operation_id, series, sequence_number, receipt_type, status)
     VALUES (?, ?, ?, ?, 'INTERNAL_TICKET', 'ISSUED')`,
    [branchId, operationId, series, sequenceNumber]
  );

  await connection.execute(
    "UPDATE receipt_sequences SET next_number = ? WHERE branch_id = ?",
    [sequenceNumber + 1, branchId]
  );

  return {
    id: Number(result.insertId),
    series,
    sequence_number: sequenceNumber,
    receipt_type: "INTERNAL_TICKET",
    status: "ISSUED"
  };
}

export async function backfillMissingReceipts() {
  const [rows] = await db.query<any[]>(`
    SELECT o.id AS operation_id, o.branch_id, b.code AS branch_code
    FROM operations o
    JOIN branches b ON b.id = o.branch_id
    LEFT JOIN receipts r ON r.operation_id = o.id
    WHERE r.id IS NULL
    ORDER BY o.branch_id, o.id
    LIMIT 5000
  `);

  for (const row of rows) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await issueInternalReceipt(
        connection,
        Number(row.branch_id),
        String(row.branch_code),
        Number(row.operation_id)
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

export function calculateCommissionShares(
  commission: number,
  staffSharePct: number | null | undefined,
  partnerSharePct: number | null | undefined
) {
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const staff = staffSharePct == null ? 0 : round(commission * (Number(staffSharePct) / 100));
  const partner = partnerSharePct == null ? 0 : round(commission * (Number(partnerSharePct) / 100));
  return {
    staffShareAmount: staff,
    partnerShareAmount: partner,
    unassignedAmount: round(Math.max(0, commission - staff - partner))
  };
}
