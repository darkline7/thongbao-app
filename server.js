import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import https from "node:https";
import { createGunzip } from "node:zlib";
const _require = createRequire(import.meta.url);
let WebSocket;
try { WebSocket = _require("ws"); } catch { WebSocket = null; }

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const useDist = process.argv.includes("--dist");
const publicDir = join(root, useDist ? "dist" : "web");
const port = Number(process.env.PORT || 4173);

// =============================================================================
// 📝 HƯỚNG DẪN CẬP NHẬT DATA KHI GAME ĐỔI TIME SLOT
// =============================================================================
// Mỗi khi game đổi lịch bán hạt/công cụ, chỉ cần:
// 1. Sửa danh sách `data` bên dưới (name + count)
// 2. Lưu file
// 3. Chạy lại: node server.js
//
// ── BẢNG TRA CỨU TÊN HẠT (name) ─────────────────────────────────────────────
// carrot_seed = Hạt cà rốt        strawberry_seed = Hạt dâu tây
// blueberry_seed = Hạt việt quất  mushroom_seed = Hạt nấm
// corn_seed = Hạt bắp              tomato_seed = Hạt cà chua
// cactus_seed = Hạt xương rồng    apple_seed = Hạt táo
// grape_seed = Hạt nho             pumpkin_seed = Hạt bí ngô
// watermelon_seed = Hạt dưa hấu   coconut_seed = Hạt dừa
// mango_seed = Hạt xoài            bean_seed = Hạt cây đậu
// star_fruit_seed = Hạt khế        sugar_apple_seed = Hạt táo đường
// papaya_seed = Hạt đu đủ          durian_seed = Hạt sầu riêng
// soursop_seed = Hạt mãng cầu      fig_seed = Hạt sung
// cherry_seed = Hạt anh đào
// daisy_seed_white, rose_seed_white, hydrangea_seed_white (hoa trắng)
// forget_me_not_seed_white, balloon_flower_seed_white, morning_glory_seed_white
// lily_of_the_valley_seed_white, trumpet_vine_seed_white
//
// ── BẢNG TRA CỨU TÊN CÔNG CỤ (name) ─────────────────────────────────────────
// common_sprinkler, uncommon_sprinkler, exceptional_sprinkler, flower_sprinkler
// =============================================================================

const overrideResponses = {
  "/api/latest/seed": {
    success: true, statusCode: 200,
    data: {
      data: [
        // ── SỬA Ở ĐÂY khi game đổi hạt giống ─────────────────────────
        { name: "carrot_seed", count: 24 },
        { name: "daisy_seed_white", count: 14 },
        { name: "strawberry_seed", count: 7 },
        { name: "forget_me_not_seed_white", count: 10 },
        { name: "blueberry_seed", count: 4 }
        // ────────────────────────────────────────────────────────────────
      ],
      timeSlot: 3, isFree: false
    }
  },
  "/api/latest/tool": {
    success: true, statusCode: 200,
    data: {
      data: [
        // ── SỬA Ở ĐÂY khi game đổi công cụ ───────────────────────────
        { name: "exceptional_sprinkler", count: 1 }
        // ────────────────────────────────────────────────────────────────
      ],
      timeSlot: 1, isFree: false
    }
  }
};

// ── GAME ITEM ID → SEED KEY MAPPING ────────────────────────────────────────
const SEED_ID_MAP = {
  36010001: "carrot_seed",       36010002: "strawberry_seed",
  36010003: "blueberry_seed",    36010004: "mushroom_seed",
  36010005: "corn_seed",         36010006: "tomato_seed",
  36010007: "cactus_seed",       36010008: "apple_seed",
  36010009: "grape_seed",        36010010: "pumpkin_seed",
  36010011: "watermelon_seed",   36010012: "coconut_seed",
  36010013: "mango_seed",        36010014: "bean_seed",
  36010015: "star_fruit_seed",   36010016: "sugar_apple_seed",
  36010017: "fig_seed",          36010018: "soursop_seed",
  36010019: "papaya_seed",       36010020: "bamboo_seed",
  36010104: "balloon_flower_seed_white",
  36010105: "daisy_seed_white",
  36010106: "forget_me_not_seed_white",
  36010107: "hydrangea_seed_white",
  36010108: "rose_seed_white",
  36010109: "lily_of_the_valley_seed_white",
  36010112: "morning_glory_seed_white",
  36010113: "trumpet_vine_seed_white",
  36010201: "durian_seed",       36010209: "cherry_seed",
};

// ── Đọc data game thực tế từ HTTP Toolkit captures ─────────────────────────
async function loadGameGateData() {
  const result = {};
  for (const fname of ["gate-startup.json", "gate-capture.json"]) {
    try {
      const entries = JSON.parse(await readFile(join(root, fname), "utf8"));
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const res = entry.decodedResponse;
        if (!Array.isArray(res) || res[0] !== 9409) continue;
        const shopData = res[1];
        const raw = shopData?.[7];
        if (!Array.isArray(raw)) continue;
        const rows = Array.isArray(raw[0]) ? raw : [raw];
        const seeds = [];
        for (const item of rows) {
          const itemId = Array.isArray(item[0]) ? item[0][1] : item[1];
          if (!itemId || itemId < 36000000 || itemId > 37000000) continue;
          const key = SEED_ID_MAP[itemId];
          if (key) seeds.push({ name: key, count: 1 });
        }
        if (seeds.length > 0) {
          console.log(`🎮 Game data từ ${fname}: ${seeds.length} hạt giống`);
          result["/api/latest/seed"] = {
            success: true, statusCode: 200,
            data: { data: seeds, timeSlot: shopData[3] ?? 1, isFree: false }
          };
          break;
        }
      }
      if (result["/api/latest/seed"]) break;
    } catch { /* File không tồn tại → bỏ qua */ }
  }
  return result;
}

const gameGateData = await loadGameGateData();

const fallbackResponses = {
  "/api/weather-event/schedule": { today: null, data: [], lastUpdatedAt: null },
  "/api/announcement/active": { success: true, statusCode: 200, data: [] },
  "/api/auth/me": { gameIdAccounts: [] }
};

async function loadCapturedResponses() {
  const merged = {};
  const loaded = [];
  for (const filename of ["thongbao.shop.har", "thongbao1.shop.har"]) {
    try {
      const har = JSON.parse(await readFile(join(root, filename), "utf8"));
      const wanted = new Set(
        [...Object.keys(fallbackResponses), ...Object.keys(overrideResponses)]
          .filter(k => !overrideResponses[k])
      );
      const captured = {};
      for (const entry of har?.log?.entries ?? []) {
        const pathname = new URL(entry.request.url).pathname;
        const text = entry.response?.content?.text;
        if (!wanted.has(pathname) || !text) continue;
        try {
          const body = JSON.parse(text);
          const previousLength = JSON.stringify(captured[pathname] ?? "").length;
          if (text.length > previousLength) captured[pathname] = body;
        } catch { /* ignore malformed */ }
      }
      Object.assign(merged, captured);
      loaded.push(`${filename} (${Object.keys(captured).length})`);
    } catch { /* Try next file */ }
  }
  if (loaded.length) {
    console.log(`Merged real API responses from ${loaded.join(", ")}`);
    return merged;
  }
  console.log("HAR not found; using bundled game-data fallback");
  return {};
}

const capturedResponses = await loadCapturedResponses();

function gameResponse(pathname) {
  return liveShopData[pathname]
    ?? overrideResponses[pathname]
    ?? gameGateData[pathname]
    ?? capturedResponses[pathname]
    ?? fallbackResponses[pathname];
}

function json(res, value, statusCode = 200) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(value));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveFile(req, res) {
  const rawPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const requested = rawPath === "/" ? "index.html" : rawPath.slice(1);
  const safePath = normalize(requested).replace(/^(\.\.(\/)|(\\|$))+/, "");
  let filePath = join(publicDir, safePath);
  try {
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, "index.html");
    const data = await readFile(filePath);
    const types = {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".webmanifest": "application/manifest+json"
    };
    res.writeHead(200, {
      "content-type": types[extname(filePath)] || "application/octet-stream",
      "cache-control": useDist ? "public, max-age=300" : "no-store"
    });
    res.end(data);
  } catch {
    const index = await readFile(join(publicDir, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(index);
  }
}

const server = createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.pathname === "/api/latest/seed")
    return json(res, gameResponse(url.pathname));
  if (req.method === "GET" && url.pathname === "/api/latest/tool")
    return json(res, gameResponse(url.pathname));
  if (req.method === "GET" && url.pathname === "/api/weather-event/schedule")
    return json(res, gameResponse(url.pathname));
  if (req.method === "GET" && url.pathname === "/api/announcement/active")
    return json(res, gameResponse(url.pathname));

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const profile = gameResponse(url.pathname);
    return json(res, {
      displayName: profile.displayName ?? null,
      email: profile.email ?? null,
      ptnId: profile.ptnId ?? null,
      avatarUrl: profile.avatarUrl ?? null,
      plan: profile.plan ?? "free",
      credit: profile.credit ?? 0,
      creditBonus: profile.creditBonus ?? 0,
      subscriptionExp: profile.subscriptionExp ?? null,
      gameIdAccounts: profile.gameIdAccounts ?? []
    });
  }

  if (req.method === "POST" &&
    (url.pathname === "/api/auth/game-id" || url.pathname === "/api/user/game-id-accounts")) {
    try {
      const body = await readJsonBody(req);
      const compact = String(body.gameId ?? body.id ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (compact.length !== 12)
        return json(res, { ok: false, message: "Game ID phải có 12 ký tự" }, 422);
      const gameId = compact.match(/.{1,4}/g).join("-");
      const capturedProfile = gameResponse("/api/auth/me");
      const account = capturedProfile.gameIdAccounts?.find(item => item.id === gameId);
      if (!account)
        return json(res, { success: false, message: "Game ID không có trong dữ liệu đã bắt" }, 404);
      return json(res, {
        success: true, message: "Đăng nhập Game ID thành công", ok: true,
        user: { gameId: account.id, displayName: account.name, avatar: account.avatar, servers: account.servers, plan: capturedProfile.plan ?? "free" },
        data: account
      });
    } catch {
      return json(res, { ok: false, message: "Dữ liệu không hợp lệ" }, 400);
    }
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/"))
    return json(res, { ok: true });

  return serveFile(req, res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`🌱 PT Noti running at http://127.0.0.1:${port}`);
  connectLiveShop();
  startHttpPolling();
});

// ── LIVE WebSocket ─────────────────────────────────────────────────────────
const liveShopData = {};
let wsReconnectDelay = 1000;

function connectLiveShop() {
  if (!WebSocket) { console.log("⚠️ ws module chưa cài — chạy: npm install ws"); return; }
  const ws = new WebSocket("wss://thongbao.shop/_dashboard", {
    headers: {
      "Origin": "https://thongbao.shop",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/148.0.0.0",
      "Cache-Control": "no-cache"
    }
  });
  let pingInterval = null;
  ws.on("open", () => {
    wsReconnectDelay = 1000;
    console.log("🟢 Live shop: kết nối thongbao.shop/_dashboard");
    ws.send(JSON.stringify({ type: "subscribe", topic: "seed" }));
    ws.send(JSON.stringify({ type: "subscribe", topic: "tool" }));
    pingInterval = setInterval(() => { if (ws.readyState === ws.OPEN) ws.ping(); }, 20000);
  });
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "seed" && msg.data) {
        liveShopData["/api/latest/seed"] = { success: true, statusCode: 200, data: msg.data };
        console.log(`🌱 Seed update [slot ${msg.data.timeSlot}]: ${(msg.data.data||[]).map(s=>s.name).join(", ")}`);
      } else if (msg.type === "tool" && msg.data) {
        liveShopData["/api/latest/tool"] = { success: true, statusCode: 200, data: msg.data };
        console.log(`🔧 Tool update [slot ${msg.data.timeSlot}]: ${(msg.data.data||[]).map(t=>t.name).join(", ")}`);
      }
    } catch { /* ignore */ }
  });
  ws.on("close", () => {
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
    console.log(`🔴 Live shop: mất kết nối — thử lại sau ${wsReconnectDelay / 1000}s`);
    setTimeout(connectLiveShop, wsReconnectDelay);
    wsReconnectDelay = Math.min(wsReconnectDelay * 2, 30000);
  });
  ws.on("error", (e) => console.log(`⚠️ Live shop error: ${e.message}`));
}

// ── HTTP POLLING (Firebase auth) ───────────────────────────────────────────
// Token được đọc từ .env — KHÔNG hardcode vào đây!
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || "";
const FIREBASE_REFRESH_TOKEN = process.env.FIREBASE_REFRESH_TOKEN || "";
let bearerToken = null;
let bearerExpiry = 0;

function httpsPost(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({ hostname, path, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
    }, res => { let d = ""; res.on("data", c => d += c); res.on("end", () => resolve(JSON.parse(d))); });
    req.on("error", reject); req.write(data); req.end();
  });
}

async function refreshToken() {
  if (!FIREBASE_API_KEY || !FIREBASE_REFRESH_TOKEN) {
    console.log("⚠️ FIREBASE_API_KEY / FIREBASE_REFRESH_TOKEN chưa set trong .env — bỏ qua HTTP polling");
    return null;
  }
  const r = await httpsPost("securetoken.googleapis.com",
    `/v1/token?key=${FIREBASE_API_KEY}`,
    { grant_type: "refresh_token", refresh_token: FIREBASE_REFRESH_TOKEN }
  );
  if (!r.id_token) throw new Error("Token refresh failed: " + JSON.stringify(r));
  bearerToken = r.id_token;
  bearerExpiry = Date.now() + (Number(r.expires_in) - 60) * 1000;
  console.log("🔑 Firebase token refreshed, expires in", Math.round((bearerExpiry - Date.now()) / 60000), "min");
  return bearerToken;
}

async function getBearer() {
  if (!bearerToken || Date.now() > bearerExpiry) await refreshToken();
  return bearerToken;
}

function httpsGetJSON(path) {
  return new Promise(async (resolve, reject) => {
    const token = await getBearer();
    if (!token) { reject(new Error("No bearer token")); return; }
    const req = https.request({ hostname: "thongbao.shop", path, method: "GET",
      headers: { Authorization: "Bearer " + token, Accept: "application/json",
        "accept-encoding": "gzip", "User-Agent": "Mozilla/5.0", Referer: "https://thongbao.shop/app" }
    }, res => {
      let stream = res;
      if (res.headers["content-encoding"] === "gzip") stream = res.pipe(createGunzip());
      let d = ""; stream.on("data", c => d += c);
      stream.on("end", () => {
        if (res.statusCode === 200) resolve(JSON.parse(d));
        else reject(new Error(`HTTP ${res.statusCode}: ${d.slice(0, 100)}`));
      });
    });
    req.on("error", reject); req.end();
  });
}

async function fetchAndUpdateShop() {
  try {
    const [seed, tool] = await Promise.all([
      httpsGetJSON("/api/latest/seed"),
      httpsGetJSON("/api/latest/tool")
    ]);
    if (seed?.data) {
      liveShopData["/api/latest/seed"] = seed;
      console.log(`🌱 HTTP Seed [slot ${seed.data.timeSlot}]: ${(seed.data.data||[]).map(s=>s.name).join(", ")}`);
    }
    if (tool?.data) {
      liveShopData["/api/latest/tool"] = tool;
      console.log(`🔧 HTTP Tool [slot ${tool.data.timeSlot}]: ${(tool.data.data||[]).map(t=>t.name).join(", ")}`);
    }
  } catch (e) {
    console.log("⚠️ HTTP poll error:", e.message);
  }
}

function startHttpPolling() {
  fetchAndUpdateShop();
  setInterval(fetchAndUpdateShop, 5 * 60 * 1000);
}
