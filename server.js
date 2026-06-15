require('dotenv').config();
const express = require('express');
const path = require('path');
const cron = require('node-cron');
const webpush = require('web-push');
const db = require('../db');
const {
  parseDataBR,
  formatDataBR,
  criarBoleto,
  listarBoletos,
  marcarComoPago,
  excluirBoleto,
  boletosVencendoHoje,
  marcarNotificado,
} = require('../boletos');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Web Push config ----
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL } = process.env;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_EMAIL || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY || '' });
});

app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ error: 'Inscrição inválida' });

  db.prepare(
    `INSERT OR REPLACE INTO push_subscriptions (endpoint, subscription_json) VALUES (?, ?)`
  ).run(subscription.endpoint, JSON.stringify(subscription));

  res.json({ ok: true });
});

async function enviarPushParaTodos(payload) {
  const subs = db.prepare(`SELECT * FROM push_subscriptions`).all();
  for (const row of subs) {
    const subscription = JSON.parse(row.subscription_json);
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
    } catch (err) {
      console.error('Erro ao enviar push, removendo inscrição inválida:', err.statusCode);
      if (err.statusCode === 410 || err.statusCode === 404) {
        db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).run(row.endpoint);
      }
    }
  }
}

// ---- API de boletos ----

app.get('/api/boletos', (req, res) => {
  const apenasAbertos = req.query.abertos === '1';
  res.json(listarBoletos({ apenasAbertos }));
});

app.post('/api/boletos', (req, res) => {
  const { empresa, valor, vencimento } = req.body;

  if (!empresa || !valor || !vencimento) {
    return res.status(400).json({ error: 'Campos obrigatórios: empresa, valor, vencimento (DD/MM/AAAA)' });
  }

  const vencimentoISO = parseDataBR(vencimento);
  if (!vencimentoISO) {
    return res.status(400).json({ error: 'Data inválida. Use o formato DD/MM/AAAA' });
  }

  const valorNum = parseFloat(String(valor).replace(',', '.'));
  if (isNaN(valorNum)) {
    return res.status(400).json({ error: 'Valor inválido' });
  }

  const id = criarBoleto({ empresa, valor: valorNum, vencimentoISO, criadoPor: 'webapp' });
  res.json({ id, empresa, valor: valorNum, vencimento: vencimentoISO });
});

app.post('/api/boletos/:id/pago', (req, res) => {
  marcarComoPago(req.params.id);
  res.json({ ok: true });
});

app.delete('/api/boletos/:id', (req, res) => {
  excluirBoleto(req.params.id);
  res.json({ ok: true });
});

// ---- Verificação diária ----
const horarioCron = process.env.CRON_HORARIO || '0 8 * * *';
cron.schedule(horarioCron, async () => {
  const boletos = boletosVencendoHoje();
  for (const b of boletos) {
    await enviarPushParaTodos({
      title: '🔔 Boleto vence hoje!',
      body: `${b.empresa} — R$ ${b.valor.toFixed(2)} — vence em ${formatDataBR(b.vencimento)}`,
    });
    marcarNotificado(b.id);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`App web rodando em http://localhost:${PORT}`);
});
