// ── home-ui.js ───────────────────────────────────────────────────

let _saveInProgressTimer = null;
function saveInProgressDebounced() {
  clearTimeout(_saveInProgressTimer);
  _saveInProgressTimer = setTimeout(saveInProgress, 300);
}

function saveInProgress() {
  if (state.workoutId) {
    localStorage.setItem("gym_in_progress", JSON.stringify({
      workoutId: state.workoutId,
      exercises: state.exercises,
      openExercise: state.openExercise,
      workoutExtras: state.workoutExtras || [],
      note: state.workoutNote || ""
    }));
  } else {
    localStorage.removeItem("gym_in_progress");
  }
}

function loadInProgress() {
  try {
    const s = localStorage.getItem("gym_in_progress");
    if (!s) return false;
    const data = JSON.parse(s);
    if (data.workoutId && getWorkout(data.workoutId)) {
      state.workoutId = data.workoutId;
      state.exercises = data.exercises;
      state.openExercise = data.openExercise;
      state.workoutExtras = data.workoutExtras || [];
      state.workoutNote = data.note || "";
      return true;
    }
  } catch (e) { console.warn("[loadInProgress] failed to restore in-progress workout from localStorage:", e); }
  return false;
}

function selectWorkoutDirect(id) {
  navigate("home");
  setTimeout(() => { selectWorkout(id); }, 50);
}

function renderChoose() {
  if (!state.workouts.length) return `<div style="padding:40px;text-align:center;color:var(--text-hint);font-size:14px">אין אימונים — הוסף דרך ניהול תוכנית</div>`;
  const cols = state.workouts.length <= 3 ? state.workouts.length : 2;
  return `<div style="padding:20px 16px">
    <p style="font-size:13px;color:var(--text-hint);margin-bottom:16px;text-align:center">איזה אימון היום?</p>
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px">
      ${state.workouts.map(w => {
        const last = getLastSession(w.id);
        return `<button class="choose-btn" onclick="selectWorkout('${w.id}')">
          <i data-lucide="dumbbell" style="width:24px;height:24px;color:var(--text-hint)"></i>
          <span style="font-size:18px;font-weight:700;color:var(--text-primary)">${w.name}</span>
          <span style="font-size:11px;color:var(--text-secondary);display:flex;align-items:center;gap:3px">
            <i data-lucide="clock" style="width:11px;height:11px"></i>
            ${last ? formatDate(last.date) : "לא בוצע עדיין"}
          </span>
          <span style="font-size:10px;color:var(--text-hint);text-align:center;line-height:1.6">${getExNames(w).join(" · ")}</span>
        </button>`;
      }).join("")}
    </div>
  </div>`;
}

function selectWorkout(id) {
  const inProgress = localStorage.getItem("gym_in_progress");
  if (inProgress) {
    const data = JSON.parse(inProgress);
    if (data.workoutId && data.workoutId !== id) {
      showConfirmSheet(
        "יש אימון בתהליך",
        `האם לבטל את ${getWorkout(data.workoutId)?.name || "האימון הקודם"} ולהתחיל ${getWorkout(id)?.name || ""}?`,
        "התחל חדש", "המשך קודם",
        () => { localStorage.removeItem("gym_in_progress"); _doSelectWorkout(id); },
        () => { _doSelectWorkout(data.workoutId); }
      );
      return;
    }
  }
  _doSelectWorkout(id);
}

function _doSelectWorkout(id) {
  haptic("medium");
  state.workoutId = id;
  const w = getWorkout(id); const last = getLastSession(id);
  const names = getExNames(w);
  state.exercises = {};
  state.workoutExtras = [];
  state.openExercise = names[0];
  names.forEach(name => {
    const prev = last?.exercises?.[name];
    state.exercises[name] = prev
      ? prev.map((s,i) => ({ num:i+1, weight:s.weight, reps:0 }))
      : [{num:1,weight:0,reps:0},{num:2,weight:0,reps:0},{num:3,weight:0,reps:0}];
  });
  render();
}

function toggleExercise(name) {
  state.openExercise = state.openExercise === name ? null : name;
  saveInProgress(); render();
}

function renderWorkout() {
  const w = getWorkout(state.workoutId);
  const names = getExNames(w);
  const last = getLastSession(state.workoutId);

  const allExtraNames = state.workoutExtras || [];
  const cards = [...names, ...allExtraNames].map(name => {
    const safeNameArg = encodeURIComponent(name);
    const safeNameText = escapeHtml(name);
    const sets = state.exercises[name] || [];
    const prevSets = last?.exercises?.[name] || null;
    const isOpen = state.openExercise === name;
    const improved = prevSets && sets.some((s,i) => prevSets[i] && s.weight > prevSets[i].weight);
    const hasData = sets.some(s => s.reps > 0);
    const curVol = calcVolume(sets); const prevVol = prevSets ? calcVolume(prevSets) : null;
    const volDiff = prevVol && curVol > 0 ? Math.round(((curVol-prevVol)/prevVol)*100) : null;
    const isExtra = (state.workoutExtras||[]).includes(name);
    const rest = isExtra ? 0 : getExRest(w, name);

    const statusDot = hasData
      ? `<span style="width:8px;height:8px;border-radius:50%;background:${improved?"var(--green)":"#6b7280"};flex-shrink:0"></span>`
      : `<span style="width:8px;height:8px;border-radius:50%;border:1.5px solid var(--border-med);flex-shrink:0"></span>`;

    const exCat = getExCategory(w, name) || getExCatByName(name);
    const catIconName = exCat ? getCategoryIcon(exCat) : null;
    const isCardio = exCat === "cardio";
    const header = `<div class="ex-header" onclick="toggleExercise(decodeURIComponent('${safeNameArg}'))">
      <div style="display:flex;align-items:center;gap:9px;min-width:0">
        ${statusDot}
        ${catIconName ? `<i data-lucide="${catIconName}" style="width:13px;height:13px;color:var(--text-hint);flex-shrink:0"></i>` : ""}
        <div style="min-width:0">
          <div style="font-weight:600;font-size:14px;color:var(--text-primary)">${safeNameText}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:2px;flex-wrap:wrap">
            ${(!isCardio && rest > 0) ? `<span class="rest-chip"><i data-lucide="timer" style="width:10px;height:10px"></i> ${formatRest(rest)}</span>` : ""}
            ${hasData ? `<span style="font-size:11px;color:var(--text-hint)">${sets.filter(s=>s.weight>0||s.reps>0).length} סטים</span>` : ""}
            ${volDiff !== null ? `<span class="badge ${volDiff>0?"badge-up":volDiff<0?"badge-down":"badge-eq"}" style="font-size:10px">${volDiff>0?"+":""}${volDiff}%</span>` : ""}
            ${improved ? `<span style="font-size:11px;color:var(--green);font-weight:600;display:flex;align-items:center;gap:2px"><i data-lucide="trending-up" style="width:11px;height:11px"></i> שיפרת</span>` : ""}
          </div>
        </div>
      </div>
      <i data-lucide="${isOpen?"chevron-up":"chevron-down"}" style="width:16px;height:16px;color:var(--text-hint);flex-shrink:0"></i>
    </div>`;

    if (!isOpen) return `<div class="card ${improved&&hasData?"improved":""}">${header}</div>`;

    const setsHtml = sets.map((s,i) => {
      const p = prevSets?.[i];
      const isLast = i === sets.length - 1;
      const isFailed = !!s.failed;

      if (isCardio) {
        const prevMin = p?.minutes || null;
        return `<div style="margin-bottom:${isLast?"8px":"14px"}">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="min-width:16px;font-size:12px;color:var(--text-hint);font-weight:600">${s.num}</span>
            <div style="flex:1">
              <input class="inp" type="number" inputmode="numeric" placeholder="${prevMin ? prevMin+" דק׳" : "דקות"}" value="${s.minutes||""}"
                oninput="updateSet(decodeURIComponent('${safeNameArg}'),${i},'minutes',this.value)"
                style="width:100%;text-align:center;font-size:15px">
            </div>
            <button onclick="removeSet(decodeURIComponent('${safeNameArg}'),${i})" class="icon-btn"><i data-lucide="x" style="width:16px;height:16px"></i></button>
          </div>
        </div>`;
      }

      const failedBtn = `<button type="button" onclick="toggleFailed(decodeURIComponent('${safeNameArg}'),${i})"
        style="height:32px;border-radius:8px;border:1px solid ${isFailed?"#fecaca":"var(--border-med)"};background:${isFailed?"#fee2e2":"var(--surface)"};color:${isFailed?"var(--red)":"var(--text-secondary)"};font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">
        ${isFailed ? "כשל" : "סמן"}
      </button>`;
      return `<div style="margin-bottom:${isLast?"8px":"14px"}">
        <div style="display:grid;grid-template-columns:20px minmax(0,1fr) 16px minmax(0,1fr) 56px;gap:6px;align-items:center;background:${isFailed?"#fef2f2":"transparent"};border:1px solid ${isFailed?"#fecaca":"transparent"};border-radius:10px;padding:6px">
          <span style="font-size:12px;color:${isFailed?"var(--red)":"var(--text-hint)"};font-weight:600;text-align:center">${s.num}</span>
          <input class="inp" type="number" inputmode="decimal" placeholder="${p?p.weight:"ק״ג"}" value="${s.weight||""}" style="${isFailed?"border-color:var(--red);color:var(--red)":s.weight>0?"":"color:var(--text-hint)"}" oninput="updateSet(decodeURIComponent('${safeNameArg}'),${i},'weight',this.value)">
          <span style="text-align:center;font-size:16px;color:${isFailed?"var(--red)":"var(--text-hint)"};line-height:1">×</span>
          <input class="inp" type="number" inputmode="numeric" placeholder="${p?p.reps+" חז׳":"חז׳"}" value="${s.reps||""}" style="${isFailed?"border-color:var(--red);color:var(--red)":""}" oninput="updateSet(decodeURIComponent('${safeNameArg}'),${i},'reps',this.value)">
          ${failedBtn}
        </div>
      </div>`;
    }).join("");

    const colHeaders = isCardio
      ? `<div style="display:flex;margin-bottom:12px">
          <span style="flex:0 0 24px"></span>
          <div style="flex:1;text-align:center;font-size:11px;color:var(--text-hint);font-weight:600">דקות</div>
          <span style="width:28px"></span>
        </div>`
      : `<div style="display:flex;margin-bottom:12px">
          <span style="flex:0 0 24px"></span>
          <div style="flex:1;display:flex;gap:6px;align-items:center;justify-content:center">
            <span style="flex:0 1 92px;text-align:center;font-size:11px;color:var(--text-hint);font-weight:600">משקל ק״ג</span>
            <span style="width:16px"></span>
            <span style="flex:0 1 92px;text-align:center;font-size:11px;color:var(--text-hint);font-weight:600">חזרות</span>
            <span style="width:56px;text-align:center;font-size:11px;color:var(--text-hint);font-weight:600">כשל</span>
          </div>
        </div>`;

    return `<div class="card ${improved&&hasData?"improved":""}">
      ${header}
      <div class="ex-body">
        ${last ? `<p style="font-size:11px;color:var(--text-hint);margin-bottom:10px;margin-top:10px;display:flex;align-items:center;gap:4px">
          <i data-lucide="clock" style="width:11px;height:11px"></i> אימון קודם: ${formatDate(last.date)}
        </p>` : ""}
        ${colHeaders}
        ${setsHtml}
        <button onclick="addSet(decodeURIComponent('${safeNameArg}'))" style="width:100%;background:var(--surface);border:1px dashed var(--border-med);border-radius:8px;padding:8px;cursor:pointer;font-size:13px;color:var(--text-secondary);font-family:inherit;display:flex;align-items:center;justify-content:center;gap:5px">
          <i data-lucide="plus" style="width:14px;height:14px"></i> ${isCardio ? "הוסף פעילות" : "הוסף סט"}
        </button>
      </div>
    </div>`;
  }).join("");

  const allNames = [...names, ...(state.workoutExtras || [])];
  const done = allNames.filter(n => state.exercises[n]?.some(s => s.reps>0||s.minutes>0)).length;

  return `<div style="padding:16px 14px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <button onclick="showCancelMenu()" style="background:none;border:none;cursor:pointer;padding:6px;color:var(--text-hint);display:flex;align-items:center;border-radius:8px">
        <i data-lucide="more-horizontal" style="width:20px;height:20px"></i>
      </button>
      <span style="font-weight:600;font-size:15px;color:var(--text-primary)">${escapeHtml(w.name)}</span>
      <span style="font-size:12px;color:var(--text-hint);background:var(--surface);padding:4px 10px;border-radius:20px">${done}/${allNames.length}</span>
    </div>
    ${cards}
    <button onclick="openWorkoutExtraPicker()" style="width:100%;background:var(--surface);border:1px dashed var(--border-med);border-radius:10px;padding:9px;cursor:pointer;font-size:13px;color:var(--text-secondary);font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:10px">
      <i data-lucide="plus" style="width:14px;height:14px"></i> הוסף תרגיל חד-פעמי לאימון זה
    </button>
    <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin:10px 0 8px;font-size:12px;color:var(--text-hint)">
      <i data-lucide="zap" style="width:13px;height:13px;color:var(--orange)"></i>
      <span>נפח כולל: <strong style="color:var(--text-primary)">${formatVolume(calcSessionVolume(state.exercises))}</strong></span>
    </div>
    <textarea id="workout-note-inp"
      placeholder="הערה לאימון (אופציונלי)..."
      oninput="state.workoutNote=this.value"
      style="width:100%;resize:none;height:64px;font-family:inherit;font-size:13px;color:var(--text-primary);background:var(--surface);border:1px solid var(--border-med);border-radius:10px;padding:10px 12px;outline:none;box-sizing:border-box;margin-bottom:8px;direction:rtl">${escapeHtml(state.workoutNote||"")}</textarea>
    <button class="btn-success" onclick="finishWorkout()" style="margin-top:0">
      <i data-lucide="check-circle" style="width:16px;height:16px"></i> סיום אימון
    </button>
  </div>`;
}

function updateSet(name,i,field,val) {
  const parsed = field==="weight" ? parseFloat(val)||0 : parseInt(val)||0;
  if (!state.exercises[name]?.[i]) return;
  state.exercises[name][i][field] = parsed;
  saveInProgressDebounced();
}
function getExCatByName(name) {
  for (const w of state.workouts) {
    const ex = w.exercises.find(e => (typeof e==="string"?e:e.name) === name);
    if (ex?.category) return ex.category;
  }
  const lib = state.exerciseLibrary.find(e => e.name === name);
  return lib?.category || null;
}
function addSet(name) {
  const sets = state.exercises[name];
  if (!Array.isArray(sets)) return;
  sets.push({ num:sets.length+1, weight:0, reps:0, failed:false });
  saveInProgressDebounced(); scheduleRender();
}
function removeSet(name,i) {
  const sets = state.exercises[name];
  if (!Array.isArray(sets)) return;
  sets.splice(i,1); sets.forEach((s,idx) => s.num=idx+1); saveInProgressDebounced(); scheduleRender();
}
function toggleFailed(name,i) {
  if (!state.exercises[name]?.[i]) return;
  state.exercises[name][i].failed = !state.exercises[name][i].failed; saveInProgressDebounced(); scheduleRender();
}

function finishWorkout() {
  if (document.getElementById("finish-sheet")) return; // already open
  const todayIso = new Date().toISOString().slice(0,10);

  document.getElementById("finish-sheet")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "finish-sheet";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:2000;";

  const sheet = document.createElement("div");
  sheet.style.cssText = "background:var(--card);border-radius:20px 20px 0 0;padding:24px 20px 32px;width:100%;direction:rtl;animation:slideUp 0.3s cubic-bezier(0.22,1,0.36,1) both;box-sizing:border-box;position:absolute;bottom:0;left:0;right:0;";
  sheet.innerHTML = `
    <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:18px">סיום אימון</div>
    <div style="margin-bottom:16px">
      <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:8px">תאריך האימון</label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button id="fs-date-today" style="padding:12px;border-radius:12px;border:2px solid var(--green);background:var(--green);color:#fff;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer">היום</button>
        <button id="fs-date-other" style="padding:12px;border-radius:12px;border:2px solid var(--border-med);background:var(--surface);color:var(--text-secondary);font-family:inherit;font-size:14px;font-weight:600;cursor:pointer">תאריך אחר</button>
      </div>
      <input type="date" id="session-date-inp" value="${todayIso}" max="${todayIso}"
        style="display:none;width:100%;margin-top:10px;font-family:inherit;font-size:15px;padding:11px 12px;border:1.5px solid var(--border-med);border-radius:12px;background:var(--surface);color:var(--text-primary);box-sizing:border-box;direction:ltr;text-align:center">
    </div>
    <button id="fs-save" style="width:100%;padding:14px;background:var(--green);color:#fff;border:none;border-radius:12px;cursor:pointer;font-size:15px;font-weight:700;font-family:inherit;margin-bottom:10px;display:flex;align-items:center;justify-content:center;gap:7px">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      שמור אימון
    </button>
    <button id="fs-cancel" style="width:100%;padding:14px;background:var(--surface);color:var(--text-secondary);border:1px solid var(--border-med);border-radius:12px;cursor:pointer;font-size:15px;font-family:inherit">המשך לערוך</button>
  `;

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", e => { if(e.target===overlay) overlay.remove(); });

  const dateInp = sheet.querySelector("#session-date-inp");
  const todayBtn = sheet.querySelector("#fs-date-today");
  const otherBtn = sheet.querySelector("#fs-date-other");

  function setFsDateActive(isToday) {
    todayBtn.style.background = isToday ? "var(--green)" : "var(--surface)";
    todayBtn.style.color = isToday ? "#fff" : "var(--text-secondary)";
    todayBtn.style.borderColor = isToday ? "var(--green)" : "var(--border-med)";
    otherBtn.style.background = !isToday ? "var(--accent)" : "var(--surface)";
    otherBtn.style.color = !isToday ? "#fff" : "var(--text-secondary)";
    otherBtn.style.borderColor = !isToday ? "var(--accent)" : "var(--border-med)";
    otherBtn.textContent = !isToday && dateInp.value ? formatDate(dateInp.value + "T12:00:00") : "תאריך אחר";
    dateInp.style.display = !isToday ? "block" : "none";
  }

  todayBtn.addEventListener("click", () => {
    dateInp.value = todayIso;
    setFsDateActive(true);
  });

  otherBtn.addEventListener("click", () => {
    dateInp.style.display = "block";
    dateInp.focus();
  });

  dateInp.addEventListener("change", () => {
    setFsDateActive(dateInp.value === todayIso);
  });

  sheet.querySelector("#fs-save").addEventListener("click", () => {
    const dateVal = sheet.querySelector("#session-date-inp").value;
    const now = new Date();
    const sessionDate = dateVal ? (() => {
      const d = new Date(dateVal + "T12:00:00");
      d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
      return d.toISOString();
    })() : now.toISOString();
    overlay.remove();
    const session = { id:"s_"+Date.now(), workoutId:state.workoutId, workoutName: getWorkout(state.workoutId)?.name || "", date:sessionDate, exercises:JSON.parse(JSON.stringify(state.exercises)), note: sanitizeText(state.workoutNote||"", 500) };
    state.sessions.push(session);
    state.sessions.sort((a,b) => new Date(a.date) - new Date(b.date));
    localStorage.removeItem("gym_in_progress");
    state.workoutNote = "";
    state.workoutId = null; state.exercises = {}; state.openExercise = null; state.selectedWorkoutId = null;
    saveSessions();
    saveSessionToSupabase(session).then(() => {
      showToast("נשמר ✓");
    }).catch(() => {
      showToast("האימון נשמר מקומית בלבד — סנכרון לענן נכשל ⚠️");
      render();
    });
    haptic("success");
    navigate("dashboard");
    setTimeout(() => showToast("כל הכבוד! האימון הושלם 💪"), 300);
  });

  sheet.querySelector("#fs-cancel").addEventListener("click", () => overlay.remove());
}

function cancelWorkout() {
  showConfirmSheet(
    "ביטול אימון",
    "האימון לא יישמר. בטוח?",
    "בטל אימון", "המשך",
    () => {
      haptic("light");
      localStorage.removeItem("gym_in_progress");
      state.workoutId = null; state.exercises = {}; state.openExercise = null; state.selectedWorkoutId = null;
      state.workoutNote = "";
      navigate("home");
    },
    null,
    true
  );
}

function showCancelMenu() {
  showConfirmSheet(
    "אפשרויות אימון",
    null,
    "בטל אימון", "המשך",
    () => cancelWorkout(),
    null,
    true
  );
}

function showConfirmSheet(title, subtitle, confirmLabel, cancelLabel, onConfirm, onCancel, isDanger) {
  document.getElementById("confirm-sheet")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "confirm-sheet";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:2000;display:flex;align-items:flex-end;justify-content:center";
  const sheet = document.createElement("div");
  sheet.style.cssText = "background:var(--card);border-radius:20px 20px 0 0;padding:24px 20px 32px;width:100%;max-width:420px;direction:rtl;animation:slideUp 0.3s cubic-bezier(0.22,1,0.36,1) both";
  sheet.innerHTML = `
    <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:${subtitle?"6px":"16px"}">${escapeHtml(title)}</div>
    ${subtitle ? `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:18px">${escapeHtml(subtitle)}</div>` : ""}
    <button id="cs-confirm" style="width:100%;padding:14px;background:${isDanger?"var(--red)":"var(--accent)"};color:#fff;border:none;border-radius:12px;cursor:pointer;font-size:15px;font-weight:700;font-family:inherit;margin-bottom:10px">${confirmLabel}</button>
    ${cancelLabel ? `<button id="cs-cancel" style="width:100%;padding:14px;background:var(--surface);color:var(--text-secondary);border:1px solid var(--border-med);border-radius:12px;cursor:pointer;font-size:15px;font-family:inherit">${cancelLabel}</button>` : ""}
  `;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", e => { if(e.target===overlay) overlay.remove(); });
  sheet.querySelector("#cs-confirm").addEventListener("click", () => { overlay.remove(); onConfirm && onConfirm(); });
  const cancelBtn = sheet.querySelector("#cs-cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", () => { overlay.remove(); onCancel && onCancel(); });
}

function exportCSV() {
  if (!state.sessions.length) { showToast("אין נתונים לייצוא"); return; }
  const rows = [["תאריך","אימון","תרגיל","סט","משקל","חזרות","כשל"]];
  state.sessions.forEach(session => {
    const w = getWorkout(session.workoutId);
    const wName = w ? w.name : (session.workoutName || session.workoutId);
    Object.entries(session.exercises||{}).forEach(([exName, sets]) => {
      sets.forEach(s => {
        if (s.weight > 0 || s.reps > 0) {
          rows.push([
            new Date(session.date).toLocaleDateString("he-IL"),
            wName, exName, s.num, s.weight, s.reps, s.failed ? "כן" : "לא"
          ]);
        }
      });
    });
  });
  const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(",")).join("\n");
  const blob = new Blob(["﻿"+csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "gym-tracker.csv"; a.click();
  URL.revokeObjectURL(url);
  showToast("הנתונים יוצאו בהצלחה ✓");
}

function exportData() {
  try {
    const data = {
      exportedAt: new Date().toISOString(),
      schemaVersion: window.APP_SCHEMA_VERSION || 1,
      sessions: state.sessions,
      weightLogs: state.weightLogs,
      weightGoal: state.weightGoal,
      workouts: state.workouts,
      settings: state.settings
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gymbuddy-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("הגיבוי הורד בהצלחה ✓");
  } catch (e) {
    console.error("Export failed:", e);
    showToast("שגיאה בייצוא נתונים ⚠️");
  }
}
