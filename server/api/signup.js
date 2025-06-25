import { createClient } from "@supabase/supabase-js";

export async function signupHandler(req, res) {
  const { SUPABASE_URL, SUPABASE_KEY } = process.env;
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { email, password } = req.body;
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) throw error;
    res.status(201).json({ user: data.user, message: "Signup successful" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}