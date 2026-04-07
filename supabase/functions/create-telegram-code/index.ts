import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const { user_id } = await req.json();
    if (!user_id) return new Response(JSON.stringify({ error: "Missing user_id" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Generate 6-char code
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const arr = new Uint8Array(6);
    crypto.getRandomValues(arr);
    const code = Array.from(arr, b => chars[b % chars.length]).join("");

    // Delete any existing codes for this user first
    await db.from("telegram_link_codes").delete().eq("user_id", user_id);

    // Insert new code
    const { error } = await db.from("telegram_link_codes").insert({ code, user_id });
    if (error) throw error;

    return new Response(JSON.stringify({ code }), {
      headers: { ...CORS, "Content-Type": "application/json" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});
