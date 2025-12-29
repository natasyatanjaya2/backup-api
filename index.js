const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const app = express();
const PORT = process.env.PORT || 3000;

// =======================
// CONFIG
// =======================
const API_KEY = process.env.API_KEY;
const TEMP_DIR = "temp";

const mysql = require("mysql2/promise");
const nodemailer = require("nodemailer");
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

// =======================
// VALIDASI ENV
// =======================
if (!API_KEY) {
  console.error("❌ API_KEY belum diset");
  process.exit(1);
}

// =======================
// PASTIKAN FOLDER TEMP ADA
// =======================
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// =======================
// R2 CLIENT
// =======================
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

// =======================
// MULTER
// =======================
const upload = multer({
  dest: TEMP_DIR,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// =======================
// REQUEST LOGGER (GLOBAL)
// =======================
app.use((req, res, next) => {
  console.log("➡️", req.method, req.url);
  next();
});

// =======================
// DB CONNECTION
// =======================
const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// =======================
// EMAIL TRANSPORTER
// =======================
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// =======================
// UPLOAD ENDPOINT
// =======================
app.post("/backup/upload", upload.single("file"), async (req, res) => {
  console.log("📦 Upload endpoint hit");
  console.log("===== AUTH DEBUG =====");
  console.log("HEADER x-api-key :", req.headers["x-api-key"]);
  console.log("ENV API_KEY     :", process.env.API_KEY);
  console.log("MATCH           :", req.headers["x-api-key"] === process.env.API_KEY);
  console.log("======================");

  try {
    const apiKey = req.headers["x-api-key"];
    console.log("🔑 API KEY HEADER:", apiKey ? "ADA" : "KOSONG");

    if (apiKey !== API_KEY) {
      console.warn("❌ API KEY SALAH");
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!req.file) {
      console.warn("❌ FILE TIDAK ADA");
      return res.status(400).json({ error: "File tidak ditemukan" });
    }

    console.log("📁 File diterima:", req.file.originalname);

    const filename = Date.now() + "_" + req.file.originalname;

    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: filename,
      Body: fs.createReadStream(req.file.path),
      ContentType: "application/zip"
    }));

    console.log("✅ Upload ke R2 sukses:", filename);

    res.json({ success: true, filename });
  } catch (err) {
    console.error("🔥 ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/backup/list", async (req, res) => {
  if (req.headers["x-api-key"] !== process.env.API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { ListObjectsV2Command } = require("@aws-sdk/client-s3");

  const result = await r2.send(new ListObjectsV2Command({
    Bucket: process.env.R2_BUCKET
  }));

  const files = (result.Contents || []).map(f => ({
    filename: f.Key,
    size: f.Size,
    lastModified: f.LastModified
  }));

  res.json(files);
});

app.get("/backup/download/:filename", async (req, res) => {
  if (req.headers["x-api-key"] !== process.env.API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { GetObjectCommand } = require("@aws-sdk/client-s3");

  const file = await r2.send(new GetObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: req.params.filename
  }));

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${req.params.filename}"`
  );

  file.Body.pipe(res);
});

async function sendVerificationEmail(email, code) {
  await resend.emails.send({
    from: "SoftwarePro <onboarding@resend.dev>",
    to: [email],
    subject: "Kode Verifikasi SoftwarePro",
    html: `
      <div style="font-family: Arial, sans-serif">
        <h2>Kode Verifikasi SoftwarePro</h2>
        <p>Gunakan kode berikut untuk melanjutkan registrasi:</p>
        <h1 style="letter-spacing: 4px;">${code}</h1>
        <p style="font-size:12px;color:#666">
          Kode berlaku selama 5 menit.
        </p>
      </div>
    `
  });
}

app.post("/auth/send-code", express.json(), async (req, res) => {
  try {
    // =======================
    // API KEY CHECK
    // =======================
    if (req.headers["x-api-key"] !== API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { username, email } = req.body;

    if (!username || !email || !email.includes("@")) {
      return res.status(400).json({ error: "Data tidak valid" });
    }

    // =======================
    // GENERATE CODE
    // =======================
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expired = new Date(Date.now() + 5 * 60 * 1000); // 5 menit

    // =======================
    // INSERT / UPDATE USER
    // =======================
    const [rows] = await db.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (rows.length > 0) {
      await db.query(
        `UPDATE users SET
          username = ?,
          email_verified = 0,
          email_verification_code = ?,
          email_verification_expired = ?
         WHERE email = ?`,
        [username, code, expired, email]
      );
    } else {
      await db.query(
        `INSERT INTO users
          (username, email, email_verified, email_verification_code, email_verification_expired)
         VALUES (?, ?, 0, ?, ?)`,
        [username, email, code, expired]
      );
    }

    res.json({ success: true });
    await sendVerificationEmail("prosoftware087@gmail.com", "850104");
  } catch (err) {
    console.error("🔥 SEND CODE ERROR:", err);
    res.status(500).json({ error: "Gagal mengirim kode" });
  }
});

// =======================
// ROOT
// =======================
app.get("/", (req, res) => {
  res.send("SoftwarePro Backup API OK");
});

// =======================
// START
// =======================
app.listen(PORT, () => {
  console.log("🚀 Backup API running on port", PORT);
});
