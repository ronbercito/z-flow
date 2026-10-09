import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { z } from "zod";
import { db } from "./db.js";
import { requireAuth } from "./auth.js";

const backupDir = resolve(process.env.ZFLOW_BACKUP_DIR ?? "/backups");
const maxUploadBytes = 100 * 1024 * 1024;
const restoreBody = z.object({
  filename: z.string().regex(/^(zflow|uploaded)_\d{14}(?:_\d+)?\.sql\.gz$/),
  confirmation: z.literal("RESTAURAR")
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

function validFilename(filename: string) {
  return /^(zflow|uploaded)_\d{14}(?:_\d+)?\.sql\.gz$/.test(filename);
}

function stamp() {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

async function uniqueFilename(prefix: "zflow" | "uploaded") {
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const base = `${prefix}_${stamp()}`;
  let filename = `${base}.sql.gz`;
  let suffix = 1;
  while (true) {
    try {
      await stat(join(backupDir, filename));
      filename = `${base}_${suffix++}.sql.gz`;
    } catch {
      return filename;
    }
  }
}

function databaseArgs() {
  return [
    "--host", process.env.DB_HOST ?? "db",
    "--port", process.env.DB_PORT ?? "3306",
    "--user", process.env.DB_USER ?? "zflow"
  ];
}

function databaseEnv() {
  return { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD ?? "" };
}

function waitForClient(client: ReturnType<typeof spawn>) {
  let stderr = "";
  client.stderr?.on("data", (chunk) => { stderr += String(chunk).slice(0, 4000); });
  return new Promise<void>((resolvePromise, rejectPromise) => {
    client.once("error", rejectPromise);
    client.once("close", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(stderr.trim() || `El cliente MariaDB terminó con código ${code}`));
    });
  });
}

async function createBackup() {
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const filename = await uniqueFilename("zflow");
  const output = join(backupDir, filename);
  const client = spawn("mariadb-dump", [
    "--single-transaction",
    ...databaseArgs(), process.env.DB_NAME ?? "zflow"
  ], { env: databaseEnv(), stdio: ["ignore", "pipe", "pipe"] });
  const completed = waitForClient(client);
  try {
    if (!client.stdout) throw new Error("No se pudo iniciar el volcado de MariaDB");
    await Promise.all([
      pipeline(client.stdout, createGzip({ level: 9 }), createWriteStream(output, { flags: "wx", mode: 0o600 })),
      completed
    ]);
    return filename;
  } catch (error) {
    client.kill();
    await unlink(output).catch(() => undefined);
    throw error;
  }
}

async function validateDump(path: string) {
  let sample = Buffer.alloc(0);
  const gunzip = createReadStream(path).pipe(createGunzip());
  for await (const chunk of gunzip) {
    if (sample.length < 256_000) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      sample = Buffer.concat([sample, buffer.subarray(0, 256_000 - sample.length)]);
    }
  }
  const sql = sample.toString("utf8");
  if (!/CREATE\s+TABLE/i.test(sql) || /DROP\s+DATABASE|CREATE\s+DATABASE/i.test(sql)) {
    throw new Error("El archivo no parece una copia SQL de Z-FLOW.");
  }
}

async function importDump(path: string) {
  const client = spawn("mariadb", [
    ...databaseArgs(), process.env.DB_NAME ?? "zflow"
  ], { env: databaseEnv(), stdio: ["pipe", "ignore", "pipe"] });
  const completed = waitForClient(client);
  try {
    if (!client.stdin) throw new Error("No se pudo iniciar el cliente MariaDB");
    await Promise.all([
      pipeline(createReadStream(path), createGunzip(), client.stdin),
      completed
    ]);
  } catch (error) {
    client.kill();
    throw error;
  }
}

export async function registerBackupRoutes(app: FastifyInstance) {
  app.addContentTypeParser(
    "application/gzip",
    { parseAs: "buffer", bodyLimit: maxUploadBytes },
    (_request, body, done) => done(null, body)
  );

  app.get("/api/admin/backups", async (request, reply) => {
    if (!(await requireOwner(request, reply))) return;
    await mkdir(backupDir, { recursive: true, mode: 0o700 });
    const entries = await readdir(backupDir, { withFileTypes: true });
    const backups = await Promise.all(entries
      .filter((entry) => entry.isFile() && validFilename(entry.name))
      .map(async (entry) => {
        const info = await stat(join(backupDir, entry.name));
        return { filename: entry.name, size: info.size, createdAt: info.mtime.toISOString() };
      }));
    return { backups: backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
  });

  app.post("/api/admin/backups", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;
    try {
      const filename = await createBackup();
      await db.execute(
        "INSERT INTO audit_logs (user_id, action, entity_type, details, ip_address, user_agent) VALUES (?, 'DATABASE_BACKUP_CREATED', 'DATABASE', ?, ?, ?)",
        [auth.userId, JSON.stringify({ filename }), request.ip, String(request.headers["user-agent"] ?? "").slice(0, 255)]
      ).catch(() => undefined);
      return reply.code(201).send({ filename });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: "No se pudo crear la copia de seguridad." });
    }
  });

  app.get<{ Params: { filename: string } }>("/api/admin/backups/:filename/download", async (request, reply) => {
    if (!(await requireOwner(request, reply))) return;
    const filename = request.params.filename;
    if (!validFilename(filename)) return reply.code(400).send({ error: "Nombre de copia inválido." });
    const path = join(backupDir, filename);
    try {
      await stat(path);
      return reply
        .header("Content-Type", "application/gzip")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(createReadStream(path));
    } catch {
      return reply.code(404).send({ error: "No se encontró la copia solicitada." });
    }
  });

  app.post("/api/admin/backups/upload", async (request, reply) => {
    if (!(await requireOwner(request, reply))) return;
    const body = request.body;
    if (!Buffer.isBuffer(body) || body.length < 20 || body.length > maxUploadBytes || body[0] !== 0x1f || body[1] !== 0x8b) {
      return reply.code(400).send({ error: "Sube una copia .sql.gz válida (máximo 100 MB)." });
    }
    const filename = await uniqueFilename("uploaded");
    const path = join(backupDir, filename);
    try {
      await pipeline(Readable.from([body]), createWriteStream(path, { flags: "wx", mode: 0o600 }));
      await validateDump(path);
      return reply.code(201).send({ filename });
    } catch (error) {
      await unlink(path).catch(() => undefined);
      return reply.code(400).send({ error: error instanceof Error ? error.message : "La copia no es válida." });
    }
  });

  app.post("/api/admin/backups/restore", async (request, reply) => {
    const auth = await requireOwner(request, reply);
    if (!auth) return;
    const parsed = restoreBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Confirma escribiendo RESTAURAR." });
    const filename = parsed.data.filename;
    const source = join(backupDir, filename);
    try {
      await validateDump(source);
    } catch {
      return reply.code(400).send({ error: "La copia no existe o no es válida." });
    }

    const [openRows] = await db.query<any[]>("SELECT COUNT(*) AS total FROM cash_sessions WHERE status='OPEN'");
    if (Number(openRows[0]?.total ?? 0) > 0) {
      return reply.code(409).send({ error: "Cierra todas las cajas abiertas antes de restaurar una copia." });
    }

    let safetyCopy = "";
    try {
      safetyCopy = await createBackup();
      await importDump(source);
      await db.execute(
        "INSERT INTO audit_logs (user_id, action, entity_type, details, ip_address, user_agent) VALUES (?, 'DATABASE_BACKUP_RESTORED', 'DATABASE', ?, ?, ?)",
        [auth.userId, JSON.stringify({ filename, safetyCopy }), request.ip, String(request.headers["user-agent"] ?? "").slice(0, 255)]
      ).catch(() => undefined);
      return { ok: true, filename, safetyCopy };
    } catch (error) {
      request.log.error(error);
      let recovered = false;
      if (safetyCopy) {
        try {
          await importDump(join(backupDir, safetyCopy));
          recovered = true;
        } catch (recoveryError) {
          request.log.error(recoveryError);
        }
      }
      return reply.code(500).send({
        error: recovered
          ? `Falló la restauración; se recuperaron los datos anteriores desde ${safetyCopy}.`
          : safetyCopy
            ? `Falló la restauración. Conserva la copia previa: ${safetyCopy}.`
            : "Falló la restauración y no se pudo crear la copia previa.",
        safetyCopy: safetyCopy || null,
        recovered
      });
    }
  });
}
