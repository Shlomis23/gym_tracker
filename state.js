function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function loadWorkouts() {
  try {
    const s = localStorage.getItem(STORAGE_WORKOUTS);
    if (s) return JSON.parse(s);
    const old = localStorage.getItem("gym_workouts_v3");
    if (old) {
      const parsed = JSON.parse(old);
      return parsed.map(w => ({ ...w, exercises: w.exercises.map(e => typeof e === "string" ? { name: e, rest: 60 } : e) }));
    }
    return JSON.parse(JSON.stringify(DEFAULT_WORKOUTS));
  } catch { return JSON.parse(JSON.stringify(DEFAULT_WORKOUTS)); }
}

function loadSettings() {
  try {
    const s = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || "{}") };
    if (!s.goalHistory || !s.goalHistory.length) {
      s.goalHistory = [{ goal: s.weeklyGoal, from: "2020-01-05" }];
    }
    const thisWeekIso = getWeekStart(new Date()).toISOString().slice(0,10);
    const sorted = [...s.goalHistory].sort((a,b) => a.from > b.from ? -1 : 1);
    const currentEntry = sorted.find(e => e.from <= thisWeekIso);
    s.weeklyGoal = currentEntry ? currentEntry.goal : (s.weeklyGoal || 4);
    return s;
  } catch { return { ...DEFAULT_SETTINGS, weeklyGoal: 4, goalHistory: [{ goal: 4, from: "2020-01-05" }] }; }
}

let state = {
  screen: "dashboard", workoutId: null, openExercise: null, exercises: {},
  sessions: [], workouts: loadWorkouts(), settings: loadSettings(),
  manageOpenId: null, editingNameId: null, selectedWorkoutId: null, expandedSessions: new Set(),
  weightLogs: [], weightGoal: { start_weight: null, goal_weight: null }, historyTab: "workouts",
  userId: null,
  weightRangeDays: 7, weightRangeMode: "preset", weightCustomRange: { from: "", to: "" },
  workoutNote: "", monthViewYear: null, monthViewMonth: null, pendingGoal: null,
  editingExKey: null, exerciseLibrary: [], workoutExtras: [], dashboardAnimatedOnce: false,
  historyWorkoutFilterMode: "all", historyWorkoutId: "all", historyExerciseQuery: ""
};

window.state = state;
