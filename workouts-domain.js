function getWorkout(id) {
  return state.workouts.find(w => w.id === id);
}

function getLastSession(id) {
  return [...state.sessions].reverse().find(s => s.workoutId === id) || null;
}

function getNextWorkout() {
  if (!state.sessions.length) return state.workouts[0] || null;
  const last = state.sessions[state.sessions.length - 1];
  const lastIdx = state.workouts.findIndex(w => w.id === last.workoutId);
  if (lastIdx === -1) return state.workouts[0] || null;
  return state.workouts[(lastIdx + 1) % state.workouts.length];
}

function normalizeWorkoutPlanRow(row, idx) {
  const id = row.plan_id ?? row.id ?? row.workout_id ?? null;
  if (!id) return null;
  const rawName = (row.name ?? row.workout_name ?? "").toString().trim();
  return {
    id: String(id),
    name: rawName || `אימון ${idx + 1}`,
    exercises: Array.isArray(row.exercises) ? row.exercises : []
  };
}

function mapWorkoutPlansFromRows(rows) {
  const rowsArray = Array.isArray(rows) ? rows : (rows ? [rows] : []);
  return rowsArray.map((r, idx) => normalizeWorkoutPlanRow(r, idx)).filter(Boolean);
}

function buildWorkoutPlanRows(workouts, userId) {
  return workouts.map((w, i) => ({
    user_id: userId,
    plan_id: w.id,
    name: w.name,
    exercises: w.exercises,
    sort_order: i
  }));
}

function addWorkoutToState(name) {
  const newWorkout = { id: "w_" + Date.now(), name, exercises: [] };
  state.workouts.push(newWorkout);
  return newWorkout;
}

function removeWorkoutFromState(workoutId) {
  state.workouts = state.workouts.filter(w => w.id !== workoutId);
}

function addExerciseToWorkoutState(workout, name, rest, category) {
  if (!workout) return false;
  workout.exercises.push({ name, rest, category });
  return true;
}

function removeExerciseFromWorkoutState(workout, index) {
  if (!workout) return false;
  workout.exercises.splice(index, 1);
  return true;
}

function updateExerciseRestInWorkoutState(workout, index, value) {
  if (!workout || !workout.exercises[index]) return false;
  workout.exercises[index].rest = parseInt(value) || 60;
  return true;
}

function updateExerciseFieldInWorkoutState(workout, index, field, value) {
  if (!workout || !workout.exercises[index]) return false;
  if (field === "rest") workout.exercises[index].rest = parseInt(value) || 60;
  else if (field === "name") {
    const clean = sanitizeText(value, 80);
    if (clean) workout.exercises[index].name = clean;
  } else if (field === "category") workout.exercises[index].category = value || null;
  return true;
}
