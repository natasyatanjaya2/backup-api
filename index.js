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
app.post("/backup/upload", upload.single("file"), (req, res) => {

    // Validasi API Key
    const apiKey = req.headers["x-api-key"];
    if (!apiKey || apiKey !== API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    // Validasi file
    if (!req.file) {
        return res.status(400).json({ error: "File tidak ditemukan" });
    }

    // Rename & simpan
    const safeName = req.file.originalname.replace(/\s+/g, "_");
    const filename = Date.now() + "_" + safeName;

    const targetPath = path.join(STORAGE_DIR, filename);
    fs.renameSync(req.file.path, targetPath);

    // Response
    res.json({
        success: true,
        filename: filename
    });
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
