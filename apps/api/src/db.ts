import mysql from "mysql2/promise";

export const db = mysql.createPool({
  host: process.env.DB_HOST ?? "db",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "zflow",
  password: process.env.DB_PASSWORD ?? "zflow_local_change_me",
  database: process.env.DB_NAME ?? "zflow",
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  timezone: "Z"
});
