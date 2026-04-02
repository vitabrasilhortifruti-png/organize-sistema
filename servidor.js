/**
 * ORGANIZE - Servidor Backend
 * Node.js + Express + sqlite3 (sem compilação nativa)
 * Backup automático a cada ação
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8080;

// ── Diretórios ──────────────────────────────────────────
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'data')
  : path.join(__dirname, 'data');
const BACKUP_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'backups')
  : path.join(__dirname, 'backups');
const DB_PATH = path.join(DATA_DIR, 'organize.db');

[DATA_DIR, BACKUP_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ── Banco de Dados ──────────────────────────────────────
let db;

async function openDB() {
  db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.exec('PRAGMA journal_mode = WAL');
  await db.exec('PRAGMA foreign_keys = ON');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY, nome TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL, acesso TEXT DEFAULT 'operador',
      ativo INTEGER DEFAULT 1, criado TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS empresa (
      id INTEGER PRIMARY KEY CHECK (id = 1), nome TEXT DEFAULT 'Organize',
      cnpj TEXT DEFAULT '', telefone TEXT DEFAULT '', email TEXT DEFAULT '',
      endereco TEXT DEFAULT '', logo TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS produtos (
      id TEXT PRIMARY KEY, codigo TEXT, nome TEXT NOT NULL, tipo TEXT,
      peso REAL DEFAULT 0, criado TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS fornecedores (
      id TEXT PRIMARY KEY, nome TEXT NOT NULL, contato TEXT, email TEXT,
      criado TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS clientes (
      id TEXT PRIMARY KEY, nome TEXT NOT NULL, contato TEXT, email TEXT,
      endereco TEXT, criado TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS entradas (
      id TEXT PRIMARY KEY, lote TEXT, fruta TEXT, fornecedor_id TEXT,
      tipo TEXT DEFAULT 'kg', quantidade REAL DEFAULT 0,
      quantidade_atual REAL DEFAULT 0, peso_unitario REAL DEFAULT 1,
      total_kg REAL DEFAULT 0, data TEXT, obs TEXT DEFAULT '',
      status TEXT DEFAULT 'disponivel', criado TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS pedidos (
      id TEXT PRIMARY KEY, cliente_id TEXT, cliente_nome TEXT, fruta TEXT,
      mercadoria_id TEXT, mercadoria_nome TEXT, peso_unitario REAL DEFAULT 0,
      quantidade INTEGER DEFAULT 0, quantidade_kg REAL DEFAULT 0,
      valor REAL DEFAULT 0, data_pedido TEXT, data_entrega TEXT,
      bancas TEXT DEFAULT '', lotes TEXT DEFAULT '', obs TEXT DEFAULT '',
      status TEXT DEFAULT 'Pendente', criado TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS romaneios (
      id TEXT PRIMARY KEY, numero TEXT, pedido_id TEXT, cliente_nome TEXT,
      fruta TEXT, motorista TEXT, placa TEXT, caixas INTEGER DEFAULT 0,
      qualidade TEXT, obs TEXT DEFAULT '', data TEXT,
      criado TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS vendas (
      id TEXT PRIMARY KEY, cliente_id TEXT, cliente TEXT, fruta TEXT,
      quantidade REAL DEFAULT 0, quantidade_kg REAL DEFAULT 0,
      valor REAL DEFAULT 0, data TEXT, pedido_id TEXT,
      origem TEXT DEFAULT 'manual', criado TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS retornos_caixa (
      id TEXT PRIMARY KEY, cliente_id TEXT, data TEXT,
      quantidade INTEGER DEFAULT 0, marca TEXT, obs TEXT DEFAULT '',
      criado TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS saidas_caixa (
      id TEXT PRIMARY KEY, cliente_id TEXT, data TEXT,
      quantidade INTEGER DEFAULT 0, marca TEXT, obs TEXT DEFAULT '',
      criado TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS pagamentos (
      id TEXT PRIMARY KEY, cliente_id TEXT, valor REAL DEFAULT 0,
      data TEXT, forma TEXT, recebedor TEXT, obs TEXT DEFAULT '',
      criado TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS descartes (
      id TEXT PRIMARY KEY, lote_id TEXT, lote TEXT, fruta TEXT,
      quantidade INTEGER DEFAULT 0, motivo TEXT, data TEXT,
      criado TEXT DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO empresa (id, nome) VALUES (1, 'Organize');
  `);
  console.log('Banco de dados pronto!');
}

// ── Backup ──────────────────────────────────────────────
function fazerBackup(motivo = 'auto') {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dest = path.join(BACKUP_DIR, `organize_${ts}_${motivo}.db`);
    fs.copyFileSync(DB_PATH, dest);
    const backups = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort();
    if (backups.length > 50) backups.slice(0, backups.length - 50).forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
  } catch (e) { console.error('Backup falhou:', e.message); }
}

setInterval(() => fazerBackup('timer'), 10 * 60 * 1000);

// ── Middleware ───────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'organize.html'));
});

const sessions = new Map();

function auth(req, res, next) {
  const token = req.headers['x-token'];
  if (!token || !sessions.has(token)) return res.status(401).json({ erro: 'Não autorizado' });
  req.usuario = sessions.get(token);
  next();
}

function authAdmin(req, res, next) {
  auth(req, res, () => {
    if (req.usuario.acesso !== 'admin') return res.status(403).json({ erro: 'Apenas administradores' });
    next();
  });
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }
function hashSenha(s) { return crypto.createHash('sha256').update(s + 'organize_salt_2026').digest('hex'); }

// ── AUTH ─────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'Campos obrigatórios' });
  const user = await db.get('SELECT * FROM usuarios WHERE email = ? AND ativo = 1', email.toLowerCase().trim());
  if (!user || user.senha !== hashSenha(senha)) return res.status(401).json({ erro: 'E-mail ou senha incorretos' });
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { id: user.id, nome: user.nome, email: user.email, acesso: user.acesso });
  res.json({ token, usuario: { id: user.id, nome: user.nome, email: user.email, acesso: user.acesso } });
});

app.post('/api/logout', auth, (req, res) => { sessions.delete(req.headers['x-token']); res.json({ ok: true }); });
app.get('/api/me', auth, (req, res) => res.json(req.usuario));
app.get('/api/tem-usuarios', async (req, res) => {
  const r = await db.get('SELECT COUNT(*) as n FROM usuarios');
  res.json({ temUsuarios: r.n > 0 });
});

// ── USUÁRIOS ─────────────────────────────────────────────
app.get('/api/usuarios', authAdmin, async (req, res) => {
  res.json(await db.all('SELECT id, nome, email, acesso, ativo, criado FROM usuarios'));
});

app.post('/api/usuarios', async (req, res) => {
  const count = await db.get('SELECT COUNT(*) as n FROM usuarios');
  const token = req.headers['x-token'];
  if (count.n > 0 && (!token || !sessions.has(token) || sessions.get(token).acesso !== 'admin'))
    return res.status(403).json({ erro: 'Apenas administradores' });
  const { nome, email, senha, acesso } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Campos obrigatórios' });
  if (senha.length < 6) return res.status(400).json({ erro: 'Senha: mínimo 6 caracteres' });
  const existe = await db.get('SELECT id FROM usuarios WHERE email = ?', email.toLowerCase().trim());
  if (existe) return res.status(400).json({ erro: 'E-mail já cadastrado' });
  const id = uid();
  const acessoFinal = count.n === 0 ? 'admin' : (acesso || 'operador');
  await db.run('INSERT INTO usuarios (id, nome, email, senha, acesso) VALUES (?, ?, ?, ?, ?)',
    id, nome, email.toLowerCase().trim(), hashSenha(senha), acessoFinal);
  fazerBackup('novo-usuario');
  res.json({ id, nome, email, acesso: acessoFinal });
});

app.delete('/api/usuarios/:id', authAdmin, async (req, res) => {
  await db.run('UPDATE usuarios SET ativo = 0 WHERE id = ?', req.params.id);
  fazerBackup('del-usuario');
  res.json({ ok: true });
});

// ── EMPRESA ──────────────────────────────────────────────
app.get('/api/empresa', auth, async (req, res) => res.json(await db.get('SELECT * FROM empresa WHERE id = 1')));
app.put('/api/empresa', auth, async (req, res) => {
  const { nome, cnpj, telefone, email, endereco, logo } = req.body;
  await db.run('UPDATE empresa SET nome=?, cnpj=?, telefone=?, email=?, endereco=?, logo=? WHERE id=1',
    nome||'', cnpj||'', telefone||'', email||'', endereco||'', logo||'');
  fazerBackup('empresa');
  res.json({ ok: true });
});

// ── CRUD GENÉRICO ─────────────────────────────────────────
function crudRoutes(tabela, campos) {
  app.get(`/api/${tabela}`, auth, async (req, res) => {
    res.json(await db.all(`SELECT * FROM ${tabela} ORDER BY criado DESC`));
  });
  app.post(`/api/${tabela}`, auth, async (req, res) => {
    if (req.usuario.acesso === 'visualizador') return res.status(403).json({ erro: 'Sem permissão' });
    const id = req.body.id || uid();
    const camposPresentes = campos.filter(c => req.body[c] !== undefined);
    const cols = ['id', ...camposPresentes];
    const vals = [id, ...camposPresentes.map(c => req.body[c])];
    const ph = cols.map(() => '?').join(', ');
    await db.run(`INSERT OR REPLACE INTO ${tabela} (${cols.join(', ')}) VALUES (${ph})`, ...vals);
    fazerBackup(`ins-${tabela}`);
    res.json({ id, ...req.body });
  });
  app.put(`/api/${tabela}/:id`, auth, async (req, res) => {
    if (req.usuario.acesso === 'visualizador') return res.status(403).json({ erro: 'Sem permissão' });
    const camposPresentes = campos.filter(c => req.body[c] !== undefined);
    if (camposPresentes.length) {
      const sets = camposPresentes.map(c => `${c} = ?`).join(', ');
      await db.run(`UPDATE ${tabela} SET ${sets} WHERE id = ?`, ...camposPresentes.map(c => req.body[c]), req.params.id);
    }
    fazerBackup(`upd-${tabela}`);
    res.json({ ok: true });
  });
  app.delete(`/api/${tabela}/:id`, auth, async (req, res) => {
    if (!['admin','gerente'].includes(req.usuario.acesso)) return res.status(403).json({ erro: 'Sem permissão' });
    await db.run(`DELETE FROM ${tabela} WHERE id = ?`, req.params.id);
    fazerBackup(`del-${tabela}`);
    res.json({ ok: true });
  });
}

crudRoutes('produtos',       ['codigo','nome','tipo','peso']);
crudRoutes('fornecedores',   ['nome','contato','email']);
crudRoutes('clientes',       ['nome','contato','email','endereco']);
crudRoutes('entradas',       ['lote','fruta','fornecedor_id','tipo','quantidade','quantidade_atual','peso_unitario','total_kg','data','obs','status']);
crudRoutes('pedidos',        ['cliente_id','cliente_nome','fruta','mercadoria_id','mercadoria_nome','peso_unitario','quantidade','quantidade_kg','valor','data_pedido','data_entrega','bancas','lotes','obs','status']);
crudRoutes('romaneios',      ['numero','pedido_id','cliente_nome','fruta','motorista','placa','caixas','qualidade','obs','data']);
crudRoutes('vendas',         ['cliente_id','cliente','fruta','quantidade','quantidade_kg','valor','data','pedido_id','origem']);
crudRoutes('retornos_caixa', ['cliente_id','data','quantidade','marca','obs']);
crudRoutes('saidas_caixa',   ['cliente_id','data','quantidade','marca','obs']);
crudRoutes('pagamentos',     ['cliente_id','valor','data','forma','recebedor','obs']);
crudRoutes('descartes',      ['lote_id','lote','fruta','quantidade','motivo','data']);

// ── SALDO LOTE ───────────────────────────────────────────
app.patch('/api/entradas/:id/saldo', auth, async (req, res) => {
  const { quantidade_atual, status } = req.body;
  await db.run('UPDATE entradas SET quantidade_atual = ?, status = ? WHERE id = ?', quantidade_atual, status||'disponivel', req.params.id);
  fazerBackup('saldo-lote');
  res.json({ ok: true });
});

// ── BACKUP ───────────────────────────────────────────────
app.post('/api/backup', authAdmin, (req, res) => {
  fazerBackup('manual');
  const backups = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort().reverse();
  res.json({ ok: true, backups });
});
app.get('/api/backups', authAdmin, (req, res) => {
  const backups = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort().reverse()
    .map(f => ({ nome: f, tamanho: fs.statSync(path.join(BACKUP_DIR, f)).size }));
  res.json(backups);
});

// ── INICIAR ──────────────────────────────────────────────
openDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Organize Server rodando na porta ${PORT}`);
    console.log(`   Banco: ${DB_PATH}`);
    fazerBackup('inicio');
  });
}).catch(err => { console.error('Erro ao iniciar:', err); process.exit(1); });

process.on('SIGINT', () => { fazerBackup('encerramento'); process.exit(); });
process.on('SIGTERM', () => { fazerBackup('encerramento'); process.exit(); });
