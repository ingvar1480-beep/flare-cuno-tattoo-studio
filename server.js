const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const MAX_BODY = 32 * 1024;
const RATE_LIMIT = 5;
const RATE_WINDOW = 10 * 60 * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const bucket = hits.get(ip) || [];
  const fresh = bucket.filter((t) => now - t < RATE_WINDOW);
  if (fresh.length >= RATE_LIMIT) return true;
  fresh.push(now);
  hits.set(ip, fresh);
  return false;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function appendBooking(record) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  let list = [];
  if (fs.existsSync(BOOKINGS_FILE)) {
    try {
      list = JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf8'));
      if (!Array.isArray(list)) list = [];
    } catch (e) {
      list = [];
    }
  }
  list.push(record);
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(list, null, 2) + '\n', 'utf8');
}

function readBookings() {
  if (!fs.existsSync(BOOKINGS_FILE)) return [];
  try {
    const list = JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function validateBooking(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    errors.push('Тело запроса должно быть объектом');
    return errors;
  }
  const name = String(data.name || '').trim();
  if (name.length < 2) errors.push('Имя обязательно (минимум 2 символа)');

  const phone = String(data.phone || '').replace(/\D/g, '');
  if (phone.length < 11) errors.push('Телефон обязателен (минимум 11 цифр)');

  if (data.date && !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    errors.push('Неверный формат даты');
  }

  if (data.consent !== true) errors.push('Требуется согласие на обработку данных');

  return errors;
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const relative = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(ROOT, relative);

  const checkRel = relative.replace(/^[\\/]+/, '');
  const blocked = checkRel.split(/[\\/]/).some((part) => part.startsWith('.'));
  if (checkRel === 'data' || checkRel.startsWith('data' + path.sep) || blocked) {
    sendJson(res, 404, { error: 'Не найдено' });
    return;
  }

  if (!filePath.startsWith(ROOT)) {
    sendJson(res, 403, { error: 'Доступ запрещён' });
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><title>404</title><h1>404 — страница не найдена</h1>');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const isHtml = ext === '.html';
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();

  if (!req.url.startsWith('/api/')) {
    serveStatic(req, res);
    return;
  }

  if (req.url.startsWith('/api/health')) {
    sendJson(res, 200, { ok: true, service: 'flarecunotattoo', time: new Date().toISOString() });
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/bookings')) {
    if (rateLimited(ip)) {
      sendJson(res, 429, { error: 'Слишком много заявок. Попробуйте позже.' });
      return;
    }

    let raw;
    try {
      raw = await readBody(req);
    } catch (e) {
      sendJson(res, 413, { error: 'Слишком большое тело запроса' });
      return;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      sendJson(res, 400, { error: 'Неверный JSON' });
      return;
    }

    const errors = validateBooking(data);
    if (errors.length) {
      sendJson(res, 400, { error: errors.join('. ') });
      return;
    }

    const record = {
      id: 'bk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: String(data.name).trim(),
      phone: String(data.phone).trim(),
      style: data.style || null,
      size: data.size || null,
      date: data.date || null,
      contact: data.contact || null,
      idea: data.idea ? String(data.idea).slice(0, 1000) : null,
      receivedAt: new Date().toISOString(),
      ip
    };

    try {
      appendBooking(record);
    } catch (e) {
      sendJson(res, 500, { error: 'Не удалось сохранить заявку' });
      return;
    }

    sendJson(res, 201, { ok: true, id: record.id });
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/bookings')) {
    if (!ADMIN_KEY) {
      sendJson(res, 403, { error: 'Чтение заявок отключено. Задайте ADMIN_KEY.' });
      return;
    }
    const provided = new URL('http://localhost' + req.url).searchParams.get('key');
    if (provided !== ADMIN_KEY) {
      sendJson(res, 401, { error: 'Неверный ключ администратора' });
      return;
    }
    const bookings = readBookings();
    sendJson(res, 200, { ok: true, count: bookings.length, bookings });
    return;
  }

  sendJson(res, 404, { error: 'Не найдено' });
});

server.listen(PORT, () => {
  console.log('FLARE CUNO TATTOO STUDIO сервер: http://localhost:' + PORT);
  console.log('Заявки сохраняются в: ' + BOOKINGS_FILE);
  if (!ADMIN_KEY) console.log('Совет: задайте ADMIN_KEY, чтобы читать заявки через /api/bookings?key=...');
});
