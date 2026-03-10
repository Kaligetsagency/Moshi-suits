const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serves your index.html

// Connect to Railway Database
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Auto-create the Suits table if it doesn't exist
async function setupDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS suits (
                id SERIAL PRIMARY KEY,
                size VARCHAR(10),
                color VARCHAR(50),
                design VARCHAR(50),
                stock INT DEFAULT 0
            );
        `);
        console.log("Database tables are ready!");
    } catch (err) {
        console.error("Error creating tables:", err);
    }
}
setupDatabase();

// --- API ROUTES ---

// 1. Get all Suits
app.get('/api/suits', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM suits ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Add a new Suit
app.post('/api/suits', async (req, res) => {
    const { size, color, design, stock } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO suits (size, color, design, stock) VALUES ($1, $2, $3, $4) RETURNING *',
            [size, color, design, stock]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
