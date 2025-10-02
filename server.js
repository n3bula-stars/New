import { createBareServer } from "@tomphttp/bare-server-node";
import express from "express";
import { createServer } from "node:http";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import path, { join } from "node:path";
import { hostname } from "node:os";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import session from "express-session";
import dotenv from "dotenv";
import fileUpload from "express-fileupload";
import { signupHandler } from "./server/api/signup.js";
import { signinHandler } from "./server/api/signin.js";
import cors from "cors";
import fetch from "node-fetch";
import fs from 'fs';
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

dotenv.config();
const envFile = `.env.${process.env.NODE_ENV || 'production'}`;
if (fs.existsSync(envFile)) {dotenv.config({ path: envFile });}
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = "public";
const { SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bare = createBareServer("/bare/");
const app = express();
app.use(cookieParser());

app.use(express.static(publicPath));
app.use("/scram/", express.static(scramjetPath));
app.get('/scramjet.all.js', (req, res) => {
  return res.sendFile(path.join(scramjetPath, 'scramjet.all.js'));
});
app.get('/scramjet.sync.js', (req, res) => {
  return res.sendFile(path.join(scramjetPath, 'scramjet.sync.js'));
});
app.get('/scramjet.wasm.wasm', (req, res) => {
  return res.sendFile(path.join(scramjetPath, 'scramjet.wasm.wasm'));
});
app.get('/scramjet.all.js.map', (req, res) => {
  return res.sendFile(path.join(scramjetPath, 'scramjet.all.js.map'));
});
app.use("/baremux/", express.static(baremuxPath));
app.use("/epoxy/", express.static(epoxyPath));

const verifyMiddleware = (req, res, next) => {
  const verified = req.cookies?.verified === "ok" || req.headers["x-bot-token"] === process.env.BOT_TOKEN;
  const protectedPaths = ["/api/", "/bare/"];
  if (!protectedPaths.some(p => req.url.startsWith(p))) return next();

  const ua = req.headers["user-agent"] || "";
  const isBrowser = /Mozilla|Chrome|Safari|Firefox|Edge/i.test(ua);
  const acceptsHtml = req.headers.accept?.includes("text/html");

  if (!isBrowser) return res.status(403).send("Forbidden");
  if (verified && isBrowser) return next();
  if (!acceptsHtml) return next();

  res.cookie("verified", "ok", { maxAge: 86400000, httpOnly: true, sameSite: "Strict" });
  res.status(200).send(`
    <!DOCTYPE html>
    <html><body>
      <script>
        document.cookie = "verified=ok; Max-Age=86400; SameSite=Strict";
        setTimeout(() => window.location.replace(window.location.pathname), 100);
      </script>
      <noscript>Enable JavaScript to continue.</noscript>
    </body></html>
  `);
};

app.use(verifyMiddleware);

const apiLimiter = rateLimit({
  windowMs: 15 * 1000, 
  max: 100,             
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, slow down"
});

app.use("/bare/", apiLimiter);
app.use("/api/", apiLimiter);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { secure: false } }));

app.get("/results/:query", async (req, res) => {
  try {
    const query = req.params.query.toLowerCase();
    const response = await fetch(`http://api.duckduckgo.com/ac?q=${encodeURIComponent(query)}&format=json`);
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    const data = await response.json();
    const suggestions = data.map(item => ({ phrase: item.phrase })).slice(0, 8);
    return res.status(200).json(suggestions);
  } catch (error) {
    console.error("Error generating suggestions:", error.message);
    return res.status(500).json({ error: "Failed to fetch suggestions" });
  }
});

app.post("/api/signup", signupHandler);
app.post("/api/signin", signinHandler);
app.post("/api/signout", async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    req.session.destroy();
    return res.status(200).json({ message: "Signout successful" });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
app.get("/api/profile", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { data, error } = await supabase.auth.getUser(req.session.access_token);
    if (error) throw error;
    return res.status(200).json({ user: data.user });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
app.post("/api/signin/oauth", async (req, res) => {
  const { provider } = req.body;
  const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const host = req.headers.host;
  if (!host) {
    return res.status(400).json({ error: "Host header missing" });
  }
  const redirectTo = `${protocol}://${host}/auth/callback`;
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo }
    });
    if (error) throw error;
    return res.status(200).json({ url: data.url, openInNewTab: true });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
app.get("/auth/callback", (req, res) => {
  return res.sendFile(join(__dirname, publicPath, "auth-callback.html"));
});
app.post("/api/set-session", async (req, res) => {
  const { access_token, refresh_token } = req.body;
  if (!access_token || !refresh_token) {
    return res.status(400).json({ error: "Invalid session tokens" });
  }
  try {
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token
    });
    if (error) throw error;
    req.session.user = data.user;
    req.session.access_token = access_token;
    return res.status(200).json({ message: "Session set successfully" });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
app.post("/api/upload-profile-pic", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const file = req.files?.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const userId = req.session.user.id;
    const fileName = `${userId}/${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage
      .from('profile-pics')
      .upload(fileName, file.data, { contentType: file.mimetype });
    if (error) throw error;
    const { data: publicUrlData } = supabase.storage
      .from('profile-pics')
      .getPublicUrl(fileName);
    const { error: updateError } = await supabase.auth.updateUser({
      data: { avatar_url: publicUrlData.publicUrl }
    });
    if (updateError) throw updateError;
    return res.status(200).json({ url: publicUrlData.publicUrl });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
app.post("/api/update-profile", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { username, bio } = req.body;
    const { error } = await supabase.auth.updateUser({
      data: { name: username, bio }
    });
    if (error) throw error;
    return res.status(200).json({ message: "Profile updated" });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
app.post("/api/save-localstorage", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { data } = req.body;
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: req.session.user.id, localstorage_data: data }, { onConflict: 'user_id' });
    if (error) throw error;
    return res.status(200).json({ message: "LocalStorage saved" });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
app.get("/api/load-localstorage", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('localstorage_data')
      .eq('user_id', req.session.user.id)
      .single();
    if (error) throw error;
    return res.status(200).json({ data: data?.localstorage_data || '{}' });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
app.delete("/api/delete-account", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { error } = await supabase.rpc('delete_user', { user_id: req.session.user.id });
    if (error) throw error;
    req.session.destroy();
    return res.status(200).json({ message: "Account deleted" });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
app.post("/api/link-account", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { provider } = req.body;
    const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    const host = req.headers.host;
    if (!host) {
      return res.status(400).json({ error: "Host header missing" });
    }
    const redirectTo = `${protocol}://${host}/auth/callback`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true }
    });
    if (error) throw error;
    return res.status(200).json({ url: data.url, openInNewTab: true });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.use((req, res) => {
  return res.status(404).sendFile(join(__dirname, publicPath, "404.html"));
});

function parseCookies(header) {
  if (!header) return {};
  return header.split(';').reduce((acc, cookie) => {
    const [name, value] = cookie.trim().split('=');
    acc[name] = value;
    return acc;
  }, {});
}

const isVerified = (req) => {
  const cookies = parseCookies(req.headers.cookie);
  return cookies.verified === "ok" || req.headers["x-bot-token"] === process.env.BOT_TOKEN;
};

const isBrowser = (req) => {
  const ua = req.headers["user-agent"] || "";
  return /Mozilla|Chrome|Safari|Firefox|Edge/i.test(ua);
};

const handleHttpVerification = (req, res, next) => {
  const acceptsHtml = req.headers.accept?.includes("text/html");
  if (!acceptsHtml) return next();
  if (isVerified(req) && isBrowser(req)) return next();
  if (!isBrowser(req)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    return res.end("Forbidden");
  }
  res.writeHead(200, {
    "Content-Type": "text/html",
    "Set-Cookie": "verified=ok; Max-Age=86400; Path=/; HttpOnly; SameSite=Strict"
  });
  res.end(`
    <!DOCTYPE html>
    <html>
      <body>
        <script>
          document.cookie = "verified=ok; Max-Age=86400; SameSite=Strict";
          setTimeout(() => window.location.replace(window.location.pathname), 100);
        </script>
        <noscript>Enable JavaScript to continue.</noscript>
      </body>
    </html>
  `);
};

const handleUpgradeVerification = (req, socket, next) => {
  const verified = isVerified(req);
  const isWsBrowser = isBrowser(req);
  console.log(`WebSocket Upgrade Attempt: URL=${req.url}, Verified=${verified}, IsBrowser=${isWsBrowser}, Cookies=${req.headers.cookie || 'none'}`);
  if (verified && isWsBrowser) {
    return next();
  }
  console.log(`WebSocket Rejected: URL=${req.url}, Reason=${verified ? 'Not a browser' : 'Not verified'}`);
  socket.destroy();
};

const server = createServer((req, res) => {
  if (bare.shouldRoute(req)) {
    handleHttpVerification(req, res, () => bare.routeRequest(req, res));
  } else {
    app.handle(req, res);
  }
});

server.on("upgrade", (req, socket, head) => {
  if (bare.shouldRoute(req)) {
    handleUpgradeVerification(req, socket, () => bare.routeUpgrade(req, socket, head));
  } else if (req.url && req.url.startsWith("/wisp/")) {
    handleUpgradeVerification(req, socket, () => wisp.routeRequest(req, socket, head));
  } else {
    socket.destroy();
  }
});

const port = parseInt(process.env.PORT || "3000");

server.listen({ port }, () => {
  const address = server.address();
  console.log(`Listening on:`);
  console.log(`\thttp://localhost:${address.port}`);
  console.log(`\thttp://${hostname()}:${address.port}`);
  console.log(`\thttp://${address.family === "IPv6" ? `[${address.address}]` : address.address}:${address.port}`);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close();
  bare.close();
  process.exit(0);
}
