// GiáThành Pro — Server với Supabase Database
const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const https   = require('https');

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

let db = {};
const clients = new Set();
const ts = () => new Date().toLocaleTimeString('vi-VN');

// ── SUPABASE helpers ──
function supaFetch(method, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/app_data`);
    if (method === 'GET') url.searchParams.set('id', 'eq.1');
    const options = {
      method,
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer':        method === 'PATCH' ? 'return=minimal' : 'return=representation',
      },
    };
    if (method === 'GET') url.searchParams.set('select', 'data');
    const req = https.request(url, options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function loadFromSupabase() {
  if (!SUPABASE_URL) return;
  try {
    const r = await supaFetch('GET');
    if (r.status === 200 && r.body[0]?.data) {
      db = r.body[0].data;
      console.log(`[${ts()}] ✅ Đã tải dữ liệu từ Supabase`);
    }
  } catch(e) {
    console.log(`[${ts()}] ⚠️  Không tải được từ Supabase:`, e.message);
  }
}

async function saveToSupabase(data) {
  if (!SUPABASE_URL) return;
  try {
    await supaFetch('PATCH', { data, updated_at: new Date().toISOString() });
  } catch(e) {
    console.log(`[${ts()}] ⚠️  Không lưu được vào Supabase:`, e.message);
    // Fallback: lưu file local
    fs.writeFileSync(path.join(__dirname, 'giathanh_data.json'),
      JSON.stringify(data, null, 2));
  }
}

// Broadcast SSE
function broadcast(data) {
  const msg = `event:update\ndata:${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(msg); } catch(e) { clients.delete(res); }
  }
  console.log(`[${ts()}] 📡 Broadcast → ${clients.size} máy`);
}

// Helper phục vụ file HTML
function serveHTML(res, filename) {
  const filePath = path.join(__dirname, filename);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end(`<h2>Không tìm thấy ${filename}</h2>`);
      return;
    }
    res.setHeader('Content-Type', 'text/html;charset=utf-8');
    res.writeHead(200);
    res.end(data);
  });
}

// ── HTTP SERVER ──
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const url = req.url.split('?')[0];

  // Trang chính
  if (url === '/' || url === '/index.html' || url === '/giathanh_pro.html') {
    serveHTML(res, 'giathanh_pro.html'); return;
  }

  // Phần mềm Kho
  if (url === '/quan_ly_kho.html' || url === '/kho') {
    serveHTML(res, 'quan_ly_kho.html'); return;
  }

  // PWA Manifest
  if (url === '/manifest.json') {
    const manifest = {
      name: 'GiáThành Pro', short_name: 'GiáThành',
      description: 'Phần mềm theo dõi giá thành sản xuất',
      start_url: '/', display: 'standalone',
      background_color: '#f8f7f5', theme_color: '#2563eb', lang: 'vi',
      icons: [{ src: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'><rect width='512' height='512' rx='80' fill='%232563eb'/><text y='380' x='60' font-size='380'>📦</text></svg>", sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }]
    };
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200); res.end(JSON.stringify(manifest)); return;
  }

  // SSE Real-time
  if (url === '/events' && req.method === 'GET') {
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.writeHead(200);
    res.write(':ok\n\n');
    clients.add(res);
    console.log(`[${ts()}] 🔌 +1 kết nối (${clients.size} máy online)`);
    if (db.materials || db.orders)
      res.write(`event:update\ndata:${JSON.stringify(db)}\n\n`);
    const ping = setInterval(() => {
      try { res.write(':ping\n\n'); }
      catch(e) { clients.delete(res); clearInterval(ping); }
    }, 25000);
    req.on('close', () => {
      clients.delete(res); clearInterval(ping);
      console.log(`[${ts()}] 🔌 -1 kết nối (${clients.size} máy)`);
    });
    return;
  }

  // GET dữ liệu
  if (url === '/giathanh.json' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    res.writeHead(200); res.end(JSON.stringify(db)); return;
  }

  // PUT lưu & broadcast
  if (url === '/giathanh.json' && (req.method === 'PUT' || req.method === 'POST')) {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        db = JSON.parse(body);
        await saveToSupabase(db);      // Lưu vào Supabase
        broadcast(db);
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200); res.end('{"ok":true}');
        console.log(`[${ts()}] 💾 Lưu từ ${db._by || '?'} → Supabase`);
      } catch(e) {
        res.writeHead(400); res.end('{"error":"JSON lỗi"}');
      }
    });
    return;
  }

  res.writeHead(404); res.end('Not found');
});

function getIP() {
  const os = require('os');
  for (const ifaces of Object.values(os.networkInterfaces()))
    for (const i of ifaces)
      if (i.family === 'IPv4' && !i.internal) return i.address;
  return 'localhost';
}

// Khởi động: tải dữ liệu từ Supabase rồi mới lắng nghe
loadFromSupabase().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║  GiáThành Pro + Supabase Database  ✅        ║');
    console.log('╚══════════════════════════════════════════════╝\n');
    console.log(`🚀 Port: ${PORT}`);
    console.log(`🗄️  Database: ${SUPABASE_URL ? 'Supabase ✅' : '⚠️  Chưa cấu hình SUPABASE_URL'}`);
    console.log('─'.repeat(50));
  });
});
