import { createClient } from "npm:@supabase/supabase-js@2";

// ── Constants ─────────────────────────────────────────────────────────────────

const TELEGRAM_API = "https://api.telegram.org/bot";
const ISRAEL_OFFSET_MS = 3 * 3600 * 1000; // UTC+3

// Hebrew day names (0=Sunday … 6=Saturday)
const HE_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowIsrael(): Date {
  return new Date(Date.now() + ISRAEL_OFFSET_MS);
}

function israelDateStr(d: Date = new Date()): string {
  return new Date(d.getTime() + ISRAEL_OFFSET_MS).toISOString().slice(0, 10);
}

/** Return "DD/MM" formatted date in Israel timezone */
function formatShortDate(isoOrDate: string | Date): string {
  const d =
    typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const local = new Date(d.getTime() + ISRAEL_OFFSET_MS);
  const day = String(local.getUTCDate()).padStart(2, "0");
  const month = String(local.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

/** "DD/MM/YYYY" */
function formatFullDate(isoOrDate: string | Date): string {
  const d =
    typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const local = new Date(d.getTime() + ISRAEL_OFFSET_MS);
  const day = String(local.getUTCDate()).padStart(2, "0");
  const month = String(local.getUTCMonth() + 1).padStart(2, "0");
  const year = local.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/** Hebrew day name from ISO date or timestamp string */
function hebrewDayName(isoDate: string): string {
  // נרמל ל-date בלבד אם קיבלנו timestamp מלא
  const dateOnly = israelDateStr(new Date(isoDate));
  const d = new Date(dateOnly + "T12:00:00Z");
  return HE_DAYS[d.getUTCDay()];
}

/** Sunday of current Israel week (as ISO date string) */
function weekStart(d: Date = nowIsrael()): string {
  const local = new Date(d.getTime() + ISRAEL_OFFSET_MS);
  const diff = local.getUTCDay(); // 0=Sun
  const sun = new Date(local);
  sun.setUTCDate(local.getUTCDate() - diff);
  return sun.toISOString().slice(0, 10);
}

/** First day of current month (Israel) as ISO string */
function monthStart(d: Date = nowIsrael()): string {
  const local = new Date(d.getTime() + ISRAEL_OFFSET_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Last day of previous month (Israel) as ISO string */
function prevMonthRange(): { start: string; end: string } {
  const now = nowIsrael();
  const local = new Date(now.getTime() + ISRAEL_OFFSET_MS);
  const year = local.getUTCMonth() === 0 ? local.getUTCFullYear() - 1 : local.getUTCFullYear();
  const month = local.getUTCMonth() === 0 ? 12 : local.getUTCMonth();
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function round1(n: number): string {
  return n.toFixed(1);
}

// ── Intent detection ──────────────────────────────────────────────────────────

type Intent =
  | "weight_current"
  | "weight_weekly_avg"
  | "weight_monthly_change"
  | "weight_record"
  | "weight_goal_remaining"
  | "weight_goal_pace"
  | "weight_avg_range"
  | "workout_this_week"
  | "workout_days_this_week"
  | "workout_goal_remaining"
  | "workout_last"
  | "workout_streak"
  | "workout_monthly_compare"
  | "workout_most_common"
  | "workout_pr"
  | "workout_pr_this_week"
  | "overview"
  | "log_weight"
  | "unknown";

function detectIntent(text: string): Intent {
  const t = text.trim().toLowerCase();

  // log_weight — must check first (has number)
  if (/נשקלתי|משקל היום/.test(t) && /\d/.test(t)) return "log_weight";

  // weight
  if (/מה המשקל שלי|כמה אני שוקל|משקל נוכחי/.test(t)) return "weight_current";
  if (/ממוצע שבועי|ממוצע השבוע|ממוצע שקיל/.test(t)) return "weight_weekly_avg";
  if (/כמה ירדתי|כמה עליתי|שינוי משקל החודש/.test(t)) return "weight_monthly_change";
  if (/הכי נמוך|הכי גבוה|שיא משקל/.test(t)) return "weight_record";
  if (/קצב|כמה זמן עד יעד|מתי אגיע ליעד/.test(t)) return "weight_goal_pace";
  if (/ממוצע.*ימים|ממוצע חודש|ממוצע בין/.test(t)) return "weight_avg_range";

  // workout_pr_this_week — before workout_pr
  if (/שברתי שיא השבוע/.test(t)) return "workout_pr_this_week";

  // workout_pr
  if (/שיא ב|pr ב|pr של/.test(t)) return "workout_pr";

  // workout — goal_remaining לפני weight_goal_remaining
  if (/כמה אימונים השבוע/.test(t)) return "workout_this_week";
  if (/באיזה ימים|אילו ימים התאמנתי/.test(t)) return "workout_days_this_week";
  if (/כמה נשאר ליעד השבועי|כמה אימונים נשארו|ליעד.*אימון/.test(t)) return "workout_goal_remaining";

  if (/כמה נשאר ליעד|יעד משקל/.test(t)) return "weight_goal_remaining";
  if (/מתי אימנתי לאחרונה|אימון אחרון/.test(t)) return "workout_last";
  if (/רצף|streak|כמה ימים ברצף/.test(t)) return "workout_streak";
  if (/השווה חודשים|החודש לעומת חודש שעבר/.test(t)) return "workout_monthly_compare";
  if (/תרגיל שאני עושה הכי הרבה/.test(t)) return "workout_most_common";

  // overview
  if (/איך הולך לי|סיכום|מצב כולל/.test(t)) return "overview";

  return "unknown";
}

// ── Telegram API ──────────────────────────────────────────────────────────────

type InlineButton = { text: string; callback_data: string };
type InlineKeyboard = InlineButton[][];

async function sendMessage(
  token: string,
  chatId: number,
  text: string,
  parseMode: "HTML" | "Markdown" = "HTML",
  keyboard?: InlineKeyboard
): Promise<void> {
  const body: any = { chat_id: chatId, text, parse_mode: parseMode };
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
  await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function answerCallback(token: string, callbackQueryId: string): Promise<void> {
  await fetch(`${TELEGRAM_API}${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
}

// ── Menus ─────────────────────────────────────────────────────────────────────

const MAIN_MENU: InlineKeyboard = [
  [{ text: "⚖️ משקל", callback_data: "menu_weight" }, { text: "🏋️ אימונים", callback_data: "menu_workouts" }],
  [{ text: "📊 איך הולך לי?", callback_data: "overview" }],
];

const WEIGHT_MENU: InlineKeyboard = [
  [{ text: "משקל נוכחי", callback_data: "weight_current" }, { text: "ממוצע שבועי", callback_data: "weight_weekly_avg" }],
  [{ text: "שינוי החודש", callback_data: "weight_monthly_change" }, { text: "שיאי משקל", callback_data: "weight_record" }],
  [{ text: "כמה נשאר ליעד", callback_data: "weight_goal_remaining" }, { text: "קצב להגעה ליעד", callback_data: "weight_goal_pace" }],
  [{ text: "🔙 תפריט ראשי", callback_data: "menu_main" }],
];

const WORKOUT_MENU: InlineKeyboard = [
  [{ text: "כמה אימונים השבוע", callback_data: "workout_this_week" }, { text: "באיזה ימים", callback_data: "workout_days_this_week" }],
  [{ text: "כמה נשאר ליעד", callback_data: "workout_goal_remaining" }, { text: "אימון אחרון", callback_data: "workout_last" }],
  [{ text: "רצף אימונים", callback_data: "workout_streak" }, { text: "השוואה חודשית", callback_data: "workout_monthly_compare" }],
  [{ text: "תרגיל נפוץ ביותר", callback_data: "workout_most_common" }, { text: "שיאים שנשברו השבוע", callback_data: "workout_pr_this_week" }],
  [{ text: "🔙 תפריט ראשי", callback_data: "menu_main" }],
];

const BACK_BUTTON = (menu: "weight" | "workouts"): InlineKeyboard => [
  [{ text: "🔙 חזרה", callback_data: `menu_${menu}` }, { text: "🏠 תפריט ראשי", callback_data: "menu_main" }],
];

// ── Handler helpers ───────────────────────────────────────────────────────────

function unknownReply(): string {
  return `לא הבנתי את השאלה 🤔

הנה דוגמאות לשאלות שאני מבין:

<b>⚖️ משקל:</b>
• מה המשקל שלי?
• ממוצע שבועי
• כמה ירדתי החודש?
• הכי נמוך / הכי גבוה
• כמה נשאר ליעד?
• מתי אגיע ליעד?
• ממוצע 30 ימים

<b>🏋️ אימונים:</b>
• כמה אימונים השבוע?
• באיזה ימים התאמנתי?
• כמה נשאר ליעד השבועי?
• מתי אימנתי לאחרונה?
• רצף / streak
• החודש לעומת חודש שעבר
• תרגיל שאני עושה הכי הרבה
• שיא ב[שם תרגיל]
• שברתי שיא השבוע?

<b>📊 כולל:</b>
• איך הולך לי? / סיכום`;
}

// ── Intent handlers ───────────────────────────────────────────────────────────

type SB = ReturnType<typeof createClient>;

async function handleWeightCurrent(sb: SB, userId: string): Promise<string> {
  const { data, error } = await sb
    .from("body_weight_logs")
    .select("weight, measured_at")
    .eq("user_id", userId)
    .order("measured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return "לא נמצאו רישומי משקל 📭";
  const date = formatShortDate(data.measured_at);
  return `⚖️ המשקל האחרון שלך: <b>${round1(data.weight)} ק״ג</b>\nנמדד ב-${date}`;
}

async function handleWeightWeeklyAvg(sb: SB, userId: string): Promise<string> {
  // 7 ימים אחרונים כולל היום — חישוב לפי תאריך ישראל בלי שעה
  const todayDate = israelDateStr();
  const weekAgoDate = israelDateStr(new Date(Date.now() - 6 * 86400000));

  const { data } = await sb
    .from("body_weight_logs")
    .select("weight")
    .eq("user_id", userId)
    .gte("measured_date", weekAgoDate)
    .lte("measured_date", todayDate);

  if (!data || data.length === 0) return "אין רישומי משקל לשבוע האחרון 📭";
  const a = avg(data.map((r) => r.weight));
  return `📊 ממוצע משקל שבועי: <b>${round1(a)} ק״ג</b>\n(מבוסס על ${data.length} מדידות)`;
}

async function handleWeightMonthlyChange(
  sb: SB,
  userId: string
): Promise<string> {
  const start = monthStart();
  const { data } = await sb
    .from("body_weight_logs")
    .select("weight, measured_at")
    .eq("user_id", userId)
    .gte("measured_at", start)
    .order("measured_at", { ascending: true });

  if (!data || data.length < 2)
    return "אין מספיק נתוני משקל החודש לחישוב שינוי 📭";

  const first = data[0].weight;
  const last = data[data.length - 1].weight;
  const diff = last - first;
  const sign = diff < 0 ? "ירדת" : diff > 0 ? "עלית" : "נשארת יציב";
  const absDiff = Math.abs(diff);
  const emoji = diff < 0 ? "📉" : diff > 0 ? "📈" : "➡️";
  return `${emoji} החודש ${sign} <b>${round1(absDiff)} ק״ג</b>\n(${round1(first)} → ${round1(last)} ק״ג)`;
}

async function handleWeightRecord(sb: SB, userId: string): Promise<string> {
  const { data } = await sb
    .from("body_weight_logs")
    .select("weight, measured_at")
    .eq("user_id", userId);

  if (!data || data.length === 0) return "לא נמצאו רישומי משקל 📭";

  const weights = data.map((r) => ({ w: r.weight, d: r.measured_at }));
  const minR = weights.reduce((a, b) => (b.w < a.w ? b : a));
  const maxR = weights.reduce((a, b) => (b.w > a.w ? b : a));

  return `🏆 שיאי משקל:
• <b>הנמוך ביותר:</b> ${round1(minR.w)} ק״ג (${formatShortDate(minR.d)})
• <b>הגבוה ביותר:</b> ${round1(maxR.w)} ק״ג (${formatShortDate(maxR.d)})`;
}

async function handleWeightGoalRemaining(
  sb: SB,
  userId: string
): Promise<string> {
  const [goalRes, weightRes] = await Promise.all([
    sb
      .from("weight_goal")
      .select("goal_weight, goal_mode")
      .eq("user_id", userId)
      .maybeSingle(),
    sb
      .from("body_weight_logs")
      .select("weight")
      .eq("user_id", userId)
      .order("measured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!goalRes.data) return "לא הוגדר יעד משקל עדיין 🎯";
  if (!weightRes.data) return "לא נמצאו רישומי משקל 📭";

  const target = goalRes.data.goal_weight;
  const current = weightRes.data.weight;
  const remaining = Math.abs(target - current);
  const isGain = goalRes.data.goal_mode === "gain" || goalRes.data.goal_mode === "lean_bulk" || goalRes.data.goal_mode === "bulk";
  const mode = isGain ? "לעלות" : "לרדת";
  const done = isGain ? current >= target : current <= target;

  if (done)
    return `🎉 הגעת ליעד שלך! יעד: ${round1(target)} ק״ג, כרגע: ${round1(current)} ק״ג`;

  return `🎯 נשאר <b>${round1(remaining)} ק״ג</b> ${mode}\nכרגע: ${round1(current)} ק״ג | יעד: ${round1(target)} ק״ג`;
}

async function handleWeightGoalPace(sb: SB, userId: string): Promise<string> {
  const [goalRes, logsRes] = await Promise.all([
    sb
      .from("weight_goal")
      .select("goal_weight, start_weight, goal_mode")
      .eq("user_id", userId)
      .maybeSingle(),
    sb
      .from("body_weight_logs")
      .select("weight, measured_at")
      .eq("user_id", userId)
      .order("measured_at", { ascending: true }),
  ]);

  if (!goalRes.data) return "לא הוגדר יעד משקל עדיין 🎯";
  if (!logsRes.data || logsRes.data.length < 2)
    return "אין מספיק נתונים לחישוב קצב ⏱️";

  const logs = logsRes.data;
  const current = logs[logs.length - 1].weight;
  const target = goalRes.data.goal_weight;
  const isGainMode = goalRes.data.goal_mode === "gain" || goalRes.data.goal_mode === "lean_bulk" || goalRes.data.goal_mode === "bulk";
  const isLoss = !isGainMode;

  const done = isLoss ? current <= target : current >= target;
  if (done)
    return `🎉 כבר הגעת ליעד! יעד: ${round1(target)} ק״ג`;

  // Weekly average rate from last 4 weeks
  const fourWeeksAgo = new Date(
    Date.now() + ISRAEL_OFFSET_MS - 28 * 86400000
  ).toISOString();
  const recent = logs.filter((r) => r.measured_at >= fourWeeksAgo);
  if (recent.length < 2)
    return "אין מספיק נתונים אחרונים לחישוב קצב. נסה שוב אחרי כמה שבועות ⏱️";

  const first = recent[0].weight;
  const last = recent[recent.length - 1].weight;
  const daysDiff =
    (new Date(recent[recent.length - 1].measured_at).getTime() -
      new Date(recent[0].measured_at).getTime()) /
    86400000;

  if (daysDiff < 1)
    return "אין מספיק נתונים לחישוב קצב ⏱️";

  const ratePerDay = (first - last) / daysDiff; // positive = losing
  const netRatePerDay = isLoss ? ratePerDay : -ratePerDay;

  if (netRatePerDay <= 0)
    return `⚠️ בשבועות האחרונים אין התקדמות לכיוון היעד.\nכרגע: ${round1(current)} ק״ג | יעד: ${round1(target)} ק״ג`;

  const remaining = Math.abs(target - current);
  const daysToGoal = Math.ceil(remaining / netRatePerDay);
  const goalDate = new Date(Date.now() + daysToGoal * 86400000);

  return `⏱️ בקצב הנוכחי (<b>${round1(netRatePerDay * 7)} ק״ג/שבוע</b>) תגיע ליעד בעוד כ-<b>${daysToGoal} ימים</b>
📅 תאריך משוער: ${formatFullDate(goalDate)}`;
}

async function handleWeightAvgRange(
  sb: SB,
  userId: string,
  text: string
): Promise<string> {
  const now = nowIsrael();

  // Try "ממוצע X ימים"
  const daysMatch = text.match(/ממוצע\s+(\d+)\s*ימים/);
  // Try "ממוצע בין DD/MM ל-DD/MM"
  const rangeMatch = text.match(
    /ממוצע\s+בין\s+(\d{1,2})\/(\d{1,2})\s+ל[- ](\d{1,2})\/(\d{1,2})/
  );
  // Try "ממוצע חודש" = last 30 days
  const monthMatch = /ממוצע חודש/.test(text);

  let startIso: string;
  let endIso: string;
  let label: string;

  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    startIso = new Date(now.getTime() - days * 86400000)
      .toISOString()
      .slice(0, 10);
    endIso = israelDateStr(now);
    label = `${days} הימים האחרונים`;
  } else if (rangeMatch) {
    const year = now.getUTCFullYear();
    startIso = `${year}-${rangeMatch[2].padStart(2, "0")}-${rangeMatch[1].padStart(2, "0")}`;
    endIso = `${year}-${rangeMatch[4].padStart(2, "0")}-${rangeMatch[3].padStart(2, "0")}`;
    label = `${rangeMatch[1]}/${rangeMatch[2]} - ${rangeMatch[3]}/${rangeMatch[4]}`;
  } else if (monthMatch) {
    startIso = new Date(now.getTime() - 30 * 86400000)
      .toISOString()
      .slice(0, 10);
    endIso = israelDateStr(now);
    label = "30 הימים האחרונים";
  } else {
    // Default: 30 days
    startIso = new Date(now.getTime() - 30 * 86400000)
      .toISOString()
      .slice(0, 10);
    endIso = israelDateStr(now);
    label = "30 הימים האחרונים";
  }

  const { data } = await sb
    .from("body_weight_logs")
    .select("weight")
    .eq("user_id", userId)
    .gte("measured_at", startIso)
    .lte("measured_at", endIso + "T23:59:59");

  if (!data || data.length === 0)
    return `אין רישומי משקל בטווח ${label} 📭`;

  const a = avg(data.map((r) => r.weight));
  return `📊 ממוצע משקל — ${label}: <b>${round1(a)} ק״ג</b>\n(מבוסס על ${data.length} מדידות)`;
}

async function handleWorkoutThisWeek(
  sb: SB,
  userId: string
): Promise<string> {
  const ws = weekStart();
  const { data } = await sb
    .from("workout_sessions")
    .select("id")
    .eq("user_id", userId)
    .gte("date", ws);

  const count = data?.length ?? 0;
  return `🏋️ השבוע התאמנת <b>${count}</b> פעמים`;
}

async function handleWorkoutDaysThisWeek(
  sb: SB,
  userId: string
): Promise<string> {
  const ws = weekStart();
  const { data } = await sb
    .from("workout_sessions")
    .select("date, workout_name")
    .eq("user_id", userId)
    .gte("date", ws)
    .order("date", { ascending: true });

  if (!data || data.length === 0)
    return "עוד לא התאמנת השבוע 😴";

  const lines = data.map(
    (r) => `• ${hebrewDayName(r.date)} (${formatShortDate(r.date)}) — ${r.workout_name || "אימון"}`
  );
  return `📅 ימי אימון השבוע:\n${lines.join("\n")}`;
}

async function handleWorkoutGoalRemaining(
  sb: SB,
  userId: string
): Promise<string> {
  const ws = weekStart();
  const [sessionsRes, planRes] = await Promise.all([
    sb
      .from("workout_sessions")
      .select("id")
      .eq("user_id", userId)
      .gte("date", ws),
    sb
      .from("user_settings")
      .select("weekly_goal")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const done = sessionsRes.data?.length ?? 0;
  const goal = planRes.data?.weekly_goal ?? 4;
  const remaining = Math.max(0, goal - done);

  if (remaining === 0)
    return `🎉 השגת את יעד האימונים השבועי! (${done}/${goal})`;

  return `🎯 השלמת <b>${done}</b> מתוך <b>${goal}</b> אימונים השבוע\nנשארו עוד <b>${remaining}</b> אימונים`;
}

async function handleWorkoutLast(sb: SB, userId: string): Promise<string> {
  const { data } = await sb
    .from("workout_sessions")
    .select("date, workout_name")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return "לא נמצאו אימונים 📭";

  const today = israelDateStr();
  const sessionDate = israelDateStr(new Date(data.date));
  const diff = Math.round(
    (new Date(today + "T00:00:00Z").getTime() - new Date(sessionDate + "T00:00:00Z").getTime()) / 86400000
  );

  let whenStr: string;
  if (diff === 0) whenStr = "היום";
  else if (diff === 1) whenStr = "אתמול";
  else whenStr = `לפני ${diff} ימים (${formatShortDate(sessionDate)})`;

  return `🏋️ האימון האחרון שלך היה <b>${whenStr}</b>\n${data.workout_name || "אימון"}`;
}

async function handleWorkoutStreak(sb: SB, userId: string): Promise<string> {
  const { data } = await sb
    .from("workout_sessions")
    .select("date")
    .eq("user_id", userId)
    .order("date", { ascending: false });

  if (!data || data.length === 0) return "אין אימונים עדיין 📭";

  // נרמל timestamps ל-date strings בשעון ישראל
  const dates = [...new Set(data.map((r) => israelDateStr(new Date(r.date))))].sort().reverse();
  const today = israelDateStr();

  // Calculate consecutive workout-week streak (weeks with at least 1 workout)
  // But also calculate consecutive days streak
  let dayStreak = 0;
  let current = today;
  for (const d of dates) {
    if (d === current) {
      dayStreak++;
      const dt = new Date(current + "T12:00:00Z");
      dt.setUTCDate(dt.getUTCDate() - 1);
      current = dt.toISOString().slice(0, 10);
    } else if (d < current) {
      break;
    }
  }

  // Also calc weekly streak
  const weeksWithWorkout = new Set(dates.map((d) => weekStart(new Date(d + "T12:00:00Z"))));
  const sortedWeeks = [...weeksWithWorkout].sort().reverse();
  let weekStreak = 0;
  let curWeek = weekStart();
  for (const w of sortedWeeks) {
    if (w === curWeek) {
      weekStreak++;
      const dt = new Date(curWeek + "T12:00:00Z");
      dt.setUTCDate(dt.getUTCDate() - 7);
      curWeek = dt.toISOString().slice(0, 10);
    } else {
      break;
    }
  }

  return `🔥 רצף אימונים:
• ימים רצופים: <b>${dayStreak}</b>
• שבועות רצופים (עם לפחות אימון אחד): <b>${weekStreak}</b>`;
}

async function handleWorkoutMonthlyCompare(
  sb: SB,
  userId: string
): Promise<string> {
  const curStart = monthStart();
  const prev = prevMonthRange();

  const [curRes, prevRes] = await Promise.all([
    sb
      .from("workout_sessions")
      .select("id")
      .eq("user_id", userId)
      .gte("date", curStart),
    sb
      .from("workout_sessions")
      .select("id")
      .eq("user_id", userId)
      .gte("date", prev.start)
      .lte("date", prev.end),
  ]);

  const cur = curRes.data?.length ?? 0;
  const prv = prevRes.data?.length ?? 0;
  const diff = cur - prv;
  const emoji = diff > 0 ? "📈" : diff < 0 ? "📉" : "➡️";

  return `${emoji} השוואה חודשית:
• החודש (עד כה): <b>${cur}</b> אימונים
• חודש שעבר: <b>${prv}</b> אימונים
• שינוי: ${diff > 0 ? "+" : ""}${diff}`;
}

async function handleWorkoutMostCommon(
  sb: SB,
  userId: string
): Promise<string> {
  const { data } = await sb
    .from("session_exercises")
    .select("exercise_name")
    .eq("user_id", userId);

  if (!data || data.length === 0) return "אין נתוני תרגילים עדיין 📭";

  const counts: Record<string, number> = {};
  for (const r of data) {
    if (r.exercise_name) {
      counts[r.exercise_name] = (counts[r.exercise_name] ?? 0) + 1;
    }
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top5 = sorted.slice(0, 5);

  const lines = top5.map(
    ([name, cnt], i) => `${i + 1}. ${name} — <b>${cnt}</b> סטים`
  );

  return `💪 התרגילים הנפוצים ביותר שלך:\n${lines.join("\n")}`;
}

async function handleWorkoutPR(
  sb: SB,
  userId: string,
  text: string
): Promise<string> {
  // Extract exercise name from "שיא ב[name]" or "PR ב[name]"
  const match = text.match(/(?:שיא|pr)\s+ב[- ]?(.+)/i);
  const exerciseName = match?.[1]?.trim();

  if (!exerciseName)
    return `כדי לראות שיא, כתוב: "שיא ב[שם התרגיל]"\nלדוגמה: שיא ב לחיצת חזה`;

  const { data } = await sb
    .from("session_exercises")
    .select("weight, reps, set_number")
    .eq("user_id", userId)
    .ilike("exercise_name", `%${exerciseName}%`)
    .gt("weight", 0);

  if (!data || data.length === 0)
    return `לא נמצאו נתונים לתרגיל "${exerciseName}" 📭`;

  const pr = data.reduce((a, b) => (b.weight > a.weight ? b : a));
  return `🏆 שיא ב-${exerciseName}:\n<b>${round1(pr.weight)} ק״ג</b> × ${pr.reps} חזרות`;
}

async function handleWorkoutPRThisWeek(
  sb: SB,
  userId: string
): Promise<string> {
  const ws = weekStart();

  // מצא session IDs של השבוע
  const { data: weekSessions } = await sb
    .from("workout_sessions")
    .select("id")
    .eq("user_id", userId)
    .gte("date", ws);

  const weekSessionIds = (weekSessions ?? []).map((s: any) => s.id);
  if (!weekSessionIds.length) return "לא התאמנת השבוע 😴";

  // Get all exercises done this week via session_id
  const { data: thisWeekData } = await sb
    .from("session_exercises")
    .select("exercise_name, weight, reps")
    .eq("user_id", userId)
    .in("session_id", weekSessionIds)
    .gt("weight", 0);

  if (!thisWeekData || thisWeekData.length === 0)
    return "לא נמצאו נתוני אימון השבוע 📭";

  // For each exercise this week, find max weight
  const thisWeekMaxes: Record<string, number> = {};
  for (const r of thisWeekData) {
    if (r.exercise_name) {
      thisWeekMaxes[r.exercise_name] = Math.max(
        thisWeekMaxes[r.exercise_name] ?? 0,
        r.weight
      );
    }
  }

  // Get all-time maxes before this week (via session_id NOT IN this week)
  const allTimePromises = Object.keys(thisWeekMaxes).map((name) =>
    sb
      .from("session_exercises")
      .select("weight")
      .eq("user_id", userId)
      .ilike("exercise_name", name)
      .not("session_id", "in", `(${weekSessionIds.join(",")})`)
      .gt("weight", 0)
      .order("weight", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((res) => ({ name, prevMax: res.data?.weight ?? 0 }))
  );

  const prevMaxes = await Promise.all(allTimePromises);
  const prs: string[] = [];

  for (const { name, prevMax } of prevMaxes) {
    const thisWeekMax = thisWeekMaxes[name] ?? 0;
    if (thisWeekMax > prevMax) {
      prs.push(`• ${name}: <b>${round1(thisWeekMax)} ק״ג</b> (שיא קודם: ${round1(prevMax)} ק״ג)`);
    }
  }

  if (prs.length === 0)
    return "לא שברת שיאים השבוע — המשך לדחוף! 💪";

  return `🏆 שיאים שנשברו השבוע:\n${prs.join("\n")}`;
}

async function handleOverview(sb: SB, userId: string): Promise<string> {
  const ws = weekStart();
  const today = israelDateStr();

  const [
    sessionsThisWeek,
    lastSession,
    latestWeight,
    goalRes,
    planRes,
  ] = await Promise.all([
    sb
      .from("workout_sessions")
      .select("id")
      .eq("user_id", userId)
      .gte("date", ws),
    sb
      .from("workout_sessions")
      .select("date, workout_name")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from("body_weight_logs")
      .select("weight, measured_at")
      .eq("user_id", userId)
      .order("measured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from("weight_goal")
      .select("goal_weight, goal_mode")
      .eq("user_id", userId)
      .maybeSingle(),
    sb
      .from("user_settings")
      .select("weekly_goal")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const workoutCount = sessionsThisWeek.data?.length ?? 0;
  const weeklyGoal = planRes.data?.weekly_goal ?? 4;
  const remaining = Math.max(0, weeklyGoal - workoutCount);

  let lastTrainStr = "עדיין לא התאמנת";
  if (lastSession.data) {
    const sessionDate = israelDateStr(new Date(lastSession.data.date));
    const diff = Math.round(
      (new Date(today + "T00:00:00Z").getTime() - new Date(sessionDate + "T00:00:00Z").getTime()) /
        86400000
    );
    lastTrainStr =
      diff === 0
        ? "היום"
        : diff === 1
        ? "אתמול"
        : `לפני ${diff} ימים`;
  }

  let weightStr = "לא נמדד";
  let goalStr = "";
  if (latestWeight.data) {
    weightStr = `${round1(latestWeight.data.weight)} ק״ג`;
    if (goalRes.data) {
      const target = goalRes.data.goal_weight;
      const current = latestWeight.data.weight;
      const diff = Math.abs(target - current);
      const isGain = ["gain", "lean_bulk", "bulk"].includes(goalRes.data.goal_mode);
      const done = isGain ? current >= target : current <= target;
      goalStr = done
        ? "\n🎉 הגעת ליעד המשקל!"
        : `\n🎯 נשאר ${round1(diff)} ק״ג ליעד (${round1(target)} ק״ג)`;
    }
  }

  return `📊 <b>סיכום כולל</b>

🏋️ <b>אימונים השבוע:</b> ${workoutCount}/${weeklyGoal} ${remaining > 0 ? `(נשאר ${remaining})` : "✅"}
📅 <b>אימון אחרון:</b> ${lastTrainStr}
⚖️ <b>משקל אחרון:</b> ${weightStr}${goalStr}`;
}

async function handleLogWeight(
  sb: SB,
  userId: string,
  text: string
): Promise<string> {
  const match = text.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return "לא הצלחתי לזהות את המשקל. נסה לכתוב: נשקלתי 82.5";

  const weight = parseFloat(match[1].replace(",", "."));
  if (isNaN(weight) || weight < 20 || weight > 300)
    return "המשקל שהזנת לא נראה תקין. נסה שוב עם מספר בין 20 ל-300.";

  const now = new Date().toISOString();
  const measuredDate = israelDateStr(new Date());

  // upsert — כדי לא לשבור unique constraint על user_id+measured_date
  const { error } = await sb.from("body_weight_logs").upsert(
    { user_id: userId, weight, measured_at: now, measured_date: measuredDate },
    { onConflict: "user_id,measured_date" }
  );

  if (error)
    return `שגיאה ברישום המשקל ⚠️\n${error.message}`;

  return `✅ נרשם! משקל <b>${round1(weight)} ק״ג</b> נשמר בהצלחה.`;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("ok", { status: 200 });
  }

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!botToken || !supabaseUrl || !serviceRoleKey) {
    return new Response("Server misconfigured", { status: 500 });
  }

  let update: any;
  try {
    update = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const sb = createClient(supabaseUrl, serviceRoleKey);

  // ── Callback query (button press) ──────────────────────────────────────────
  if (update?.callback_query) {
    const cq = update.callback_query;
    const chatId: number = cq.message?.chat?.id;
    const callbackData: string = cq.data || "";
    await answerCallback(botToken, cq.id);

    // Menu navigation — no auth needed
    if (callbackData === "menu_main") {
      await sendMessage(botToken, chatId, "בחר נושא:", "HTML", MAIN_MENU);
      return new Response("ok", { status: 200 });
    }
    if (callbackData === "menu_weight") {
      await sendMessage(botToken, chatId, "⚖️ <b>משקל</b> — בחר שאלה:", "HTML", WEIGHT_MENU);
      return new Response("ok", { status: 200 });
    }
    if (callbackData === "menu_workouts") {
      await sendMessage(botToken, chatId, "🏋️ <b>אימונים</b> — בחר שאלה:", "HTML", WORKOUT_MENU);
      return new Response("ok", { status: 200 });
    }

    // Resolve user
    const telegramId: number = cq.from?.id;
    const { data: linkRow } = await sb.from("telegram_links").select("user_id").eq("telegram_id", telegramId).maybeSingle();
    if (!linkRow) {
      await sendMessage(botToken, chatId, "❌ הבוט לא מחובר לחשבון שלך.\n\nפתח את GymBuddy ← הגדרות ← קשר לבוט טלגרם.");
      return new Response("ok", { status: 200 });
    }
    const userId = linkRow.user_id;

    // Determine which back menu to use
    const backMenu = callbackData.startsWith("workout") ? BACK_BUTTON("workouts") : BACK_BUTTON("weight");

    let reply = "";
    try {
      switch (callbackData as Intent) {
        case "weight_current":        reply = await handleWeightCurrent(sb, userId); break;
        case "weight_weekly_avg":     reply = await handleWeightWeeklyAvg(sb, userId); break;
        case "weight_monthly_change": reply = await handleWeightMonthlyChange(sb, userId); break;
        case "weight_record":         reply = await handleWeightRecord(sb, userId); break;
        case "weight_goal_remaining": reply = await handleWeightGoalRemaining(sb, userId); break;
        case "weight_goal_pace":      reply = await handleWeightGoalPace(sb, userId); break;
        case "workout_this_week":     reply = await handleWorkoutThisWeek(sb, userId); break;
        case "workout_days_this_week":reply = await handleWorkoutDaysThisWeek(sb, userId); break;
        case "workout_goal_remaining":reply = await handleWorkoutGoalRemaining(sb, userId); break;
        case "workout_last":          reply = await handleWorkoutLast(sb, userId); break;
        case "workout_streak":        reply = await handleWorkoutStreak(sb, userId); break;
        case "workout_monthly_compare":reply = await handleWorkoutMonthlyCompare(sb, userId); break;
        case "workout_most_common":   reply = await handleWorkoutMostCommon(sb, userId); break;
        case "workout_pr_this_week":  reply = await handleWorkoutPRThisWeek(sb, userId); break;
        case "overview":              reply = await handleOverview(sb, userId); break;
        default: reply = "פעולה לא מוכרת";
      }
    } catch (err: any) {
      reply = `⚠️ שגיאה: ${err?.message ?? err}`;
    }

    await sendMessage(botToken, chatId, reply, "HTML", backMenu);
    return new Response("ok", { status: 200 });
  }

  // ── Regular message ────────────────────────────────────────────────────────
  const message = update?.message;
  if (!message) return new Response("ok", { status: 200 });

  const chatId: number = message.chat?.id;
  const text: string = (message.text || "").trim();

  if (!chatId || !text) return new Response("ok", { status: 200 });

  // ── /start handler ─────────────────────────────────────────────────────────

  if (text.startsWith("/start")) {
    const parts = text.split(" ");
    const code = parts[1]?.trim();
    const telegramId: number = message.from?.id ?? chatId;

    if (code) {
      // Validate code
      const { data: codeRow, error: codeErr } = await sb
        .from("telegram_link_codes")
        .select("user_id, expires_at")
        .eq("code", code)
        .maybeSingle();

      if (codeErr || !codeRow) {
        await sendMessage(
          botToken,
          chatId,
          "❌ הקוד לא תקף. נסה ליצור קישור חדש מהאפליקציה."
        );
        return new Response("ok", { status: 200 });
      }

      if (new Date(codeRow.expires_at) < new Date()) {
        await sb
          .from("telegram_link_codes")
          .delete()
          .eq("code", code);
        await sendMessage(
          botToken,
          chatId,
          "❌ הקוד פג תוקף. נסה ליצור קישור חדש מהאפליקציה."
        );
        return new Response("ok", { status: 200 });
      }

      // Link telegram_id to user_id
      const { error: linkErr } = await sb
        .from("telegram_links")
        .upsert(
          { telegram_id: telegramId, user_id: codeRow.user_id },
          { onConflict: "telegram_id" }
        );

      // Delete used code
      await sb
        .from("telegram_link_codes")
        .delete()
        .eq("code", code);

      if (linkErr) {
        await sendMessage(
          botToken,
          chatId,
          "⚠️ אירעה שגיאה בחיבור החשבון. נסה שוב."
        );
        return new Response("ok", { status: 200 });
      }

      await sendMessage(
        botToken,
        chatId,
        `✅ <b>החשבון חובר בהצלחה!</b>\n\nבחר נושא:`,
        "HTML",
        MAIN_MENU
      );
      return new Response("ok", { status: 200 });
    }

    // /start without code — check if already linked
    const { data: linkRow } = await sb
      .from("telegram_links")
      .select("user_id")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (linkRow) {
      await sendMessage(
        botToken,
        chatId,
        `👋 <b>ברוך הבא!</b>\n\nבחר נושא:`,
        "HTML",
        MAIN_MENU
      );
    } else {
      await sendMessage(
        botToken,
        chatId,
        `👋 <b>שלום! אני GymBuddy Bot 🏋️</b>\n\nכדי להתחיל, יש לקשר את הבוט לחשבון שלך:\n\n1. פתח את אפליקציית GymBuddy\n2. לך להגדרות (ניהול תוכנית)\n3. לחץ על "קשר לבוט טלגרם"\n4. לחץ "צור קישור"\n5. לחץ על הכפתור שיפתח את הבוט\n\nאחרי החיבור תוכל לשאול אותי כל שאלה!`,
        "HTML"
      );
    }
    return new Response("ok", { status: 200 });
  }

  // ── Resolve user from telegram_id ─────────────────────────────────────────

  const telegramId: number = message.from?.id ?? chatId;
  const { data: linkRow } = await sb
    .from("telegram_links")
    .select("user_id")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (!linkRow) {
    await sendMessage(
      botToken,
      chatId,
      `❌ הבוט לא מחובר לחשבון שלך.\n\nכדי לחבר:\n1. פתח את GymBuddy\n2. לך להגדרות\n3. לחץ "קשר לבוט טלגרם"`,
      "HTML"
    );
    return new Response("ok", { status: 200 });
  }

  const userId = linkRow.user_id;

  // ── /menu command ─────────────────────────────────────────────────────────
  if (text === "/menu") {
    await sendMessage(botToken, chatId, "בחר נושא:", "HTML", MAIN_MENU);
    return new Response("ok", { status: 200 });
  }

  // ── Intent routing ────────────────────────────────────────────────────────

  const intent = detectIntent(text);
  let reply: string;
  let replyKeyboard: InlineKeyboard | undefined;

  try {
    switch (intent) {
      case "weight_current":
        reply = await handleWeightCurrent(sb, userId);
        replyKeyboard = BACK_BUTTON("weight"); break;
      case "weight_weekly_avg":
        reply = await handleWeightWeeklyAvg(sb, userId);
        replyKeyboard = BACK_BUTTON("weight"); break;
      case "weight_monthly_change":
        reply = await handleWeightMonthlyChange(sb, userId);
        replyKeyboard = BACK_BUTTON("weight"); break;
      case "weight_record":
        reply = await handleWeightRecord(sb, userId);
        replyKeyboard = BACK_BUTTON("weight"); break;
      case "weight_goal_remaining":
        reply = await handleWeightGoalRemaining(sb, userId);
        replyKeyboard = BACK_BUTTON("weight"); break;
      case "weight_goal_pace":
        reply = await handleWeightGoalPace(sb, userId);
        replyKeyboard = BACK_BUTTON("weight"); break;
      case "weight_avg_range":
        reply = await handleWeightAvgRange(sb, userId, text);
        replyKeyboard = BACK_BUTTON("weight"); break;
      case "workout_this_week":
        reply = await handleWorkoutThisWeek(sb, userId);
        replyKeyboard = BACK_BUTTON("workouts"); break;
      case "workout_days_this_week":
        reply = await handleWorkoutDaysThisWeek(sb, userId);
        replyKeyboard = BACK_BUTTON("workouts"); break;
      case "workout_goal_remaining":
        reply = await handleWorkoutGoalRemaining(sb, userId);
        replyKeyboard = BACK_BUTTON("workouts"); break;
      case "workout_last":
        reply = await handleWorkoutLast(sb, userId);
        replyKeyboard = BACK_BUTTON("workouts"); break;
      case "workout_streak":
        reply = await handleWorkoutStreak(sb, userId);
        replyKeyboard = BACK_BUTTON("workouts"); break;
      case "workout_monthly_compare":
        reply = await handleWorkoutMonthlyCompare(sb, userId);
        replyKeyboard = BACK_BUTTON("workouts"); break;
      case "workout_most_common":
        reply = await handleWorkoutMostCommon(sb, userId);
        replyKeyboard = BACK_BUTTON("workouts"); break;
      case "workout_pr":
        reply = await handleWorkoutPR(sb, userId, text);
        replyKeyboard = BACK_BUTTON("workouts"); break;
      case "workout_pr_this_week":
        reply = await handleWorkoutPRThisWeek(sb, userId);
        replyKeyboard = BACK_BUTTON("workouts"); break;
      case "overview":
        reply = await handleOverview(sb, userId);
        replyKeyboard = [[{ text: "🏠 תפריט ראשי", callback_data: "menu_main" }]]; break;
      case "log_weight":
        reply = await handleLogWeight(sb, userId, text);
        replyKeyboard = [[{ text: "🏠 תפריט ראשי", callback_data: "menu_main" }]]; break;
      default:
        reply = "בחר נושא:";
        replyKeyboard = MAIN_MENU;
    }
  } catch (err: any) {
    console.error("Handler error:", err);
    reply = `⚠️ אירעה שגיאה. נסה שוב.\n${err?.message ?? ""}`;
  }

  await sendMessage(botToken, chatId, reply, "HTML", replyKeyboard);
  return new Response("ok", { status: 200 });
});
