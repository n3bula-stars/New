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
const { SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET } = process.env;

if (!SUPABASE_URL || !SUPABASE_KEY || !SESSION_SECRET) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bare = createBareServer("/bare/", { logErrors: true });
const app = express();
const publicPath = "public";

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, httpOnly: true, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(publicPath));
app.use("/petezah/", express.static(uvPath));

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy', "default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval' blob:; style-src * 'unsafe-inline'; img-src * data:; font-src *; connect-src * ws: wss: data:; media-src *; object-src *; frame-src *; worker-src * blob:; manifest-src *");
  next();
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

app.post("/api/signup", async (req, res, next) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const result = await signupHandler(req, res);
    if (result.status === 200 && req.session.user) {
      const { error } = await supabase.auth.updateUser({
        data: { ...req.session.user.user_metadata, ip_address: ip }
      });
      if (error) throw new Error(error.message);
    }
    return result;
  } catch (error) {
    console.error(`Signup error: ${error.message}`);
    next(error);
  }
});

app.post("/api/signin", async (req, res, next) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const result = await signinHandler(req, res);
    if (result.status === 200 && req.session.user) {
      const { error } = await supabase.auth.updateUser({
        data: { ...req.session.user.user_metadata, ip_address: ip }
      });
      if (error) throw new Error(error.message);
    }
    return result;
  } catch (error) {
    console.error(`Signin error: ${error.message}`);
    next(error);
  }
});

app.post("/api/signout", async (req, res, next) => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
    req.session.destroy((err) => {
      if (err) throw new Error("Session destruction failed");
      res.status(200).json({ message: "Signout successful" });
    });
  } catch (error) {
    console.error(`Signout error: ${error.message}`);
    next(error);
  }
});

app.get("/api/profile", async (req, res, next) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { data, error } = await supabase.auth.getUser(req.session.access_token);
    if (error) throw new Error(error.message);
    return res.status(200).json({ user: data.user });
  } catch (error) {
    console.error(`Profile error: ${error.message}`);
    next(error);
  }
});

app.post("/api/signin/oauth", async (req, res, next) => {
  try {
    const { provider } = req.body;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    if (!host) {
      throw new Error("Host header missing");
    }
    const redirectTo = `${protocol}://${host}/auth/callback`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo }
    });
    if (error) throw new Error(error.message);
    return res.status(200).json({ url: data.url, openInNewTab: true });
  } catch (error) {
    console.error(`OAuth signin error: ${error.message}`);
    next(error);
  }
});

app.get("/auth/callback", (req, res) => {
  return res.sendFile(join(__dirname, publicPath, "auth-callback.html"));
});

app.post("/api/set-session", async (req, res, next) => {
  try {
    const { access_token, refresh_token } = req.body;
    if (!access_token || !refresh_token) {
      throw new Error("Invalid session tokens");
    }
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token
    });
    if (error) throw new Error(error.message);
    req.session.user = data.user;
    req.session.access_token = access_token;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const { error: updateError } = await supabase.auth.updateUser({
      data: { ...data.user.user_metadata, ip_address: ip }
    });
    if (updateError) throw new Error(updateError.message);
    return res.status(200).json({ message: "Session set successfully" });
  } catch (error) {
    console.error(`Set session error: ${error.message}`);
    next(error);
  }
});

app.post("/api/upload-profile-pic", async (req, res, next) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const file = req.files?.file;
    if (!file) {
      throw new Error("No file uploaded");
    }
    const userId = req.session.user.id;
    const fileName = `${userId}/${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage
      .from('profile-pics')
      .upload(fileName, file.data, { contentType: file.mimetype });
    if (error) throw new Error(error.message);
    const { data: publicUrlData } = supabase.storage
      .from('profile-pics')
      .getPublicUrl(fileName);
    const { error: updateError } = await supabase.auth.updateUser({
      data: { ...req.session.user.user_metadata, avatar_url: publicUrlData.publicUrl }
    });
    if (updateError) throw new Error(updateError.message);
    return res.status(200).json({ url: publicUrlData.publicUrl });
  } catch (error) {
    console.error(`Upload profile pic error: ${error.message}`);
    next(error);
  }
});

app.post("/api/update-profile", async (req, res, next) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { username, bio } = req.body;
    const { error } = await supabase.auth.updateUser({
      data: { ...req.session.user.user_metadata, name: username, bio }
    });
    if (error) throw new Error(error.message);
    return res.status(200).json({ message: "Profile updated" });
  } catch (error) {
    console.error(`Update profile error: ${error.message}`);
    next(error);
  }
});

app.post("/api/save-localstorage", async (req, res, next) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { data } = req.body;
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: req.session.user.id, localstorage_data: data }, { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
    return res.status(200).json({ message: "LocalStorage saved" });
  } catch (error) {
    console.error(`Save localstorage error: ${error.message}`);
    next(error);
  }
});

app.get("/api/load-localstorage", async (req, res, next) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { data, error } = await supabase
      .from('user_settings')
      .select('localstorage_data')
      .eq('user_id', req.session.user.id)
      .single();
    if (error) throw new Error(error.message);
    return res.status(200).json({ data: data?.localstorage_data || '{}' });
  } catch (error) {
    console.error(`Load localstorage error: ${error.message}`);
    next(error);
  }
});

app.delete("/api/delete-account", async (req, res, next) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { error } = await supabase.rpc('delete_user', { user_id: req.session.user.id });
    if (error) throw new Error(error.message);
    req.session.destroy((err) => {
      if (err) throw new Error("Session destruction failed");
      res.status(200).json({ message: "Account deleted" });
    });
  } catch (error) {
    console.error(`Delete account error: ${error.message}`);
    next(error);
  }
});

app.post("/api/link-account", async (req, res, next) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { provider } = req.body;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    if (!host) {
      throw new Error("Host header missing");
    }
    const redirectTo = `${protocol}://${host}/auth/callback`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true }
    });
    if (error) throw new Error(error.message);
    return res.status(200).json({ url: data.url, openInNewTab: true });
  } catch (error) {
    console.error(`Link account error: ${error.message}`);
    next(error);
  }
});

// Error handling middleware
app.use((err,91, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  res.status(500).json({ error: "Internal server error" });
});

app.use((req, res) => {
  return res.status(404).sendFile(join(__dirname, publicPath, "404.html"));
});

const server = createServer((req, res) => {
  try {
    if (bare.shouldRoute(req)) {
      bare.routeRequest(req, res);
    } else {
      app.handle(req, res);
    }
  } catch (error) {
    console.error(`Server error: ${error.message}`);
    res.writeStatusCode = 500;
    res.end("Internal server error");
  }
});

server.on("upgrade", (req, socket, head) => {
  try {
    if (bare.shouldRoute(req)) {
      bare.routeUpgrade(req, socket, head);
    } else {
      socket.end();
    }
  } catch (error) {
    console.error(`Upgrade error: ${error.message}`);
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
