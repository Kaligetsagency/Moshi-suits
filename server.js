const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function setupDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS colors (name VARCHAR(50) PRIMARY KEY);
            CREATE TABLE IF NOT EXISTS designs (name VARCHAR(50) PRIMARY KEY);
            
            CREATE TABLE IF NOT EXISTS suits (
                id SERIAL PRIMARY KEY,
                size VARCHAR(10),
                color VARCHAR(50),
                design VARCHAR(50),
                stock INT DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS sales (
                id SERIAL PRIMARY KEY,
                suit_id INT REFERENCES suits(id),
                quantity INT,
                total_price DECIMAL,
                sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const defaultColors = ['Black', 'Navy', 'Grey', 'Charcoal', 'Gold', 'Green', 'Light Blue', 'Maroon', 'White'];
        for (let c of defaultColors) { await pool.query('INSERT INTO colors (name) VALUES ($1) ON CONFLICT DO NOTHING', [c]); }

        const defaultDesigns = ['Single Button Suit', 'Kaunda Suit', 'Six Button Suit', 'Double Button Suit', 'Taxido'];
        for (let d of defaultDesigns) { await pool.query('INSERT INTO designs (name) VALUES ($1) ON CONFLICT DO NOTHING', [d]); }
        
        console.log("Database tables ready!");
    } catch (err) { console.error(err); }
}
setupDatabase();

// --- API ROUTES ---

app.get('/api/options', async (req, res) => {
    try {
        const colors = await pool.query('SELECT name FROM colors ORDER BY name');
        const designs = await pool.query('SELECT name FROM designs ORDER BY name');
        res.json({ colors: colors.rows, designs: designs.rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/colors', async (req, res) => {
    try { await pool.query('INSERT INTO colors (name) VALUES ($1) ON CONFLICT DO NOTHING', [req.body.name]); res.json({ success: true }); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/designs', async (req, res) => {
    try { await pool.query('INSERT INTO designs (name) VALUES ($1) ON CONFLICT DO NOTHING', [req.body.name]); res.json({ success: true }); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/suits', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM suits ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/suits', async (req, res) => {
    const { size, color, design, stock } = req.body;
    try {
        const existing = await pool.query('SELECT id, stock FROM suits WHERE size = $1 AND color = $2 AND design = $3', [size, color, design]);
        if (existing.rows.length > 0) {
            const result = await pool.query('UPDATE suits SET stock = stock + $1 WHERE id = $2 RETURNING *', [stock, existing.rows[0].id]);
            res.json(result.rows[0]);
        } else {
            const result = await pool.query('INSERT INTO suits (size, color, design, stock) VALUES ($1, $2, $3, $4) RETURNING *', [size, color, design, stock]);
            res.json(result.rows[0]);
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// NEW: Edit an existing wrong entry
app.put('/api/suits/:id', async (req, res) => {
    const { id } = req.params;
    const { size, color, design, stock } = req.body;
    try {
        const result = await pool.query(
            'UPDATE suits SET size = $1, color = $2, design = $3, stock = $4 WHERE id = $5 RETURNING *',
            [size, color, design, stock, id]
        );
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sales', async (req, res) => {
    const { suit_id, quantity, total_price } = req.body;
    try {
        await pool.query('BEGIN');
        await pool.query('INSERT INTO sales (suit_id, quantity, total_price) VALUES ($1, $2, $3)', [suit_id, quantity, total_price]);
        await pool.query('UPDATE suits SET stock = stock - $1 WHERE id = $2', [quantity, suit_id]);
        await pool.query('COMMIT');
        res.json({ message: "Sale recorded successfully!" });
    } catch (err) {
        await pool.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/summary', async (req, res) => {
    try {
        const daily = await pool.query(`SELECT COALESCE(SUM(quantity), 0) as qty, COALESCE(SUM(total_price), 0) as revenue FROM sales WHERE DATE(sale_date) = CURRENT_DATE`);
        const weekly = await pool.query(`SELECT COALESCE(SUM(quantity), 0) as qty, COALESCE(SUM(total_price), 0) as revenue FROM sales WHERE sale_date >= date_trunc('week', CURRENT_DATE)`);
        const monthly = await pool.query(`SELECT COALESCE(SUM(quantity), 0) as qty, COALESCE(SUM(total_price), 0) as revenue FROM sales WHERE sale_date >= date_trunc('month', CURRENT_DATE)`);
        const yearly = await pool.query(`SELECT COALESCE(SUM(quantity), 0) as qty, COALESCE(SUM(total_price), 0) as revenue FROM sales WHERE sale_date >= date_trunc('year', CURRENT_DATE)`);
        
        res.json({ daily: daily.rows[0], weekly: weekly.rows[0], monthly: monthly.rows[0], yearly: yearly.rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/bestsellers', async (req, res) => {
    try {
        const result = await pool.query(`SELECT s.size, s.color, s.design, SUM(sa.quantity) as total_sold FROM sales sa JOIN suits s ON sa.suit_id = s.id GROUP BY s.id ORDER BY total_sold DESC LIMIT 5`);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
