import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { z } from "zod";
import { db } from "./db.js";
import { registerAdminRoutes } from "./admin.js";
import { registerReportRoutes } from "./reports.js";
import { ensureStage4Schema, registerStage4Routes } from "./stage4.js";
import {
  backfillMissingReceipts,
  calculateCommissionShares,
  ensureBusinessSchema,
  issueInternalReceipt
} from "./business.js";
import {
  bootstrapUsersIfEmpty,
  canReadBranch,
  canWriteBranch,
  changeOwnPassword,
  ensureAuthSchema,
  loginUser,
  logoutUser,
  publicUserById,
  requireAuth
} from "./auth.js";

const app = Fastify({ logger: true });

await app.register(cookie);
await app.register(cors, {
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"]
});

const branchParams = z.object({
  branchId: z.coerce.number().int().positive()
});

const loginBody = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(200),
  remember: z.boolean().optional().default(false)
});

const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10).max(200)
    .regex(/[A-Z]/, "Debe incluir una mayúscula")
    .regex(/[a-z]/, "Debe incluir una minúscula")
    .regex(/[0-9]/, "Debe incluir un número")
});

const operationBody = z.object({
  operationType: z.enum(["YAPE_TO_CASH", "CASH_TO_YAPE"]),
  referenceCode: z.string().trim().min(1).max(80).optional(),
  customerName: z.string().trim().max(140).optional(),
  amount: z.coerce.number().positive(),
  notes: z.string().trim().max(255).optional()
});

const openCashBody = z.object({
  initialCash: z.coerce.number().min(0),
  initialWallet: z.coerce.number().min(0)
});

const closeCashBody = z.object({
  declaredCash: z.coerce.number().min(0),
  declaredWallet: z.coerce.number().min(0),
  notes: z.string().trim().max(255).optional()
});

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function authorizeBranch(
  request: Parameters<typeof requireAuth>[0],
  reply: Parameters<typeof requireAuth>[1],
  branchId: number,
  write = false
) {
  const auth = await requireAuth(request, reply);
  if (!auth) return null;

  const allowed = write ? canWriteBranch(auth, branchId) : canReadBranch(auth, branchId);
  if (!allowed) {
    reply.code(403).send({
      error: "No tienes permiso para acceder a esta filial"
    });
    return null;
  }

  return auth;
}

app.get("/health", async () => {
  await db.query("SELECT 1");
  return { ok: true, service: "z-flow-api", auth: "enabled" };
});

/* Authentication */

app.post("/api/auth/login", async (request, reply) => {
  const parsed = loginBody.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "Usuario o contraseña inválidos" });
  }

  return loginUser(
    request,
    reply,
    parsed.data.username,
    parsed.data.password,
    parsed.data.remember
  );
});

app.post("/api/auth/logout", async (request, reply) => {
  return logoutUser(request, reply);
});

app.get("/api/auth/me", async (request, reply) => {
  const auth = await requireAuth(request, reply);
  if (!auth) return;
  return {
    authenticated: true,
    user: await publicUserById(auth.userId)
  };
});

app.post("/api/auth/change-password", async (request, reply) => {
  const auth = await requireAuth(request, reply);
  if (!auth) return;

  const parsed = changePasswordBody.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: parsed.error.issues[0]?.message ?? "La nueva contraseña no cumple los requisitos"
    });
  }

  const result = await changeOwnPassword(
    auth,
    parsed.data.currentPassword,
    parsed.data.newPassword
  );

  if (!result.ok) {
    return reply.code(400).send({ error: result.error });
  }

  await db.execute(
    `INSERT INTO audit_logs (branch_id, user_id, action, entity_type, entity_id)
     VALUES (?, ?, 'PASSWORD_CHANGED', 'USER', ?)`,
    [auth.branchId, auth.userId, auth.userId]
  );

  return { ok: true };
});

/* Branch dashboard */

app.get("/api/branches/:branchId/dashboard", async (request, reply) => {
  const parsed = branchParams.safeParse(request.params);
  if (!parsed.success) {
    return reply.code(400).send({ error: "Filial inválida" });
  }

  const { branchId } = parsed.data;
  const auth = await authorizeBranch(request, reply, branchId);
  if (!auth) return;

  const [branchRows] = await db.query<any[]>(
    "SELECT id, code, name, address, active FROM branches WHERE id = ? LIMIT 1",
    [branchId]
  );

  if (!branchRows.length) {
    return reply.code(404).send({ error: "Filial no encontrada" });
  }

  const [sessionRows] = await db.query<any[]>(
    `SELECT id, user_id, initial_cash, initial_wallet, status, started_at
     FROM cash_sessions
     WHERE branch_id = ? AND status = 'OPEN'
     ORDER BY started_at DESC
     LIMIT 1`,
    [branchId]
  );

  const [summaryRows] = await db.query<any[]>(
    `SELECT
       COUNT(*) AS operations_today,
       COALESCE(SUM(CASE WHEN operation_type = 'YAPE_TO_CASH' THEN amount ELSE 0 END), 0) AS yape_received,
       COALESCE(SUM(CASE WHEN operation_type = 'YAPE_TO_CASH' THEN net_amount ELSE 0 END), 0) AS cash_delivered,
       COALESCE(SUM(CASE WHEN operation_type = 'CASH_TO_YAPE' THEN amount ELSE 0 END), 0) AS cash_received,
       COALESCE(SUM(CASE WHEN operation_type = 'CASH_TO_YAPE' THEN net_amount ELSE 0 END), 0) AS yape_sent,
       COALESCE(SUM(commission), 0) AS commission_total
     FROM operations
     WHERE branch_id = ?
       AND DATE(created_at) = CURDATE()
       AND status = 'COMPLETED'`,
    [branchId]
  );

  const [recentRows] = await db.query<any[]>(
    `SELECT
       id, operation_type, reference_code, customer_name, amount, commission,
       net_amount, status,
       DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s') AS created_at
     FROM operations
     WHERE branch_id = ?
       AND DATE(created_at) = CURDATE()
     ORDER BY created_at DESC
     LIMIT 12`,
    [branchId]
  );

  const summary = summaryRows[0] ?? {};
  const session = sessionRows[0] ?? null;
  const initialCash = Number(session?.initial_cash ?? 0);
  const initialWallet = Number(session?.initial_wallet ?? 0);

  const cashCurrent = money(
    initialCash +
      Number(summary.cash_received ?? 0) -
      Number(summary.cash_delivered ?? 0)
  );
  const walletCurrent = money(
    initialWallet +
      Number(summary.yape_received ?? 0) -
      Number(summary.yape_sent ?? 0)
  );

  return {
    branch: branchRows[0],
    session,
    access: {
      role: auth.roleCode,
      canWrite: canWriteBranch(auth, branchId)
    },
    metrics: {
      operationsToday: Number(summary.operations_today ?? 0),
      yapeReceived: money(Number(summary.yape_received ?? 0)),
      cashDelivered: money(Number(summary.cash_delivered ?? 0)),
      commissionTotal: money(Number(summary.commission_total ?? 0)),
      cashCurrent,
      walletCurrent,
      cashDifference: 0
    },
    recentOperations: recentRows
  };
});

app.get("/api/branches/:branchId/operations", async (request, reply) => {
  const parsed = branchParams.safeParse(request.params);
  if (!parsed.success) {
    return reply.code(400).send({ error: "Filial inválida" });
  }

  const auth = await authorizeBranch(request, reply, parsed.data.branchId);
  if (!auth) return;

  const [rows] = await db.query<any[]>(
    `SELECT o.id, o.operation_type, o.reference_code, o.customer_name, o.amount,
            o.commission, o.staff_share_amount, o.partner_share_amount,
            o.net_amount, o.notes, o.status,
            DATE_FORMAT(o.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
            u.full_name AS registered_by,
            r.series AS receipt_series, r.sequence_number AS receipt_number
     FROM operations o
     LEFT JOIN users u ON u.id = o.user_id
     LEFT JOIN receipts r ON r.operation_id = o.id
     WHERE o.branch_id = ?
     ORDER BY o.created_at DESC
     LIMIT 500`,
    [parsed.data.branchId]
  );

  return { operations: rows };
});

app.post("/api/branches/:branchId/cash/open", async (request, reply) => {
  const parsedParams = branchParams.safeParse(request.params);
  const parsedBody = openCashBody.safeParse(request.body);

  if (!parsedParams.success || !parsedBody.success) {
    return reply.code(400).send({ error: "Datos de apertura inválidos" });
  }

  const { branchId } = parsedParams.data;
  const auth = await authorizeBranch(request, reply, branchId, true);
  if (!auth) return;

  const [existing] = await db.query<any[]>(
    "SELECT id FROM cash_sessions WHERE branch_id = ? AND status = 'OPEN' LIMIT 1",
    [branchId]
  );

  if (existing.length) {
    return reply.code(409).send({ error: "La caja ya se encuentra abierta" });
  }

  const [result] = await db.execute<any>(
    `INSERT INTO cash_sessions
      (branch_id, user_id, initial_cash, initial_wallet, status, started_at)
     VALUES (?, ?, ?, ?, 'OPEN', NOW())`,
    [
      branchId,
      auth.userId,
      money(parsedBody.data.initialCash),
      money(parsedBody.data.initialWallet)
    ]
  );

  await db.execute(
    `INSERT INTO audit_logs (branch_id, user_id, action, entity_type, entity_id, details)
     VALUES (?, ?, 'CASH_OPENED', 'CASH_SESSION', ?, JSON_OBJECT('initial_cash', ?, 'initial_wallet', ?))`,
    [
      branchId,
      auth.userId,
      Number(result.insertId),
      money(parsedBody.data.initialCash),
      money(parsedBody.data.initialWallet)
    ]
  );

  return reply.code(201).send({ id: Number(result.insertId), status: "OPEN" });
});

app.post("/api/branches/:branchId/cash/close", async (request, reply) => {
  const parsedParams = branchParams.safeParse(request.params);
  const parsedBody = closeCashBody.safeParse(request.body);

  if (!parsedParams.success || !parsedBody.success) {
    return reply.code(400).send({ error: "Datos de cierre inválidos" });
  }

  const { branchId } = parsedParams.data;
  const auth = await authorizeBranch(request, reply, branchId, true);
  if (!auth) return;

  const [sessionRows] = await db.query<any[]>(
    `SELECT id, initial_cash, initial_wallet
     FROM cash_sessions
     WHERE branch_id = ? AND status = 'OPEN'
     ORDER BY started_at DESC LIMIT 1`,
    [branchId]
  );

  if (!sessionRows.length) {
    return reply.code(409).send({ error: "No hay una caja abierta para cerrar" });
  }

  const session = sessionRows[0];
  const [summaryRows] = await db.query<any[]>(
    `SELECT
       COALESCE(SUM(CASE WHEN operation_type = 'YAPE_TO_CASH' AND status = 'COMPLETED' THEN amount ELSE 0 END), 0) AS yape_received,
       COALESCE(SUM(CASE WHEN operation_type = 'YAPE_TO_CASH' AND status = 'COMPLETED' THEN net_amount ELSE 0 END), 0) AS cash_delivered,
       COALESCE(SUM(CASE WHEN operation_type = 'CASH_TO_YAPE' AND status = 'COMPLETED' THEN amount ELSE 0 END), 0) AS cash_received,
       COALESCE(SUM(CASE WHEN operation_type = 'CASH_TO_YAPE' AND status = 'COMPLETED' THEN net_amount ELSE 0 END), 0) AS yape_sent,
       COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) AS operation_count,
       COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN commission ELSE 0 END), 0) AS commission_total,
       COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN staff_share_amount ELSE 0 END), 0) AS staff_share_total,
       COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN partner_share_amount ELSE 0 END), 0) AS partner_share_total
     FROM operations
     WHERE branch_id = ? AND cash_session_id = ?`,
    [branchId, session.id]
  );

  const s = summaryRows[0] ?? {};
  const expectedCash = money(
    Number(session.initial_cash) + Number(s.cash_received ?? 0) - Number(s.cash_delivered ?? 0)
  );
  const expectedWallet = money(
    Number(session.initial_wallet) + Number(s.yape_received ?? 0) - Number(s.yape_sent ?? 0)
  );

  const declaredCash = money(parsedBody.data.declaredCash);
  const declaredWallet = money(parsedBody.data.declaredWallet);
  const differenceCash = money(declaredCash - expectedCash);
  const differenceWallet = money(declaredWallet - expectedWallet);

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const operationCount = Number(s.operation_count ?? 0);
    const commissionTotal = money(Number(s.commission_total ?? 0));
    const staffShareTotal = money(Number(s.staff_share_total ?? 0));
    const partnerShareTotal = money(Number(s.partner_share_total ?? 0));

    const [closure] = await connection.execute<any>(
      `INSERT INTO daily_closures
       (branch_id, cash_session_id, operation_count, commission_total,
        staff_share_total, partner_share_total, expected_cash, declared_cash,
        expected_wallet, declared_wallet, difference_cash, difference_wallet, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        branchId,
        session.id,
        operationCount,
        commissionTotal,
        staffShareTotal,
        partnerShareTotal,
        expectedCash,
        declaredCash,
        expectedWallet,
        declaredWallet,
        differenceCash,
        differenceWallet,
        parsedBody.data.notes ?? null
      ]
    );

    await connection.execute(
      `UPDATE cash_sessions
       SET declared_cash = ?, declared_wallet = ?, status = 'CLOSED', ended_at = NOW()
       WHERE id = ?`,
      [declaredCash, declaredWallet, session.id]
    );

    await connection.execute(
      `INSERT INTO audit_logs (branch_id, user_id, action, entity_type, entity_id, details)
       VALUES (?, ?, 'CASH_CLOSED', 'DAILY_CLOSURE', ?,
         JSON_OBJECT('difference_cash', ?, 'difference_wallet', ?))`,
      [
        branchId,
        auth.userId,
        Number(closure.insertId),
        differenceCash,
        differenceWallet
      ]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return {
    status: "CLOSED",
    expectedCash,
    declaredCash,
    differenceCash,
    expectedWallet,
    declaredWallet,
    differenceWallet,
    operationCount: Number(s.operation_count ?? 0),
    commissionTotal: money(Number(s.commission_total ?? 0)),
    staffShareTotal: money(Number(s.staff_share_total ?? 0)),
    partnerShareTotal: money(Number(s.partner_share_total ?? 0))
  };
});

app.get("/api/branches/:branchId/settings", async (request, reply) => {
  const parsed = branchParams.safeParse(request.params);
  if (!parsed.success) {
    return reply.code(400).send({ error: "Filial inválida" });
  }

  const auth = await authorizeBranch(request, reply, parsed.data.branchId);
  if (!auth) return;

  const [rows] = await db.query<any[]>(
    `SELECT bs.max_operation_amount, bs.commission_type, bs.commission_value,
            bs.staff_share_pct, bs.partner_share_pct,
            ss.require_cash_to_yape_reference, ss.allow_cashier_cancel
     FROM branch_settings bs
     CROSS JOIN system_settings ss
     WHERE bs.branch_id = ? AND ss.id=1
     LIMIT 1`,
    [parsed.data.branchId]
  );

  if (!rows.length) {
    return reply.code(404).send({ error: "Configuración no encontrada" });
  }

  return rows[0];
});

app.post("/api/branches/:branchId/operations", async (request, reply) => {
  const parsedParams = branchParams.safeParse(request.params);
  const parsedBody = operationBody.safeParse(request.body);

  if (!parsedParams.success || !parsedBody.success) {
    return reply.code(400).send({ error: "Datos de operación inválidos" });
  }

  const { branchId } = parsedParams.data;
  const auth = await authorizeBranch(request, reply, branchId, true);
  if (!auth) return;

  const body = parsedBody.data;
  const [settingsRows] = await db.query<any[]>(
    `SELECT bs.max_operation_amount, bs.commission_type, bs.commission_value,
            bs.staff_share_pct, bs.partner_share_pct, b.code AS branch_code,
            ss.require_cash_to_yape_reference
     FROM branch_settings bs
     JOIN branches b ON b.id = bs.branch_id
     CROSS JOIN system_settings ss
     WHERE bs.branch_id = ? AND ss.id = 1
     LIMIT 1`,
    [branchId]
  );

  if (!settingsRows.length) {
    return reply.code(409).send({ error: "La filial no tiene reglas de comisión configuradas" });
  }

  const settings = settingsRows[0];
  const maxAmount = Number(settings.max_operation_amount);

  if (body.amount > maxAmount) {
    return reply.code(422).send({
      error: `El monto máximo configurado por operación es S/ ${maxAmount.toFixed(2)}`
    });
  }

  if (body.operationType === "YAPE_TO_CASH" && !body.referenceCode) {
    return reply.code(422).send({
      error: "El código/referencia es obligatorio para Yape → Efectivo"
    });
  }

  if (
    body.operationType === "CASH_TO_YAPE"
    && Boolean(settings.require_cash_to_yape_reference)
    && !body.referenceCode
  ) {
    return reply.code(422).send({
      error: "El código/referencia también es obligatorio para Efectivo → Yape según la configuración general"
    });
  }

  const commission =
    settings.commission_type === "PERCENT"
      ? money(body.amount * (Number(settings.commission_value) / 100))
      : money(Number(settings.commission_value));

  const netAmount = money(body.amount - commission);

  if (netAmount <= 0) {
    return reply.code(422).send({
      error: "La comisión no puede ser mayor o igual al monto"
    });
  }

  const [sessionRows] = await db.query<any[]>(
    `SELECT id FROM cash_sessions
     WHERE branch_id = ? AND status = 'OPEN'
     ORDER BY started_at DESC LIMIT 1`,
    [branchId]
  );

  if (!sessionRows.length) {
    return reply.code(409).send({
      error: "Debes abrir la caja antes de registrar operaciones"
    });
  }

  const shares = calculateCommissionShares(
    commission,
    settings.staff_share_pct == null ? null : Number(settings.staff_share_pct),
    settings.partner_share_pct == null ? null : Number(settings.partner_share_pct)
  );

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.execute<any>(
      `INSERT INTO operations
       (branch_id, cash_session_id, user_id, operation_type, reference_code,
        customer_name, amount, commission, staff_share_amount, partner_share_amount,
        net_amount, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')`,
      [
        branchId,
        sessionRows[0].id,
        auth.userId,
        body.operationType,
        body.referenceCode ?? null,
        body.customerName ?? null,
        money(body.amount),
        commission,
        shares.staffShareAmount,
        shares.partnerShareAmount,
        netAmount,
        body.notes ?? null
      ]
    );

    const operationId = Number(result.insertId);
    const receipt = await issueInternalReceipt(
      connection,
      branchId,
      String(settings.branch_code),
      operationId
    );

    await connection.execute(
      `INSERT INTO audit_logs (branch_id, user_id, action, entity_type, entity_id, details)
       VALUES (?, ?, 'OPERATION_CREATED', 'OPERATION', ?,
         JSON_OBJECT('type', ?, 'amount', ?, 'commission', ?, 'staff_share', ?, 'partner_share', ?))`,
      [
        branchId,
        auth.userId,
        operationId,
        body.operationType,
        money(body.amount),
        commission,
        shares.staffShareAmount,
        shares.partnerShareAmount
      ]
    );

    await connection.commit();

    return reply.code(201).send({
      id: operationId,
      operationType: body.operationType,
      amount: money(body.amount),
      commission,
      staffShareAmount: shares.staffShareAmount,
      partnerShareAmount: shares.partnerShareAmount,
      unassignedCommission: shares.unassignedAmount,
      netAmount,
      referenceCode: body.referenceCode ?? null,
      receipt: {
        series: receipt.series,
        number: Number(receipt.sequence_number)
      }
    });
  } catch (error: any) {
    await connection.rollback();
    if (error?.code === "ER_DUP_ENTRY") {
      return reply.code(409).send({
        error: "Ese código/referencia ya fue registrado en esta filial"
      });
    }
    throw error;
  } finally {
    connection.release();
  }
});

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  reply.code(500).send({ error: "Error interno de Z-FLOW" });
});

await ensureAuthSchema();
await ensureBusinessSchema();
await ensureStage4Schema();
await bootstrapUsersIfEmpty(app.log);
await backfillMissingReceipts();
await registerAdminRoutes(app);
await registerReportRoutes(app);
await registerStage4Routes(app);

const port = Number(process.env.PORT ?? 3001);
await app.listen({ host: "0.0.0.0", port });
