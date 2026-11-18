const express = require("express");
const multer = require("multer");
const crypto = require("crypto");

const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand
} = require("@aws-sdk/client-s3");

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const db = require("./db");

const router = express.Router();

const BUCKET = "tushar-student-files-2026";

const s3 = new S3Client({
    region: "ap-southeast-2"
});

const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "text/plain",
    "text/csv",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("File type not allowed"));
        }
    }
});

// Upload file to S3 and save metadata in RDS
router.post("/", upload.single("file"), async (req, res) => {
    let s3Key;

    try {
        if (!req.file) {
            return res.status(400).json({ error: "Please select a file" });
        }

        const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");

        s3Key = `uploads/${crypto.randomUUID()}-${safeName}`;

        await s3.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: s3Key,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        }));

        const studentId = req.body.student_id || null;

        const [result] = await db.query(
            `INSERT INTO student_files
            (student_id, original_name, s3_key, mime_type, size_bytes)
            VALUES (?, ?, ?, ?, ?)`,
            [
                studentId,
                req.file.originalname,
                s3Key,
                req.file.mimetype,
                req.file.size
            ]
        );

        res.status(201).json({
            message: "File uploaded successfully to S3!",
            id: result.insertId
        });

    } catch (error) {
        if (s3Key) {
            await s3.send(new DeleteObjectCommand({
                Bucket: BUCKET,
                Key: s3Key
            })).catch(() => {});
        }

        res.status(500).json({ error: error.message });
    }
});

// Get all uploaded files
router.get("/", async (req, res) => {
    try {
        const [files] = await db.query(
            "SELECT * FROM student_files ORDER BY created_at DESC"
        );

        res.json(files);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Generate download URL
router.get("/:id/download", async (req, res) => {
    try {
        const [files] = await db.query(
            "SELECT * FROM student_files WHERE id = ?",
            [req.params.id]
        );

        if (files.length === 0) {
            return res.status(404).json({ error: "File not found" });
        }

        const file = files[0];

        const command = new GetObjectCommand({
            Bucket: BUCKET,
            Key: file.s3_key
        });

        const url = await getSignedUrl(s3, command, {
            expiresIn: 300
        });

        res.json({ url });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete file from S3 and RDS
router.delete("/:id", async (req, res) => {
    try {
        const [files] = await db.query(
            "SELECT * FROM student_files WHERE id = ?",
            [req.params.id]
        );

        if (files.length === 0) {
            return res.status(404).json({ error: "File not found" });
        }

        await s3.send(new DeleteObjectCommand({
            Bucket: BUCKET,
            Key: files[0].s3_key
        }));

        await db.query(
            "DELETE FROM student_files WHERE id = ?",
            [req.params.id]
        );

        res.json({ message: "File deleted successfully" });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;



