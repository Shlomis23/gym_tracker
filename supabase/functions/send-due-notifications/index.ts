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


function getJerusalemDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

type QueueRow = {
  id: string;
  user_id: string;
  type: "weight_reminder" | "workout_gap_reminder" | "pr_celebration";
  title: string;
  body: string;
  payload_json?: Record<string, unknown> | null;
};

async function cancelQueueRow(supabase: ReturnType<typeof createClient>, queueId: string) {
  return supabase
    .from("notification_queue")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", queueId);
}

async function markQueueRowStatus(supabase: ReturnType<typeof createClient>, queueId: string, status: "sent" | "failed") {
  const updates: Record<string, string> = { status, updated_at: new Date().toISOString() };
  if (status === "sent") updates.sent_at = new Date().toISOString();
  return supabase.from("notification_queue").update(updates).eq("id", queueId);
}

async function shouldCancelWorkoutGapReminder(supabase: ReturnType<typeof createClient>, row: QueueRow) {
  const triggerDate = String(row.payload_json?.triggering_session_date || "");
  if (!triggerDate) return true;

  const { data: newerWorkout, error } = await supabase
    .from("workout_sessions")
    .select("id")
    .eq("user_id", row.user_id)
    .gt("date", triggerDate)
    .order("date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return !!newerWorkout;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

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

  const { data: dueRows, error: dueErr } = await supabase
    .from("notification_queue")
    .select("id,user_id,type,title,body,payload_json")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(100);

  if (dueErr) return jsonResponse(500, { error: dueErr.message });

  let sent = 0;
  let cancelled = 0;
  let failed = 0;

  for (const row of (dueRows || []) as QueueRow[]) {
    try {
      if (row.type === "workout_gap_reminder") {
        const shouldCancel = await shouldCancelWorkoutGapReminder(supabase, row);
        if (shouldCancel) {
          await cancelQueueRow(supabase, row.id);
          cancelled += 1;
          continue;
        }
      }

      if (row.type === "weight_reminder") {
        const localDate = String(row.payload_json?.local_date || getJerusalemDate());
        const { data: existingWeight, error: weightErr } = await supabase
          .from("body_weight_logs")
          .select("id")
          .eq("user_id", row.user_id)
          .eq("measured_date", localDate)
          .limit(1)
          .maybeSingle();
        if (weightErr) throw weightErr;
        if (existingWeight) {
          await cancelQueueRow(supabase, row.id);
          cancelled += 1;
          continue;
        }
      }

      const { data: subscriptions, error: subErr } = await supabase
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", row.user_id)
        .eq("is_active", true);
      if (subErr) throw subErr;
      if (!subscriptions?.length) {
        await markQueueRowStatus(supabase, row.id, "failed");
        failed += 1;
        continue;
      }

      const payload = JSON.stringify({ title: row.title, body: row.body, url: "/" });
      let delivered = 0;

      for (const subscription of subscriptions) {
        try {
          await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth
            }
          }, payload);
          delivered += 1;
        } catch (pushErr: any) {
          const statusCode = Number(pushErr?.statusCode || 0);
          if (statusCode === 404 || statusCode === 410) {
            await supabase
              .from("push_subscriptions")
              .update({ is_active: false, updated_at: new Date().toISOString() })
              .eq("id", subscription.id);
          }
        }
      }

      if (delivered > 0) {
        await markQueueRowStatus(supabase, row.id, "sent");
        sent += 1;
      } else {
        await markQueueRowStatus(supabase, row.id, "failed");
        failed += 1;
      }
    } catch {
      await markQueueRowStatus(supabase, row.id, "failed");
      failed += 1;
    }
  }

  return jsonResponse(200, {
    success: true,
    processed: (dueRows || []).length,
    sent,
    cancelled,
    failed
  });
});
