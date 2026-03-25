const APP_BUILD = "2026-03-23-audit-2";
const DEBUG = localStorage.getItem("gym_debug") === "1";
const dlog = (...args) => { if (DEBUG) console.debug(...args); };
const dinfo = (...args) => { if (DEBUG) console.info(...args); };

dinfo("[GymBuddy] build:", APP_BUILD, "supabase:", SUPABASE_URL);
window.__GYMBUDDY_BUILD__ = APP_BUILD;

function setDataSource(key, source) {
  if (!state.syncStatus) return;
  state.syncStatus.dataSource[key] = source;
}

function setSyncError(message) {
  if (!state.syncStatus) return;
  state.syncStatus.lastError = message;
}

function clearSyncError() {
  if (!state.syncStatus) return;
  state.syncStatus.lastError = null;
}

function renderSyncNotice() {
  const status = state.syncStatus || {};
  const localSources = Object.entries(status.dataSource || {})
    .filter(([, src]) => src === "local")
    .map(([k]) => k);
  const fallbackLine = localSources.length
    ? `<div style="font-size:11px;color:var(--orange)">מציג נתונים מקומיים: ${localSources.join(", ")}</div>`
    : "";
  const errorLine = status.lastError
    ? `<div style="font-size:11px;color:var(--red);margin-top:${fallbackLine ? "4px" : "0"}">${escapeHtml(status.lastError)}</div>`
    : "";
  if (!fallbackLine && !errorLine) return "";
  return `<div style="margin:10px 14px 0;padding:8px 10px;border-radius:10px;background:var(--surface);border:1px solid var(--border-med)">${fallbackLine}${errorLine}</div>`;
}

async function runRuntimeDataAudit() {
  if (!DEBUG) return;
  try {
    const [sessionsWithEmbed, standaloneSets, goals] = await Promise.all([
      sbGet("workout_sessions?select=*,sets:session_exercises(*)&order=date.asc"),
      sbGet("session_exercises?select=*"),
      sbGet("weight_goal?select=*&order=updated_at.desc&limit=1")
    ]);

    const sessionRows = Array.isArray(sessionsWithEmbed) ? sessionsWithEmbed : [];
    const hasSetsProp = sessionRows.some(r => Object.prototype.hasOwnProperty.call(r, "sets"));
    const embeddedSetCount = sessionRows.reduce((n, r) => n + (Array.isArray(r.sets) ? r.sets.length : 0), 0);
    const setRows = Array.isArray(standaloneSets) ? standaloneSets : [];

    const sessionKeys = new Set(
      sessionRows
        .flatMap(r => [r.id, r.local_id])
        .filter(Boolean)
        .map(v => String(v))
    );
    const matchedStandalone = setRows.filter(s => {
      const key = String(
        s.session_id ??
        s.workout_session_id ??
        s.workout_session ??
        s.session_local_id ??
        s.local_session_id ??
        ""
      );
      return key && sessionKeys.has(key);
    }).length;
    const orphanStandalone = setRows.length - matchedStandalone;

    const goalRows = Array.isArray(goals) ? goals : (goals ? [goals] : []);
    const goalParsed = goalRows[0] ? getWeightGoalValues(goalRows[0]) : { hasGoal: false, start: NaN, target: NaN };

    console.info("[runtime-audit]", {
      build: APP_BUILD,
      supabaseUrl: SUPABASE_URL,
      sessionsCount: sessionRows.length,
      hasSetsProp,
      embeddedSetCount,
      standaloneSetCount: setRows.length,
      matchedStandalone,
      orphanStandalone,
      weightGoalRows: goalRows.length,
      weightGoalParsed: goalParsed,
      prsFromStateCount: Object.keys(getPRs?.() || {}).length
    });
  } catch (err) {
    console.warn("[runtime-audit] failed:", err);
  }
}
