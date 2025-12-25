const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// =======================
// CONFIG
// =======================
const API_KEY = process.env.API_KEY; // WAJIB dari ENV
const STORAGE_DIR = "storage";

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

// =======================
// VALIDASI ENV
// =======================
if (!API_KEY) {
    console.error("API_KEY belum diset di environment");
    process.exit(1);
}

// =======================
// PASTIKAN FOLDER ADA
// =======================
if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// =======================
// MULTER CONFIG
// =======================
const upload = multer({
    dest: "temp/",
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// =======================
// ENDPOINT UPLOAD
// =======================
app.post("/backup/upload", upload.single("file"), async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "File tidak ditemukan" });
    }

    const filename = Date.now() + "_" + req.file.originalname;

    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: filename,
      Body: require("fs").createReadStream(req.file.path),
      ContentType: "application/zip"
    }));

    res.json({ success: true, filename });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// ROOT CHECK
// =======================
app.get("/", (req, res) => {
    res.send("SoftwarePro Backup API OK");
});

// =======================
// START SERVER
// =======================
app.listen(PORT, () => {
    console.log("SoftwarePro Backup API running on port", PORT);
});
