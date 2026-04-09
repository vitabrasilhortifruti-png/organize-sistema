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
// PWA files
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'manifest.json'));
});
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(__dirname, 'sw.js'));
});
app.get('/icon-:size.svg', (req, res) => {
  var file = path.join(__dirname, 'icon-'+req.params.size+'.svg');
  var fs2 = require('fs');
  if(fs2.existsSync(file)) { res.setHeader('Content-Type','image/svg+xml'); res.sendFile(file); }
  else { res.setHeader('Content-Type','image/svg+xml'); res.sendFile(path.join(__dirname,'icon-192.svg')); }
});
app.get('/icon-:size.png', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.sendFile(path.join(__dirname, 'icon-192.svg'));
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
  const userEmail = email.toLowerCase().trim();
  const user = await db.get('SELECT * FROM usuarios WHERE LOWER(TRIM(email)) = ? AND ativo = 1', userEmail);
  if (!user) return res.status(401).json({ erro: 'E-mail não encontrado' });
  if (user.senha !== hashSenha(senha)) return res.status(401).json({ erro: 'Senha incorreta' });
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
  // Protect master admin
  const target = await db.get('SELECT email FROM usuarios WHERE id = ?', req.params.id);
  if (target && target.email.toLowerCase() === 'nildomoraesagro@gmail.com') {
    return res.status(403).json({ erro: 'Este usuário não pode ser excluído.' });
  }
  // Remove all sessions for this user
  for (const [token, sess] of sessions.entries()) {
    if (sess.id === req.params.id) sessions.delete(token);
  }
  await db.run('DELETE FROM usuarios WHERE id = ?', req.params.id);
  fazerBackup('del-usuario');
  res.json({ ok: true });
});

// ── CHANGE PASSWORD ──────────────────────────────────────
app.patch('/api/usuarios/:id/senha', authAdmin, async (req, res) => {
  const { senha } = req.body;
  if (!senha || senha.length < 6) return res.status(400).json({ erro: 'Senha: mínimo 6 caracteres' });
  await db.run('UPDATE usuarios SET senha = ? WHERE id = ?', hashSenha(senha), req.params.id);
  // Invalidate sessions for this user
  for (const [token, sess] of sessions.entries()) {
    if (sess.id === req.params.id) sessions.delete(token);
  }
  fazerBackup('senha-usuario');
  res.json({ ok: true });
});

// ── TROCAR SENHA (admin pode trocar de qualquer usuário) ──
app.put('/api/usuarios/:id/senha', authAdmin, async (req, res) => {
  const { senha } = req.body;
  if (!senha || senha.length < 6) return res.status(400).json({ erro: 'Senha: mínimo 6 caracteres' });
  const usr = await db.get('SELECT id FROM usuarios WHERE id = ?', req.params.id);
  if (!usr) return res.status(404).json({ erro: 'Usuário não encontrado' });
  await db.run('UPDATE usuarios SET senha = ? WHERE id = ?', hashSenha(senha), req.params.id);
  // Invalidate all sessions for this user (force re-login)
  for (const [token, sess] of sessions.entries()) {
    if (sess.id === req.params.id) sessions.delete(token);
  }
  fazerBackup('troca-senha');
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

// ── DELETE PEDIDO (com restauração de estoque e exclusão de venda) ──
app.delete('/api/pedidos/:id', auth, async (req, res) => {
  if (!['admin','gerente'].includes(req.usuario.acesso)) return res.status(403).json({ erro: 'Sem permissão' });
  const pedido = await db.get('SELECT * FROM pedidos WHERE id = ?', req.params.id);
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });

  // If already attended, restore stock from lotes
  if (pedido.status === 'Atendido' && pedido.lotes && pedido.lotes !== 'A definir pela produção') {
    // Parse lotes: "LOTE01(50), LOTE02(30)" or "LOTE01, LOTE02"
    const partes = pedido.lotes.split(',').map(s => s.trim());
    for (const parte of partes) {
      const matchQtd = parte.match(/^(.+?)\((\d+)\)$/);
      const loteCod = matchQtd ? matchQtd[1].trim() : parte;
      const qtdUsada = matchQtd ? parseInt(matchQtd[2]) : pedido.quantidade;
      if (loteCod && qtdUsada > 0) {
        const lote = await db.get('SELECT * FROM entradas WHERE lote = ?', loteCod);
        if (lote) {
          const novoSaldo = (lote.quantidade_atual || lote.quantidade) + qtdUsada;
          const novoStatus = novoSaldo > 0 ? 'disponivel' : lote.status;
          await db.run('UPDATE entradas SET quantidade_atual = ?, status = ? WHERE id = ?',
            novoSaldo, novoStatus, lote.id);
        }
      }
    }
  }

  // Delete linked venda
  await db.run("DELETE FROM vendas WHERE pedido_id = ?", pedido.id);

  // Delete pedido
  await db.run('DELETE FROM pedidos WHERE id = ?', req.params.id);
  fazerBackup('del-pedido');
  res.json({ ok: true });
});

crudRoutes('produtos',       ['codigo','nome','tipo','peso']);
crudRoutes('fornecedores',   ['nome','contato','email']);
crudRoutes('clientes',       ['nome','contato','email','endereco']);
crudRoutes('entradas',       ['lote','fruta','fornecedor_id','tipo','quantidade','quantidade_atual','peso_unitario','total_kg','data','obs','status']);
crudRoutes('pedidos',        ['cliente_id','cliente_nome','fruta','mercadoria_id','mercadoria_nome','peso_unitario','quantidade','quantidade_kg','valor','data_pedido','data_entrega','bancas','lotes','obs','status']);

// ── CUSTOM DELETE VENDA: restaura estoque se tiver lote ──
app.delete('/api/vendas/:id/completo', auth, async (req, res) => {
  const venda = await db.get('SELECT * FROM vendas WHERE id = ?', req.params.id);
  if(!venda) return res.status(404).json({ erro: 'Venda não encontrada' });

  // Restore stock via pedido lotes
  if(venda.pedido_id) {
    const pedido = await db.get('SELECT * FROM pedidos WHERE id = ?', venda.pedido_id);
    if(pedido && pedido.lotes && pedido.lotes !== 'A definir pela produção') {
      const parts = pedido.lotes.split(',');
      for(const part of parts) {
        const raw = part.trim();
        const m1 = raw.match(/^(.+?)\((\d+)cx\/(\d+(?:\.\d+)?)kg\)$/);
        const m2 = raw.match(/^(.+?)\((\d+)(?:cx)?\)$/);
        const m = m1 || m2;
        if(m) {
          const loteName = m[1].trim();
          const qtdCx = parseInt(m[2]);
          const kgUsado = m1 ? parseFloat(m1[3]) : null;
          const entrada = await db.get('SELECT * FROM entradas WHERE lote = ?', loteName);
          if(entrada) {
            const tipoLote = (entrada.tipo || 'kg').toLowerCase();
            const restoreQty = (tipoLote === 'kg' && kgUsado)
              ? kgUsado
              : (tipoLote === 'kg' ? qtdCx * (entrada.peso_unitario || 1) : qtdCx);
            const novoSaldo = (entrada.quantidade_atual || 0) + restoreQty;
            await db.run('UPDATE entradas SET quantidade_atual = ?, status = ? WHERE lote = ?',
              novoSaldo, 'disponivel', loteName);
          }
        }
      }
      // Reset pedido to Pendente
      await db.run("UPDATE pedidos SET status = 'Pendente', lotes = 'A definir pela produção' WHERE id = ?", venda.pedido_id);
    }
  }

  await db.run('DELETE FROM vendas WHERE id = ?', req.params.id);
  fazerBackup('del-venda-completo');
  res.json({ ok: true });
});


// ── CUSTOM DELETE PEDIDO: restaura estoque + exclui venda ──
// Override the generic delete for pedidos
app.delete('/api/pedidos/:id/completo', auth, async (req, res) => {
  if (!['admin','gerente','operador'].includes(req.usuario.acesso))
    return res.status(403).json({ erro: 'Sem permissão' });

  const pedido = await db.get('SELECT * FROM pedidos WHERE id = ?', req.params.id);
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });

  // ── 1. RESTAURAR ESTOQUE (sempre, mesmo se esgotado) ──
  if (pedido.lotes && pedido.lotes !== 'A definir pela produção') {
    const loteParts = pedido.lotes.split(',');
    for (const part of loteParts) {
      const raw = part.trim();
      // Suporta: "LOTE(100cx/2000kg)" ou "LOTE(100cx)" ou "LOTE(100)"
      const m = raw.match(/^(.+?)\((\d+)(?:cx)?\/?([\d.]+)?kg?\)$/) || raw.match(/^(.+?)\((\d+)\)$/);
      if (m) {
        const loteName = m[1].trim();
        const qtdCx    = parseInt(m[2]) || 0;
        const kgUsado  = m[3] ? parseFloat(m[3]) : null;
        const entrada  = await db.get('SELECT * FROM entradas WHERE lote = ?', loteName);
        if (entrada) {
          const tipoLote   = (entrada.tipo || 'kg').toLowerCase();
          const restoreQty = (tipoLote === 'kg' && kgUsado)
            ? kgUsado
            : (tipoLote === 'kg' ? qtdCx * (entrada.peso_unitario || 1) : qtdCx);
          const novoSaldo  = (entrada.quantidade_atual || 0) + restoreQty;
          await db.run(
            'UPDATE entradas SET quantidade_atual = ?, status = ? WHERE lote = ?',
            novoSaldo, 'disponivel', loteName
          );
        }
      }
    }
  }

  // ── 2. EXCLUIR ROMANEIOS VINCULADOS ──
  await db.run('DELETE FROM romaneios WHERE pedido_id = ?', req.params.id);
  // Romaneios com múltiplos pedidos (formato: "id1,id2,id3")
  const todosRom = await db.all('SELECT * FROM romaneios');
  for (const rom of todosRom) {
    if (rom.pedido_id && rom.pedido_id.split(',').map(s=>s.trim()).includes(req.params.id)) {
      await db.run('DELETE FROM romaneios WHERE id = ?', rom.id);
    }
  }

  // ── 3. EXCLUIR VENDA VINCULADA ──
  await db.run('DELETE FROM vendas WHERE pedido_id = ?', req.params.id);

  // ── 4. EXCLUIR O PEDIDO ──
  await db.run('DELETE FROM pedidos WHERE id = ?', req.params.id);

  fazerBackup('del-pedido-completo');
  res.json({ ok: true });
});

crudRoutes('romaneios',      ['numero','pedido_id','cliente_nome','fruta','motorista','placa','caixas','qualidade','rota','obs','status','data']);
crudRoutes('vendas',         ['cliente_id','cliente','fruta','quantidade','quantidade_kg','valor','data','pedido_id','origem']);

// ── CUSTOM DELETE VENDA: restaura estoque ──
app.delete('/api/vendas/:id/completo', auth, async (req, res) => {
  const venda = await db.get('SELECT * FROM vendas WHERE id = ?', req.params.id);
  if (!venda) return res.status(404).json({ erro: 'Venda não encontrada' });

  // If venda linked to pedido, restore the pedido's lotes to stock
  if (venda.pedido_id) {
    const pedido = await db.get('SELECT * FROM pedidos WHERE id = ?', venda.pedido_id);
    if (pedido && pedido.lotes && pedido.lotes !== 'A definir pela produção') {
      const parts = pedido.lotes.split(',');
      for (const part of parts) {
        const m = part.trim().match(/^(.+?)\((\d+)cx\/(\d+)kg\)$/) || part.trim().match(/^(.+?)\((\d+)\)$/);
        if (m) {
          const loteName = m[1].trim();
          const qtdCx = parseInt(m[2]);
          const kgUsado = m[3] ? parseInt(m[3]) : qtdCx;
          const entrada = await db.get('SELECT * FROM entradas WHERE lote = ?', loteName);
          if (entrada) {
            const tipoLote = (entrada.tipo || 'kg').toLowerCase();
            const restoreQty = tipoLote === 'kg' ? kgUsado : qtdCx;
            const novoSaldo = (entrada.quantidade_atual || 0) + restoreQty;
            await db.run('UPDATE entradas SET quantidade_atual = ?, status = ? WHERE lote = ?',
              novoSaldo, novoSaldo > 0 ? 'disponivel' : 'esgotado', loteName);
          }
        }
      }
      // Reset pedido status to Pendente
      await db.run("UPDATE pedidos SET status = 'Pendente', lotes = 'A definir pela produção' WHERE id = ?", venda.pedido_id);
    }
  }

  await db.run('DELETE FROM vendas WHERE id = ?', req.params.id);
  fazerBackup('del-venda-completo');
  res.json({ ok: true });
});
crudRoutes('retornos_caixa', ['cliente_id','data','quantidade','marca','obs']);
crudRoutes('saidas_caixa',   ['cliente_id','data','quantidade','marca','obs']);
crudRoutes('pagamentos',     ['cliente_id','valor','data','forma','recebedor','obs']);
crudRoutes('descartes',      ['lote_id','lote','fruta','quantidade','motivo','data']);

// ── SALDO LOTE ───────────────────────────────────────────
app.patch('/api/entradas/:id/saldo', auth, async (req, res) => {
  const { quantidade_atual, status, kg_abatido } = req.body;
  const entrada = await db.get('SELECT * FROM entradas WHERE id = ?', req.params.id);
  if (!entrada) return res.status(404).json({ erro: 'Lote não encontrado' });
  
  if (kg_abatido && kg_abatido > 0 && entrada.peso_unitario && entrada.peso_unitario > 0) {
    // Abate by KG: convert kg to units using lote's peso_unitario
    // quantidade_atual from client is in units - use it directly
    await db.run('UPDATE entradas SET quantidade_atual = ?, status = ? WHERE id = ?',
      quantidade_atual, status || 'disponivel', req.params.id);
  } else {
    await db.run('UPDATE entradas SET quantidade_atual = ?, status = ? WHERE id = ?',
      quantidade_atual, status || 'disponivel', req.params.id);
  }
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
// ── EMAIL BACKUP (desativado temporariamente) ────────────
async function enviarBackupEmail() {
  console.log('Backup por e-mail não configurado.');
}
function agendarBackupSemanal() {}

app.post('/api/backup/email', authAdmin, async (req, res) => {
  fazerBackup('manual-email');
  res.json({ ok: true, msg: 'Backup salvo no servidor.' });
});

openDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Organize Server rodando na porta ${PORT}`);
    console.log(`   Banco: ${DB_PATH}`);
    fazerBackup('inicio');
    agendarBackupSemanal();
    console.log('📧 Backup semanal agendado para domingos às 8h');
  });
}).catch(err => { console.error('Erro ao iniciar:', err); process.exit(1); });

process.on('SIGINT', () => { fazerBackup('encerramento'); process.exit(); });
process.on('SIGTERM', () => { fazerBackup('encerramento'); process.exit(); });
