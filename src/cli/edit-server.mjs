// Local edit server for `triton2 edit <file.dsl>`.
// Serves the editor UI plus the package's dist/vendor assets on a random
// loopback port, exposes GET/POST /api/file for the edited DSL file, and
// opens the browser. No state leaves the machine.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const SAMPLE = `flowchart TD
  client[Клиент] --> api[API Gateway]
  api --> auth{Авторизован?}
  auth -Да-> svc[Сервис]
  auth -Нет-> deny([Отказ 401])
  svc --> db[(База данных)]
  svc --> log[Журнал] [--]
`;

function openBrowser(url) {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    const child = spawn(opener, [url], { detached: true, stdio: 'ignore', shell: process.platform === 'win32' });
    child.unref();
  } catch {
    // headless environment — the URL is printed below
  }
}

export function startEditServer(filePath) {
  const absoluteFile = path.resolve(filePath);
  if (!fs.existsSync(absoluteFile)) {
    fs.writeFileSync(absoluteFile, SAMPLE, 'utf8');
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    if (url.pathname === '/api/file') {
      if (req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ name: path.basename(absoluteFile), text: fs.readFileSync(absoluteFile, 'utf8') }));
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          fs.writeFileSync(absoluteFile, body, 'utf8');
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{"ok":true}');
        });
        return;
      }
    }

    // Static: / redirects to /editor/ so that the page's relative asset
    // references (./editor.css, ./editor.js) resolve under /editor/.
    if (url.pathname === '/') {
      res.writeHead(302, { location: '/editor/' });
      res.end();
      return;
    }
    let rel = url.pathname === '/editor/' ? 'editor/index.html' : url.pathname;
    rel = path.normalize(rel).replace(/^([/\\])+/, '');
    const resolved = rel.startsWith('editor/')
      ? path.join(packageRoot, 'src', rel)
      : path.join(packageRoot, rel);

    if (!resolved.startsWith(packageRoot) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(resolved)] || 'application/octet-stream' });
    fs.createReadStream(resolved).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const url = `http://127.0.0.1:${port}/`;
      process.stdout.write(`triton2 edit: ${path.basename(absoluteFile)} @ ${url}\nCtrl+C — выход\n`);
      openBrowser(url);
      resolve({ server, url });
    });
  });
}
