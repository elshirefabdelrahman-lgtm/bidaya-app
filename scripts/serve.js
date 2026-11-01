import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const base = process.cwd();
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(base + path.sep) || /(?:^|[\\/])\./.test(pathname) || /\.(?:sql|md|json|ts)$/.test(file)) { res.writeHead(403); return res.end(); }
    const body = await readFile(file);
    res.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.jpeg':'image/jpeg'})[path.extname(file)] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options','nosniff'); res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(4174, '127.0.0.1', () => console.log('http://localhost:4174'));
