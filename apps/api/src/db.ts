import mysql from "mysql2/promise";

const dbPassword = process.env.DB_PASSWORD;

if (!dbPassword) {
  throw new Error("DB_PASSWORD es obligatorio; configura el secreto antes de iniciar la API.");
}

export const db = mysql.createPool({
  host: process.env.DB_HOST ?? "db",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "zflow",
  password: dbPassword,
  database: process.env.DB_NAME ?? "zflow",
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  timezone: "Z"
});
