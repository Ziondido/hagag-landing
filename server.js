// ─────────────────────────────────────────────────────────────
//  שרת קליטה אופציונלי — קבוצת חגג
//  מקבל ביקורות טקסט (JSON) והמלצות וידאו (multipart) ושומר לדיסק.
//  הרצה:  node server.js   (אין תלות חיצונית — Node מובנה בלבד)
// ─────────────────────────────────────────────────────────────
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "uploads");
const VIDEO_DIR = path.join(DATA_DIR, "videos");
const REVIEWS_FILE = path.join(DATA_DIR, "reviews.json");

fs.mkdirSync(VIDEO_DIR, { recursive: true });
if (!fs.existsSync(REVIEWS_FILE)) fs.writeFileSync(REVIEWS_FILE, "[]");

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const parts = [];
    req.on("data", (c) => parts.push(c));
    req.on("end", () => resolve(Buffer.concat(parts)));
    req.on("error", reject);
  });
}

// minimal multipart parser: pulls the first file field out of the body
function extractFile(buf, boundary) {
  const bnd = Buffer.from("--" + boundary);
  const sections = [];
  let start = buf.indexOf(bnd);
  while (start !== -1) {
    const next = buf.indexOf(bnd, start + bnd.length);
    if (next === -1) break;
    sections.push(buf.slice(start + bnd.length, next));
    start = next;
  }
  for (const sec of sections) {
    const headerEnd = sec.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const header = sec.slice(0, headerEnd).toString();
    if (/filename="/.test(header)) {
      const m = header.match(/filename="([^"]*)"/);
      const filename = (m && m[1]) || "upload.bin";
      // strip leading CRLF after header and trailing CRLF before boundary
      let data = sec.slice(headerEnd + 4);
      if (data.slice(-2).toString() === "\r\n") data = data.slice(0, -2);
      return { filename, data };
    }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  if (req.method === "POST" && req.url === "/api/reviews") {
    try {
      const body = await readBody(req);
      const review = JSON.parse(body.toString() || "{}");
      const all = JSON.parse(fs.readFileSync(REVIEWS_FILE));
      all.push({ ...review, receivedAt: new Date().toISOString() });
      fs.writeFileSync(REVIEWS_FILE, JSON.stringify(all, null, 2));
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(400); return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  if (req.method === "POST" && req.url === "/api/testimonials") {
    try {
      const ct = req.headers["content-type"] || "";
      const bm = ct.match(/boundary=(.+)$/);
      if (!bm) { res.writeHead(400); return res.end("missing boundary"); }
      const body = await readBody(req);
      const file = extractFile(body, bm[1]);
      if (!file) { res.writeHead(400); return res.end("no file"); }
      const safe = Date.now() + "-" + file.filename.replace(/[^\w.\-]/g, "_");
      fs.writeFileSync(path.join(VIDEO_DIR, safe), file.data);
      console.log("✓ saved testimonial:", safe, "(" + file.data.length + " bytes)");
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, file: safe }));
    } catch (e) {
      res.writeHead(500); return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  res.writeHead(404); res.end("not found");
});

server.listen(PORT, () => {
  console.log(`קבוצת חגג — שרת קליטה רץ על http://localhost:${PORT}`);
  console.log(`ביקורות → ${REVIEWS_FILE}`);
  console.log(`וידאו   → ${VIDEO_DIR}`);
});
