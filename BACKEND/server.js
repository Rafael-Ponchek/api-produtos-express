require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Frontend e backend no mesmo projeto
app.use(express.static(path.join(__dirname, 'public')));

// Página inicial
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Buscar produtos
app.get('/produtos', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM produtos ORDER BY id ASC'
        );
        res.json(result.rows);
    } catch (erro) {
        console.error('Erro ao buscar produtos:', erro);
        res.status(500).json({ erro: 'Erro ao buscar produtos' });
    }
});

// Inserir produto
app.post('/produtos', async (req, res) => {
    const { nome, preco, quantidade } = req.body;
    const p = Number(preco);
    const q = Number(quantidade);

    if (!nome || !Number.isFinite(p) || !Number.isInteger(q) || p <= 0 || q <= 0) {
        return res.status(400).json({ erro: 'Dados inválidos' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO produtos(nome, preco, quantidade) VALUES($1, $2, $3) RETURNING *',
            [nome, p, q]
        );
        res.status(201).json(result.rows[0]);
    } catch (erro) {
        console.error('Erro ao inserir produto:', erro);
        res.status(500).json({ erro: 'Erro ao inserir produto' });
    }
});

// Deletar um produto
app.delete('/produtos/:id', async (req, res) => {
    try {
        const result = await pool.query(
            'DELETE FROM produtos WHERE id = $1',
            [req.params.id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ erro: 'Produto não encontrado' });
        }

        res.status(204).send();
    } catch (erro) {
        console.error('Erro ao deletar produto:', erro);
        res.status(500).json({ erro: 'Erro ao deletar produto' });
    }
});

// Deletar todos os produtos
app.delete('/produtos', async (req, res) => {
    try {
        await pool.query('DELETE FROM produtos');
        res.status(204).send();
    } catch (erro) {
        console.error('Erro ao limpar produtos:', erro);
        res.status(500).json({ erro: 'Erro ao limpar produtos' });
    }
});

module.exports = app;
