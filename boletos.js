const db = require('./db');

// Converte DD/MM/AAAA -> YYYY-MM-DD
function parseDataBR(dataStr) {
  const m = dataStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, dia, mes, ano] = m;
  const d = parseInt(dia, 10), me = parseInt(mes, 10), a = parseInt(ano, 10);
  if (me < 1 || me > 12 || d < 1 || d > 31) return null;
  return `${a}-${String(me).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Converte YYYY-MM-DD -> DD/MM/AAAA
function formatDataBR(isoStr) {
  const [a, m, d] = isoStr.split('-');
  return `${d}/${m}/${a}`;
}

function criarBoleto({ empresa, valor, vencimentoISO, criadoPor }) {
  const stmt = db.prepare(
    `INSERT INTO boletos (empresa, valor, vencimento, criado_por) VALUES (?, ?, ?, ?)`
  );
  const info = stmt.run(empresa, valor, vencimentoISO, criadoPor || null);
  return info.lastInsertRowid;
}

function listarBoletos({ apenasAbertos = false } = {}) {
  const sql = apenasAbertos
    ? `SELECT * FROM boletos WHERE pago = 0 ORDER BY vencimento ASC`
    : `SELECT * FROM boletos ORDER BY vencimento ASC`;
  return db.prepare(sql).all();
}

function marcarComoPago(id) {
  db.prepare(`UPDATE boletos SET pago = 1 WHERE id = ?`).run(id);
}

function excluirBoleto(id) {
  db.prepare(`DELETE FROM boletos WHERE id = ?`).run(id);
}

function boletosVencendoHoje() {
  const hoje = new Date().toISOString().slice(0, 10);
  return db
    .prepare(`SELECT * FROM boletos WHERE vencimento = ? AND pago = 0 AND notificado = 0`)
    .all(hoje);
}

function marcarNotificado(id) {
  db.prepare(`UPDATE boletos SET notificado = 1 WHERE id = ?`).run(id);
}

module.exports = {
  parseDataBR,
  formatDataBR,
  criarBoleto,
  listarBoletos,
  marcarComoPago,
  excluirBoleto,
  boletosVencendoHoje,
  marcarNotificado,
};
