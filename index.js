require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const { enviarMensagem, enviarParaTodos } = require('./zapi');
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

const NUMEROS_AUTORIZADOS = (process.env.NUMEROS_AUTORIZADOS || '')
  .split(',')
  .map((n) => n.trim())
  .filter(Boolean);

function numeroAutorizado(numero) {
  // Compara ignorando o "+" e espaços
  const limpo = numero.replace(/\D/g, '');
  return NUMEROS_AUTORIZADOS.some((n) => n.replace(/\D/g, '') === limpo);
}

function formatarMoeda(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const TEXTO_AJUDA = `🍽️ *Restaurante e Lanchonete Reis*
*Agenda de Boletos*

*/novo* Empresa | Valor | DD/MM/AAAA
Cadastra um novo boleto.
Ex: /novo Energisa | 250,90 | 20/06/2026

*/listar*
Lista todos os boletos em aberto.

*/pago* ID
Marca o boleto como pago (use o ID que aparece em /listar).

*/excluir* ID
Remove o boleto da lista.

*/ajuda*
Mostra esta mensagem.`;

async function processarComando(numero, texto) {
  const msg = texto.trim();

  if (/^\/ajuda/i.test(msg)) {
    return enviarMensagem(numero, TEXTO_AJUDA);
  }

  if (/^\/novo/i.test(msg)) {
    const conteudo = msg.replace(/^\/novo/i, '').trim();
    const partes = conteudo.split('|').map((p) => p.trim());

    if (partes.length !== 3) {
      return enviarMensagem(
        numero,
        '❌ Formato inválido.\n\nUse: */novo* Empresa | Valor | DD/MM/AAAA\nEx: /novo Energisa | 250,90 | 20/06/2026'
      );
    }

    const [empresa, valorStr, dataStr] = partes;
    const valorNormalizado = valorStr.replace(/\./g, '').replace(',', '.');
    const valor = parseFloat(valorNormalizado);

    if (!empresa || isNaN(valor)) {
      return enviarMensagem(numero, '❌ Empresa ou valor inválido. Verifique o formato e tente novamente.');
    }

    const vencimentoISO = parseDataBR(dataStr);
    if (!vencimentoISO) {
      return enviarMensagem(numero, '❌ Data inválida. Use o formato DD/MM/AAAA, ex: 20/06/2026.');
    }

    const id = criarBoleto({ empresa, valor, vencimentoISO, criadoPor: numero });

    return enviarMensagem(
      numero,
      `✅ Boleto cadastrado!\n\n*ID:* ${id}\n*Empresa:* ${empresa}\n*Valor:* ${formatarMoeda(valor)}\n*Vencimento:* ${formatDataBR(vencimentoISO)}\n\nVocê (e o time) receberá uma notificação no dia do vencimento.`
    );
  }

  if (/^\/listar/i.test(msg)) {
    const boletos = listarBoletos({ apenasAbertos: true });

    if (boletos.length === 0) {
      return enviarMensagem(numero, '📋 Não há boletos em aberto.');
    }

    let texto = '📋 *Boletos em aberto:*\n\n';
    for (const b of boletos) {
      texto += `*ID ${b.id}* — ${b.empresa}\n💰 ${formatarMoeda(b.valor)}\n📅 Vence em ${formatDataBR(b.vencimento)}\n\n`;
    }
    texto += 'Para marcar como pago: */pago* ID\nPara excluir: */excluir* ID';

    return enviarMensagem(numero, texto);
  }

  if (/^\/pago/i.test(msg)) {
    const idStr = msg.replace(/^\/pago/i, '').trim();
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return enviarMensagem(numero, '❌ Use: */pago* ID (ex: /pago 3)');
    }
    marcarComoPago(id);
    return enviarMensagem(numero, `✅ Boleto ID ${id} marcado como pago.`);
  }

  if (/^\/excluir/i.test(msg)) {
    const idStr = msg.replace(/^\/excluir/i, '').trim();
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return enviarMensagem(numero, '❌ Use: */excluir* ID (ex: /excluir 3)');
    }
    excluirBoleto(id);
    return enviarMensagem(numero, `🗑️ Boleto ID ${id} excluído.`);
  }

  // Comando não reconhecido
  return enviarMensagem(
    numero,
    'Não entendi esse comando. Digite */ajuda* para ver os comandos disponíveis.'
  );
}

// Webhook do Z-API - dispara quando uma mensagem é recebida
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    // Ignora mensagens enviadas pelo próprio bot
    if (body.fromMe) return res.sendStatus(200);

    const numero = body.phone;
    const texto = body.text?.message;

    if (!numero || !texto) return res.sendStatus(200);

    if (!numeroAutorizado(numero)) {
      console.log(`Mensagem de número não autorizado: ${numero}`);
      return res.sendStatus(200);
    }

    await processarComando(numero, texto);
    res.sendStatus(200);
  } catch (err) {
    console.error('Erro no webhook:', err);
    res.sendStatus(500);
  }
});

// Verificação diária de vencimentos
const horarioCron = process.env.CRON_HORARIO || '0 8 * * *';
cron.schedule(horarioCron, async () => {
  console.log('Verificando boletos que vencem hoje...');
  const boletos = boletosVencendoHoje();

  for (const b of boletos) {
    const texto = `🔔 *Lembrete de vencimento — Restaurante e Lanchonete Reis*\n\n*Empresa:* ${b.empresa}\n*Valor:* ${formatarMoeda(b.valor)}\n*Vencimento:* HOJE (${formatDataBR(b.vencimento)})\n\nID: ${b.id}\nPara marcar como pago: /pago ${b.id}`;
    await enviarParaTodos(texto);
    marcarNotificado(b.id);
  }
});

const PORT = process.env.BOT_PORT || 3001;
app.listen(PORT, () => {
  console.log(`Bot rodando na porta ${PORT}. Configure o webhook do Z-API para: http://SEU_DOMINIO:${PORT}/webhook`);
});
