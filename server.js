import "dotenv/config";
import express from "express";
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { validate_sql } from "./validator.js";

const { Pool } = pg;
const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const caPath =
  process.env.PG_CA_CERT_PATH || path.join(__dirname, "certs", "do-ca.crt");
const ca = fs.readFileSync(caPath, "utf8");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    ca,
    rejectUnauthorized: true,
  },
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

app.post("/execute-sql", async (req, res) => {
  const sql = req.body?.sql;

  const [ok, reason] = validate_sql(sql);
  if (!ok) {
    return res.status(400).json({ error: reason });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("SET statement_timeout TO 10000");
    const started = Date.now();
    const result = await client.query(sql);
    const durationMs = Date.now() - started;

    console.log("Result:", result);

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
    if (client) client.release();
  }
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`SQL executor listening on port ${port}`);
});
