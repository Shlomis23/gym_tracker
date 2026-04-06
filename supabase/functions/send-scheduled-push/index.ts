import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

// Israel Daylight Time = UTC+3 (Mar–Oct), IST = UTC+2 (Oct–Mar)
// We use +3 — worst case the notification arrives 1h early in winter
const ISRAEL_OFFSET_MS = 3 * 3600 * 1000;

function israelDateStr(date: Date = new Date()): string {
  return new Date(date.getTime() + ISRAEL_OFFSET_MS).toISOString().slice(0, 10);
}

function currentWeekKey(): string {
  // Returns the Sunday date of the current week as "YYYY-MM-DD"
  const now = new Date(Date.now() + ISRAEL_OFFSET_MS);
  const sun = new Date(now);
  sun.setUTCDate(now.getUTCDate() - now.getUTCDay());
  return sun.toISOString().slice(0, 10);
}

function lastWeekRange(): { start: string; end: string } {
  const now = new Date(Date.now() + ISRAEL_OFFSET_MS);
  const thisSun = new Date(now);
  thisSun.setUTCDate(now.getUTCDate() - now.getUTCDay());
  const lastSun = new Date(thisSun);
  lastSun.setUTCDate(thisSun.getUTCDate() - 7);
  const lastSat = new Date(lastSun);
  lastSat.setUTCDate(lastSun.getUTCDate() + 6);
  return { start: lastSun.toISOString().slice(0, 10), end: lastSat.toISOString().slice(0, 10) };
}

function jsonRes(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });
}

// ─── Push helper ─────────────────────────────────────────────────────────────
async function push(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; url: string }
): Promise<"ok" | "gone" | "error"> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return "ok";
  } catch (err: any) {
    const code = Number(err?.statusCode ?? 0);
    return code === 404 || code === 410 ? "gone" : "error";
  }
}

async function alreadySent(
  db: ReturnType<typeof createClient>,
  userId: string,
  type: string,
  periodKey: string
): Promise<boolean> {
  const { data } = await db
    .from("notification_log")
    .select("id")
    .eq("user_id", userId)
    .eq("type", type)
    .eq("period_key", periodKey)
    .maybeSingle();
  return !!data;
}

async function logSent(
  db: ReturnType<typeof createClient>,
  userId: string,
  type: string,
  periodKey: string
) {
  await db.from("notification_log").insert({ user_id: userId, type, period_key: periodKey });
}

async function deactivateSub(db: ReturnType<typeof createClient>, endpoint: string) {
  await db.from("push_subscriptions")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("endpoint", endpoint);
}

// ─── Weight Reminder ──────────────────────────────────────────────────────────
async function sendWeightReminders(db: ReturnType<typeof createClient>) {
  const today = israelDateStr();

  const { data: subs } = await db
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .eq("is_active", true);
  if (!subs?.length) return;

  // Users who already weighed today (Israel time)
  const { data: weighed } = await db
    .from("body_weight_logs")
    .select("user_id")
    .gte("measured_at", `${today}T00:00:00+03:00`)
    .lte("measured_at", `${today}T23:59:59+03:00`);

  const weighedSet = new Set((weighed ?? []).map((r: any) => r.user_id));

  for (const sub of subs) {
    if (weighedSet.has(sub.user_id)) continue;
    if (await alreadySent(db, sub.user_id, "weight_reminder", today)) continue;

    const result = await push(sub, {
      title: "⚖️ GymBuddy",
      body: "בוקר טוב! אל תשכח להישקל הבוקר 🌅",
      url: "/"
    });

    if (result === "ok") await logSent(db, sub.user_id, "weight_reminder", today);
    else if (result === "gone") await deactivateSub(db, sub.endpoint);
  }
}

// ─── Workout Reminder ─────────────────────────────────────────────────────────
const WORKOUT_MSGS: Record<number, string> = {
  2: "לא התאמנת כבר יומיים 😤 אפילו 20 דקות יעשו את ההבדל — קח את עצמך לאימון!",
  3: "שלושה ימים בלי אימון 🔥 הגוף מחכה לך. עכשיו הזמן לחזור לפעולה!",
  4: "ארבעה ימים? 😬 כל אימון שאתה מחסיר הוא צעד אחורה — בוא נשנה את זה היום.",
  5: "חמישה ימים ללא אימון 💥 אתה חזק יותר מהתירוצים — הגיע הזמן להוכיח את זה!"
};

async function sendWorkoutReminders(db: ReturnType<typeof createClient>) {
  const today = israelDateStr();

  const { data: subs } = await db
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .eq("is_active", true);
  if (!subs?.length) return;

  // Last session date per user
  const { data: sessions } = await db
    .from("workout_sessions")
    .select("user_id, date")
    .order("date", { ascending: false });

  const lastByUser = new Map<string, string>();
  for (const s of (sessions ?? [])) {
    if (!lastByUser.has(s.user_id)) lastByUser.set(s.user_id, israelDateStr(new Date(s.date)));
  }

  const todayMs = new Date(today + "T00:00:00").getTime();

  for (const sub of subs) {
    const lastDate = lastByUser.get(sub.user_id);
    if (!lastDate) continue; // Never worked out — don't nag

    const daysSince = Math.round((todayMs - new Date(lastDate + "T00:00:00").getTime()) / 86400000);
    if (daysSince < 2) continue;

    const body = WORKOUT_MSGS[Math.min(daysSince, 5)];
    if (!body) continue;

    if (await alreadySent(db, sub.user_id, "workout_reminder", today)) continue;

    const result = await push(sub, { title: "💪 GymBuddy", body, url: "/" });
    if (result === "ok") await logSent(db, sub.user_id, "workout_reminder", today);
    else if (result === "gone") await deactivateSub(db, sub.endpoint);
  }
}

// ─── Goal Completion Check ────────────────────────────────────────────────────
async function checkGoalCompletions(db: ReturnType<typeof createClient>) {
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const weekKey = currentWeekKey();
  const weekEnd = new Date(weekKey + "T00:00:00");
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  // Users who had a session in the last hour
  const { data: recent } = await db
    .from("workout_sessions")
    .select("user_id, date")
    .gte("date", oneHourAgo);
  if (!recent?.length) return;

  const recentUsers = [...new Set(recent.map((s: any) => s.user_id))];

  for (const userId of recentUsers) {
    if (await alreadySent(db, userId, "goal_complete", weekKey)) continue;

    // Get goal from any workout plan
    const { data: plan } = await db
      .from("workout_plans")
      .select("days_per_week")
      .eq("user_id", userId)
      .maybeSingle();

    const goal = plan?.days_per_week ?? 3;

    // Count this week's sessions
    const { data: weekSessions } = await db
      .from("workout_sessions")
      .select("id", { count: "exact" })
      .eq("user_id", userId)
      .gte("date", `${weekKey}T00:00:00`)
      .lte("date", `${weekEndStr}T23:59:59`);

    const count = (weekSessions as any)?.length ?? 0;
    if (count < goal) continue;

    const { data: sub } = await db
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    if (!sub) continue;

    const result = await push(sub, {
      title: "🏆 GymBuddy",
      body: `כל הכבוד! השלמת ${goal} אימונים השבוע — יעד השבועי הושג! 🎉`,
      url: "/"
    });
    if (result === "ok") await logSent(db, userId, "goal_complete", weekKey);
    else if (result === "gone") await deactivateSub(db, sub.endpoint);
  }
}

// ─── Weekly Summary ───────────────────────────────────────────────────────────
async function sendWeeklySummary(db: ReturnType<typeof createClient>) {
  const { start, end } = lastWeekRange();
  const weekKey = start;

  const { data: subs } = await db
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .eq("is_active", true);
  if (!subs?.length) return;

  // Sessions last week per user
  const { data: sessions } = await db
    .from("workout_sessions")
    .select("user_id")
    .gte("date", `${start}T00:00:00`)
    .lte("date", `${end}T23:59:59`);

  const countByUser = new Map<string, number>();
  for (const s of (sessions ?? [])) countByUser.set(s.user_id, (countByUser.get(s.user_id) ?? 0) + 1);

  // Weight logs last week per user (first & last)
  const { data: wlogs } = await db
    .from("body_weight_logs")
    .select("user_id, weight, measured_at")
    .gte("measured_at", `${start}T00:00:00+03:00`)
    .lte("measured_at", `${end}T23:59:59+03:00`)
    .order("measured_at", { ascending: true });

  const weightByUser = new Map<string, { first: number; last: number }>();
  for (const log of (wlogs ?? [])) {
    const cur = weightByUser.get(log.user_id);
    if (!cur) weightByUser.set(log.user_id, { first: Number(log.weight), last: Number(log.weight) });
    else cur.last = Number(log.weight);
  }

  for (const sub of subs) {
    if (await alreadySent(db, sub.user_id, "weekly_summary", weekKey)) continue;

    const workouts = countByUser.get(sub.user_id) ?? 0;
    const weight = weightByUser.get(sub.user_id);

    if (!workouts && !weight) continue; // No activity — skip

    let body = workouts > 0
      ? `${workouts} אימון${workouts === 1 ? "" : "ים"} שבוע שעבר`
      : "לא היו אימונים שבוע שעבר";

    if (weight) {
      const delta = weight.last - weight.first;
      body += Math.abs(delta) >= 0.1
        ? ` · משקל: ${delta > 0 ? "+" : ""}${delta.toFixed(1)} ק״ג`
        : " · משקל יציב";
    }

    const result = await push(sub, {
      title: "📊 GymBuddy — סיכום שבועי",
      body,
      url: "/"
    });
    if (result === "ok") await logSent(db, sub.user_id, "weekly_summary", weekKey);
    else if (result === "gone") await deactivateSub(db, sub.endpoint);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return jsonRes(405, { error: "Method not allowed" });

  try {
    const { type } = await req.json();
    if (!type) return jsonRes(400, { error: "Missing type" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPub = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPriv = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidSubject = Deno.env.get("VAPID_SUBJECT")!;

    if (!supabaseUrl || !serviceKey || !vapidPub || !vapidPriv || !vapidSubject) {
      return jsonRes(500, { error: "Missing env vars" });
    }

    webpush.setVapidDetails(vapidSubject, vapidPub, vapidPriv);
    const db = createClient(supabaseUrl, serviceKey);

    switch (type) {
      case "weight_reminder":    await sendWeightReminders(db); break;
      case "workout_reminder":   await sendWorkoutReminders(db); break;
      case "goal_complete_check": await checkGoalCompletions(db); break;
      case "weekly_summary":     await sendWeeklySummary(db); break;
      default: return jsonRes(400, { error: `Unknown type: ${type}` });
    }

    return jsonRes(200, { success: true, type });
  } catch (err: any) {
    console.error("send-scheduled-push error:", err);
    return jsonRes(500, { error: String(err?.message ?? err) });
  }
});
