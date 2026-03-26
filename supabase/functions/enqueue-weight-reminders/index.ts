import { createClient } from "npm:@supabase/supabase-js@2";

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

function getJerusalemParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    localDate: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour || "0")
  };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse(500, { error: "Missing server env vars" });

  const { localDate, hour } = getJerusalemParts();
  if (hour !== 6) {
    return jsonResponse(200, { skipped: true, reason: "outside_6am_window", local_date: localDate, local_hour: hour });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: users, error: usersErr } = await supabase
    .from("push_subscriptions")
    .select("user_id")
    .eq("is_active", true);
  if (usersErr) return jsonResponse(500, { error: usersErr.message });

  const uniqueUserIds = [...new Set((users || []).map(row => row.user_id).filter(Boolean))];
  let enqueued = 0;

  for (const userId of uniqueUserIds) {
    const { data: weightRow, error: weightErr } = await supabase
      .from("body_weight_logs")
      .select("id")
      .eq("user_id", userId)
      .eq("measured_date", localDate)
      .limit(1)
      .maybeSingle();
    if (weightErr) return jsonResponse(500, { error: weightErr.message });
    if (weightRow) continue;

    const dedupeKey = `weight_reminder:${userId}:${localDate}`;
    const { error: enqueueErr } = await supabase
      .from("notification_queue")
      .upsert({
        user_id: userId,
        type: "weight_reminder",
        title: "GymBuddy",
        body: "לא נשקלת היום עדיין — שקילה קצרה וסגרת את זה",
        scheduled_for: new Date().toISOString(),
        dedupe_key: dedupeKey,
        payload_json: { local_date: localDate },
        status: "pending"
      }, { onConflict: "dedupe_key" });
    if (enqueueErr) return jsonResponse(500, { error: enqueueErr.message });
    enqueued += 1;
  }

  return jsonResponse(200, { success: true, local_date: localDate, users_checked: uniqueUserIds.length, enqueued });
});
