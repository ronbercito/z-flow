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
        COUNT(DISTINCT CASE WHEN DATE(o.created_at) = CURDATE() THEN o.id END) AS operations_today,
        COALESCE(SUM(CASE WHEN DATE(o.created_at) = CURDATE() AND o.status = 'COMPLETED' THEN o.commission ELSE 0 END), 0) AS commission_today,
        MAX(CASE WHEN cs.status = 'OPEN' THEN 1 ELSE 0 END) AS cash_open,
        MAX(CASE WHEN cs.status = 'OPEN' THEN cs.started_at ELSE NULL END) AS cash_started_at
      FROM branches b
      LEFT JOIN branch_settings bs ON bs.branch_id = b.id
      LEFT JOIN operations o ON o.branch_id = b.id
      LEFT JOIN cash_sessions cs ON cs.branch_id = b.id
      GROUP BY b.id, b.code, b.name, b.address, b.active,
               bs.max_operation_amount, bs.commission_type, bs.commission_value,
               bs.staff_share_pct, bs.partner_share_pct
      ORDER BY b.name
    `);

    const [recentRows] = await db.query<any[]>(`
      SELECT o.id, o.operation_type, o.reference_code, o.customer_name, o.amount,
             o.commission, o.net_amount, o.status,
             DATE_FORMAT(o.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
             b.id AS branch_id, b.name AS branch_name,
             u.full_name AS registered_by
      FROM operations o
      JOIN branches b ON b.id = o.branch_id
      LEFT JOIN users u ON u.id = o.user_id
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

    const [rows] = await db.query<any[]>(`
      SELECT o.id, o.operation_type, o.reference_code, o.customer_name, o.amount,
             o.commission, o.net_amount, o.status,
             DATE_FORMAT(o.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
             b.id AS branch_id, b.name AS branch_name,
             u.full_name AS registered_by
      FROM operations o
      JOIN branches b ON b.id = o.branch_id
      LEFT JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC
      LIMIT 500
    `);

    return { operations: rows };
  });

  app.get("/api/admin/closures", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;

    const [rows] = await db.query<any[]>(`
      SELECT dc.id, dc.expected_cash, dc.declared_cash, dc.expected_wallet,
             dc.declared_wallet, dc.difference_cash, dc.difference_wallet,
             dc.notes, DATE_FORMAT(dc.closed_at, '%Y-%m-%dT%H:%i:%s') AS closed_at,
             b.id AS branch_id, b.name AS branch_name
      FROM daily_closures dc
      JOIN branches b ON b.id = dc.branch_id
      ORDER BY dc.closed_at DESC
      LIMIT 200
    `);

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
