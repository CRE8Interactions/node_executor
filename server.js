import express from "express";
import pg from "pg";
import { validate_sql } from "./validator.js";

const { Pool } = pg;
const app = express();
app.use(express.json({ limit: "1mb" }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

(async () => {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    console.log("Database connectivity OK");
  } catch (err) {
    console.error("Database connectivity FAILED:", err.message);
  }
})();

app.post("/execute-sql", async (req, res) => {
  const sql = req.body?.sql;

  const [ok, reason] = validate_sql(sql);
  if (!ok) {
    return res.status(400).json({ error: reason });
  }

  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout TO 10000");
    const started = Date.now();
    const result = await client.query(sql);
    const durationMs = Date.now() - started;

    return res.json({
      rowCount: result.rowCount,
      columns: result.fields.map((f) => f.name),
      rows: result.rows,
      durationMs,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Query execution failed",
      detail: err.message,
    });
  } finally {
    client.release();
  }
});

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`SQL executor listening on port ${port}`);
});
