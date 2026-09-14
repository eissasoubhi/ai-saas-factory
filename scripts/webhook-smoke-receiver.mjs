import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const secret = process.env.WEBHOOK_SMOKE_SECRET?.trim();
if (!secret) {
  console.error('WEBHOOK_SMOKE_SECRET is required');
  process.exit(1);
}

const port = Number(process.env.WEBHOOK_SMOKE_PORT ?? '8787');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('WEBHOOK_SMOKE_PORT must be a valid TCP port');
  process.exit(1);
}

const seen = new Set();
const maxBodyBytes = 256 * 1024;
const maxAgeSeconds = 300;

function verifySignature({ timestamp, eventId, body, signature }) {
  if (!signature.startsWith('v1=')) return false;
  const expectedHex = createHmac('sha256', secret)
    .update(`${timestamp}.${eventId}.${body}`, 'utf8')
    .digest('hex');
  const actualHex = signature.slice(3);
  if (!/^[0-9a-f]{64}$/i.test(actualHex)) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(actualHex, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const server = createServer((request, response) => {
  if (request.method !== 'POST') {
    response.writeHead(405).end();
    return;
  }

  const chunks = [];
  let size = 0;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size > maxBodyBytes) {
      response.writeHead(413).end();
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => {
    if (response.writableEnded) return;
    const eventId = String(request.headers['x-ai-saas-event-id'] ?? '');
    const eventType = String(request.headers['x-ai-saas-event-type'] ?? '');
    const timestampText = String(request.headers['x-ai-saas-timestamp'] ?? '');
    const signature = String(request.headers['x-ai-saas-signature'] ?? '');
    const timestamp = Number(timestampText);
    const now = Math.floor(Date.now() / 1000);
    const body = Buffer.concat(chunks).toString('utf8');

    let status = 204;
    let reason = 'accepted';
    if (!eventId || !eventType || !Number.isSafeInteger(timestamp)) {
      status = 400;
      reason = 'missing_headers';
    } else if (Math.abs(now - timestamp) > maxAgeSeconds) {
      status = 401;
      reason = 'stale_timestamp';
    } else if (seen.has(eventId)) {
      status = 409;
      reason = 'replay';
    } else if (!verifySignature({ timestamp, eventId, body, signature })) {
      status = 401;
      reason = 'invalid_signature';
    } else {
      seen.add(eventId);
    }

    console.log(JSON.stringify({ eventId: eventId || null, eventType: eventType || null, status, reason }));
    response.writeHead(status).end();
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(JSON.stringify({ listening: `http://127.0.0.1:${port}`, note: 'local receiver only; production sender still requires public HTTPS' }));
});
