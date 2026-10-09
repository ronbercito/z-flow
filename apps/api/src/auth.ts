import type { FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db.js";

export type RoleCode = "OWNER" | "PARTNER" | "BRANCH_ADMIN" | "CASHIER" | "AUDITOR";

export type AuthContext = {
  userId: number;
  username: string;
  fullName: string;
  roleCode: RoleCode;
  roleName: string;
  branchId: number | null;
  branchName: string | null;
  sessionId: number;
  permissions: string[];
  accessibleBranchIds: number[];
};

const COOKIE_NAME = "zflow_session";
const failedLogins = new Map<string, {
  count: number;
  windowStartedAt: number;
  blockedUntil: number;
}>();
let lastFailedLoginPrune = 0;
const failedLoginWindowMs = 15 * 60 * 1000;
const maxFailedLoginKeys = 10_000;

function pruneFailedLogins(now: number) {
  if (now - lastFailedLoginPrune < 60_000 && failedLogins.size < maxFailedLoginKeys) return;
  lastFailedLoginPrune = now;
  for (const [key, attempt] of failedLogins) {
    if (now - attempt.windowStartedAt > failedLoginWindowMs && attempt.blockedUntil <= now) {
      failedLogins.delete(key);
    }
  }
  while (failedLogins.size >= maxFailedLoginKeys) {
    const oldestKey = failedLogins.keys().next().value;
    if (oldestKey === undefined) break;
    failedLogins.delete(oldestKey);
  }
}

function sessionHours(remember = false) {
  if (remember) return 24 * 7;
  const configured = Number(process.env.SESSION_HOURS ?? 12);
  return Number.isFinite(configured) && configured > 0 ? configured : 12;
}

function cookieSecure() {
  return String(process.env.COOKIE_SECURE ?? "false").toLowerCase() === "true";
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function tempPassword() {
  return `Zf!${randomBytes(10).toString("base64url")}`;
}

async function permissionsForRoleFromDb(roleId: number, roleCode: RoleCode) {
  try {
    const [rows] = await db.query<any[]>(
      "SELECT permission_code, enabled FROM role_permissions WHERE role_id=? ORDER BY permission_code",
      [roleId]
    );
    // Return an empty list when every permission was intentionally disabled.
    // The hard-coded defaults are only for databases that predate this schema.
    if (rows.length) {
      return rows
        .filter((row) => Number(row.enabled) === 1)
        .map((row) => String(row.permission_code));
    }
  } catch {
    // Stage 4 schema may not exist during an initial bootstrap; fall back to defaults.
  }
  return permissionsForRole(roleCode);
}

export function permissionsForRole(role: RoleCode) {
  const permissions: Record<RoleCode, string[]> = {
    OWNER: ["GLOBAL_READ", "GLOBAL_WRITE", "BRANCH_READ", "BRANCH_WRITE", "USER_ADMIN"],
    PARTNER: ["GLOBAL_READ", "BRANCH_READ"],
    BRANCH_ADMIN: ["BRANCH_READ", "BRANCH_WRITE", "BRANCH_USER_ADMIN"],
    CASHIER: ["BRANCH_READ", "BRANCH_WRITE"],
    AUDITOR: ["GLOBAL_READ", "BRANCH_READ", "AUDIT_READ"]
  };
  return permissions[role] ?? [];
}

export async function ensureAuthSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      revoked_at DATETIME NULL,
      ip_address VARCHAR(64) NULL,
      user_agent VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_auth_sessions_token_hash (token_hash),
      KEY idx_auth_sessions_user (user_id),
      KEY idx_auth_sessions_expiry (expires_at),
      CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS last_login_at DATETIME NULL
  `);

  await db.query(`
    DELETE FROM auth_sessions
    WHERE expires_at < NOW() OR (revoked_at IS NOT NULL AND revoked_at < DATE_SUB(NOW(), INTERVAL 7 DAY))
  `);
}

export async function bootstrapUsersIfEmpty(log: Pick<Console, "warn" | "info"> = console) {
  const [countRows] = await db.query<any[]>("SELECT COUNT(*) AS total FROM users");
  if (Number(countRows[0]?.total ?? 0) > 0) return;

  const [roles] = await db.query<any[]>(
    "SELECT id, code FROM roles WHERE code IN ('OWNER','CASHIER')"
  );
  const ownerRole = roles.find((role) => role.code === "OWNER");
  const cashierRole = roles.find((role) => role.code === "CASHIER");

  const [branches] = await db.query<any[]>(
    "SELECT id, name FROM branches WHERE active = 1 ORDER BY id LIMIT 1"
  );
  const firstBranch = branches[0];

  if (!ownerRole || !cashierRole || !firstBranch) {
    throw new Error("No se pudo crear usuarios iniciales: faltan roles o una filial activa");
  }

  const ownerPassword = tempPassword();
  const branchPassword = tempPassword();
  const [ownerHash, branchHash] = await Promise.all([
    bcrypt.hash(ownerPassword, 12),
    bcrypt.hash(branchPassword, 12)
  ]);

  await db.execute(
    `INSERT INTO users (branch_id, role_id, username, password_hash, full_name, active)
     VALUES (NULL, ?, 'admin', ?, 'Administrador Z-FLOW', 1)`,
    [ownerRole.id, ownerHash]
  );

  await db.execute(
    `INSERT INTO users (branch_id, role_id, username, password_hash, full_name, active)
     VALUES (?, ?, 'miraflores', ?, 'Encargado Miraflores', 1)`,
    [firstBranch.id, cashierRole.id, branchHash]
  );

  log.warn("============================================================");
  log.warn("Z-FLOW - CREDENCIALES TEMPORALES GENERADAS (GUARDAR AHORA)");
  log.warn(`OWNER      usuario: admin       contraseña: ${ownerPassword}`);
  log.warn(`FILIAL     usuario: miraflores  contraseña: ${branchPassword}`);
  log.warn("Cambie estas contraseñas después del primer ingreso.");
  log.warn("============================================================");
}

export async function loginUser(
  request: FastifyRequest,
  reply: FastifyReply,
  username: string,
  password: string,
  remember: boolean
) {
  const normalized = username.trim().toLowerCase();
  const key = `${request.ip}:${normalized}`;
  const now = Date.now();
  pruneFailedLogins(now);
  const attempt = failedLogins.get(key);

  if (attempt && attempt.blockedUntil > now) {
    const seconds = Math.ceil((attempt.blockedUntil - now) / 1000);
    return reply.code(429).send({
      error: `Demasiados intentos. Intenta nuevamente en ${seconds} segundos.`
    });
  }

  const [rows] = await db.query<any[]>(
    `SELECT u.id, u.branch_id, u.username, u.password_hash, u.full_name, u.active,
            r.code AS role_code, r.name AS role_name,
            b.name AS branch_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE LOWER(u.username) = ?
     LIMIT 1`,
    [normalized]
  );

  const user = rows[0];
  const valid = user?.active === 1 && await bcrypt.compare(password, user?.password_hash ?? "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid");

  if (!valid) {
    await db.execute(
      `INSERT INTO audit_logs
       (branch_id, user_id, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES (?, ?, 'LOGIN_FAILED', 'USER', ?, JSON_OBJECT('username', ?), ?, ?)`,
      [
        user?.branch_id ?? null,
        user?.id ?? null,
        user?.id ?? null,
        normalized,
        request.ip,
        String(request.headers["user-agent"] ?? "").slice(0, 255)
      ]
    );

    const prior = failedLogins.get(key);
    const current = prior && now - prior.windowStartedAt <= failedLoginWindowMs
      ? prior
      : { count: 0, windowStartedAt: now, blockedUntil: 0 };
    current.count += 1;
    if (current.count >= 5) {
      current.count = 0;
      current.windowStartedAt = now;
      current.blockedUntil = now + 5 * 60 * 1000;
    }
    // Refresh insertion order so the size cap removes the least recently used key.
    failedLogins.delete(key);
    failedLogins.set(key, current);
    return reply.code(401).send({ error: "Usuario o contraseña incorrectos" });
  }

  failedLogins.delete(key);

  const token = randomBytes(32).toString("base64url");
  const hours = sessionHours(remember);
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

  await db.execute(
    `INSERT INTO auth_sessions
       (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
    [
      user.id,
      tokenHash(token),
      expiresAt,
      request.ip,
      String(request.headers["user-agent"] ?? "").slice(0, 255)
    ]
  );

  await db.execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);
  await db.execute(
    `INSERT INTO audit_logs
      (branch_id, user_id, action, entity_type, entity_id, details, ip_address, user_agent)
     VALUES (?, ?, 'LOGIN', 'USER', ?, JSON_OBJECT('ip', ?), ?, ?)`,
    [
      user.branch_id ?? null,
      user.id,
      user.id,
      request.ip,
      request.ip,
      String(request.headers["user-agent"] ?? "").slice(0, 255)
    ]
  );

  reply.setCookie(COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    maxAge: hours * 60 * 60
  });

  return {
    ok: true,
    user: await publicUserById(user.id)
  };
}

export async function logoutUser(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[COOKIE_NAME];
  if (token) {
    const [rows] = await db.query<any[]>(
      `SELECT s.id, u.id AS user_id, u.branch_id
       FROM auth_sessions s
       JOIN users u ON u.id=s.user_id
       WHERE s.token_hash=? LIMIT 1`,
      [tokenHash(token)]
    );

    await db.execute(
      "UPDATE auth_sessions SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL",
      [tokenHash(token)]
    );

    if (rows.length) {
      await db.execute(
        `INSERT INTO audit_logs
         (branch_id, user_id, action, entity_type, entity_id, details, ip_address, user_agent)
         VALUES (?, ?, 'LOGOUT', 'AUTH_SESSION', ?, JSON_OBJECT('ip', ?), ?, ?)`,
        [
          rows[0].branch_id ?? null,
          rows[0].user_id,
          rows[0].id,
          request.ip,
          request.ip,
          String(request.headers["user-agent"] ?? "").slice(0, 255)
        ]
      );
    }
  }

  reply.clearCookie(COOKIE_NAME, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure()
  });

  return { ok: true };
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<AuthContext | null> {
  const token = request.cookies[COOKIE_NAME];
  if (!token) {
    reply.code(401).send({ error: "Debes iniciar sesión" });
    return null;
  }

  const [rows] = await db.query<any[]>(
    `SELECT s.id AS session_id, u.id AS user_id, u.username, u.full_name,
            u.branch_id, r.id AS role_id, r.code AS role_code, r.name AS role_name,
            b.name AS branch_name
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE s.token_hash = ?
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
       AND u.active = 1
     LIMIT 1`,
    [tokenHash(token)]
  );

  const row = rows[0];
  if (!row) {
    reply.clearCookie(COOKIE_NAME, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure()
    });
    reply.code(401).send({ error: "La sesión expiró. Inicia sesión nuevamente." });
    return null;
  }

  let accessibleBranchIds: number[] = [];
  if (row.role_code === "PARTNER") {
    const [partnerBranches] = await db.query<any[]>(
      `SELECT branch_id
       FROM branch_partner_assignments
       WHERE user_id=? AND active=1
       ORDER BY id`,
      [row.user_id]
    );
    accessibleBranchIds = partnerBranches.map((item) => Number(item.branch_id));
  } else if (row.branch_id != null) {
    accessibleBranchIds = [Number(row.branch_id)];
  }

  return {
    userId: Number(row.user_id),
    username: row.username,
    fullName: row.full_name,
    roleCode: row.role_code as RoleCode,
    roleName: row.role_name,
    branchId: row.branch_id == null ? null : Number(row.branch_id),
    branchName: row.branch_name ?? null,
    sessionId: Number(row.session_id),
    permissions: await permissionsForRoleFromDb(Number(row.role_id), row.role_code as RoleCode),
    accessibleBranchIds
  };
}

export function canReadBranch(auth: AuthContext, branchId: number) {
  if (auth.roleCode === "PARTNER") {
    return auth.permissions.includes("BRANCH_READ") && auth.accessibleBranchIds.includes(branchId);
  }
  if (auth.roleCode !== "CASHIER" && auth.roleCode !== "BRANCH_ADMIN"
      && auth.permissions.includes("GLOBAL_READ")) return true;
  return auth.permissions.includes("BRANCH_READ") && auth.branchId === branchId;
}

export function canWriteBranch(auth: AuthContext, branchId: number) {
  if (auth.roleCode === "OWNER" && auth.permissions.includes("GLOBAL_WRITE")) return true;
  return auth.permissions.includes("BRANCH_WRITE") && auth.branchId === branchId;
}

export async function publicUserById(userId: number) {
  const [rows] = await db.query<any[]>(
    `SELECT u.id, u.username, u.full_name, u.branch_id, u.last_login_at,
            r.id AS role_id, r.code AS role_code, r.name AS role_name,
            b.id AS branch_real_id, b.code AS branch_code, b.name AS branch_name,
            b.address AS branch_address
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE u.id = ? LIMIT 1`,
    [userId]
  );

  const row = rows[0];
  if (!row) return null;

  let defaultBranch = null;
  if (row.branch_id == null) {
    if (row.role_code === "PARTNER") {
      const [branches] = await db.query<any[]>(`
        SELECT b.id, b.code, b.name, b.address
        FROM branch_partner_assignments a
        JOIN branches b ON b.id=a.branch_id
        WHERE a.user_id=? AND a.active=1 AND b.active=1
        ORDER BY a.id
        LIMIT 1
      `, [userId]);
      defaultBranch = branches[0] ?? null;
    } else {
      const [branches] = await db.query<any[]>(
        "SELECT id, code, name, address FROM branches WHERE active = 1 ORDER BY id LIMIT 1"
      );
      defaultBranch = branches[0] ?? null;
    }
  }

  return {
    id: Number(row.id),
    username: row.username,
    fullName: row.full_name,
    role: {
      code: row.role_code,
      name: row.role_name
    },
    permissions: await permissionsForRoleFromDb(Number(row.role_id), row.role_code as RoleCode),
    branch: row.branch_id == null ? null : {
      id: Number(row.branch_real_id),
      code: row.branch_code,
      name: row.branch_name,
      address: row.branch_address
    },
    defaultBranch,
    lastLoginAt: row.last_login_at
  };
}

export async function changeOwnPassword(
  auth: AuthContext,
  currentPassword: string,
  newPassword: string
) {
  const [rows] = await db.query<any[]>(
    "SELECT password_hash FROM users WHERE id = ? LIMIT 1",
    [auth.userId]
  );
  const valid = await bcrypt.compare(currentPassword, rows[0]?.password_hash ?? "");
  if (!valid) {
    return { ok: false, error: "La contraseña actual no es correcta" };
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.execute("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, auth.userId]);
  await db.execute(
    "UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = ? AND id <> ? AND revoked_at IS NULL",
    [auth.userId, auth.sessionId]
  );

  return { ok: true };
}
