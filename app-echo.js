// app-echo.js - versão que responde eco (hardened)
require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const port = process.env.PORT || 3000;
const verifyToken  = (process.env.VERIFY_TOKEN || '').trim();
const token        = (process.env.WHATSAPP_TOKEN || '').trim();
const phoneNumberId= (process.env.PHONE_NUMBER_ID || '').trim();

console.log('[BOOT] phoneNumberId:', phoneNumberId);
console.log('[BOOT] token len:', token.length, 'prefix:', token.slice(0,6), 'suffix:', token.slice(-6));

// Verificação do webhook (GET)
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': t } = req.query;
  if (mode === 'subscribe' && t === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    return res.status(200).send(challenge);
  }
  return res.status(403).end();
});

// Enviar texto
async function sendText(to, text) {
  console.log(`[SEND] Enviando mensagem para ${to}: ${text}`);
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  try {
    const resp = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { preview_url: false, body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    console.log('[OK] Mensagem enviada:', resp.data);
  } catch (err) {
    console.error('Erro ao responder:', JSON.stringify(err?.response?.data || err.message, null, 2));
  }
}

// Recebimento de mensagens (POST)
app.post('/', async (req, res) => {
  res.sendStatus(200); // responde logo ao Meta
  try {
    const value   = req.body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message) return; // ignora status/acks

    const from = (message.from || '').replace(/\D/g, '');
    if (!/^\d{10,15}$/.test(from)) {
      console.warn('[WARN] destinatário inválido (não E.164):', from);
      return;
    }

    const text = message.text?.body || `[${message.type}] recebido`;
    console.log(`Mensagem recebida de ${from}: ${text}`);

    await sendText(from, `Você disse: ${text}`);
  } catch (err) {
    console.error('Erro ao processar webhook:', JSON.stringify(err?.response?.data || err.message, null, 2));
  }
});

app.listen(port, () => console.log(`\nListening on port ${port}\n`));
