// app.js - Echo bot WhatsApp Cloud API
require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;
const token = process.env.WHATSAPP_TOKEN;
const phoneNumberId = process.env.PHONE_NUMBER_ID;

// Healthcheck
app.get('/health', (_, res) => res.status(200).send('ok'));

// Verificação do webhook (GET)
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': t } = req.query;
  if (mode === 'subscribe' && t === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    return res.status(200).send(challenge);
  }
  return res.status(403).end();
});

// Helper: enviar texto
async function sendText(to, text) {
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  try {
    await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { preview_url: false, body: text },
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (err) {
    const data = err?.response?.data || err.message;
    console.error('Erro ao enviar mensagem:', data);
  }
}

// Webhook de mensagens (POST)
app.post('/', async (req, res) => {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n\nWebhook received ${ts}\n${JSON.stringify(req.body, null, 2)}\n`);
  res.sendStatus(200); // Confirma rápido p/ o Meta

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];
    const from = message?.from;
    if (!from) return;

    let userText = '';
    switch (message?.type) {
      case 'text':
        userText = message.text?.body || '';
        break;
      case 'interactive':
        userText =
          message.interactive?.button_reply?.title ||
          message.interactive?.list_reply?.title ||
          message.interactive?.button_reply?.id ||
          message.interactive?.list_reply?.id ||
          '';
        break;
      case 'button':
        userText = message.button?.text || '';
        break;
      default:
        userText = `[${message?.type}] recebido`;
    }

    // Resposta eco (ponto de partida)
    await sendText(from, `Recebi: ${userText}`);
  } catch (err) {
    console.error('Erro ao processar webhook:', err?.response?.data || err.message);
  }
});

app.listen(port, () => console.log(`\nListening on port ${port}\n`));