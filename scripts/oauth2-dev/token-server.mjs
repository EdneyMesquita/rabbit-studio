// Minimal OpenID token server (client_credentials) for the OAuth 2 dev broker.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ISSUER = 'http://127.0.0.1:8099';
const CLIENT_ID = 'rabbit-studio';
const CLIENT_SECRET = 's3cret';
const key = fs.readFileSync(fileURLToPath(new URL('./private.pem', import.meta.url)));
const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

function sign() {
  const iat = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT', kid: 'key1' });
  const body = b64({
    iss: ISSUER, sub: CLIENT_ID, aud: ['rabbitmq'], client_id: CLIENT_ID,
    scope: 'rabbitmq.tag:administrator rabbitmq.configure:*/* rabbitmq.read:*/* rabbitmq.write:*/*',
    iat, exp: iat + 300,
  });
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(key).toString('base64url');
  return `${head}.${body}.${sig}`;
}

const send = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
};

http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/.well-known/openid-configuration') {
    return send(res, 200, { issuer: ISSUER, token_endpoint: `${ISSUER}/token` });
  }
  if (req.method === 'POST' && req.url === '/token') {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const form = new URLSearchParams(raw);
      let id = form.get('client_id');
      let secret = form.get('client_secret');
      const auth = req.headers.authorization || '';
      if (auth.startsWith('Basic ')) {
        const [i, ...s] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
        id = decodeURIComponent(i); secret = decodeURIComponent(s.join(':'));
      }
      if (form.get('grant_type') !== 'client_credentials') return send(res, 400, { error: 'unsupported_grant_type' });
      if (id !== CLIENT_ID || secret !== CLIENT_SECRET) return send(res, 401, { error: 'invalid_client' });
      send(res, 200, { access_token: sign(), token_type: 'Bearer', expires_in: 300 });
    });
    return;
  }
  send(res, 404, { error: 'not_found' });
}).listen(8099, '127.0.0.1', () => console.log(`token server on ${ISSUER}`));
