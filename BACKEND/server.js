require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();

app.use(cors());
app.use(express.json());

const databaseUrl = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

const pool = databaseUrl
    ? new Pool({
        connectionString: databaseUrl,
        ssl: { rejectUnauthorized: false }
    })
    : null;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'inicio.html'));
});

// Middleware: valida o token JWT.
function autenticarToken(req, res, next) {
    const autorizacao = req.headers.authorization;

    if (!autorizacao || !autorizacao.startsWith('Bearer ')) {
        return res.status(401).json({ erro: 'Token não informado' });
    }

    const token = autorizacao.split(' ')[1];

    if (!JWT_SECRET) {
        return res.status(500).json({ erro: 'JWT_SECRET não está configurado.' });
    }

    try {
        const usuario = jwt.verify(token, JWT_SECRET);
        req.usuario = usuario;
        next();
    } catch (erro) {
        return res.status(401).json({ erro: 'Token inválido ou expirado' });
    }
}

// Middleware: exige perfil de administrador.
function exigirAdmin(req, res, next) {
    if (!req.usuario || req.usuario.perfil !== 'admin') {
        return res.status(403).json({ erro: 'Acesso permitido somente para administradores' });
    }

    next();
}

// Criação da tabela de usuários.
async function criarTabelaUsuarios() {
    if (!pool) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            nome TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            senha TEXT NOT NULL,
            perfil TEXT NOT NULL DEFAULT 'cliente' CHECK (perfil IN ('admin', 'cliente'))
        )
    `);
}

// Registro de usuário.
app.post('/auth/registro', async (req, res) => {
    if (!pool) {
        return res.status(500).json({ erro: 'DATABASE_URL não está configurada na Vercel.' });
    }

    const { nome, email, senha, perfil } = req.body;

    if (!nome || !email || !senha) {
        return res.status(400).json({ erro: 'Nome, email e senha são obrigatórios' });
    }

    const perfilUsuario = perfil === 'admin' ? 'admin' : 'cliente';

    try {
        const senhaHash = await bcrypt.hash(senha, 10);

        const result = await pool.query(
            `INSERT INTO usuarios (nome, email, senha, perfil)
             VALUES ($1, $2, $3, $4)
             RETURNING id, nome, email, perfil`,
            [nome, email, senhaHash, perfilUsuario]
        );

        res.status(201).json({
            mensagem: 'Usuário criado com sucesso',
            usuario: result.rows[0]
        });
    } catch (erro) {
        if (erro.code === '23505') {
            return res.status(409).json({ erro: 'Este email já está cadastrado' });
        }

        console.error('ERRO REGISTRO:', erro);
        res.status(500).json({ erro: 'Erro ao criar usuário', detalhe: erro.message });
    }
});

// Login e geração do JWT.
app.post('/auth/login', async (req, res) => {
    if (!pool) {
        return res.status(500).json({ erro: 'DATABASE_URL não está configurada na Vercel.' });
    }

    const { email, senha } = req.body;

    if (!email || !senha) {
        return res.status(400).json({ erro: 'Email e senha são obrigatórios' });
    }

    if (!JWT_SECRET) {
        return res.status(500).json({ erro: 'JWT_SECRET não está configurado.' });
    }

    try {
        const result = await pool.query(
            'SELECT id, nome, email, senha, perfil FROM usuarios WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ erro: 'Email ou senha inválidos' });
        }

        const usuario = result.rows[0];
        const senhaValida = await bcrypt.compare(senha, usuario.senha);

        if (!senhaValida) {
            return res.status(401).json({ erro: 'Email ou senha inválidos' });
        }

        const token = jwt.sign(
            {
                id: usuario.id,
                perfil: usuario.perfil
            },
            JWT_SECRET,
            { expiresIn: '2h' }
        );

        res.status(200).json({
            mensagem: 'Login realizado com sucesso',
            token,
            usuario: {
                id: usuario.id,
                nome: usuario.nome,
                email: usuario.email,
                perfil: usuario.perfil
            }
        });
    } catch (erro) {
        console.error('ERRO LOGIN:', erro);
        res.status(500).json({ erro: 'Erro ao realizar login', detalhe: erro.message });
    }
});

// Rota pública.
app.get('/produtos', async (req, res) => {
    if (!pool) {
        return res.status(500).json({ erro: 'DATABASE_URL não está configurada na Vercel.' });
    }

    try {
        const result = await pool.query('SELECT * FROM produtos ORDER BY id ASC');
        res.status(200).json(result.rows);
    } catch (erro) {
        console.error('ERRO POSTGRES:', erro);
        res.status(500).json({ erro: 'Erro ao buscar produtos', detalhe: erro.message });
    }
});

// Criar produto: usuário autenticado.
app.post('/produtos', autenticarToken, async (req, res) => {
    if (!pool) {
        return res.status(500).json({ erro: 'DATABASE_URL não está configurada na Vercel.' });
    }

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
        console.error('ERRO POSTGRES:', erro);
        res.status(500).json({ erro: 'Erro ao inserir produto', detalhe: erro.message });
    }
});

// Alterar produto: usuário autenticado.
app.put('/produtos/:id', autenticarToken, async (req, res) => {
    if (!pool) {
        return res.status(500).json({ erro: 'DATABASE_URL não está configurada na Vercel.' });
    }

    const { nome, preco, quantidade } = req.body;
    const p = Number(preco);
    const q = Number(quantidade);

    if (!nome || !Number.isFinite(p) || !Number.isInteger(q) || p <= 0 || q <= 0) {
        return res.status(400).json({ erro: 'Dados inválidos' });
    }

    try {
        const result = await pool.query(
            `UPDATE produtos
             SET nome = $1, preco = $2, quantidade = $3
             WHERE id = $4
             RETURNING *`,
            [nome, p, q, req.params.id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ erro: 'Produto não encontrado' });
        }

        res.status(200).json(result.rows[0]);
    } catch (erro) {
        console.error('ERRO POSTGRES:', erro);
        res.status(500).json({ erro: 'Erro ao atualizar produto', detalhe: erro.message });
    }
});

// Apagar um produto: somente admin.
app.delete('/produtos/:id', autenticarToken, exigirAdmin, async (req, res) => {
    if (!pool) {
        return res.status(500).json({ erro: 'DATABASE_URL não está configurada na Vercel.' });
    }

    try {
        const result = await pool.query('DELETE FROM produtos WHERE id = $1', [req.params.id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ erro: 'Produto não encontrado' });
        }

        res.status(204).send();
    } catch (erro) {
        console.error('ERRO POSTGRES:', erro);
        res.status(500).json({ erro: 'Erro ao deletar produto', detalhe: erro.message });
    }
});

// Apagar todos os produtos: somente admin.
app.delete('/produtos', autenticarToken, exigirAdmin, async (req, res) => {
    if (!pool) {
        return res.status(500).json({ erro: 'DATABASE_URL não está configurada na Vercel.' });
    }

    try {
        await pool.query('DELETE FROM produtos');
        res.status(204).send();
    } catch (erro) {
        console.error('ERRO POSTGRES:', erro);
        res.status(500).json({ erro: 'Erro ao limpar produtos', detalhe: erro.message });
    }
});

// Inicializa a tabela sem impedir o deploy caso o banco ainda não esteja disponível.
criarTabelaUsuarios().catch((erro) => {
    console.error('ERRO AO CRIAR TABELA USUARIOS:', erro);
});

module.exports = app;
