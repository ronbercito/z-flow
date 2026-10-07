import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "./db.js";
import { requireAuth } from "./auth.js";

const branchParams = z.object({
  branchId: z.coerce.number().int().positive()
});

const userParams = z.object({
  userId: z.coerce.number().int().positive()
});

const createBranchBody = z.object({
  code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(255).optional(),
  maxOperationAmount: z.coerce.number().positive().default(50),
  commissionType: z.enum(["FLAT", "PERCENT"]).default("FLAT"),
  commissionValue: z.coerce.number().positive().default(1),
  staffSharePct: z.coerce.number().min(0).max(100).nullable().optional(),
  partnerSharePct: z.coerce.number().min(0).max(100).nullable().optional()
}).superRefine((value, ctx) => {
  if (value.staffSharePct != null && value.partnerSharePct != null) {
    if (Math.abs(value.staffSharePct + value.partnerSharePct - 100) > 0.01) {
      ctx.addIssue({ code: "custom", message: "El reparto encargado + socio debe sumar 100%" });
    }
  }
});

const updateBranchBody = z.object({
  code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(255).nullable().optional(),
  active: z.boolean()
});

const branchSettingsBody = z.object({
  maxOperationAmount: z.coerce.number().positive(),
  commissionType: z.enum(["FLAT", "PERCENT"]),
  commissionValue: z.coerce.number().positive(),
  staffSharePct: z.coerce.number().min(0).max(100).nullable().optional(),
  partnerSharePct: z.coerce.number().min(0).max(100).nullable().optional()
}).superRefine((value, ctx) => {
  if (value.staffSharePct != null && value.partnerSharePct != null) {
    const total = value.staffSharePct + value.partnerSharePct;
    if (Math.abs(total - 100) > 0.01) {
      ctx.addIssue({
        code: "custom",
        message: "El reparto encargado + socio debe sumar 100%"
      });
    }
  }
});

const createUserBody = z.object({
  branchId: z.coerce.number().int().positive().nullable().optional(),
  roleCode: z.enum(["OWNER", "PARTNER", "BRANCH_ADMIN", "CASHIER", "AUDITOR"]),
  username: z.string().trim().min(3).max(80).regex(/^[A-Za-z0-9._-]+$/),
  fullName: z.string().trim().min(3).max(140),
  password: z.string().min(10).max(200)
    .regex(/[A-Z]/, "La contraseña debe incluir una mayúscula")
    .regex(/[a-z]/, "La contraseña debe incluir una minúscula")
    .regex(/[0-9]/, "La contraseña debe incluir un número")
});

const toggleUserBody = z.object({
  active: z.boolean()
});

const updateUserBody = z.object({
  branchId: z.coerce.number().int().positive().nullable().optional(),
  roleCode: z.enum(["OWNER", "PARTNER", "BRANCH_ADMIN", "CASHIER", "AUDITOR"]),
  username: z.string().trim().min(3).max(80).regex(/^[A-Za-z0-9._-]+$/),
  fullName: z.string().trim().min(3).max(140),
  active: z.boolean()
});

const resetPasswordBody = z.object({
  password: z.string().min(10).max(200)
    .regex(/[A-Z]/, "La contraseña debe incluir una mayúscula")
    .regex(/[a-z]/, "La contraseña debe incluir una minúscula")
    .regex(/[0-9]/, "La contraseña debe incluir un número")
});

const historyQuery = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const dashboardQuery = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
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

function num(value: unknown) {
  return Number(value ?? 0);
}

function money(value: unknown) {
  return Math.round((num(value) + Number.EPSILON) * 100) / 100;
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get("/api/admin/dashboard", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;

    const parsed = dashboardQuery.safeParse(request.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Filtros inválidos" });

    const date = parsed.data.date ?? new Date().toISOString().slice(0, 10);
    const branchId = parsed.data.branchId;
    const branchFilter = branchId ? " AND o.branch_id = ?" : "";
    const branchParams: unknown[] = branchId ? [branchId] : [];
    const previousDateExpr = "DATE_SUB(?, INTERVAL 1 DAY)";

    const [metricRows] = await db.query<any[]>(`
      SELECT
        COUNT(*) AS operations,
        COALESCE(SUM(CASE WHEN o.operation_type='YAPE_TO_CASH' THEN o.amount ELSE 0 END),0) AS yape_received,
        COALESCE(SUM(CASE WHEN o.operation_type='YAPE_TO_CASH' THEN o.net_amount ELSE 0 END),0) AS cash_delivered,
        COALESCE(SUM(o.commission),0) AS commission_total,
        COALESCE(SUM(o.staff_share_amount),0) AS staff_share_total,
        COALESCE(SUM(o.partner_share_amount),0) AS partner_share_total
      FROM operations o
      WHERE DATE(o.created_at)=? AND o.status='COMPLETED'${branchFilter}
    `, [date, ...branchParams]);

    const [previousRows] = await db.query<any[]>(`
      SELECT
        COUNT(*) AS operations,
        COALESCE(SUM(CASE WHEN o.operation_type='YAPE_TO_CASH' THEN o.amount ELSE 0 END),0) AS yape_received,
        COALESCE(SUM(CASE WHEN o.operation_type='YAPE_TO_CASH' THEN o.net_amount ELSE 0 END),0) AS cash_delivered,
        COALESCE(SUM(o.commission),0) AS commission_total,
        COALESCE(SUM(o.staff_share_amount),0) AS staff_share_total,
        COALESCE(SUM(o.partner_share_amount),0) AS partner_share_total
      FROM operations o
      WHERE DATE(o.created_at)=${previousDateExpr} AND o.status='COMPLETED'${branchFilter}
    `, [date, ...branchParams]);

    const [hourRows] = await db.query<any[]>(`
      SELECT HOUR(o.created_at) AS hour, COUNT(*) AS operation_count
      FROM operations o
      WHERE DATE(o.created_at)=? AND o.status='COMPLETED'${branchFilter}
      GROUP BY HOUR(o.created_at)
      ORDER BY hour
    `, [date, ...branchParams]);

    const branchWhere = branchId ? " AND b.id = ?" : "";
    const [branchRows] = await db.query<any[]>(`
      SELECT b.id, b.code, b.name,
             COUNT(o.id) AS operations,
             COALESCE(SUM(CASE WHEN o.operation_type='YAPE_TO_CASH' THEN o.amount ELSE 0 END),0) AS yape_received,
             COALESCE(SUM(CASE WHEN o.operation_type='YAPE_TO_CASH' THEN o.net_amount ELSE 0 END),0) AS cash_delivered,
             COALESCE(SUM(o.amount),0) AS amount_total,
             COALESCE(SUM(o.commission),0) AS commission_total
      FROM branches b
      LEFT JOIN operations o
        ON o.branch_id=b.id
       AND DATE(o.created_at)=?
       AND o.status='COMPLETED'
      WHERE b.active=1${branchWhere}
      GROUP BY b.id,b.code,b.name
      ORDER BY amount_total DESC, b.name
    `, [date, ...(branchId ? [branchId] : [])]);

    const [recentRows] = await db.query<any[]>(`
      SELECT o.id, o.operation_type, o.reference_code, o.customer_name, o.amount,
             o.commission, o.staff_share_amount, o.partner_share_amount,
             o.net_amount, o.status,
             DATE_FORMAT(o.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
             b.id AS branch_id, b.name AS branch_name,
             u.full_name AS registered_by,
             r.series AS receipt_series, r.sequence_number AS receipt_number
      FROM operations o
      JOIN branches b ON b.id=o.branch_id
      LEFT JOIN users u ON u.id=o.user_id
      LEFT JOIN receipts r ON r.operation_id=o.id
      WHERE DATE(o.created_at)=?${branchFilter}
      ORDER BY o.created_at DESC
      LIMIT 10
    `, [date, ...branchParams]);

    const [closureRows] = await db.query<any[]>(`
      SELECT
        COALESCE(SUM(dc.difference_cash),0) AS difference_cash,
        COALESCE(SUM(dc.difference_wallet),0) AS difference_wallet
      FROM daily_closures dc
      WHERE DATE(dc.closed_at)=?
      ${branchId ? "AND dc.branch_id = ?" : ""}
    `, [date, ...(branchId ? [branchId] : [])]);

    const [cashRows] = await db.query<any[]>(`
      SELECT COALESCE(SUM(
        cs.initial_cash
        + COALESCE(m.cash_received,0)
        - COALESCE(m.cash_delivered,0)
      ),0) AS cash_expected
      FROM cash_sessions cs
      LEFT JOIN (
        SELECT o.cash_session_id,
               SUM(CASE WHEN o.operation_type='CASH_TO_YAPE' AND o.status='COMPLETED' THEN o.amount ELSE 0 END) AS cash_received,
               SUM(CASE WHEN o.operation_type='YAPE_TO_CASH' AND o.status='COMPLETED' THEN o.net_amount ELSE 0 END) AS cash_delivered
        FROM operations o
        GROUP BY o.cash_session_id
      ) m ON m.cash_session_id=cs.id
      WHERE cs.status='OPEN'
      ${branchId ? "AND cs.branch_id = ?" : ""}
    `, branchId ? [branchId] : []);

    const current = metricRows[0] ?? {};
    const previous = previousRows[0] ?? {};
    const closure = closureRows[0] ?? {};
    const cash = cashRows[0] ?? {};

    const percentChange = (now: unknown, before: unknown) => {
      const a = num(now); const b = num(before);
      if (b === 0) return a === 0 ? 0 : 100;
      return Math.round(((a - b) / Math.abs(b)) * 1000) / 10;
    };

    const hourlyMap = new Map(hourRows.map((row) => [Number(row.hour), Number(row.operation_count)]));
    const hours = Array.from({ length: 13 }, (_, index) => 8 + index).map((hour) => ({
      hour,
      label: `${String(hour).padStart(2,"0")}:00`,
      operations: hourlyMap.get(hour) ?? 0
    }));

    return {
      date,
      branchId: branchId ?? null,
      updatedAt: new Date().toISOString(),
      metrics: {
        operations: num(current.operations),
        yapeReceived: money(current.yape_received),
        cashDelivered: money(current.cash_delivered),
        commissionTotal: money(current.commission_total),
        staffShareTotal: money(current.staff_share_total),
        partnerShareTotal: money(current.partner_share_total),
        cashExpected: money(cash.cash_expected),
        cashDifference: money(closure.difference_cash)
      },
      comparison: {
        operations: percentChange(current.operations, previous.operations),
        yapeReceived: percentChange(current.yape_received, previous.yape_received),
        cashDelivered: percentChange(current.cash_delivered, previous.cash_delivered),
        commissionTotal: percentChange(current.commission_total, previous.commission_total),
        staffShareTotal: percentChange(current.staff_share_total, previous.staff_share_total),
        partnerShareTotal: percentChange(current.partner_share_total, previous.partner_share_total)
      },
      hours,
      branches: branchRows.map((row) => ({
        id: num(row.id),
        code: row.code,
        name: row.name,
        operations: num(row.operations),
        yapeReceived: money(row.yape_received),
        cashDelivered: money(row.cash_delivered),
        amountTotal: money(row.amount_total),
        commissionTotal: money(row.commission_total)
      })),
      recentOperations: recentRows,
      differenceWallet: money(closure.difference_wallet)
    };
  });

  app.get("/api/admin/overview", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;

    const [summaryRows] = await db.query<any[]>(`
      SELECT
        (SELECT COUNT(*) FROM branches WHERE active = 1) AS active_branches,
        (SELECT COUNT(*) FROM users WHERE active = 1) AS active_users,
        (SELECT COUNT(*) FROM cash_sessions WHERE status = 'OPEN') AS open_cash_sessions,
        COUNT(CASE WHEN DATE(o.created_at) = CURDATE() THEN 1 END) AS operations_today,
        COALESCE(SUM(CASE WHEN DATE(o.created_at) = CURDATE() AND o.status = 'COMPLETED' AND o.operation_type = 'YAPE_TO_CASH' THEN o.amount ELSE 0 END), 0) AS yape_received,
        COALESCE(SUM(CASE WHEN DATE(o.created_at) = CURDATE() AND o.status = 'COMPLETED' AND o.operation_type = 'YAPE_TO_CASH' THEN o.net_amount ELSE 0 END), 0) AS cash_delivered,
        COALESCE(SUM(CASE WHEN DATE(o.created_at) = CURDATE() AND o.status = 'COMPLETED' THEN o.commission ELSE 0 END), 0) AS commission_today
      FROM operations o
    `);

    const [branchRows] = await db.query<any[]>(`
      SELECT
        b.id, b.code, b.name, b.address, b.active,
        bs.max_operation_amount, bs.commission_type, bs.commission_value,
        bs.staff_share_pct, bs.partner_share_pct,
        COALESCE(op.operations_today, 0) AS operations_today,
        COALESCE(op.commission_today, 0) AS commission_today,
        CASE WHEN cs.id IS NULL THEN 0 ELSE 1 END AS cash_open,
        cs.started_at AS cash_started_at
      FROM branches b
      LEFT JOIN branch_settings bs ON bs.branch_id = b.id
      LEFT JOIN (
        SELECT branch_id,
               COUNT(*) AS operations_today,
               COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN commission ELSE 0 END), 0) AS commission_today
        FROM operations
        WHERE DATE(created_at) = CURDATE()
        GROUP BY branch_id
      ) op ON op.branch_id = b.id
      LEFT JOIN (
        SELECT c1.id, c1.branch_id, c1.started_at
        FROM cash_sessions c1
        INNER JOIN (
          SELECT branch_id, MAX(started_at) AS max_started
          FROM cash_sessions
          WHERE status = 'OPEN'
          GROUP BY branch_id
        ) latest ON latest.branch_id = c1.branch_id AND latest.max_started = c1.started_at
        WHERE c1.status = 'OPEN'
      ) cs ON cs.branch_id = b.id
      ORDER BY b.name
    `);

    const [recentRows] = await db.query<any[]>(`
      SELECT o.id, o.operation_type, o.reference_code, o.customer_name, o.amount,
             o.commission, o.staff_share_amount, o.partner_share_amount,
             o.net_amount, o.status,
             DATE_FORMAT(o.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
             b.id AS branch_id, b.name AS branch_name,
             u.full_name AS registered_by,
             r.series AS receipt_series, r.sequence_number AS receipt_number
      FROM operations o
      JOIN branches b ON b.id = o.branch_id
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN receipts r ON r.operation_id = o.id
      ORDER BY o.created_at DESC
      LIMIT 15
    `);

    const s = summaryRows[0] ?? {};
    return {
      metrics: {
        activeBranches: num(s.active_branches),
        activeUsers: num(s.active_users),
        openCashSessions: num(s.open_cash_sessions),
        operationsToday: num(s.operations_today),
        yapeReceived: money(s.yape_received),
        cashDelivered: money(s.cash_delivered),
        commissionToday: money(s.commission_today)
      },
      branches: branchRows.map((row) => ({
        id: num(row.id),
        code: row.code,
        name: row.name,
        address: row.address,
        active: Boolean(row.active),
        operationsToday: num(row.operations_today),
        commissionToday: money(row.commission_today),
        cashOpen: Boolean(row.cash_open),
        cashStartedAt: row.cash_started_at,
        settings: {
          maxOperationAmount: money(row.max_operation_amount),
          commissionType: row.commission_type,
          commissionValue: money(row.commission_value),
          staffSharePct: row.staff_share_pct == null ? null : num(row.staff_share_pct),
          partnerSharePct: row.partner_share_pct == null ? null : num(row.partner_share_pct)
        }
      })),
      recentOperations: recentRows
    };
  });

  app.get("/api/admin/branches", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;

    const [rows] = await db.query<any[]>(`
      SELECT b.id, b.code, b.name, b.address, b.active, b.created_at,
             bs.max_operation_amount, bs.commission_type, bs.commission_value,
             bs.staff_share_pct, bs.partner_share_pct,
             SUM(CASE WHEN u.active = 1 THEN 1 ELSE 0 END) AS active_users
      FROM branches b
      LEFT JOIN branch_settings bs ON bs.branch_id = b.id
      LEFT JOIN users u ON u.branch_id = b.id
      GROUP BY b.id, b.code, b.name, b.address, b.active, b.created_at,
               bs.max_operation_amount, bs.commission_type, bs.commission_value,
               bs.staff_share_pct, bs.partner_share_pct
      ORDER BY b.name
    `);

    return { branches: rows };
  });

  app.post("/api/admin/branches", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;

    const parsed = createBranchBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    }

    const body = parsed.data;
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();
      const [branchResult] = await connection.execute<any>(
        "INSERT INTO branches (code, name, address, active) VALUES (?, ?, ?, 1)",
        [body.code.toUpperCase(), body.name, body.address ?? null]
      );

      const branchId = Number(branchResult.insertId);
      await connection.execute(
        `INSERT INTO branch_settings
         (branch_id, max_operation_amount, commission_type, commission_value, staff_share_pct, partner_share_pct)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          branchId,
          body.maxOperationAmount,
          body.commissionType,
          body.commissionValue,
          body.staffSharePct ?? null,
          body.partnerSharePct ?? null
        ]
      );

      await connection.execute(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES (?, 'BRANCH_CREATED', 'BRANCH', ?, JSON_OBJECT('name', ?, 'code', ?))`,
        [auth.userId, branchId, body.name, body.code.toUpperCase()]
      );

      await connection.commit();
      return reply.code(201).send({ id: branchId, ok: true });
    } catch (error: any) {
      await connection.rollback();
      if (error?.code === "ER_DUP_ENTRY") {
        return reply.code(409).send({ error: "Ese código de filial ya existe" });
      }
      throw error;
    } finally {
      connection.release();
    }
  });

  app.get("/api/admin/branches/:branchId/detail", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;

    const parsed = branchParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Filial inválida" });

    const { branchId } = parsed.data;
    const [branchRows] = await db.query<any[]>(`
      SELECT b.id, b.code, b.name, b.address, b.active, b.created_at,
             bs.max_operation_amount, bs.commission_type, bs.commission_value,
             bs.staff_share_pct, bs.partner_share_pct
      FROM branches b
      LEFT JOIN branch_settings bs ON bs.branch_id = b.id
      WHERE b.id = ?
      LIMIT 1
    `, [branchId]);

    if (!branchRows.length) return reply.code(404).send({ error: "Filial no encontrada" });

    const [cashRows] = await db.query<any[]>(`
      SELECT id, user_id, initial_cash, initial_wallet, declared_cash, declared_wallet,
             status, DATE_FORMAT(started_at, '%Y-%m-%dT%H:%i:%s') AS started_at,
             DATE_FORMAT(ended_at, '%Y-%m-%dT%H:%i:%s') AS ended_at
      FROM cash_sessions
      WHERE branch_id = ?
      ORDER BY started_at DESC
      LIMIT 20
    `, [branchId]);

    const [userRows] = await db.query<any[]>(`
      SELECT u.id, u.username, u.full_name, u.active, u.last_login_at,
             r.code AS role_code, r.name AS role_name
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.branch_id = ?
      ORDER BY u.active DESC, u.full_name
    `, [branchId]);

    const [operationRows] = await db.query<any[]>(`
      SELECT o.id, o.operation_type, o.reference_code, o.customer_name, o.amount,
             o.commission, o.staff_share_amount, o.partner_share_amount,
             o.net_amount, o.status,
             DATE_FORMAT(o.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
             u.full_name AS registered_by,
             r.series AS receipt_series, r.sequence_number AS receipt_number
      FROM operations o
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN receipts r ON r.operation_id = o.id
      WHERE o.branch_id = ?
      ORDER BY o.created_at DESC
      LIMIT 20
    `, [branchId]);

    const [closureRows] = await db.query<any[]>(`
      SELECT id, operation_count, commission_total, staff_share_total, partner_share_total,
             expected_cash, declared_cash, expected_wallet, declared_wallet,
             difference_cash, difference_wallet, notes,
             DATE_FORMAT(closed_at, '%Y-%m-%dT%H:%i:%s') AS closed_at
      FROM daily_closures
      WHERE branch_id = ?
      ORDER BY closed_at DESC
      LIMIT 20
    `, [branchId]);

    const [todayRows] = await db.query<any[]>(`
      SELECT COUNT(*) AS operations_today,
             COALESCE(SUM(CASE WHEN status='COMPLETED' THEN amount ELSE 0 END),0) AS amount_today,
             COALESCE(SUM(CASE WHEN status='COMPLETED' THEN commission ELSE 0 END),0) AS commission_today
      FROM operations
      WHERE branch_id = ? AND DATE(created_at)=CURDATE()
    `, [branchId]);

    const b = branchRows[0];
    return {
      branch: {
        id: Number(b.id),
        code: b.code,
        name: b.name,
        address: b.address,
        active: Boolean(b.active),
        createdAt: b.created_at,
        settings: {
          maxOperationAmount: money(b.max_operation_amount),
          commissionType: b.commission_type,
          commissionValue: money(b.commission_value),
          staffSharePct: b.staff_share_pct == null ? null : num(b.staff_share_pct),
          partnerSharePct: b.partner_share_pct == null ? null : num(b.partner_share_pct)
        }
      },
      today: {
        operations: num(todayRows[0]?.operations_today),
        amount: money(todayRows[0]?.amount_today),
        commission: money(todayRows[0]?.commission_today)
      },
      users: userRows,
      cashSessions: cashRows,
      recentOperations: operationRows,
      closures: closureRows
    };
  });

  app.post("/api/admin/branches/:branchId/update", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;

    const parsedParams = branchParams.safeParse(request.params);
    const parsedBody = updateBranchBody.safeParse(request.body);
    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({ error: parsedBody.success ? "Filial inválida" : parsedBody.error.issues[0]?.message ?? "Datos inválidos" });
    }

    const { branchId } = parsedParams.data;
    const body = parsedBody.data;

    try {
      const [result] = await db.execute<any>(
        "UPDATE branches SET code = ?, name = ?, address = ?, active = ? WHERE id = ?",
        [body.code.toUpperCase(), body.name, body.address ?? null, body.active ? 1 : 0, branchId]
      );

      if (!result.affectedRows) return reply.code(404).send({ error: "Filial no encontrada" });

      await db.execute(
        `INSERT INTO audit_logs (branch_id, user_id, action, entity_type, entity_id, details)
         VALUES (?, ?, 'BRANCH_UPDATED', 'BRANCH', ?, JSON_OBJECT('name', ?, 'code', ?, 'active', ?))`,
        [branchId, auth.userId, branchId, body.name, body.code.toUpperCase(), body.active]
      );

      return { ok: true };
    } catch (error: any) {
      if (error?.code === "ER_DUP_ENTRY") {
        return reply.code(409).send({ error: "Ese código de filial ya existe" });
      }
      throw error;
    }
  });

  app.post("/api/admin/branches/:branchId/settings", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;

    const parsedParams = branchParams.safeParse(request.params);
    const parsedBody = branchSettingsBody.safeParse(request.body);
    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({
        error: parsedBody.success ? "Filial inválida" : parsedBody.error.issues[0]?.message ?? "Configuración inválida"
      });
    }

    const { branchId } = parsedParams.data;
    const body = parsedBody.data;

    const [result] = await db.execute<any>(
      `UPDATE branch_settings
       SET max_operation_amount = ?, commission_type = ?, commission_value = ?,
           staff_share_pct = ?, partner_share_pct = ?
       WHERE branch_id = ?`,
      [
        body.maxOperationAmount,
        body.commissionType,
        body.commissionValue,
        body.staffSharePct ?? null,
        body.partnerSharePct ?? null,
        branchId
      ]
    );

    if (!result.affectedRows) {
      return reply.code(404).send({ error: "Filial no encontrada" });
    }

    await db.execute(
      `INSERT INTO audit_logs (branch_id, user_id, action, entity_type, entity_id)
       VALUES (?, ?, 'BRANCH_SETTINGS_UPDATED', 'BRANCH', ?)`,
      [branchId, auth.userId, branchId]
    );

    return { ok: true };
  });

  app.get("/api/admin/roles", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;
    const [rows] = await db.query<any[]>("SELECT id, code, name FROM roles ORDER BY id");
    return { roles: rows };
  });

  app.get("/api/admin/users", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;

    const [rows] = await db.query<any[]>(`
      SELECT u.id, u.username, u.full_name, u.active, u.created_at, u.last_login_at,
             r.code AS role_code, r.name AS role_name,
             b.id AS branch_id, b.name AS branch_name
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN branches b ON b.id = u.branch_id
      ORDER BY u.active DESC, u.full_name
    `);

    return { users: rows };
  });

  app.post("/api/admin/users", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;

    const parsed = createUserBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    }

    const body = parsed.data;
    const branchRoles = ["BRANCH_ADMIN", "CASHIER"];
    if (branchRoles.includes(body.roleCode) && !body.branchId) {
      return reply.code(400).send({ error: "Ese rol requiere una filial asignada" });
    }

    const [roleRows] = await db.query<any[]>(
      "SELECT id FROM roles WHERE code = ? LIMIT 1",
      [body.roleCode]
    );
    if (!roleRows.length) {
      return reply.code(400).send({ error: "Rol inválido" });
    }

    if (body.branchId) {
      const [branchRows] = await db.query<any[]>(
        "SELECT id FROM branches WHERE id = ? AND active = 1 LIMIT 1",
        [body.branchId]
      );
      if (!branchRows.length) {
        return reply.code(400).send({ error: "Filial inválida o inactiva" });
      }
    }

    const passwordHash = await bcrypt.hash(body.password, 12);

    try {
      const [result] = await db.execute<any>(
        `INSERT INTO users (branch_id, role_id, username, password_hash, full_name, active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [
          body.branchId ?? null,
          roleRows[0].id,
          body.username.toLowerCase(),
          passwordHash,
          body.fullName
        ]
      );

      await db.execute(
        `INSERT INTO audit_logs (branch_id, user_id, action, entity_type, entity_id, details)
         VALUES (?, ?, 'USER_CREATED', 'USER', ?, JSON_OBJECT('username', ?, 'role', ?))`,
        [body.branchId ?? null, auth.userId, Number(result.insertId), body.username.toLowerCase(), body.roleCode]
      );

      return reply.code(201).send({ id: Number(result.insertId), ok: true });
    } catch (error: any) {
      if (error?.code === "ER_DUP_ENTRY") {
        return reply.code(409).send({ error: "Ese nombre de usuario ya existe" });
      }
      throw error;
    }
  });

  app.post("/api/admin/users/:userId/update", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;

    const parsedParams = userParams.safeParse(request.params);
    const parsedBody = updateUserBody.safeParse(request.body);
    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({ error: parsedBody.success ? "Usuario inválido" : parsedBody.error.issues[0]?.message ?? "Datos inválidos" });
    }

    const { userId } = parsedParams.data;
    const body = parsedBody.data;

    if (userId === auth.userId && (!body.active || body.roleCode !== "OWNER")) {
      return reply.code(400).send({ error: "No puedes quitar tu propio acceso de propietario" });
    }

    const branchRoles = ["BRANCH_ADMIN", "CASHIER"];
    if (branchRoles.includes(body.roleCode) && !body.branchId) {
      return reply.code(400).send({ error: "Ese rol requiere una filial asignada" });
    }

    const [roleRows] = await db.query<any[]>("SELECT id FROM roles WHERE code = ? LIMIT 1", [body.roleCode]);
    if (!roleRows.length) return reply.code(400).send({ error: "Rol inválido" });

    if (body.branchId) {
      const [branchRows] = await db.query<any[]>("SELECT id FROM branches WHERE id = ? LIMIT 1", [body.branchId]);
      if (!branchRows.length) return reply.code(400).send({ error: "Filial inválida" });
    }

    try {
      const [result] = await db.execute<any>(
        `UPDATE users
         SET branch_id = ?, role_id = ?, username = ?, full_name = ?, active = ?
         WHERE id = ?`,
        [
          branchRoles.includes(body.roleCode) ? body.branchId ?? null : null,
          roleRows[0].id,
          body.username.toLowerCase(),
          body.fullName,
          body.active ? 1 : 0,
          userId
        ]
      );

      if (!result.affectedRows) return reply.code(404).send({ error: "Usuario no encontrado" });

      if (!body.active) {
        await db.execute("UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL", [userId]);
      }

      await db.execute(
        `INSERT INTO audit_logs (branch_id, user_id, action, entity_type, entity_id, details)
         VALUES (?, ?, 'USER_UPDATED', 'USER', ?, JSON_OBJECT('username', ?, 'role', ?, 'active', ?))`,
        [branchRoles.includes(body.roleCode) ? body.branchId ?? null : null, auth.userId, userId, body.username.toLowerCase(), body.roleCode, body.active]
      );

      return { ok: true };
    } catch (error: any) {
      if (error?.code === "ER_DUP_ENTRY") return reply.code(409).send({ error: "Ese nombre de usuario ya existe" });
      throw error;
    }
  });

  app.post("/api/admin/users/:userId/reset-password", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;

    const parsedParams = userParams.safeParse(request.params);
    const parsedBody = resetPasswordBody.safeParse(request.body);
    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({ error: parsedBody.success ? "Usuario inválido" : parsedBody.error.issues[0]?.message ?? "Contraseña inválida" });
    }

    const passwordHash = await bcrypt.hash(parsedBody.data.password, 12);
    const [result] = await db.execute<any>("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, parsedParams.data.userId]);
    if (!result.affectedRows) return reply.code(404).send({ error: "Usuario no encontrado" });

    await db.execute("UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL", [parsedParams.data.userId]);
    await db.execute(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
       VALUES (?, 'USER_PASSWORD_RESET', 'USER', ?)`,
      [auth.userId, parsedParams.data.userId]
    );

    return { ok: true };
  });

  app.post("/api/admin/users/:userId/status", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;

    const parsedParams = userParams.safeParse(request.params);
    const parsedBody = toggleUserBody.safeParse(request.body);
    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({ error: "Datos inválidos" });
    }

    if (parsedParams.data.userId === auth.userId && !parsedBody.data.active) {
      return reply.code(400).send({ error: "No puedes desactivar tu propia cuenta" });
    }

    await db.execute(
      "UPDATE users SET active = ? WHERE id = ?",
      [parsedBody.data.active ? 1 : 0, parsedParams.data.userId]
    );

    if (!parsedBody.data.active) {
      await db.execute(
        "UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL",
        [parsedParams.data.userId]
      );
    }

    await db.execute(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES (?, 'USER_STATUS_CHANGED', 'USER', ?, JSON_OBJECT('active', ?))`,
      [auth.userId, parsedParams.data.userId, parsedBody.data.active]
    );

    return { ok: true };
  });

  app.get("/api/admin/operations", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;

    const parsed = historyQuery.safeParse(request.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Filtros inválidos" });

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (parsed.data.branchId) { conditions.push("o.branch_id = ?"); params.push(parsed.data.branchId); }
    if (parsed.data.from) { conditions.push("DATE(o.created_at) >= ?"); params.push(parsed.data.from); }
    if (parsed.data.to) { conditions.push("DATE(o.created_at) <= ?"); params.push(parsed.data.to); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows] = await db.query<any[]>(`
      SELECT o.id, o.operation_type, o.reference_code, o.customer_name, o.amount,
             o.commission, o.staff_share_amount, o.partner_share_amount,
             o.net_amount, o.status,
             DATE_FORMAT(o.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
             b.id AS branch_id, b.name AS branch_name,
             u.full_name AS registered_by,
             r.series AS receipt_series, r.sequence_number AS receipt_number
      FROM operations o
      JOIN branches b ON b.id = o.branch_id
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN receipts r ON r.operation_id = o.id
      ${where}
      ORDER BY o.created_at DESC
      LIMIT 1000
    `, params);

    return { operations: rows };
  });

  app.get("/api/admin/closures", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;

    const parsed = historyQuery.safeParse(request.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Filtros inválidos" });

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (parsed.data.branchId) { conditions.push("dc.branch_id = ?"); params.push(parsed.data.branchId); }
    if (parsed.data.from) { conditions.push("DATE(dc.closed_at) >= ?"); params.push(parsed.data.from); }
    if (parsed.data.to) { conditions.push("DATE(dc.closed_at) <= ?"); params.push(parsed.data.to); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows] = await db.query<any[]>(`
      SELECT dc.id, dc.operation_count, dc.commission_total,
             dc.staff_share_total, dc.partner_share_total,
             dc.expected_cash, dc.declared_cash, dc.expected_wallet,
             dc.declared_wallet, dc.difference_cash, dc.difference_wallet,
             dc.notes, DATE_FORMAT(dc.closed_at, '%Y-%m-%dT%H:%i:%s') AS closed_at,
             b.id AS branch_id, b.name AS branch_name
      FROM daily_closures dc
      JOIN branches b ON b.id = dc.branch_id
      ${where}
      ORDER BY dc.closed_at DESC
      LIMIT 500
    `, params);

    return { closures: rows };
  });

  app.get("/api/admin/audit", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;

    const [rows] = await db.query<any[]>(`
      SELECT a.id, a.action, a.entity_type, a.entity_id, a.details,
             DATE_FORMAT(a.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
             b.name AS branch_name, u.full_name AS user_name, u.username
      FROM audit_logs a
      LEFT JOIN branches b ON b.id = a.branch_id
      LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC
      LIMIT 300
    `);

    return { audit: rows };
  });
}
