// ── workout-sync.js ──────────────────────────────────────────────

function getGoalForWeek(weekStartIso) {
  const history = state.settings.goalHistory || [];
  const sorted = [...history].sort((a,b) => a.from > b.from ? -1 : 1);
  const entry = sorted.find(e => e.from <= weekStartIso);
  return entry ? entry.goal : (state.settings.weeklyGoal || 4);
}

function saveSessions() { localStorage.setItem(STORAGE_SESSIONS, JSON.stringify(state.sessions)); }

function saveWorkouts() {
  localStorage.setItem(STORAGE_WORKOUTS, JSON.stringify(state.workouts));
  saveWorkoutsToSupabase();
}
function saveSettings() {
  localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(state.settings));
  saveSettingsToSupabase();
}

async function saveSettingsToSupabase() {
  try {
    const userId = requireUserIdOrThrow("saveSettingsToSupabase");
    await sbPost("user_settings", {
      user_id: userId,
      weekly_goal: state.settings.weeklyGoal,
      goal_history: state.settings.goalHistory || []
    });
    clearSyncError();
  } catch(e) { console.error("Settings save failed:", e); setSyncError("שמירת הגדרות לענן נכשלה"); showToast("שמירת הגדרות לענן נכשלה ⚠️"); }
}

async function loadSettingsFromSupabase() {
  try {
    const userId = (typeof ensureUserId === "function") ? ensureUserId() : (state.userId || "");
    const userFilter = userId ? `&user_id=eq.${encodeURIComponent(userId)}` : "";
    const rows = await sbGet(`user_settings?select=*&order=updated_at.desc&limit=1${userFilter}`);
    if (rows && rows.length) {
      const r = rows[0];
      state.settings.weeklyGoal = r.weekly_goal || 4;
      state.settings.goalHistory = r.goal_history || [];
      localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(state.settings));
    }
    setDataSource("settings", "supabase");
  } catch(e) { console.error("Settings load failed:", e); setSyncError("טעינת הגדרות מהענן נכשלה"); }
  if ((state.syncStatus?.dataSource?.settings) !== "supabase") {
    setDataSource("settings", "local");
  }
}


async function saveWorkoutsToSupabase() {
  try {
    const userId = requireUserIdOrThrow("saveWorkoutsToSupabase");
    const rows = buildWorkoutPlanRows(state.workouts, userId);
    if (!rows.length) {
      if (!ALLOW_EMPTY_WORKOUT_SYNC) {
        setSyncError("נחסמה מחיקה גורפת של תוכניות בענן (ALLOW_EMPTY_WORKOUT_SYNC=false)");
        showToast("המחיקה בענן נחסמה להגנה על הנתונים ⚠️");
        return;
      }
    } else {
      const upsertHeaders = { ...SB_HEADERS, Prefer: "return=representation,resolution=merge-duplicates" };
      const upsertRes = await fetch(SUPABASE_URL + "/rest/v1/workout_plans?on_conflict=user_id,plan_id", {
        method: "POST",
        headers: upsertHeaders,
        body: JSON.stringify(rows)
      });
      if (!upsertRes.ok) throw new Error(await upsertRes.text());
    }

    const remoteRows = await sbGet("workout_plans?select=plan_id,user_id");
    const localIds = new Set(rows.map(r => String(r.plan_id)));
    const staleRemoteIds = (remoteRows || [])
      .filter(r => String(r.user_id || "") === String(userId))
      .map(r => String(r.plan_id))
      .filter(id => id && !localIds.has(id));

    if (staleRemoteIds.length) {
      console.warn("[saveWorkoutsToSupabase] deleting stale workout plans:", staleRemoteIds);
      for (const staleId of staleRemoteIds) {
        await sbDelete("workout_plans?user_id=eq." + encodeURIComponent(userId) + "&plan_id=eq." + encodeURIComponent(staleId));
      }
    }
    showToast("התוכנית נשמרה ✓");
    clearSyncError();
  } catch(e) { console.error("Workout plan save failed:", e); setSyncError("שמירת תוכנית לענן נכשלה"); showToast("שגיאה בשמירת התוכנית ⚠️"); }
}

async function loadWorkoutsFromSupabase() {
  const fetchWorkoutRows = async (path, diagLabel) => {
    const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, { headers: SB_HEADERS });
    const rawText = await res.text();
    dlog("[loadWorkoutsFromSupabase]", diagLabel, "status:", res.status, "body:", rawText);
    if (!res.ok) throw new Error(`${diagLabel} failed (${res.status}): ${rawText}`);
    if (!rawText) return [];
    try {
      return JSON.parse(rawText);
    } catch (parseErr) {
      throw new Error(`${diagLabel} parse failed: ${parseErr.message}`);
    }
  };

  const _wpUserId = (typeof ensureUserId === "function") ? ensureUserId() : (state.userId || "");
  const _wpUserFilter = _wpUserId ? `&user_id=eq.${encodeURIComponent(_wpUserId)}` : "";
  try {
    let rows;
    let fallbackReason = "";
    try {
      rows = await fetchWorkoutRows(`workout_plans?select=*&order=sort_order.asc${_wpUserFilter}`, "ordered_fetch");
    } catch (orderedErr) {
      const orderedMsg = String(orderedErr?.message || orderedErr);
      if (orderedMsg.includes("sort_order")) {
        fallbackReason = "sort_order_missing_or_invalid";
        console.warn("[loadWorkoutsFromSupabase] ordered query failed, retrying without order:", orderedMsg);
        rows = await fetchWorkoutRows(`workout_plans?select=*${_wpUserFilter}`, "unordered_fetch");
      } else {
        throw orderedErr;
      }
    }

    const rowsArray = Array.isArray(rows) ? rows : (rows ? [rows] : []);
    dlog("[loadWorkoutsFromSupabase] parsed rows:", rowsArray.length, "fallbackReason:", fallbackReason || "none");
    if (rowsArray.length) {
      // תמיד החלף את כל ה-state — אל תצרף
      const normalized = mapWorkoutPlansFromRows(rowsArray);

      if (normalized.length) {
        state.workouts = normalized;
        localStorage.setItem(STORAGE_WORKOUTS, JSON.stringify(state.workouts));
        setDataSource("workouts", "supabase");
      } else {
        // הגיעו rows אבל בלי מזהה תקין — אל תדרוס state קיים
        if (!state.workouts?.length) state.workouts = JSON.parse(JSON.stringify(DEFAULT_WORKOUTS));
        setDataSource("workouts", "local");
        setSyncError("תוכניות בענן בפורמט לא תקין — מוצגות תוכניות מקומיות");
      }
    } else {
      // Supabase ריק — השאר נתונים מקומיים קיימים כדי לא להעלים את רשימת האימונים
      if (!state.workouts?.length) {
        state.workouts = JSON.parse(JSON.stringify(DEFAULT_WORKOUTS));
      }
      // Persist to v4 so future loads don't fall back to defaults (in case v3 was cleared by migration)
      try { localStorage.setItem(STORAGE_WORKOUTS, JSON.stringify(state.workouts)); } catch (_) {}
      setDataSource("workouts", "local");
      setSyncError("לא נמצאו תוכניות בענן — מוצגות תוכניות מקומיות");
    }
  } catch(e) {
    console.error("Workout plan load failed (fetch/parse/normalize):", e);
    setSyncError("טעינת תוכנית מהענן נכשלה");
    // Persist current workouts to v4 so future reloads don't fall back to defaults
    try { localStorage.setItem(STORAGE_WORKOUTS, JSON.stringify(state.workouts)); } catch (_) {}
  }
  if ((state.syncStatus?.dataSource?.workouts) !== "supabase") {
    setDataSource("workouts", "local");
  }
}
