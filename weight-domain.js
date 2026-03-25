function mapWeightLog(log) {
  return {
    id: log.id,
    user_id: log.user_id || null,
    weight: Number(log.weight),
    measured_at: log.measured_at || log.date || new Date().toISOString(),
    measured_date: log.measured_date || (log.date ? log.date.slice(0, 10) : new Date().toISOString().slice(0, 10)),
    note: log.note || ""
  };
}

function getWeightLogsAsc() {
  return [...state.weightLogs]
    .map(mapWeightLog)
    .sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at));
}

function formatWeightDate(log) {
  return formatDate(log.measured_at || log.date);
}

function getWeightGoalValues(goal) {
  const g = goal || state.weightGoal || {};
  const pickNumber = keys => {
    for (const key of keys) {
      const raw = g[key] ?? g?.goal?.[key] ?? null;
      if (raw === null || raw === undefined || raw === "") continue;
      const num = Number(String(raw).replace(",", "."));
      if (Number.isFinite(num)) return num;
    }
    return NaN;
  };

  const start = pickNumber(["start_weight", "startWeight", "starting_weight", "start", "initial_weight"]);
  const target = pickNumber(["goal_weight", "goalWeight", "target_weight", "target", "goal"]);
  return { start, target, hasGoal: Number.isFinite(start) && Number.isFinite(target) };
}

function getWeightGoalMode(goal) {
  const g = goal || state.weightGoal || {};
  const rawMode = String(
    g.goal_mode
    ?? g.goalMode
    ?? g.mode
    ?? g?.goal?.goal_mode
    ?? g?.goal?.goalMode
    ?? "maintain"
  ).trim().toLowerCase();
  if (rawMode === "cut") return "cut";
  if (rawMode === "lean_bulk" || rawMode === "leanbulk") return "lean_bulk";
  return "maintain";
}

function hasWeightGoal(goal) {
  return getWeightGoalValues(goal).hasGoal;
}

function getLatestWeight() {
  const logs = getWeightLogsAsc();
  if (!logs.length) return null;
  return logs[logs.length - 1];
}

function getPrevWeight() {
  const logs = getWeightLogsAsc();
  if (logs.length < 2) return null;
  return logs[logs.length - 2];
}

function daysSinceWeight() {
  const latest = getLatestWeight();
  if (!latest) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const latestDay = new Date(latest.measured_at); latestDay.setHours(0,0,0,0);
  return Math.round((today - latestDay) / (1000 * 60 * 60 * 24));
}
