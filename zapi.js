const axios = require('axios');

const { ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN } = process.env;

const baseURL = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}`;

async function enviarMensagem(numero, mensagem) {
  try {
    await axios.post(
      `${baseURL}/send-text`,
      { phone: numero, message: mensagem },
      { headers: { 'Client-Token': ZAPI_CLIENT_TOKEN } }
    );
  } catch (err) {
    console.error(`Erro ao enviar mensagem para ${numero}:`, err.response?.data || err.message);
  }
}

async function enviarParaTodos(mensagem) {
  const numeros = (process.env.NUMEROS_AUTORIZADOS || '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);

  for (const numero of numeros) {
    await enviarMensagem(numero, mensagem);
  }
}

module.exports = { enviarMensagem, enviarParaTodos };
