// ─── Share Token ─────────────────────────────────────────────────────────────

function generateToken() {
  const arr = new Uint8Array(18);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
}

async function getOrCreateShareToken() {
  const userId = requireUserIdOrThrow("getOrCreateShareToken");

  // בדוק אם כבר קיים token פעיל
  try {
    const rows = await sbGet(
      `share_tokens?user_id=eq.${encodeURIComponent(userId)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&order=expires_at.desc&limit=1`
    );
    if (Array.isArray(rows) && rows.length) return rows[0];
  } catch (_) {}

  // צור חדש
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const rows = await sbPost("share_tokens?select=*", {
    token,
    user_id: userId,
    expires_at: expiresAt
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function loadSharedData(token) {
  // אמת token ומצא את ה-user_id
  const tokenRows = await sbGet(
    `share_tokens?token=eq.${encodeURIComponent(token)}&select=user_id,expires_at`
  );
  if (!Array.isArray(tokenRows) || !tokenRows.length) return "expired";
  const { user_id: ownerId, expires_at: expiresAt } = tokenRows[0];
  if (new Date(expiresAt) < new Date()) return "expired";

  // טען נתונים של הבעלים
  const userFilter = `&user_id=eq.${encodeURIComponent(ownerId)}`;

  const [sessions, exerciseRows, weightLogs, goalRows, workoutsRaw] = await Promise.all([
    sbGet(`workout_sessions?select=*&order=date.asc${userFilter}`),
    sbGet(`session_exercises?select=*${userFilter}`),
    sbGet(`body_weight_logs?select=*&order=measured_at.asc${userFilter}`),
    sbGet(`weight_goal?select=*&order=updated_at.desc&limit=1${userFilter}`),
    sbGet(`workout_plans?select=*${userFilter}`)
  ]);

  // בנה sessions עם תרגילים
  const setsBySessionId = new Map();
  (exerciseRows || []).forEach(s => {
    const key = String(s.session_id || "");
    if (!key) return;
    if (!setsBySessionId.has(key)) setsBySessionId.set(key, []);
    setsBySessionId.get(key).push(s);
  });

  state.sessions = (sessions || []).map(row => {
    const exercises = {};
    const sets = setsBySessionId.get(String(row.id)) || [];
    sets.forEach(s => {
      const exName = s.exercise_name;
      if (!exName) return;
      if (!exercises[exName]) exercises[exName] = [];
      exercises[exName].push({
        num: Number(s.set_number || 0),
        weight: Number(s.weight || 0),
        reps: Number(s.reps || 0),
        failed: !!s.failed
      });
    });
    Object.values(exercises).forEach(arr => arr.sort((a, b) => a.num - b.num));
    return {
      id: row.local_id || row.id,
      workoutId: row.workout_id,
      workoutName: row.workout_name || "",
      date: row.date,
      exercises,
      note: row.note || ""
    };
  });

  state.weightLogs = (weightLogs || []).map(mapWeightLog);
  state.weightLogs = getWeightLogsAsc();

  const goalRow = Array.isArray(goalRows) ? goalRows[0] : null;
  if (goalRow) {
    state.weightGoal = {
      ...goalRow,
      start_weight: goalRow.start_weight ?? goalRow.startWeight ?? null,
      goal_weight: goalRow.goal_weight ?? goalRow.goalWeight ?? null,
      goal_mode: getWeightGoalMode(goalRow)
    };
  }

  state.workouts = mapWorkoutPlansFromRows(workoutsRaw || []);

  return "ok";
}

async function openShareSheet() {
  const existing = document.getElementById("share-sheet-modal");
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement("div");
  overlay.id = "share-sheet-modal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:3000;display:flex;align-items:flex-end;justify-content:center";

  const sheet = document.createElement("div");
  sheet.style.cssText = "background:var(--card);border-radius:22px 22px 0 0;padding:24px 20px 32px;width:100%;max-width:430px;box-sizing:border-box;direction:rtl;animation:slideUp 0.28s ease both";
  sheet.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
      <div style="font-size:17px;font-weight:800;color:var(--text-primary)">שתף עם מאמן</div>
      <button id="share-close" style="width:32px;height:32px;border:none;background:var(--surface);border-radius:999px;cursor:pointer;color:var(--text-hint);font-size:20px;display:flex;align-items:center;justify-content:center">×</button>
    </div>
    <div id="share-loading" style="text-align:center;padding:24px;color:var(--text-hint);font-size:13px">יוצר קישור...</div>
  `;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  sheet.querySelector("#share-close").addEventListener("click", () => overlay.remove());

  try {
    const row = await getOrCreateShareToken();
    const expiresAt = new Date(row.expires_at);
    const expiresStr = expiresAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) +
      " · " + expiresAt.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
    const url = `${location.origin}${location.pathname}?share=${row.token}`;

    const loadingEl = sheet.querySelector("#share-loading");
    loadingEl.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border-med);border-radius:14px;padding:14px;margin-bottom:16px">
        <div style="font-size:11px;color:var(--text-hint);margin-bottom:6px">קישור לצפייה בלבד</div>
        <div style="font-size:12px;color:var(--text-primary);word-break:break-all;line-height:1.5">${url}</div>
        <div style="font-size:11px;color:var(--text-hint);margin-top:8px">פג תוקף: ${expiresStr}</div>
      </div>
      <button id="share-copy-btn" style="width:100%;padding:14px;background:var(--accent);color:#fff;border:none;border-radius:14px;cursor:pointer;font-size:15px;font-weight:700;font-family:inherit;margin-bottom:10px">העתק קישור</button>
      <button id="share-close2" style="width:100%;padding:13px;background:var(--surface);color:var(--text-secondary);border:1.5px solid var(--border-med);border-radius:14px;font-family:inherit;font-size:14px;cursor:pointer">סגור</button>
    `;

    loadingEl.querySelector("#share-copy-btn").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(url);
      } catch (_) {
        const ta = document.createElement("textarea");
        ta.value = url; ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;left:-9999px";
        document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); ta.remove();
      }
      showToast("הקישור הועתק ✓");
      setTimeout(() => {
        document.getElementById("share-sheet-modal")?.remove();
      }, 800);
    });
    loadingEl.querySelector("#share-close2").addEventListener("click", () => overlay.remove());
  } catch (e) {
    console.error("Share token failed:", e);
    sheet.querySelector("#share-loading").innerHTML = `<div style="color:var(--red);font-size:13px;text-align:center;padding:16px">שגיאה ביצירת קישור ⚠️</div>`;
  }
}

Object.assign(window, { openShareSheet, loadSharedData });
