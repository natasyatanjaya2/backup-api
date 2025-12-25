const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ===== CONFIG =====
const API_KEY = process.env.API_KEY || "DEV_KEY";
const STORAGE_DIR = "storage";

// ===== PASTIKAN FOLDER ADA =====
if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR);
}

// ===== MULTER =====
const upload = multer({
    dest: "temp/",
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// ===== ENDPOINT UPLOAD =====
app.post("/backup/upload", upload.single("file"), (req, res) => {

    // 1️⃣ Validasi API Key
    const apiKey = req.headers["x-api-key"];
    if (!apiKey || apiKey !== API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    // 2️⃣ Validasi file
    if (!req.file) {
        return res.status(400).json({ error: "File tidak ditemukan" });
    }

    // 3️⃣ Rename & simpan
    const filename =
        Date.now() + "_" + req.file.originalname.replace(/\s/g, "_");

    const targetPath = path.join(STORAGE_DIR, filename);
    fs.renameSync(req.file.path, targetPath);

    // 4️⃣ Response
    res.json({
        success: true,
        filename: filename
    });
});

// ===== START SERVER =====
app.listen(PORT, () => {
    console.log("SoftwarePro Backup API running on port", PORT);
});
