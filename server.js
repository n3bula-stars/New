import { createBareServer } from "@tomphttp/bare-server-node";
import express from "express";
import { createServer } from "node:http";
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

dotenv.config({ path: `.env.${process.env.NODE_ENV || "development"}` });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bare = createBareServer("/bare/");
const app = express();
const publicPath = "public";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { secure: process.env.NODE_ENV === "production", httpOnly: true, maxAge: 24 * 60 * 60 * 1000, sameSite: 'lax' } }));
app.use(express.static(publicPath));
app.use("/petezah/", express.static(uvPath));

app.post("/api/signup", signupHandler);
app.post("/api/signin", signinHandler);
app.post("/api/signout", async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    req.session.destroy();
    return res.status(200).json({ message: "Signout successful" });
  } catch (error) {
    console.error(`Signout error: ${error.message}`);
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
    console.error(`Profile error: ${error.message}`);
    return res.status(400).json({ error: error.message });
  }
});
app.post("/api/signin/oauth", async (req, res) => {
  const { provider, state } = req.body;
  const protocol = process.env.NODE_ENV === "production" ? "https" : req.headers['x-forwarded-proto'] || 'http';
  const host = process.env.APP_HOST || req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const redirectTo = `${protocol}://${host}/auth/callback`;
  req.session.oauth_state = state;
  console.log(`OAuth initiated: provider=${provider}, state=${state}, redirectTo=${redirectTo}, sessionID=${req.sessionID}`);
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, queryParams: { state } }
    });
    if (error) throw error;
    return res.status(200).json({ url: data.url, openInNewTab: true });
  } catch (error) {
    console.error(`OAuth error: ${error.message}`);
    return res.status(400).json({ error: error.message });
  }
});
app.get("/auth/callback", async (req, res) => {
  console.log(`Callback received: state=${req.query.state}, sessionID=${req.sessionID}`);
  return res.sendFile(join(__dirname, publicPath, "auth-callback.html"));
});
app.post("/api/set-session", async (req, res) => {
  const { access_token, refresh_token, state } = req.body;
  console.log(`Set session: state=${state}, session_state=${req.session.oauth_state}, sessionID=${req.sessionID}`);
  if (!access_token || !refresh_token) {
    return res.status(400).json({ error: "Invalid session tokens" });
  }
  if (!req.session.oauth_state || state !== req.session.oauth_state) {
    console.error(`Invalid state: received=${state}, expected=${req.session.oauth_state}`);
    return res.status(400).json({ error: "OAuth callback with invalid state" });
  }
  try {
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token
    });
    if (error) throw error;
    req.session.user = data.user;
    req.session.access_token = access_token;
    delete req.session.oauth_state;
    return res.status(200).json({ message: "Session set successfully" });
  } catch (error) {
    console.error(`Set session error: ${error.message}`);
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
    console.error(`Upload profile pic error: ${error.message}`);
    return res.status(400).json({ error: error.message });
  }
});
app.post("/api/update-profile", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { username, bio } = req.body;
  try {
    const { error } = await supabase.auth.updateUser({
      data: { name: username, bio }
    });
    if (error) throw error;
    return res.status(200).json({ message: "Profile updated" });
  } catch (error) {
    console.error(`Update profile error: ${error.message}`);
    return res.status(400).json({ error: error.message });
  }
});
app.post("/api/save-localstorage", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { data } = req.body;
  try {
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: req.session.user.id, localstorage_data: data }, { onConflict: 'user_id' });
    if (error) throw error;
    return res.status(200).json({ message: "LocalStorage saved" });
  } catch (error) {
    console.error(`Save localStorage error: ${error.message}`);
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
    console.error(`Load localStorage error: ${error.message}`);
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
    console.error(`Delete account error: ${error.message}`);
    return res.status(400).json({ error: error.message });
  }
});
app.post("/api/link-account", async (req, res) => {
  const { provider, state } = req.body;
  const protocol = process.env.NODE_ENV === "production" ? "https" : req.headers['x-forwarded-proto'] || 'http';
  const host = process.env.APP_HOST || req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const redirectTo = `${protocol}://${host}/auth/callback`;
  req.session.oauth_state = state;
  console.log(`Link account initiated: provider=${provider}, state=${state}, redirectTo=${redirectTo}, sessionID=${req.sessionID}`);
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, queryParams: { state } }
    });
    if (error) throw error;
    return res.status(200).json({ url: data.url, openInNewTab: true });
  } catch (error) {
    console.error(`Link account error: ${error.message}`);
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
