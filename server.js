// GiáThành Pro — Cloud Server
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');

const PORT=process.env.PORT||3000;
const DATA_DIR=process.env.PROJECT_DOMAIN?'/app/.data':__dirname;
const DATA=path.join(DATA_DIR,'giathanh_data.json');

let db={};
const clients=new Set();

try{
  if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR,{recursive:true});
  db=JSON.parse(fs.readFileSync(DATA,'utf8'));
  console.log('✅ Đã tải dữ liệu từ file.');
}catch(e){console.log('📝 Bắt đầu với dữ liệu trống.');}

function broadcast(data){
  const msg=`event:update\ndata:${JSON.stringify(data)}\n\n`;
  for(const res of clients){try{res.write(msg);}catch(e){clients.delete(res);}}
}

const ts=()=>new Date().toLocaleTimeString('vi-VN');

// Helper phục vụ file HTML
function serveHTML(res,filename){
  const filePath=path.join(__dirname,filename);
  fs.readFile(filePath,(err,data)=>{
    if(err){res.writeHead(404);res.end(`<h2>Không tìm thấy ${filename}</h2>`);return;}
    res.setHeader('Content-Type','text/html;charset=utf-8');
    res.writeHead(200);res.end(data);
  });
}

http.createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,PUT,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS'){res.writeHead(200);res.end();return;}

  const url=req.url.split('?')[0];

  // GiáThành Pro — trang chính
  if(url==='/'||url==='/index.html'||url==='/giathanh_pro.html'){
    serveHTML(res,'giathanh_pro.html');return;
  }

  // Quản lý Kho
  if(url==='/quan_ly_kho.html'||url==='/kho'){
    serveHTML(res,'quan_ly_kho.html');return;
  }

  // PWA Manifest
  if(url==='/manifest.json'){
    const manifest={
      name:'GiáThành Pro',short_name:'GiáThành',
      description:'Phần mềm theo dõi giá thành sản xuất',
      start_url:'/',display:'standalone',
      background_color:'#f8f7f5',theme_color:'#2563eb',lang:'vi',
      icons:[{src:"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'><rect width='512' height='512' rx='80' fill='%232563eb'/><text y='380' x='60' font-size='380'>📦</text></svg>",sizes:'512x512',type:'image/svg+xml',purpose:'any maskable'}]
    };
    res.setHeader('Content-Type','application/json');
    res.writeHead(200);res.end(JSON.stringify(manifest));return;
  }

  // SSE Real-time
  if(url==='/events'&&req.method==='GET'){
    res.setHeader('Content-Type','text/event-stream');
    res.setHeader('Cache-Control','no-cache');
    res.setHeader('Connection','keep-alive');
    res.setHeader('X-Accel-Buffering','no');
    res.writeHead(200);
    res.write(':ok\n\n');
    clients.add(res);
    console.log(`[${ts()}] 🔌 +1 kết nối (${clients.size} máy)`);
    if(db.materials||db.orders) res.write(`event:update\ndata:${JSON.stringify(db)}\n\n`);
    const ping=setInterval(()=>{try{res.write(':ping\n\n');}catch(e){clients.delete(res);clearInterval(ping);}},25000);
    req.on('close',()=>{clients.delete(res);clearInterval(ping);console.log(`[${ts()}] 🔌 -1 kết nối (${clients.size} máy)`);});
    return;
  }

  // GET dữ liệu
  if(url==='/giathanh.json'&&req.method==='GET'){
    res.setHeader('Content-Type','application/json;charset=utf-8');
    res.writeHead(200);res.end(JSON.stringify(db));return;
  }

  // PUT lưu & broadcast
  if(url==='/giathanh.json'&&(req.method==='PUT'||req.method==='POST')){
    let body='';
    req.on('data',c=>body+=c);
    req.on('end',()=>{
      try{
        db=JSON.parse(body);
        fs.writeFileSync(DATA,JSON.stringify(db,null,2));
        broadcast(db);
        res.setHeader('Content-Type','application/json');
        res.writeHead(200);res.end('{"ok":true}');
        console.log(`[${ts()}] 💾 Lưu từ ${db._by||'?'} → ${clients.size} máy`);
      }catch(e){res.writeHead(400);res.end('{"error":"JSON lỗi"}');}
    });return;
  }

  res.writeHead(404);res.end('Not found');

}).listen(PORT,'0.0.0.0',()=>{
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║  GiáThành Pro – Cloud Server ✅      ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`🚀 Port: ${PORT}`);
  if(process.env.PROJECT_DOMAIN)
    console.log(`🌐 URL: https://${process.env.PROJECT_DOMAIN}.glitch.me`);
  console.log('─'.repeat(40));
});
