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
import helmet from "helmet";
import rateLimit from "express-rate-limit";

dotenv.config({ path: `.env.${process.env.NODE_ENV || "production"}` });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET } = process.env;

if (!SUPABASE_URL || !SUPABASE_KEY || !SESSION_SECRET) {
  throw new Error("Missing required environment variables");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bare = createBareServer("/bare/", { maintainence: false });
const app = express();
const publicPath = "public";

app.use(helmet());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(
  fileUpload({
    limits: { fileSize: 5 * 1024 * 1024 },
    abortOnLimit: true,
  })
);
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);
app.use(express.static(publicPath, { maxAge: "1d" }));
app.use("/petezah/", express.static(uvPath, { maxAge: "1d" }));

const authMiddleware = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

app.post("/api/signup", async (req, res) => {
  try {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
    const result = await signupHandler(req, res);
    if (result.status === 200 && req.session.user) {
      const { error } = await supabase.auth.updateUser({
        data: { ...req.session.user.user_metadata, ip_address: ip },
      });
      if (error) throw error;
    }
    return result;
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/api/signin", async (req, res) => {
  try {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
    const result = await signinHandler(req, res);
    if (result.status === 200 && req.session.user) {
      const { error } = await supabase.auth.updateUser({
        data: { ...req.session.user.user_metadata, ip_address: ip },
      });
      if (error) throw error;
    }
    return result;
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/api/signout", async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    req.session.destroy((err) => {
      if (err) throw err;
      res.status(200).json({ message: "Signout successful" });
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get("/api/profile", authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase.auth.getUser(req.session.access_token);
    if (error) throw error;
    return res.status(200).json({ user: data.user });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/api/signin/oauth", async (req, res) => {
  try {
    const { provider } = req.body;
    if (!provider) throw new Error("Provider missing");
    const protocol = req.headers["x-forwarded-proto"] || (req.secure ? "https" : "http");
    const host = req.headers.host;
    if (!host) throw new Error("Host header missing");
    const redirectTo = `${protocol}://${host}/auth/callback`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) throw error;
    return res.status(200).json({ url: data.url, openInNewTab: true });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get("/auth/callback", (req, res) => {
  res.sendFile(join(__dirname, publicPath, "auth-callback.html"));
});

app.post("/api/set-session", async (req, res) => {
  try {
    const { access_token, refresh_token } = req.body;
    if (!access_token || !refresh_token) throw new Error("Invalid session tokens");
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (error) throw error;
    req.session.user = data.user;
    req.session.access_token = access_token;
    const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
    const { error: updateError } = await supabase.auth.updateUser({
      data: { ...data.user.user_metadata, ip_address: ip },
    });
    if (updateError) throw updateError;
    return res.status(200).json({ message: "Session set successfully" });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/api/upload-profile-pic", authMiddleware, async (req, res) => {
  try {
    const file = req.files?.file;
    if (!file) throw new Error("No file uploaded");
    if (!["image/jpeg", "image/png"].includes(file.mimetype)) {
      throw new Error("Invalid file type");
    }
    const userId = req.session.user.id;
    const fileName = `${userId}/${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage
      .from("profile-pics")
      .upload(fileName, file.data, { contentType: file.mimetype });
    if (error) throw error;
    const { data: publicUrlData } = supabase.storage
      .from("profile-pics")
      .getPublicUrl(fileName);
    const { error: updateError } = await supabase.auth.updateUser({
      data: { ...req.session.user.user_metadata, avatar_url: publicUrlData.publicUrl },
    });
    if (updateError) throw updateError;
    return res.status(200).json({ url: publicUrlData.publicUrl });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/api/update-profile", authMiddleware, async (req, res) => {
  try {
    const { username, bio } = req.body;
    if (!username) throw new Error("Username required");
    const { error } = await supabase.auth.updateUser({
      data: { ...req.session.user.user_metadata, name: username, bio },
    });
    if (error) throw error;
    return res.status(200).json({ message: "Profile updated" });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/api/save-localstorage", authMiddleware, async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) throw new Error("Data required");
    const { error } = await supabase
      .from("user_settings")
      .upsert(
        { user_id: req.session.user.id, localstorage_data: data },
        { onConflict: "user_id" }
      );
    if (error) throw error;
    return res.status(200).json({ message: "LocalStorage saved" });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get("/api/load-localstorage", authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("user_settings")
      .select("localstorage_data")
      .eq("user_id", req.session.user.id)
      .single();
    if (error) throw error;
    return res.status(200).json({ data: data?.localstorage_data || "{}" });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.delete("/api/delete-account", authMiddleware, async (req, res) => {
  try {
    const { error } = await supabase.rpc("delete_user", { user_id: req.session.user.id });
    if (error) throw error;
    req.session.destroy((err) => {
      if (err) throw err;
      res.status(200).json({ message: "Account deleted" });
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/api/link-account", authMiddleware, async (req, res) => {
  try {
    const { provider } = req.body;
    if (!provider) throw new Error("Provider missing");
    const protocol = req.headers["x-forwarded-proto"] || (req.secure ? "https" : "http");
    const host = req.headers.host;
    if (!host) throw new Error("Host header missing");
    const redirectTo = `${protocol}://${host}/auth/callback`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    return res.status(200).json({ url: data.url, openInNewTab: true });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.use((req, res) => {
  res.status(404).sendFile(join(__dirname, publicPath, "404.html"));
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
    socket.destroy();
  }
});

const port = parseInt(process.env.PORT || "3000");

server.listen({ port }, () => {
  const address = server.address();
  console.log(`Listening on:`);
  console.log(`\thttp://localhost:${address.port}`);
  console.log(`\thttp://${hostname()}:${address.port}`);
  console.log(
    `\thttp://${address.family === "IPv6" ? `[${address.address}]` : address.address}:${
      address.port
    }`
  );
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function shutdown() {
  console.log("SIGTERM signal received: closing HTTP server");
  await new Promise((resolve) => server.close(resolve));
  bare.close();
  process.exit(0);
}
