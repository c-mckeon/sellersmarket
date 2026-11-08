// Local dev server: node tools/serve.js [port]
// Serves the site with caching off, and reloads the browser whenever a file changes.
const http = require("http"), fs = require("fs"), path = require("path");

const ROOT = path.resolve(__dirname, ".."), PORT = +process.argv[2] || 8000;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2" };
const RELOAD = `<script>new EventSource("/__reload").onmessage = () => location.reload();</script>`;

// Browsers listening for a reload
const clients = new Set();
let timer = null;
fs.watch(ROOT, { recursive: true }, (ev, file) => {
  if (!file || /^(\.git|node_modules)[\\/]/.test(file)) return;
  clearTimeout(timer); // editors often write a file several times in a row
  timer = setTimeout(() => { console.log(`changed: ${file}`); clients.forEach(res => res.write("data: reload\n\n")); }, 100);
});

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/__reload") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    res.write(": hi\n\n");
    clients.add(res); req.on("close", () => clients.delete(res));
    return;
  }
  let file = path.join(ROOT, url);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    const ext = path.extname(file).toLowerCase();
    if (ext === ".html") data = data.toString().replace(/__V__/g, Date.now()).replace("</body>", RELOAD + "</body>");
    res.writeHead(200, { "Content-Type": (TYPES[ext] || "application/octet-stream") + (ext.match(/html|js|css|json|svg/) ? "; charset=utf-8" : ""), "Cache-Control": "no-store" });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Serving on http://localhost:${PORT} (reloads on save, Ctrl+C to stop)`));
