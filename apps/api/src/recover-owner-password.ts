import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { db } from "./db.js";

async function main() {
  const requestedUsername = process.argv[2]?.trim();
  const [rows] = await db.query<any[]>(
    `SELECT u.id, u.username
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.code = 'OWNER' AND u.active = 1
       AND (? IS NULL OR u.username = ?)
     ORDER BY u.id`,
    [requestedUsername || null, requestedUsername || null]
  );

  if (rows.length !== 1) {
    if (!rows.length) {
      console.error(requestedUsername
        ? `No existe una cuenta propietaria activa con el usuario "${requestedUsername}".`
        : "No hay una cuenta propietaria activa.");
    } else {
      console.error("Hay varias cuentas propietarias. Indica el usuario al ejecutar el comando:");
      for (const row of rows) console.error(` - ${row.username}`);
    }
    process.exitCode = 1;
    return;
  }

  const owner = rows[0];
  const temporaryPassword = randomBytes(18).toString("base64url") + "A7a!";
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute(
      "UPDATE users SET password_hash = ? WHERE id = ? AND active = 1",
      [passwordHash, owner.id]
    );
    await connection.execute(
      "UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL",
      [owner.id]
    );
    await connection.commit();
    console.log(`Contraseña temporal para ${owner.username}: ${temporaryPassword}`);
    console.log("Inicia sesión y cámbiala inmediatamente desde Mi perfil.");
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

main()
  .catch((error) => {
    console.error("No se pudo recuperar la cuenta propietaria:", error);
    process.exitCode = 1;
  })
  .finally(() => db.end());
