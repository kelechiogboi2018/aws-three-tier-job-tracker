const express = require("express");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  connectionTimeoutMillis: 5000,
ssl: process.env.DB_SSL === "true"
  ? { rejectUnauthorized: true }
  : false
});

pool.on("error", (error) => {
  console.error("Unexpected database connection error:", error.message);
});

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Job Application Tracker API" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/ready", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Database readiness check failed:", error.message);
    res.status(503).json({ status: "error", database: "unavailable" });
  }
});

app.get("/api/applications", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM applications ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Could not fetch applications:", error.message);
    res.status(500).json({ error: "Could not fetch applications" });
  }
});
app.post("/api/applications", async (req, res) => {
  const { company, job_title } = req.body || {};

  if (
    typeof company !== "string" ||
    typeof job_title !== "string" ||
    !company.trim() ||
    !job_title.trim() ||
    company.trim().length > 150 ||
    job_title.trim().length > 150
  ) {
    return res.status(400).json({
      error: "Company and job title must contain 1–150 characters."
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO applications (company, job_title)
       VALUES ($1, $2)
       RETURNING *`,
      [company.trim(), job_title.trim()]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Could not save application:", error.message);
    res.status(500).json({
      error: "Could not save application"
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend listening on port ${PORT}`);
});