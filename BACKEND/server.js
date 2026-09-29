require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Conexão com PostgreSQL / Supabase
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Rota inicial
app.get('/', (req, res) => {
    res.send('API de produtos funcionando!');
});

// Buscar produtos
app.get('/produtos', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM produtos ORDER BY id ASC'
        );

        res.json(result.rows);

    } catch (erro) {
        console.error(erro);

        res.status(500).json({
            erro: 'Erro ao buscar produtos'
        });
    }
});

// Inserir produto
app.post('/produtos', async (req, res) => {

    const { nome, preco, quantidade } = req.body;

    const p = parseFloat(preco);
    const q = parseInt(quantidade);

    if (!nome || isNaN(p) || isNaN(q) || p <= 0 || q <= 0) {
        return res.status(400).json({
            erro: 'Dados inválidos'
        });
    }

    try {

        const result = await pool.query(
            `
            INSERT INTO produtos(nome, preco, quantidade)
            VALUES($1, $2, $3)
            RETURNING *
            `,
            [nome, p, q]
        );

        res.status(201).json(result.rows[0]);

    } catch (erro) {

        console.error(erro);

        res.status(500).json({
            erro: 'Erro ao inserir produto'
        });
    }
});

// Deletar produto
app.delete('/produtos/:id', async (req, res) => {

    const { id } = req.params;

    try {

        const result = await pool.query(
            'DELETE FROM produtos WHERE id = $1',
            [id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                erro: 'Produto não encontrado'
            });
        }

        res.status(204).send();

    } catch (erro) {

        console.error(erro);

        res.status(500).json({
            erro: 'Erro ao deletar produto'
        });
    }
});

// Deletar todos
app.delete('/produtos', async (req, res) => {

    try {

        await pool.query('DELETE FROM produtos');

        res.status(204).send();

    } catch (erro) {

        console.error(erro);

        res.status(500).json({
            erro: 'Erro ao limpar produtos'
        });
    }
});

module.exports = app;