async function getHistoricalPrMaxByExercise(userId, exerciseNames) {
  if (!Array.isArray(exerciseNames) || !exerciseNames.length) return {};
  const quoted = exerciseNames
    .map(name => String(name || "").replace(/"/g, "\\\""))
    .filter(Boolean)
    .map(name => `"${name}"`);
  if (!quoted.length) return {};

  const rows = await sbGet(
    "session_exercises?select=exercise_name,weight&user_id=eq."
      + encodeURIComponent(userId)
      + "&exercise_name=in.("
      + encodeURIComponent(quoted.join(","))
      + ")"
  );

  const maxByExercise = {};
  (rows || []).forEach(row => {
    const exerciseName = row?.exercise_name;
    const weight = Number(row?.weight || 0);
    if (!exerciseName || !Number.isFinite(weight) || weight <= 0) return;
    maxByExercise[exerciseName] = Math.max(maxByExercise[exerciseName] || 0, weight);
  });
  return maxByExercise;
}

function getSessionExerciseMaxMap(session) {
  const maxByExercise = {};
  Object.entries(session?.exercises || {}).forEach(([exerciseName, sets]) => {
    const maxWeight = (Array.isArray(sets) ? sets : []).reduce((max, setRow) => {
      const weight = Number(setRow?.weight || 0);
      return Number.isFinite(weight) && weight > max ? weight : max;
    }, 0);
    if (maxWeight > 0) maxByExercise[exerciseName] = maxWeight;
  });
  return maxByExercise;
}

function getWorkoutGapReminderIso(sessionDateIso) {
  const target = new Date(sessionDateIso);
  target.setUTCDate(target.getUTCDate() + 3);
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(target).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});

  const y = Number(dateParts.year);
  const m = Number(dateParts.month);
  const d = Number(dateParts.day);
  const roughUtc = new Date(Date.UTC(y, m - 1, d, 16, 0, 0));
  const tzPart = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(roughUtc).find(part => part.type === "timeZoneName")?.value || "GMT+0";
  const offsetMatch = tzPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const sign = offsetMatch?.[1] === "-" ? -1 : 1;
  const offsetHours = Number(offsetMatch?.[2] || 0);
  const offsetMinutes = Number(offsetMatch?.[3] || 0);
  const totalOffsetMinutes = sign * ((offsetHours * 60) + offsetMinutes);

  const utcMs = Date.UTC(y, m - 1, d, 16, 0, 0) - (totalOffsetMinutes * 60 * 1000);
  return new Date(utcMs).toISOString();
}

async function scheduleAutomatedNotificationsForSession({ userId, sessionRow, session, hasNewPr }) {
  const nowIso = new Date().toISOString();

  await sbPatch(
    "notification_queue?user_id=eq."
      + encodeURIComponent(userId)
      + "&type=eq.workout_gap_reminder&status=eq.pending",
    {
      status: "cancelled",
      cancelled_at: nowIso,
      updated_at: nowIso
    }
  );

  const workoutGapDedupeKey = `workout_gap_reminder:${userId}:${sessionRow.id}`;
  await sbPost("notification_queue?on_conflict=dedupe_key", [{
    user_id: userId,
    type: "workout_gap_reminder",
    title: "GymBuddy",
    body: "עברו כבר 3 ימים מהאימון האחרון — זמן לחזור למסלול",
    scheduled_for: getWorkoutGapReminderIso(session.date),
    dedupe_key: workoutGapDedupeKey,
    payload_json: {
      triggering_session_id: sessionRow.id,
      triggering_session_date: session.date
    },
    status: "pending"
  }]);

  if (!hasNewPr) return;

  const prDedupeKey = `pr_celebration:${userId}:${sessionRow.id}`;
  await sbPost("notification_queue?on_conflict=dedupe_key", [{
    user_id: userId,
    type: "pr_celebration",
    title: "GymBuddy",
    body: "שיא אישי חדש באימון האחרון — יש התקדמות אמיתית",
    scheduled_for: new Date(Date.now() + (60 * 60 * 1000)).toISOString(),
    dedupe_key: prDedupeKey,
    payload_json: {
      triggering_session_id: sessionRow.id,
      triggering_session_date: session.date
    },
    status: "pending"
  }]);
}

async function saveSessionToSupabase(session) {
  try {
    const userId = requireUserIdOrThrow("saveSessionToSupabase");
    const sessionExerciseMax = getSessionExerciseMaxMap(session);
    const historicalPrMaxByExercise = await getHistoricalPrMaxByExercise(userId, Object.keys(sessionExerciseMax));
    const hasNewPr = Object.entries(sessionExerciseMax).some(([exerciseName, sessionMax]) => {
      const previousMax = Number(historicalPrMaxByExercise[exerciseName] || 0);
      return Number(sessionMax) > previousMax;
    });

    const rows = await sbPost("workout_sessions", {
      user_id: userId,
      local_id: session.id,
      workout_id: session.workoutId,
      workout_name: getWorkout(session.workoutId)?.name || session.workoutId,
      date: session.date,
      note: session.note || ""
    });
    if (!Array.isArray(rows) || !rows.length || !rows[0]?.id) {
      throw new Error("Invalid workout_sessions write response");
    }
    const sessionRow = rows[0];
    const sets = [];
    Object.entries(session.exercises || {}).forEach(([exName, exSets]) => {
      exSets.forEach(s => {
        if (s.weight > 0 || s.reps > 0) {
          sets.push({
            user_id: userId,
            session_id: sessionRow.id,
            exercise_name: exName,
            set_number: s.num,
            weight: s.weight,
            reps: s.reps,
            failed: !!s.failed
          });
        }
      });
    });
    if (sets.length) await sbPost("session_exercises", sets);

    await scheduleAutomatedNotificationsForSession({ userId, sessionRow, session, hasNewPr });

    clearSyncError();
  } catch (e) {
    console.error("Supabase save failed:", e);
    setSyncError("האימון נשמר מקומית בלבד (סנכרון לענן נכשל)");
    throw e;
  }
}

async function loadSessionsFromSupabase() {
  try {
    const sessionQuery = "workout_sessions?select=*,sets:session_exercises(*),session_exercises(*)&order=date.asc";
    const rowsWithEmbed = await sbGet(sessionQuery);
    dlog("[loadSessionsFromSupabase] workout_sessions (embedded sets) raw response:", rowsWithEmbed);

    const rows = Array.isArray(rowsWithEmbed) ? rowsWithEmbed : [];
    let exerciseRows = [];
    try {
      exerciseRows = await sbGet("session_exercises?select=*");
    } catch (exerciseLoadErr) {
      if (DEBUG) {
        console.warn("Supabase session_exercises standalone fetch failed, using embedded relation only:", exerciseLoadErr);
      }
    }
    dlog("[loadSessionsFromSupabase] workout_sessions raw response:", rows);
    dlog("[loadSessionsFromSupabase] session_exercises raw response:", exerciseRows);

    const setsBySessionId = new Map();
    const getSetSessionKey = s => String(
      s.session_id ??
      s.workout_session_id ??
      s.workout_session ??
      s.session_local_id ??
      s.local_session_id ??
      ""
    );

    (exerciseRows || []).forEach(s => {
      const key = getSetSessionKey(s);
      if (!key) return;
      if (!setsBySessionId.has(key)) setsBySessionId.set(key, []);
      setsBySessionId.get(key).push(s);
    });

    const sessionIdSet = new Set(rows.map(r => String(r.id ?? "")).filter(Boolean));
    const sessionLocalIdSet = new Set(rows.map(r => String(r.local_id ?? "")).filter(Boolean));
    const unmatchedSessionExerciseRows = (exerciseRows || []).filter(s => {
      const sid = getSetSessionKey(s);
      if (!sid) return false;
      return !sessionIdSet.has(sid) && !sessionLocalIdSet.has(sid);
    });
    if (unmatchedSessionExerciseRows.length) {
      console.warn("[loadSessionsFromSupabase] Found session_exercises rows with non-matching FK (session_id/workout_session_id):", unmatchedSessionExerciseRows);
    }

    const hasUserIdFilter = /user_id=eq\./.test(sessionQuery);
    dlog("[loadSessionsFromSupabase] user_id filter in query:", hasUserIdFilter);

    const normalizeSet = s => ({
      num: Number(s.set_number ?? s.set_no ?? s.set_index ?? s.num ?? 0),
      weight: Number(s.weight ?? 0),
      reps: Number(s.reps ?? 0),
      failed: !!s.failed,
      minutes: Number(s.minutes ?? 0)
    });

    state.sessions = rows.map(row => {
      const exercises = {};
      const rowKeys = [row.id, row.local_id].filter(Boolean).map(v => String(v));
      const standaloneSets = rowKeys.flatMap(k => setsBySessionId.get(k) || []);
      const rowSets = [
        ...(Array.isArray(row.sets) ? row.sets : []),
        ...(Array.isArray(row.session_exercises) ? row.session_exercises : []),
        ...standaloneSets
      ];
      const uniqueSetMap = new Map();
      rowSets.forEach(s => {
        const dedupeKey = String(s.id ?? `${getSetSessionKey(s)}|${s.exercise_name ?? s.exercise?.name ?? s.exercise ?? s.name ?? ""}|${s.set_number ?? s.set_no ?? s.set_index ?? s.num ?? ""}|${s.weight ?? ""}|${s.reps ?? ""}|${s.minutes ?? ""}`);
        if (!uniqueSetMap.has(dedupeKey)) uniqueSetMap.set(dedupeKey, s);
      });

      [...uniqueSetMap.values()].forEach(rawSet => {
        const exName = rawSet.exercise_name ?? rawSet.exercise?.name ?? rawSet.exercise ?? rawSet.name;
        if (!exName) return;
        if (!exercises[exName]) exercises[exName] = [];
        exercises[exName].push(normalizeSet(rawSet));
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
    const sessionsWithoutExercises = state.sessions.filter(s => !Object.keys(s.exercises || {}).length).length;
    if (state.sessions.length && sessionsWithoutExercises === state.sessions.length) {
      console.warn("[loadSessionsFromSupabase] Sessions loaded but no exercise rows were mapped.");
    }
    localStorage.setItem(STORAGE_SESSIONS, JSON.stringify(state.sessions));
    setDataSource("sessions", "supabase");
  } catch (e) {
    console.error("Supabase load failed, using localStorage:", e);
    try {
      state.sessions = JSON.parse(localStorage.getItem(STORAGE_SESSIONS) || "[]");
    } catch {}
    setDataSource("sessions", "local");
    setSyncError("טעינת אימונים מהענן נכשלה — מוצגים נתונים מקומיים");
  }
}

async function deleteSessionFromSupabase(localId) {
  try {
    await sbDelete("workout_sessions?local_id=eq." + encodeURIComponent(localId));
  } catch (e) {
    console.error("Supabase delete failed:", e);
  }
}
