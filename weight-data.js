const STORAGE_WEIGHT_LOGS = "gym_weight_logs_v1";
const STORAGE_WEIGHT_GOAL = "gym_weight_goal_v1";

function isValidWeightLog(row) {
  return row && typeof row.weight === "number" && typeof row.measured_at === "string";
}

function saveWeightCache() {
  localStorage.setItem(STORAGE_WEIGHT_LOGS, JSON.stringify(state.weightLogs || []));
  localStorage.setItem(STORAGE_WEIGHT_GOAL, JSON.stringify(state.weightGoal || { start_weight: null, goal_weight: null, goal_mode: "maintain" }));
}

function loadWeightCache() {
  let logs = [];
  let goal = null;
  try {
    logs = JSON.parse(localStorage.getItem(STORAGE_WEIGHT_LOGS) || "[]");
  } catch (e) { console.warn("[loadWeightCache] failed to parse weight logs from localStorage:", e); }
  try {
    goal = JSON.parse(localStorage.getItem(STORAGE_WEIGHT_GOAL) || "null");
  } catch (e) { console.warn("[loadWeightCache] failed to parse weight goal from localStorage:", e); }
  return { logs: Array.isArray(logs) ? logs : [], goal };
}

async function loadWeightData() {
  try {
    // Always use the stored user_id so we don't overwrite it with another user's id
    const userId = (typeof ensureUserId === "function") ? ensureUserId() : (state.userId || localStorage.getItem(STORAGE_USER_ID) || "");
    const userFilter = userId ? `&user_id=eq.${encodeURIComponent(userId)}` : "";
    const logs = await sbGet(`body_weight_logs?select=*&order=measured_at.asc${userFilter}`);
    dlog("[loadWeightData] body_weight_logs raw response:", logs);
    const validLogs = (logs || []).filter(row => {
      if (!isValidWeightLog(row)) { console.warn("[loadWeightData] skipping invalid row:", row); return false; }
      return true;
    });
    state.weightLogs = validLogs.map(mapWeightLog);
    const goalUserFilter = userId ? `&user_id=eq.${encodeURIComponent(userId)}` : "";
    const goalsRaw = await sbGet(`weight_goal?select=*&order=updated_at.desc&limit=1${goalUserFilter}`);
    dlog("[loadWeightData] weight_goal raw response:", goalsRaw);
    const goalRows = Array.isArray(goalsRaw) ? goalsRaw : (goalsRaw ? [goalsRaw] : []);
    const normalizedGoals = goalRows.map(g => ({
      ...g,
      start_weight: g.start_weight ?? g.startWeight ?? g.starting_weight ?? null,
      goal_weight: g.goal_weight ?? g.goalWeight ?? g.target_weight ?? null,
      goal_mode: getWeightGoalMode(g)
    }));
    const validGoal = normalizedGoals.find(g => getWeightGoalValues(g).hasGoal);
    if (validGoal) state.weightGoal = validGoal;
    else if (goalRows.length) console.warn("[loadWeightData] weight_goal row exists but could not be parsed:", goalRows[0]);
    saveWeightCache();
    setDataSource("weight", "supabase");
  } catch (e) {
    console.error("Weight load failed:", e);
    const cached = loadWeightCache();
    state.weightLogs = (cached.logs || []).map(mapWeightLog);
    state.weightLogs = getWeightLogsAsc();
    if (cached.goal && typeof cached.goal === "object") {
      state.weightGoal = { ...cached.goal, goal_mode: getWeightGoalMode(cached.goal) };
    }
    setDataSource("weight", "local");
    setSyncError("טעינת נתוני משקל מהענן נכשלה");
  }
}

async function saveWeightLog(weight, measuredAtIso, note) {
  try {
    const userId = ensureUserId();
    const measuredAt = measuredAtIso || new Date().toISOString();
    const path = "body_weight_logs?on_conflict=user_id,measured_date";
    const headers = { ...SB_HEADERS, Prefer: "return=representation,resolution=merge-duplicates" };
    const payload = [{
      user_id: userId,
      weight,
      measured_at: measuredAt,
      note: note || ""
    }];
    const r = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(await r.text());
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) throw new Error("Invalid body_weight_logs write response");
    const saved = mapWeightLog(rows[0]);
    const idx = state.weightLogs.findIndex(l => l.id === saved.id);
    if (idx >= 0) state.weightLogs[idx] = saved;
    else state.weightLogs.push(saved);
    state.weightLogs = getWeightLogsAsc();
    saveWeightCache();
    clearSyncError();
    showToast("המשקל נשמר ✓");
    return saved;
  } catch (e) {
    console.error("Weight save failed:", e);
    showToast("שגיאה בשמירת משקל ⚠️");
    throw e;
  }
}

async function updateWeightLog(id, weight, measuredAtIso, note) {
  try {
    const rows = await sbPatch("body_weight_logs?id=eq." + encodeURIComponent(id), {
      weight,
      measured_at: measuredAtIso,
      note: note || ""
    });
    if (!rows || !rows.length) throw new Error("No row returned after update");
    const updated = mapWeightLog(rows[0]);
    const idx = state.weightLogs.findIndex(l => l.id === id);
    if (idx >= 0) state.weightLogs[idx] = updated;
    state.weightLogs = getWeightLogsAsc();
    saveWeightCache();
    showToast("השקילה עודכנה ✓");
    return updated;
  } catch (e) {
    console.error("Weight update failed:", e);
    showToast("שגיאה בעדכון שקילה ⚠️");
    throw e;
  }
}

async function saveWeightGoal(startWeight, goalWeight, goalMode) {
  try {
    const userId = ensureUserId();
    const upsertHeaders = { ...SB_HEADERS, Prefer: "return=representation,resolution=merge-duplicates" };
    const r = await fetch(SUPABASE_URL + "/rest/v1/weight_goal?on_conflict=user_id", {
      method: "POST",
      headers: upsertHeaders,
      body: JSON.stringify({
        user_id: userId,
        start_weight: startWeight,
        goal_weight: goalWeight,
        goal_mode: getWeightGoalMode({ goal_mode: goalMode })
      })
    });
    if (!r.ok) throw new Error(await r.text());
    const row = await r.json();
    if (!Array.isArray(row) || !row.length) throw new Error("Invalid weight_goal write response");
    state.weightGoal = { ...row[0], goal_mode: getWeightGoalMode(row[0]) };
    saveWeightCache();
    clearSyncError();
  } catch (e) {
    console.error("Weight goal save failed:", e);
    showToast("שגיאה בשמירת יעד");
    throw e;
  }
}

async function deleteWeightLog(id) {
  try {
    await sbDelete("body_weight_logs?id=eq." + id);
    state.weightLogs = state.weightLogs.filter(l => l.id !== id);
    if (!state.weightLogs.length) {
      state.weightGoal = { start_weight: null, goal_weight: null, goal_mode: "maintain" };
    }
    saveWeightCache();
    render();
  } catch (e) {
    console.error("Weight delete failed:", e);
    showToast("שגיאה במחיקה");
  }
}
