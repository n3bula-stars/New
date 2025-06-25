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

dotenv.config({ path: `.env.${process.env.NODE_ENV || "production"}` });
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
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { secure: false } }));
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
    return res.status(400).json({ error: error.message });
  }
});

app.get("/api/profile", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { data, error } = await supabase.auth.getUser(req.session.access_token);
    if (error) throw error;
    return res.status(200).json({ user: data.user });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/api/signin/oauth", async (req, res) => {
  const { provider, redirect } = req.body;
  const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const host = req.headers.host;
  if (!host) return res.status(400).json({ error: "Host header missing" });

  const redirectTo = `${protocol}://${host}/auth/callback`;
  const state = encodeURIComponent(redirect || "/");

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        queryParams: { state }
      }
    });
    if (error) throw error;
    return res.status(200).json({ url: data.url });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get("/auth/callback", (req, res) => {
  return res.sendFile(join(__dirname, publicPath, "auth-callback.html"));
});

app.post("/api/set-session", async (req, res) => {
  const { access_token, refresh_token } = req.body;
  if (!access_token || !refresh_token) return res.status(400).json({ error: "Invalid session tokens" });

  try {
    const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) throw error;
    req.session.user = data.user;
    req.session.access_token = access_token;
    return res.status(200).json({ message: "Session set successfully" });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

// (all other routes like upload-profile-pic, update-profile, etc. unchanged...)
// keep your existing app.post("/api/upload-profile-pic") and others here.

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
