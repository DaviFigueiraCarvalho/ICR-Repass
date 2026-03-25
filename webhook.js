/**
 * webhook.js – Node.js/Express webhook handler for Pagar.me
 *
 * Responsibilities:
 *   1. Receive payment-confirmed events from Pagar.me
 *   2. Validate the HMAC-SHA256 signature to ensure authenticity
 *   3. On `order.paid` event, save the repasse via the existing /api/repasses endpoint
 *
 * Required environment variables (see .env.example):
 *   PAGARME_SECRET_KEY  – Pagar.me secret key (used for HMAC validation)
 *   API_BASE_URL        – Base URL of the C# API (e.g. https://sua-api.com)
 *   PORT                – (optional) port to listen on, defaults to 3001
 *
 * Setup:
 *   npm install express dotenv
 *   node webhook.js
 *
 * Configure Pagar.me to send webhooks to:
 *   https://<your-domain>/webhook/pagarme
 */

'use strict';

const crypto = require('crypto');
const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Keep the raw body buffer available for HMAC verification before JSON parsing
app.use('/webhook/pagarme', express.raw({ type: 'application/json' }));
app.use(express.json());

/**
 * Verifies the HMAC-SHA256 signature sent by Pagar.me in the
 * `x-hub-signature` request header.
 *
 * @param {Buffer} rawBody - Raw request body buffer
 * @param {string} signatureHeader - Value of the x-hub-signature header
 * @returns {boolean}
 */
function isValidSignature(rawBody, signatureHeader) {
    if (!signatureHeader || !process.env.PAGARME_SECRET_KEY) return false;

    const expected = crypto
        .createHmac('sha256', process.env.PAGARME_SECRET_KEY)
        .update(rawBody)
        .digest('hex');

    // Use timingSafeEqual to prevent timing attacks
    try {
        return crypto.timingSafeEqual(
            Buffer.from(signatureHeader),
            Buffer.from(expected)
        );
    } catch {
        return false;
    }
}

/**
 * POST /webhook/pagarme
 *
 * Pagar.me sends a JSON payload with a `type` field (e.g. "order.paid")
 * and a `data` object containing the order details.
 * Order metadata is expected to carry `churchId` and `reference` so the
 * repasse can be associated with the correct church/period.
 */
app.post('/webhook/pagarme', async (req, res) => {
    const signature = req.headers['x-hub-signature'];

    if (!isValidSignature(req.body, signature)) {
        console.warn('Webhook: assinatura inválida recebida');
        return res.status(401).json({ error: 'Assinatura inválida' });
    }

    let event;
    try {
        event = JSON.parse(req.body.toString());
    } catch {
        return res.status(400).json({ error: 'Corpo do webhook inválido' });
    }

    if (event.type === 'order.paid') {
        const order = event.data;
        const metadata = order.metadata || {};

        const churchId = Number(metadata.churchId);
        const reference = Number(metadata.reference);
        // Pagar.me amounts are in cents
        const amount = (order.amount || 0) / 100;

        if (!churchId || !reference || !amount) {
            console.error('Webhook: metadados incompletos no pedido', order.id);
            return res.status(422).json({ error: 'Metadados incompletos no pedido' });
        }

        try {
            const apiResponse = await fetch(`${process.env.API_BASE_URL}/api/repasses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ churchId, reference, amount }),
            });

            if (!apiResponse.ok) {
                const body = await apiResponse.text();
                console.error('Webhook: falha ao salvar repasse', apiResponse.status, body);
                return res.status(502).json({ error: 'Falha ao salvar repasse' });
            }

            console.log(`Webhook: repasse salvo com sucesso (pedido ${order.id})`);
        } catch (err) {
            console.error('Webhook: erro ao chamar /api/repasses', err);
            return res.status(500).json({ error: 'Erro interno ao salvar repasse' });
        }
    }

    // Acknowledge all other event types with 200 so Pagar.me stops retrying
    res.status(200).json({ received: true });
});

app.listen(PORT, () => {
    console.log(`Servidor de webhook rodando na porta ${PORT}`);
});
