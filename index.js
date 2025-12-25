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
