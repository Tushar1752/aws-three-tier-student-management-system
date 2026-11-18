const express = require("express");
const cors = require("cors");
const db = require("./db");
const filesRouter = require("./files");
const app = express();

app.use(cors());
app.use(express.json());
app.use("/files", filesRouter);

// GET - Fetch all students
app.get("/students", async (req, res) => {
    try {
        const [students] = await db.query("SELECT * FROM students");
        res.json(students);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST - Add student
app.post("/students", async (req, res) => {
    try {
        const { name, course } = req.body;

        const [result] = await db.query(
            "INSERT INTO students (name, course) VALUES (?, ?)",
            [name, course]
        );

        res.status(201).json({
            id: result.insertId,
            name,
            course
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT - Update student
app.put("/students/:id", async (req, res) => {
    try {
        const { name, course } = req.body;
        const id = req.params.id;

        const [result] = await db.query(
            "UPDATE students SET name = ?, course = ? WHERE id = ?",
            [name, course, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Student not found" });
        }

        res.json({ id: Number(id), name, course });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE - Remove student
app.delete("/students/:id", async (req, res) => {
    try {
        const [result] = await db.query(
            "DELETE FROM students WHERE id = ?",
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Student not found" });
        }

        res.json({ message: "Student deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Backend server running on port ${PORT}`);
});
