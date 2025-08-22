// app-menu.js - bot com menu e roteamento básico
require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const port = process.env.PORT || 3000;
const verifyToken   = (process.env.VERIFY_TOKEN || '').trim();
const token         = (process.env.WHATSAPP_TOKEN || '').trim();
const phoneNumberId = (process.env.PHONE_NUMBER_ID || '').trim();

console.log('[BOOT] phoneNumberId:', phoneNumberId);
console.log('[BOOT] token len:', token.length, 'prefix:', token.slice(0,6), 'suffix:', token.slice(-6));

app.get('/health', (_,res)=>res.status(200).send('ok'));

// Verificação do webhook (GET)
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': t } = req.query;
  if (mode === 'subscribe' && t === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    return res.status(200).send(challenge);
  }
  return res.status(403).end();
});

// ===== Helpers para enviar mensagens =====
const api = axios.create({
  baseURL: `https://graph.facebook.com/v20.0/${phoneNumberId}`,
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  timeout: 15000
});

async function sendText(to, body) {
  try {
    const { data } = await api.post('/messages', {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { preview_url: false, body }
    });
    console.log('[OK] texto enviado:', data);
  } catch (err) {
    console.error('[ERRO] sendText:', JSON.stringify(err?.response?.data || err.message, null, 2));
  }
}

async function sendMenu(to) {
  try {
    const { data } = await api.post('/messages', {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'Como posso ajudar?' },
        footer: { text: 'Atendimento automático' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'orcamento', title: '💰 Orçamento' } },
            { type: 'reply', reply: { id: 'pedido', title: '🛒 Status do pedido' } },
            { type: 'reply', reply: { id: 'fornecedor',     title: '📦 Sou Fornecedor' } }
          ]
        }
      }
    });
    console.log('[OK] menu enviado:', data);
  } catch (err) {
    console.error('[ERRO] sendMenu:', JSON.stringify(err?.response?.data || err.message, null, 2));
  }
}

// ===== Webhook de mensagens =====
app.post('/', async (req, res) => {
  res.sendStatus(200); // responde rápido ao Meta
  try {
    const value   = req.body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message) return; // ignora entregas/acks

    const from = (message.from || '').replace(/\D/g, '');
    if (!/^\d{10,15}$/.test(from)) return;

    // Normaliza texto / botão
    let intent = '';
    if (message.type === 'text') {
      intent = (message.text?.body || '').trim().toLowerCase();
    } else if (message.type === 'interactive') {
      intent =
        (message.interactive?.button_reply?.id ||
         message.interactive?.list_reply?.id ||
         message.interactive?.button_reply?.title ||
         message.interactive?.list_reply?.title || ''
        ).trim().toLowerCase();
    } else if (message.type === 'button') {
      intent = (message.button?.text || '').trim().toLowerCase();
    }

    console.log(`[IN] de ${from}:`, intent || `[${message.type}]`);

    // Gatilhos de saudação → mostra menu
    if (!intent || /^(oi|ola|olá|bom dia|boa tarde|boa noite|menu|iniciar)$/i.test(intent)) {
      await sendText(from, 'Olá! 👋 Sou o assistente de atendimento da Medx.');
      await sendMenu(from);
      return;
    }

    // Roteamento simples
    if (intent.includes('fornecedor') || intent.includes('fornecedores') || intent === 'fornecedor') {
      // TODO: op;óes de fornecedor
      await sendText(from, 'Olá fornecedor! 👋\n\nEnvie o seu *CNPJ* e o *nome da empresa* para busca no sistema.');
      return;
    }

    if (intent.includes('pedido') || intent.includes('entrega')) {
      await sendText(from, 'Envie o número do pedido para consulta (ex.: PED-1234).');
      return;
    }

    if (intent.includes('orcamento') || intent.includes('orçamento')) {
      await sendText(from, 'Para orçamento, envie: *produto*, *quantidade* e *CNPJ/CPF*.');
      return;
    }

    // Se o cliente digitar PED-xxxx → simula status
    const m = intent.match(/ped[-\s]?(\d{3,})/i);
    if (m) {
      const numero = m[1];
      // TODO: consultar status real no ERP
      await sendText(from, `Status do PED-${numero}: *Em separação*.`);
      return;
    }

    // Fallback
    await sendText(from, 'Não entendi. Toque em um botão do menu ou digite: orçamento, pedido ou fornecedor.');
    await sendMenu(from);

  } catch (err) {
    console.error('[ERRO] webhook:', JSON.stringify(err?.response?.data || err.message, null, 2));
  }
});

app.listen(port, () => console.log(`\nListening on port ${port}\n`));