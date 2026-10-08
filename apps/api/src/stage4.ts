import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "./db.js";
import { canWriteBranch, requireAuth } from "./auth.js";

const branchParams = z.object({ branchId: z.coerce.number().int().positive() });
const operationParams = z.object({
  branchId: z.coerce.number().int().positive(),
  operationId: z.coerce.number().int().positive()
});
const adminOperationParams = z.object({ operationId: z.coerce.number().int().positive() });
const sessionParams = z.object({ sessionId: z.coerce.number().int().positive() });
const userParams = z.object({ userId: z.coerce.number().int().positive() });

const settingsBody = z.object({
  businessName: z.string().trim().min(2).max(140),
  legalName: z.string().trim().max(180).nullable().optional(),
  ruc: z.string().trim().max(20).nullable().optional(),
  address: z.string().trim().max(255).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  currencyCode: z.string().trim().min(3).max(8).default("PEN"),
  timezoneName: z.string().trim().min(3).max(80).default("America/Lima"),
  ticketFooter: z.string().trim().max(255).nullable().optional(),
  receiptPrefix: z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9_-]+$/).default("ZF"),
  defaultMaxOperationAmount: z.coerce.number().positive(),
  defaultCommissionType: z.enum(["FLAT", "PERCENT"]),
  defaultCommissionValue: z.coerce.number().positive(),
  defaultStaffSharePct: z.coerce.number().min(0).max(100).nullable().optional(),
  defaultPartnerSharePct: z.coerce.number().min(0).max(100).nullable().optional(),
  requireCashToYapeReference: z.boolean(),
  allowCashierCancel: z.boolean()
}).superRefine((value, ctx) => {
  if (value.defaultStaffSharePct != null && value.defaultPartnerSharePct != null) {
    if (Math.abs(value.defaultStaffSharePct + value.defaultPartnerSharePct - 100) > 0.01) {
      ctx.addIssue({ code: "custom", message: "El reparto encargado + socio debe sumar 100%" });
    }
  }
});

const reasonBody = z.object({
  reason: z.string().trim().min(5).max(255)
});

const handoffBody = z.object({
  toUserId: z.coerce.number().int().positive(),
  notes: z.string().trim().max(255).optional()
});

const partnerAssignmentBody = z.object({
  branchId: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
  poolSharePct: z.coerce.number().min(0).max(100),
  active: z.boolean().default(true)
});

async function requireOwner(request: FastifyRequest, reply: FastifyReply) {
  const auth = await requireAuth(request, reply);
  if (!auth) return null;
  if (auth.roleCode !== "OWNER") {
    reply.code(403).send({ error: "Esta función requiere acceso de propietario" });
    return null;
  }
  return auth;
}

function money(value: unknown) {
  const n = Number(value ?? 0);
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function audit(
  request: FastifyRequest,
  branchId: number | null,
  userId: number | null,
  action: string,
  entityType: string,
  entityId: number | null,
  details: Record<string, unknown> = {}
) {
  await db.execute(
    `INSERT INTO audit_logs
      (branch_id, user_id, action, entity_type, entity_id, details, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      branchId,
      userId,
      action,
      entityType,
      entityId,
      JSON.stringify(details),
      request.ip,
      String(request.headers["user-agent"] ?? "").slice(0, 255)
    ]
  );
}

export async function ensureStage4Schema() {
  await db.query(`
    ALTER TABLE audit_logs
      ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64) NULL AFTER details,
      ADD COLUMN IF NOT EXISTS user_agent VARCHAR(255) NULL AFTER ip_address
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      id TINYINT UNSIGNED NOT NULL DEFAULT 1,
      business_name VARCHAR(140) NOT NULL DEFAULT 'Z-FLOW',
      legal_name VARCHAR(180) NULL,
      ruc VARCHAR(20) NULL,
      address VARCHAR(255) NULL,
      phone VARCHAR(40) NULL,
      currency_code VARCHAR(8) NOT NULL DEFAULT 'PEN',
      timezone_name VARCHAR(80) NOT NULL DEFAULT 'America/Lima',
      ticket_footer VARCHAR(255) NULL,
      receipt_prefix VARCHAR(12) NOT NULL DEFAULT 'ZF',
      default_max_operation_amount DECIMAL(14,2) NOT NULL DEFAULT 50.00,
      default_commission_type ENUM('FLAT','PERCENT') NOT NULL DEFAULT 'FLAT',
      default_commission_value DECIMAL(14,2) NOT NULL DEFAULT 1.00,
      default_staff_share_pct DECIMAL(5,2) NULL,
      default_partner_share_pct DECIMAL(5,2) NULL,
      require_cash_to_yape_reference TINYINT(1) NOT NULL DEFAULT 0,
      allow_cashier_cancel TINYINT(1) NOT NULL DEFAULT 1,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT chk_system_settings_singleton CHECK (id = 1)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    INSERT INTO system_settings (id, business_name)
    VALUES (1, 'Z-FLOW')
    ON DUPLICATE KEY UPDATE id = VALUES(id)
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS operation_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      operation_id BIGINT UNSIGNED NOT NULL,
      branch_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NULL,
      action ENUM('CANCEL','REVERSE') NOT NULL,
      reason VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_operation_events_operation (operation_id),
      KEY idx_operation_events_branch (branch_id, created_at),
      CONSTRAINT fk_operation_events_operation FOREIGN KEY (operation_id) REFERENCES operations(id),
      CONSTRAINT fk_operation_events_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
      CONSTRAINT fk_operation_events_user FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS cash_session_handoffs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      cash_session_id BIGINT UNSIGNED NOT NULL,
      branch_id BIGINT UNSIGNED NOT NULL,
      from_user_id BIGINT UNSIGNED NULL,
      to_user_id BIGINT UNSIGNED NOT NULL,
      changed_by_user_id BIGINT UNSIGNED NOT NULL,
      notes VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_handoffs_session (cash_session_id, created_at),
      CONSTRAINT fk_handoff_session FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id),
      CONSTRAINT fk_handoff_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
      CONSTRAINT fk_handoff_from_user FOREIGN KEY (from_user_id) REFERENCES users(id),
      CONSTRAINT fk_handoff_to_user FOREIGN KEY (to_user_id) REFERENCES users(id),
      CONSTRAINT fk_handoff_changed_by FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS branch_partner_assignments (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      branch_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      pool_share_pct DECIMAL(5,2) NOT NULL DEFAULT 100.00,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_branch_partner (branch_id, user_id),
      CONSTRAINT fk_branch_partner_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
      CONSTRAINT fk_branch_partner_user FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS operation_partner_shares (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      operation_id BIGINT UNSIGNED NOT NULL,
      branch_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      pool_share_pct DECIMAL(5,2) NOT NULL,
      amount DECIMAL(14,2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_operation_partner_share (operation_id, user_id),
      KEY idx_partner_share_user (user_id, created_at),
      CONSTRAINT fk_operation_partner_share_operation FOREIGN KEY (operation_id) REFERENCES operations(id),
      CONSTRAINT fk_operation_partner_share_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
      CONSTRAINT fk_operation_partner_share_user FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function registerStage4Routes(app: FastifyInstance) {
  app.get("/api/admin/system/settings", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;

    const [rows] = await db.query<any[]>(`
      SELECT business_name, legal_name, ruc, address, phone, currency_code,
             timezone_name, ticket_footer, receipt_prefix,
             default_max_operation_amount, default_commission_type,
             default_commission_value, default_staff_share_pct,
             default_partner_share_pct, require_cash_to_yape_reference,
             allow_cashier_cancel, updated_at
      FROM system_settings WHERE id=1
    `);
    const row = rows[0];
    return {
      businessName: row.business_name,
      legalName: row.legal_name,
      ruc: row.ruc,
      address: row.address,
      phone: row.phone,
      currencyCode: row.currency_code,
      timezoneName: row.timezone_name,
      ticketFooter: row.ticket_footer,
      receiptPrefix: row.receipt_prefix,
      defaultMaxOperationAmount: money(row.default_max_operation_amount),
      defaultCommissionType: row.default_commission_type,
      defaultCommissionValue: money(row.default_commission_value),
      defaultStaffSharePct: row.default_staff_share_pct == null ? null : Number(row.default_staff_share_pct),
      defaultPartnerSharePct: row.default_partner_share_pct == null ? null : Number(row.default_partner_share_pct),
      requireCashToYapeReference: Boolean(row.require_cash_to_yape_reference),
      allowCashierCancel: Boolean(row.allow_cashier_cancel),
      updatedAt: row.updated_at
    };
  });

  app.post("/api/admin/system/settings", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;

    const parsed = settingsBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Configuración inválida" });
    }
    const s = parsed.data;

    await db.execute(`
      UPDATE system_settings
      SET business_name=?, legal_name=?, ruc=?, address=?, phone=?,
          currency_code=?, timezone_name=?, ticket_footer=?, receipt_prefix=?,
          default_max_operation_amount=?, default_commission_type=?,
          default_commission_value=?, default_staff_share_pct=?,
          default_partner_share_pct=?, require_cash_to_yape_reference=?,
          allow_cashier_cancel=?
      WHERE id=1
    `, [
      s.businessName, s.legalName ?? null, s.ruc ?? null, s.address ?? null, s.phone ?? null,
      s.currencyCode, s.timezoneName, s.ticketFooter ?? null, s.receiptPrefix.toUpperCase(),
      money(s.defaultMaxOperationAmount), s.defaultCommissionType, money(s.defaultCommissionValue),
      s.defaultStaffSharePct ?? null, s.defaultPartnerSharePct ?? null,
      s.requireCashToYapeReference ? 1 : 0, s.allowCashierCancel ? 1 : 0
    ]);

    await audit(request, null, auth.userId, "SYSTEM_SETTINGS_UPDATED", "SYSTEM", 1, {
      businessName: s.businessName,
      timezone: s.timezoneName
    });

    return { ok: true };
  });

  app.post("/api/admin/system/apply-defaults-to-branches", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;

    const [rows] = await db.query<any[]>("SELECT * FROM system_settings WHERE id=1");
    const s = rows[0];

    const [result] = await db.execute<any>(`
      UPDATE branch_settings
      SET max_operation_amount=?, commission_type=?, commission_value=?,
          staff_share_pct=?, partner_share_pct=?
    `, [
      s.default_max_operation_amount,
      s.default_commission_type,
      s.default_commission_value,
      s.default_staff_share_pct,
      s.default_partner_share_pct
    ]);

    await audit(request, null, auth.userId, "DEFAULT_RULES_APPLIED_TO_BRANCHES", "SYSTEM", 1, {
      affectedBranches: Number(result.affectedRows ?? 0)
    });

    return { ok: true, affectedBranches: Number(result.affectedRows ?? 0) };
  });

  app.get("/api/admin/system/status", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;

    const started = process.uptime();
    const memory = process.memoryUsage();
    const [dbRows] = await db.query<any[]>("SELECT VERSION() AS version, NOW() AS db_time");
    const [counts] = await db.query<any[]>(`
      SELECT
        (SELECT COUNT(*) FROM branches WHERE active=1) AS active_branches,
        (SELECT COUNT(*) FROM users WHERE active=1) AS active_users,
        (SELECT COUNT(*) FROM auth_sessions WHERE revoked_at IS NULL AND expires_at>NOW()) AS active_sessions,
        (SELECT COUNT(*) FROM cash_sessions WHERE status='OPEN') AS open_cash_sessions,
        (SELECT COUNT(*) FROM operations WHERE DATE(created_at)=CURDATE()) AS operations_today
    `);

    return {
      ok: true,
      api: {
        uptimeSeconds: Math.floor(started),
        node: process.version,
        memoryMb: Math.round(memory.rss / 1024 / 1024)
      },
      database: {
        ok: true,
        version: dbRows[0]?.version,
        time: dbRows[0]?.db_time
      },
      counts: {
        activeBranches: Number(counts[0]?.active_branches ?? 0),
        activeUsers: Number(counts[0]?.active_users ?? 0),
        activeSessions: Number(counts[0]?.active_sessions ?? 0),
        openCashSessions: Number(counts[0]?.open_cash_sessions ?? 0),
        operationsToday: Number(counts[0]?.operations_today ?? 0)
      }
    };
  });

  app.get("/api/admin/security/sessions", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;

    const [rows] = await db.query<any[]>(`
      SELECT s.id, s.user_id, s.ip_address, s.user_agent, s.created_at, s.expires_at,
             s.revoked_at, u.username, u.full_name, r.name AS role_name,
             b.name AS branch_name
      FROM auth_sessions s
      JOIN users u ON u.id=s.user_id
      JOIN roles r ON r.id=u.role_id
      LEFT JOIN branches b ON b.id=u.branch_id
      ORDER BY s.revoked_at IS NULL AND s.expires_at>NOW() DESC, s.created_at DESC
      LIMIT 300
    `);

    return {
      sessions: rows.map((row) => ({
        id: Number(row.id),
        userId: Number(row.user_id),
        username: row.username,
        fullName: row.full_name,
        roleName: row.role_name,
        branchName: row.branch_name,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
        active: !row.revoked_at && new Date(row.expires_at).getTime() > Date.now(),
        current: Number(row.id) === auth.sessionId
      }))
    };
  });

  app.post("/api/admin/security/sessions/:sessionId/revoke", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;
    const parsed = sessionParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Sesión inválida" });
    if (parsed.data.sessionId === auth.sessionId) {
      return reply.code(400).send({ error: "Usa Cerrar sesión para finalizar tu sesión actual" });
    }

    const [result] = await db.execute<any>(
      "UPDATE auth_sessions SET revoked_at=NOW() WHERE id=? AND revoked_at IS NULL",
      [parsed.data.sessionId]
    );
    await audit(request, null, auth.userId, "SESSION_REVOKED", "AUTH_SESSION", parsed.data.sessionId);
    return { ok: true, changed: Number(result.affectedRows ?? 0) };
  });

  app.post("/api/admin/security/users/:userId/revoke-sessions", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;
    const parsed = userParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Usuario inválido" });

    const params: number[] = [parsed.data.userId];
    let sql = "UPDATE auth_sessions SET revoked_at=NOW() WHERE user_id=? AND revoked_at IS NULL";
    if (parsed.data.userId === auth.userId) {
      sql += " AND id<>?";
      params.push(auth.sessionId);
    }
    const [result] = await db.execute<any>(sql, params);
    await audit(request, null, auth.userId, "USER_SESSIONS_REVOKED", "USER", parsed.data.userId);
    return { ok: true, changed: Number(result.affectedRows ?? 0) };
  });

  app.get("/api/admin/partners/assignments", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;
    const [rows] = await db.query<any[]>(`
      SELECT a.id, a.branch_id, a.user_id, a.pool_share_pct, a.active,
             b.name AS branch_name, u.full_name, u.username,
             COALESCE(SUM(CASE WHEN o.status='COMPLETED' THEN ops.amount ELSE 0 END),0) AS earnings
      FROM branch_partner_assignments a
      JOIN branches b ON b.id=a.branch_id
      JOIN users u ON u.id=a.user_id
      LEFT JOIN operation_partner_shares ops
        ON ops.branch_id=a.branch_id AND ops.user_id=a.user_id
      LEFT JOIN operations o ON o.id=ops.operation_id
      GROUP BY a.id, a.branch_id, a.user_id, a.pool_share_pct, a.active,
               b.name, u.full_name, u.username
      ORDER BY b.name, u.full_name
    `);
    return { assignments: rows };
  });

  app.post("/api/admin/partners/assignments", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;
    const parsed = partnerAssignmentBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Asignación inválida" });
    const body = parsed.data;

    const [userRows] = await db.query<any[]>(`
      SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id
      WHERE u.id=? AND r.code='PARTNER' LIMIT 1
    `, [body.userId]);
    if (!userRows.length) return reply.code(400).send({ error: "El usuario seleccionado no tiene rol Socio" });

    const [sumRows] = await db.query<any[]>(`
      SELECT COALESCE(SUM(pool_share_pct),0) AS total
      FROM branch_partner_assignments
      WHERE branch_id=? AND user_id<>? AND active=1
    `, [body.branchId, body.userId]);
    if (body.active && Number(sumRows[0]?.total ?? 0) + body.poolSharePct > 100.01) {
      return reply.code(422).send({ error: "La distribución de socios de la filial no puede superar 100%" });
    }

    await db.execute(`
      INSERT INTO branch_partner_assignments (branch_id,user_id,pool_share_pct,active)
      VALUES (?,?,?,?)
      ON DUPLICATE KEY UPDATE pool_share_pct=VALUES(pool_share_pct), active=VALUES(active)
    `, [body.branchId, body.userId, body.poolSharePct, body.active ? 1 : 0]);

    await audit(request, body.branchId, auth.userId, "PARTNER_ASSIGNMENT_UPDATED", "USER", body.userId, {
      poolSharePct: body.poolSharePct,
      active: body.active
    });
    return { ok: true };
  });

  app.get("/api/branches/:branchId/staff", async (request, reply) => {
    const parsed = branchParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Filial inválida" });
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    if (!canWriteBranch(auth, parsed.data.branchId)) return reply.code(403).send({ error: "Acceso denegado" });

    const [rows] = await db.query<any[]>(`
      SELECT u.id, u.username, u.full_name, r.code AS role_code, r.name AS role_name
      FROM users u
      JOIN roles r ON r.id=u.role_id
      WHERE u.branch_id=? AND u.active=1 AND r.code IN ('CASHIER','BRANCH_ADMIN')
      ORDER BY u.full_name
    `, [parsed.data.branchId]);
    return { users: rows };
  });

  app.post("/api/branches/:branchId/cash/handoff", async (request, reply) => {
    const parsedParams = branchParams.safeParse(request.params);
    const parsedBody = handoffBody.safeParse(request.body);
    if (!parsedParams.success || !parsedBody.success) return reply.code(400).send({ error: "Datos inválidos" });

    const auth = await requireAuth(request, reply);
    if (!auth) return;
    if (!canWriteBranch(auth, parsedParams.data.branchId)) return reply.code(403).send({ error: "Acceso denegado" });

    const [sessions] = await db.query<any[]>(`
      SELECT id,user_id FROM cash_sessions
      WHERE branch_id=? AND status='OPEN'
      ORDER BY started_at DESC LIMIT 1
    `, [parsedParams.data.branchId]);
    if (!sessions.length) return reply.code(409).send({ error: "No hay una caja abierta" });

    const [users] = await db.query<any[]>(`
      SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id
      WHERE u.id=? AND u.branch_id=? AND u.active=1 AND r.code IN ('CASHIER','BRANCH_ADMIN')
      LIMIT 1
    `, [parsedBody.data.toUserId, parsedParams.data.branchId]);
    if (!users.length) return reply.code(400).send({ error: "El nuevo encargado no pertenece a esta filial" });

    const session = sessions[0];
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(`
        INSERT INTO cash_session_handoffs
          (cash_session_id,branch_id,from_user_id,to_user_id,changed_by_user_id,notes)
        VALUES (?,?,?,?,?,?)
      `, [
        session.id, parsedParams.data.branchId, session.user_id ?? null,
        parsedBody.data.toUserId, auth.userId, parsedBody.data.notes ?? null
      ]);
      await connection.execute("UPDATE cash_sessions SET user_id=? WHERE id=?", [parsedBody.data.toUserId, session.id]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    await audit(request, parsedParams.data.branchId, auth.userId, "CASH_HANDOFF", "CASH_SESSION", Number(session.id), {
      fromUserId: session.user_id,
      toUserId: parsedBody.data.toUserId
    });
    return { ok: true };
  });

  app.post("/api/branches/:branchId/operations/:operationId/cancel", async (request, reply) => {
    const parsedParams = operationParams.safeParse(request.params);
    const parsedBody = reasonBody.safeParse(request.body);
    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({ error: parsedBody.success ? "Operación inválida" : parsedBody.error.issues[0]?.message ?? "Motivo inválido" });
    }

    const auth = await requireAuth(request, reply);
    if (!auth) return;
    if (!canWriteBranch(auth, parsedParams.data.branchId)) return reply.code(403).send({ error: "Acceso denegado" });

    const [settingRows] = await db.query<any[]>("SELECT allow_cashier_cancel FROM system_settings WHERE id=1");
    if (auth.roleCode === "CASHIER" && !Boolean(settingRows[0]?.allow_cashier_cancel)) {
      return reply.code(403).send({ error: "La anulación por cajero está desactivada" });
    }

    const [rows] = await db.query<any[]>(`
      SELECT o.id,o.status,o.cash_session_id,cs.status AS session_status
      FROM operations o
      LEFT JOIN cash_sessions cs ON cs.id=o.cash_session_id
      WHERE o.id=? AND o.branch_id=? LIMIT 1
    `, [parsedParams.data.operationId, parsedParams.data.branchId]);
    if (!rows.length) return reply.code(404).send({ error: "Operación no encontrada" });
    const op = rows[0];
    if (op.status !== "COMPLETED") return reply.code(409).send({ error: "Solo se puede anular una operación completada" });
    if (op.session_status !== "OPEN") return reply.code(409).send({ error: "El turno ya fue cerrado. La corrección debe hacerla el propietario mediante reverso" });

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute("UPDATE operations SET status='CANCELLED' WHERE id=?", [op.id]);
      await connection.execute("UPDATE receipts SET status='VOID' WHERE operation_id=?", [op.id]);
      await connection.execute(`
        INSERT INTO operation_events (operation_id,branch_id,user_id,action,reason)
        VALUES (?,?,?,'CANCEL',?)
      `, [op.id, parsedParams.data.branchId, auth.userId, parsedBody.data.reason]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    await audit(request, parsedParams.data.branchId, auth.userId, "OPERATION_CANCELLED", "OPERATION", Number(op.id), {
      reason: parsedBody.data.reason
    });
    return { ok: true, status: "CANCELLED" };
  });

  app.post("/api/admin/operations/:operationId/reverse", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;
    const parsedParams = adminOperationParams.safeParse(request.params);
    const parsedBody = reasonBody.safeParse(request.body);
    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({ error: parsedBody.success ? "Operación inválida" : parsedBody.error.issues[0]?.message ?? "Motivo inválido" });
    }

    const [rows] = await db.query<any[]>("SELECT id,branch_id,status FROM operations WHERE id=? LIMIT 1", [parsedParams.data.operationId]);
    if (!rows.length) return reply.code(404).send({ error: "Operación no encontrada" });
    const op = rows[0];
    if (!["COMPLETED","CANCELLED"].includes(op.status)) {
      return reply.code(409).send({ error: "Esta operación ya fue revertida o no admite reverso" });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute("UPDATE operations SET status='REVERSED' WHERE id=?", [op.id]);
      await connection.execute("UPDATE receipts SET status='VOID' WHERE operation_id=?", [op.id]);
      await connection.execute(`
        INSERT INTO operation_events (operation_id,branch_id,user_id,action,reason)
        VALUES (?,?,?,'REVERSE',?)
      `, [op.id, op.branch_id, auth.userId, parsedBody.data.reason]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    await audit(request, Number(op.branch_id), auth.userId, "OPERATION_REVERSED", "OPERATION", Number(op.id), {
      reason: parsedBody.data.reason,
      previousStatus: op.status
    });
    return { ok: true, status: "REVERSED" };
  });
}
