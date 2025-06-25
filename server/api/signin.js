import { createClient } from "@supabase/supabase-js";

export async function signinHandler(req, res) {
  const { SUPABASE_URL, SUPABASE_KEY } = process.env;
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { email, password } = req.body;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    req.session.user = data.user;
    req.session.access_token = data.session.access_token;
    res.status(200).json({ user: data.user, message: "Signin successful" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}