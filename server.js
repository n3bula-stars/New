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

dotenv.config();
const envFile = `.env.${process.env.NODE_ENV || 'production'}`;
if (fs.existsSync(envFile)) {dotenv.config({ path: envFile });}
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bare = createBareServer("/bare/");
const app = express();
const publicPath = "public";

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { secure: false } }));
app.use(express.static(publicPath));
app.use(express.static("public"));
app.use("/scram/", express.static(scramjetPath));
// Also serve common scramjet asset names at the site root for legacy references
// (this avoids copying files into the repo root and keeps a single source)
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
app.get("/results/:query", async (req, res) => {
  try {
    const query = req.params.query.toLowerCase();
    const response = await fetch(`http://api.duckduckgo.com/ac?q=${encodeURIComponent(query)}&format=json`);
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    const data = await response.json();
    const suggestions = data.map(item => ({ phrase: item.phrase })).slice(0, 8);
    // Optionally fetch from Supabase (example: search user history or bookmarks)
    /*
    const { data, error } = await supabase
      .from('user_history') // Ensure you have a table for history or suggestions
      .select('url')
      .ilike('url', `%${query}%`)
      .limit(8);
    if (error) throw error;
    const suggestions = data.map(item => ({ phrase: item.url }));
    */
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

const server = createServer((req, res) => {
  if (bare.shouldRoute(req)) {
    bare.routeRequest(req, res);
  } else {
    app.handle(req, res);
  }
});

server.on("upgrade", (req, socket, head) => {
  if (bare.shouldRoute(req)) {
    bare.routeUpgrade(req, socket, head);
  } else if (req.url && req.url.startsWith("/wisp/")) {
    wisp.routeRequest(req, socket, head);
  } else {
    socket.end();
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
