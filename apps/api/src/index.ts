import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { db } from "./db.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "OPTIONS"]
});

const branchParams = z.object({
  branchId: z.coerce.number().int().positive()
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

app.get("/health", async () => {
  await db.query("SELECT 1");
  return { ok: true, service: "z-flow-api" };
});

app.get("/api/branches/:branchId/dashboard", async (request, reply) => {
  const parsed = branchParams.safeParse(request.params);
  if (!parsed.success) {
    return reply.code(400).send({ error: "Filial inválida" });
  }

  const { branchId } = parsed.data;

  const [branchRows] = await db.query<any[]>(
    "SELECT id, code, name, address, active FROM branches WHERE id = ? LIMIT 1",
    [branchId]
  );

  if (!branchRows.length) {
    return reply.code(404).send({ error: "Filial no encontrada" });
  }

  const [sessionRows] = await db.query<any[]>(
    `SELECT id, initial_cash, initial_wallet, status, started_at
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
       id,
       operation_type,
       reference_code,
       customer_name,
       amount,
       commission,
       net_amount,
       status,
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

  const [rows] = await db.query<any[]>(
    `SELECT id, operation_type, reference_code, customer_name, amount, commission,
            net_amount, notes, status,
            DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s') AS created_at
     FROM operations
     WHERE branch_id = ?
     ORDER BY created_at DESC
     LIMIT 100`,
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
  const [existing] = await db.query<any[]>(
    "SELECT id FROM cash_sessions WHERE branch_id = ? AND status = 'OPEN' LIMIT 1",
    [branchId]
  );

  if (existing.length) {
    return reply.code(409).send({ error: "La caja ya se encuentra abierta" });
  }

  const [result] = await db.execute<any>(
    `INSERT INTO cash_sessions
      (branch_id, initial_cash, initial_wallet, status, started_at)
     VALUES (?, ?, ?, 'OPEN', NOW())`,
    [branchId, money(parsedBody.data.initialCash), money(parsedBody.data.initialWallet)]
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
       COALESCE(SUM(CASE WHEN operation_type = 'CASH_TO_YAPE' AND status = 'COMPLETED' THEN net_amount ELSE 0 END), 0) AS yape_sent
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

    await connection.execute(
      `INSERT INTO daily_closures
       (branch_id, cash_session_id, expected_cash, declared_cash, expected_wallet,
        declared_wallet, difference_cash, difference_wallet, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        branchId,
        session.id,
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
    differenceWallet
  };
});

app.get("/api/branches/:branchId/settings", async (request, reply) => {
  const parsed = branchParams.safeParse(request.params);
  if (!parsed.success) {
    return reply.code(400).send({ error: "Filial inválida" });
  }

  const [rows] = await db.query<any[]>(
    `SELECT max_operation_amount, commission_type, commission_value,
            staff_share_pct, partner_share_pct
     FROM branch_settings
     WHERE branch_id = ? LIMIT 1`,
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
  const body = parsedBody.data;

  const [settingsRows] = await db.query<any[]>(
    `SELECT max_operation_amount, commission_type, commission_value
     FROM branch_settings
     WHERE branch_id = ? LIMIT 1`,
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
    return reply.code(422).send({ error: "El código/referencia es obligatorio para Yape → Efectivo" });
  }

  const commission =
    settings.commission_type === "PERCENT"
      ? money(body.amount * (Number(settings.commission_value) / 100))
      : money(Number(settings.commission_value));

  const netAmount = money(body.amount - commission);

  if (netAmount <= 0) {
    return reply.code(422).send({ error: "La comisión no puede ser mayor o igual al monto" });
  }

  const [sessionRows] = await db.query<any[]>(
    `SELECT id FROM cash_sessions
     WHERE branch_id = ? AND status = 'OPEN'
     ORDER BY started_at DESC LIMIT 1`,
    [branchId]
  );

  if (!sessionRows.length) {
    return reply.code(409).send({ error: "Debes abrir la caja antes de registrar operaciones" });
  }

  try {
    const [result] = await db.execute<any>(
      `INSERT INTO operations
       (branch_id, cash_session_id, operation_type, reference_code, customer_name,
        amount, commission, net_amount, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')`,
      [
        branchId,
        sessionRows[0].id,
        body.operationType,
        body.referenceCode ?? null,
        body.customerName ?? null,
        money(body.amount),
        commission,
        netAmount,
        body.notes ?? null
      ]
    );

    return reply.code(201).send({
      id: Number(result.insertId),
      operationType: body.operationType,
      amount: money(body.amount),
      commission,
      netAmount,
      referenceCode: body.referenceCode ?? null
    });
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") {
      return reply.code(409).send({ error: "Ese código/referencia ya fue registrado en esta filial" });
    }
    throw error;
  }
});

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  reply.code(500).send({ error: "Error interno de Z-FLOW" });
});

const port = Number(process.env.PORT ?? 3001);
await app.listen({ host: "0.0.0.0", port });
