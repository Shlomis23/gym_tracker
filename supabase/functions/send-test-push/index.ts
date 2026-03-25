import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const { user_id, endpoint } = await req.json();
    if (!user_id || !endpoint) return jsonResponse(400, { error: "Missing user_id or endpoint" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT");

    if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
      return jsonResponse(500, { error: "Missing server env vars" });
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: subscription, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", user_id)
      .eq("endpoint", endpoint)
      .eq("is_active", true)
      .maybeSingle();

    if (error) return jsonResponse(500, { error: error.message });
    if (!subscription) return jsonResponse(404, { error: "No active subscription found for this device" });

    const payload = JSON.stringify({ title: "GymBuddy", body: "זוהי התראת בדיקה", url: "/" });

    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth
        }
      }, payload);
      return jsonResponse(200, { success: true });
    } catch (pushErr: any) {
      const statusCode = Number(pushErr?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        await supabase
          .from("push_subscriptions")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("id", subscription.id);
      }
      return jsonResponse(500, { error: String(pushErr?.message || pushErr) });
    }
  } catch (err) {
    return jsonResponse(500, { error: String(err?.message || err) });
  }
});
