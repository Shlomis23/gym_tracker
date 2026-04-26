// ── manage-ui.js ─────────────────────────────────────────────────

function getCategoryIcon(catId) {
  return (CATEGORIES.find(c => c.id === catId) || CATEGORIES[CATEGORIES.length-1]).icon;
}
function getCategoryLabel(catId) {
  return (CATEGORIES.find(c => c.id === catId) || { label: "" }).label;
}
function getExCategory(w, name) {
  const ex = w.exercises.find(e => (typeof e==="string"?e:e.name) === name);
  return ex?.category || null;
}

function changeGoalTemp(delta) {
  const thisWeekIso = getWeekStart(new Date()).toISOString().slice(0,10);
  const currentWeekGoal = getGoalForWeek(thisWeekIso);
  const base = state.pendingGoal ?? currentWeekGoal;
  const next = Math.max(1, Math.min(7, base + delta));
  state.pendingGoal = next;
  const el = document.getElementById("goal-display");
  if (el) el.textContent = next;
  render();
}

function promptSaveGoal() {
  const newGoal = state.pendingGoal;

  const thisWeekStart = getWeekStart(new Date());
  const thisWeekIso = thisWeekStart.toISOString().slice(0,10);

  const currentWeekGoal = getGoalForWeek(thisWeekIso);

  if (newGoal == null || newGoal === currentWeekGoal) return;

  const nextWeekStart = new Date(thisWeekStart.getTime() + 7 * 86400000);
  const nextWeekIso = nextWeekStart.toISOString().slice(0,10);

  showConfirmSheet(
    `עדכון יעד ל-${newGoal} אימונים`,
    "מאיזה שבוע לתחיל?",
    "החל מהשבוע הנוכחי",
    "החל משבוע הבא",
    () => { applyGoal(newGoal, thisWeekIso); },
    () => { applyGoal(newGoal, nextWeekIso); }
  );
}

function applyGoal(newGoal, fromIso) {
  const thisWeekIso = getWeekStart(new Date()).toISOString().slice(0,10);
  const currentWeekGoalBefore = getGoalForWeek(thisWeekIso);

  state.pendingGoal = null;
  if (!state.settings.goalHistory) state.settings.goalHistory = [];
  state.settings.goalHistory = state.settings.goalHistory.filter(e => e.from !== fromIso);
  state.settings.goalHistory.push({ goal: newGoal, from: fromIso });

  state.settings.weeklyGoal = fromIso <= thisWeekIso ? newGoal : currentWeekGoalBefore;

  saveSettings();
  haptic("medium");
  showToast(fromIso <= thisWeekIso ? "היעד השבועי עודכן ✓" : "היעד נשמר לשבוע הבא ✓");
  render();
}

function toggleManageOpen(id) { state.manageOpenId = state.manageOpenId===id ? null : id; state.editingNameId=null; state.editingExKey=null; render(); }
function startEditName(id) {
  state.editingNameId=id; if(state.manageOpenId!==id) state.manageOpenId=id;
  render(); setTimeout(()=>{ const inp=document.getElementById("name-inp-"+id); if(inp){inp.focus();inp.select();} },30);
}
function saveWorkoutName(id) {
  const inp=document.getElementById("name-inp-"+id); const val=sanitizeText(inp?inp.value:"", 80);
  if(val){ const w=getWorkout(id); if(w) w.name=val; saveWorkouts(); }
  state.editingNameId=null; render();
}
function addWorkout() {
  const inp=document.getElementById("new-workout-name"); const name=sanitizeText(inp?inp.value:"", 80);
  if(!name) return;
  const newWorkout = addWorkoutToState(name);
  state.manageOpenId=newWorkout.id;
  state.editingNameId=null; saveWorkouts(); render();
}
function deleteWorkout(id) {
  if(!confirm("למחוק את האימון לצמיתות?")) return;
  removeWorkoutFromState(id);
  if(state.manageOpenId===id) state.manageOpenId=null;
  saveWorkouts(); render();
}
function addExercise(workoutId) {
  const inp=document.getElementById("new-ex-"+workoutId); const val=sanitizeText(inp?inp.value:"", 80);
  const restInp=document.getElementById("new-rest-"+workoutId);
  const rest=restInp?parseInt(restInp.value)||60:60;
  const catEl=document.getElementById("new-cat-"+workoutId);
  const category=catEl?catEl.value||null:null;
  if(!val) return; const w=getWorkout(workoutId);
  if(addExerciseToWorkoutState(w, val, rest, category)){
    saveWorkouts(); render();
    addToLibrary(val, category);
  }
}
function removeExercise(workoutId,i) {
  const w=getWorkout(workoutId);
  if(!w) return;
  if(w.exercises.length === 1) {
    if(confirm("אם תמחק תרגיל זה, האימון יישאר ריק. האם למחוק את האימון לגמרי?")) {
      removeWorkoutFromState(workoutId);
      if(state.manageOpenId === workoutId) state.manageOpenId = null;
      saveWorkouts(); render();
    }
    return;
  }
  removeExerciseFromWorkoutState(w, i); saveWorkouts(); render();
}
function updateExRest(workoutId,i,val) {
  const w=getWorkout(workoutId);
  if(updateExerciseRestInWorkoutState(w, i, val)){ saveWorkouts(); }
}
function updateExField(workoutId,i,field,val) {
  const w=getWorkout(workoutId);
  if(updateExerciseFieldInWorkoutState(w, i, field, val)) saveWorkouts();
}

function renderManage() {
  const weightGoalValues = getWeightGoalValues(state.weightGoal);
  const weightGoalMode = (typeof getWeightGoalMode === "function") ? getWeightGoalMode(state.weightGoal) : "maintain";
  const weightGoalModeLabel = weightGoalMode === "cut" ? "חיטוב" : (weightGoalMode === "lean_bulk" ? "מסה נקייה" : "תחזוקה");
  const workoutSections = state.workouts.map(w => {
    const isOpen = state.manageOpenId === w.id;
    const isEditing = state.editingNameId === w.id;
    const nameEl = isEditing
      ? `<input class="name-edit-inp" id="name-inp-${w.id}" value="${w.name}"
           onblur="saveWorkoutName('${w.id}')"
           onkeydown="if(event.key==='Enter')saveWorkoutName('${w.id}');if(event.key==='Escape'){state.editingNameId=null;render();}">`
      : `<span style="font-weight:700;font-size:15px;color:var(--text-primary)">${w.name}</span>
         <button onclick="event.stopPropagation();startEditName('${w.id}')" class="icon-btn" style="margin-right:4px">
           <i data-lucide="pencil" style="width:13px;height:13px"></i>
         </button>`;
    const exRows = isOpen ? `<div id="drag-list-${w.id}">${w.exercises.map((ex,i) => {
      const name = typeof ex === "string" ? ex : ex.name;
      const rest = typeof ex === "string" ? 60 : (ex.rest||60);
      const cat = ex.category || "";
      const catIcon = cat ? getCategoryIcon(cat) : "grip-vertical";
      const isEditingEx = state.editingExKey === w.id+":"+i;
      if (isEditingEx) {
        const catLabel = cat ? (CATEGORIES.find(c=>c.id===cat)?.label || cat) : "ללא קטגוריה";
        return `<div class="ex-row-drag" data-wid="${w.id}" data-idx="${i}"
          style="padding:10px 0;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;gap:6px;align-items:center">
            <span class="drag-handle"><i data-lucide="grip-vertical" style="width:14px;height:14px"></i></span>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${escapeHtml(name)}</div>
              <div style="font-size:11px;color:var(--text-hint);margin-top:1px">${escapeHtml(catLabel)}</div>
            </div>
            <i data-lucide="lock" style="width:12px;height:12px;color:var(--border-med)"></i>
          </div>
          <div style="display:flex;gap:6px;align-items:center;padding-right:22px">
            <i data-lucide="timer" style="width:13px;height:13px;color:var(--orange);flex-shrink:0"></i>
            <span style="font-size:12px;color:var(--text-secondary)">זמן מנוחה:</span>
            <input type="number" value="${rest}" min="15" max="600" step="15"
              onchange="updateExField('${w.id}',${i},'rest',this.value)"
              style="width:60px;text-align:center;font-size:13px;font-family:inherit;background:var(--surface);border:1px solid var(--border-med);border-radius:6px;padding:5px 4px;color:var(--text-primary);outline:none">
            <span style="font-size:11px;color:var(--text-hint)">שנ׳</span>
            <button onclick="state.editingExKey=null;render()" style="margin-right:auto;background:var(--green-bg);border:1px solid #86efac;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:11px;font-weight:600;color:var(--green);font-family:inherit">סיום</button>
          </div>
        </div>`;
      }
      return `<div class="ex-row-drag" draggable="true" data-wid="${w.id}" data-idx="${i}"
        style="display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--border)">
        <span class="drag-handle"><i data-lucide="grip-vertical" style="width:14px;height:14px"></i></span>
        <i data-lucide="${catIcon}" style="width:13px;height:13px;color:var(--text-hint);flex-shrink:0"></i>
        <span style="flex:1;font-size:14px;color:var(--text-primary)">${escapeHtml(name)}</span>
        <span style="font-size:10px;color:var(--text-hint);background:var(--surface);padding:2px 6px;border-radius:4px;white-space:nowrap">${rest}שנ׳</span>
        <button onclick="event.stopPropagation();state.editingExKey='${w.id}:${i}';render()" class="icon-btn">
          <i data-lucide="pencil" style="width:13px;height:13px"></i>
        </button>
        <button onclick="removeExercise('${w.id}',${i})" class="icon-btn" style="color:var(--red)">
          <i data-lucide="x" style="width:16px;height:16px"></i>
        </button>
      </div>`;
    }).join("")}</div>` : "";
    const addRow = isOpen ? `
      <div style="margin-top:12px">
        <button onclick="openExercisePicker('${w.id}')"
          style="width:100%;background:var(--surface);border:1px dashed var(--border-med);border-radius:10px;padding:10px;cursor:pointer;font-size:13px;color:var(--text-secondary);font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px">
          <i data-lucide="plus" style="width:15px;height:15px"></i> הוסף תרגיל
        </button>
      </div>` : "";
    const wIdx = state.workouts.indexOf(w);
    return `<div class="card workout-drag" draggable="true" data-wid="${w.id}" data-widx="${wIdx}" style="padding:0;overflow:hidden;margin-bottom:10px">
      <div class="workout-header" onclick="toggleManageOpen('${w.id}')">
        <div style="display:flex;align-items:center;gap:6px" onclick="event.stopPropagation()">
          <span class="drag-handle workout-drag-handle" onclick="event.stopPropagation()" style="cursor:grab;color:var(--text-hint);display:flex;align-items:center;padding:0 2px">
            <i data-lucide="grip-vertical" style="width:15px;height:15px"></i>
          </span>
          ${nameEl}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;color:var(--text-hint)">${w.exercises.length} תרגילים</span>
          <button onclick="event.stopPropagation();deleteWorkout('${w.id}')" class="del-btn">
            <i data-lucide="trash-2" style="width:15px;height:15px"></i>
          </button>
          <i data-lucide="${isOpen?"chevron-up":"chevron-down"}" style="width:16px;height:16px;color:var(--text-hint)"></i>
        </div>
      </div>
      ${isOpen ? `<div style="padding:0 14px 14px">${exRows}${addRow}</div>` : ""}
    </div>`;
  }).join("");

  return `<div style="padding:14px">
    <div class="card" style="padding:14px 16px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:12px">
        <i data-lucide="target" style="width:15px;height:15px;color:var(--text-secondary)"></i>
        <span style="font-weight:700;font-size:14px;color:var(--text-primary)">עדכון יעד אימונים</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <span style="font-size:13px;color:var(--text-secondary)">אימונים בשבוע:</span>
        <div style="display:flex;align-items:center;gap:8px">
          <button onclick="changeGoalTemp(-1)" style="width:32px;height:32px;background:var(--surface);border:1px solid var(--border-med);border-radius:8px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;color:var(--text-primary)">−</button>
          <span style="font-size:20px;font-weight:700;color:var(--text-primary);min-width:24px;text-align:center" id="goal-display">${state.pendingGoal ?? getGoalForWeek(getWeekStart(new Date()).toISOString().slice(0,10))}</span>
          <button onclick="changeGoalTemp(1)" style="width:32px;height:32px;background:var(--surface);border:1px solid var(--border-med);border-radius:8px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;color:var(--text-primary)">+</button>
        </div>
      </div>
      ${(state.pendingGoal != null && state.pendingGoal !== getGoalForWeek(getWeekStart(new Date()).toISOString().slice(0,10))) ? `
      <button onclick="promptSaveGoal()" style="width:100%;padding:10px;background:var(--accent);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px">
        <i data-lucide="check" style="width:15px;height:15px"></i> שמור יעד (${state.pendingGoal} אימונים)
      </button>` : ""}
    </div>

    <div class="card" style="padding:14px 16px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:10px">
        <i data-lucide="weight" style="width:15px;height:15px;color:var(--text-secondary)"></i>
        <span style="font-weight:700;font-size:14px;color:var(--text-primary)">עדכון יעד משקל ומשקל התחלתי</span>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;line-height:1.5">
        ${hasWeightGoal(state.weightGoal)
          ? `<span style="display:inline-flex;gap:4px;align-items:center;direction:ltr;unicode-bidi:isolate"><span>התחלתי: ${weightGoalValues.start.toFixed(1)}</span><span aria-hidden="true">→</span><span>יעד: ${weightGoalValues.target.toFixed(1)} ק״ג</span></span><br><span style="font-size:11px;color:var(--text-hint)">מצב יעד: ${weightGoalModeLabel}</span>`
          : "לא הוגדר יעד משקל עדיין"}
      </div>
      <button onclick="showGoalModal()" style="width:100%;padding:10px;background:var(--surface);color:var(--text-secondary);border:1px solid var(--border-med);border-radius:10px;cursor:pointer;font-size:13px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px">
        <i data-lucide="pencil" style="width:15px;height:15px"></i> ${hasWeightGoal(state.weightGoal) ? "ערוך יעד משקל" : "הוסף יעד משקל"}
      </button>
    </div>

    <div class="card" style="padding:14px 16px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:10px">
        <i data-lucide="bell" style="width:15px;height:15px;color:var(--text-secondary)"></i>
        <span style="font-weight:700;font-size:14px;color:var(--text-primary)">התראות</span>
      </div>
      <div style="font-size:12px;color:var(--text-hint);margin-bottom:10px" id="push-status-text">${getNotificationStatusText()}</div>
      <div style="display:grid;grid-template-columns:1fr;gap:8px">
        ${Notification.permission === "denied"
          ? `<div style="font-size:12px;color:var(--red);background:var(--surface);border:1px solid var(--border-med);border-radius:10px;padding:10px;text-align:center;line-height:1.6">
               ההרשאה נחסמה ← יש לאפשר ידנית:<br>
               <strong>הגדרות iOS ← [שם האפליקציה] ← התראות ← אפשר</strong>
             </div>`
          : `<button onclick="enablePushNotifications()" ${state.notificationBusy ? "disabled" : ""} style="width:100%;padding:10px;background:var(--surface);color:var(--text-secondary);border:1px solid var(--border-med);border-radius:10px;cursor:pointer;font-size:13px;font-family:inherit">הפעל התראות</button>`
        }
        <button onclick="sendTestPushNotification()" ${state.notificationTestBusy ? "disabled" : ""} style="width:100%;padding:10px;background:var(--accent);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:13px;font-family:inherit">שלח התראת בדיקה</button>
      </div>
    </div>

    <div class="card" style="padding:14px 16px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:10px">
        <span style="font-size:15px;line-height:1">✈️</span>
        <span style="font-weight:700;font-size:14px;color:var(--text-primary)">קשר לבוט טלגרם</span>
      </div>
      <div style="font-size:12px;color:var(--text-hint);margin-bottom:10px">${state.telegramLinked ? '<span style="color:var(--green)">מחובר ✓</span>' : 'לא מחובר'}</div>
      <button onclick="openTelegramLinkSheet()" style="width:100%;padding:10px;background:var(--surface);color:var(--text-secondary);border:1px solid var(--border-med);border-radius:10px;cursor:pointer;font-size:13px;font-family:inherit">צור קישור</button>
    </div>

    <div class="card" style="padding:14px 16px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:10px">
        <i data-lucide="smartphone" style="width:15px;height:15px;color:var(--text-secondary)"></i>
        <span style="font-weight:700;font-size:14px;color:var(--text-primary)">העברת חשבון למכשיר / דפדפן אחר</span>
      </div>
      <div style="font-size:12px;color:var(--text-hint);margin-bottom:10px;line-height:1.5">
        לסנכרון נתונים בין Safari ל-PWA: צור קוד במכשיר אחד והזן אותו בשני
      </div>
      ${state.transferCode ? `
        <div style="background:var(--surface);border:1px solid var(--border-med);border-radius:10px;padding:12px;text-align:center;margin-bottom:8px">
          <div style="font-size:11px;color:var(--text-hint);margin-bottom:4px">קוד ההעברה שלך</div>
          <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:var(--text-primary);font-variant-numeric:tabular-nums;direction:ltr">${state.transferCode}</div>
          <div style="font-size:11px;color:var(--text-hint);margin-top:4px" id="transfer-code-timer">פג תוקף בעוד ${getTransferCodeCountdown()}</div>
        </div>
      ` : `
        <button onclick="generateTransferCode()" style="width:100%;padding:10px;background:var(--accent);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:13px;font-family:inherit;margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:6px">
          <i data-lucide="share-2" style="width:15px;height:15px"></i> צור קוד העברה
        </button>
      `}
      <div style="display:flex;gap:8px">
        <input id="transfer-code-input" class="inp inp-text" placeholder="הזן קוד 6 ספרות" maxlength="6" inputmode="numeric" style="flex:1;text-align:center;letter-spacing:4px;font-size:16px;direction:ltr">
        <button onclick="redeemTransferCode()" style="padding:0 16px;background:var(--surface);color:var(--text-secondary);border:1px solid var(--border-med);border-radius:10px;cursor:pointer;font-size:13px;font-family:inherit;white-space:nowrap">כנס</button>
      </div>
    </div>

    <div class="card" style="padding:14px 16px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:10px">
        <i data-lucide="download" style="width:15px;height:15px;color:var(--text-secondary)"></i>
        <span style="font-weight:700;font-size:14px;color:var(--text-primary)">גיבוי וייצוא</span>
      </div>
      <div style="font-size:12px;color:var(--text-hint);margin-bottom:10px">הורד את כל הנתונים שלך כקובץ JSON</div>
      <button onclick="exportData()" style="width:100%;padding:10px;background:var(--surface);color:var(--text-secondary);border:1px solid var(--border-med);border-radius:10px;cursor:pointer;font-size:13px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px">
        <i data-lucide="download" style="width:15px;height:15px"></i> ייצוא נתונים (JSON)
      </button>
    </div>

    <div style="display:flex;align-items:center;gap:7px;margin-bottom:10px;padding:0 2px">
      <i data-lucide="dumbbell" style="width:15px;height:15px;color:var(--text-secondary)"></i>
      <span style="font-weight:700;font-size:14px;color:var(--text-primary)">אימונים ותרגילים</span>
    </div>
    ${workoutSections}

    <div style="padding:14px 16px;background:var(--card);border:1px solid var(--border);border-radius:14px">
      <p style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:10px;display:flex;align-items:center;gap:5px">
        <i data-lucide="plus-circle" style="width:14px;height:14px"></i> הוסף אימון חדש
      </p>
      <div style="display:flex;gap:8px">
        <input class="inp inp-text" id="new-workout-name" placeholder='למשל "אימון C"' style="flex:1">
        <button onclick="addWorkout()" style="padding:0 16px;background:var(--accent);border:none;border-radius:8px;cursor:pointer;font-size:14px;color:#fff;font-family:inherit;white-space:nowrap;display:flex;align-items:center;gap:5px">
          <i data-lucide="plus" style="width:16px;height:16px"></i> הוסף
        </button>
      </div>
    </div>
    <button onclick="navigate('library')" style="width:100%;margin-top:12px;padding:13px 16px;background:var(--card);border:1px solid var(--border);border-radius:14px;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:10px;text-align:right">
      <i data-lucide="library" style="width:18px;height:18px;color:var(--text-secondary);flex-shrink:0"></i>
      <div style="flex:1">
        <div style="font-size:14px;font-weight:600;color:var(--text-primary)">ניהול מאגר תרגילים</div>
        <div style="font-size:11px;color:var(--text-hint);margin-top:2px">${state.exerciseLibrary.length} תרגילים במאגר</div>
      </div>
      <i data-lucide="chevron-left" style="width:16px;height:16px;color:var(--text-hint)"></i>
    </button>
  </div>`;
}

function getNotificationStatusText() {
  if (!("Notification" in window)) return "התראות לא פעילות";
  if (Notification.permission === "denied") return "ההרשאה נדחתה";
  if (Notification.permission === "default") return "ממתין להרשאה";
  if (Notification.permission === "granted" && state.pushSubscriptionActive) return "התראות פעילות";
  return "התראות לא פעילות";
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

function detectPlatform() {
  const ua = (navigator.userAgent || "").toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
}

async function syncPushSubscriptionState() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    state.pushSubscriptionActive = !!subscription;
  } catch (_) {
    state.pushSubscriptionActive = false;
  }
}

async function savePushSubscriptionToSupabase(subscription) {
  const userId = requireUserIdOrThrow("savePushSubscriptionToSupabase");
  const keys = subscription.toJSON().keys || {};
  const nowIso = new Date().toISOString();

  // בטל סאבסקריפשנים ישנים של אותו משתמש (endpoint שונה) — כדי שרק המכשיר הנוכחי יקבל התראות
  await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${userId}&endpoint=neq.${encodeURIComponent(subscription.endpoint)}&is_active=eq.true`,
    { method: "PATCH", headers: SB_HEADERS, body: JSON.stringify({ is_active: false, updated_at: nowIso }) }
  ).catch(() => {}); // לא קריטי אם נכשל

  const payload = [{
    user_id: userId,
    endpoint: subscription.endpoint,
    p256dh: keys.p256dh || "",
    auth: keys.auth || "",
    user_agent: navigator.userAgent || null,
    platform: detectPlatform(),
    is_active: true,
    updated_at: nowIso,
    last_seen_at: nowIso
  }];
  const headers = { ...SB_HEADERS, Prefer: "return=representation,resolution=merge-duplicates" };
  const res = await fetch(SUPABASE_URL + "/rest/v1/push_subscriptions?on_conflict=endpoint", {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function enablePushNotifications() {
  if (state.notificationBusy) return;
  state.notificationBusy = true;
  render();
  try {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      showToast("התראות לא נתמכות בדפדפן זה");
      return;
    }

    let permission = Notification.permission;
    if (permission === "denied") {
      showToast("יש לאפשר התראות ידנית בהגדרות iOS ← [שם האפליקציה] ← התראות");
      render();
      return;
    }
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") {
      render();
      return;
    }

    if (!VAPID_PUBLIC_KEY) {
      showToast("חסר VAPID_PUBLIC_KEY");
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    // בטל תמיד סאבסקריפשן קיים כדי לקבל endpoint רענן מ-Apple
    const existing = await registration.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });

    await savePushSubscriptionToSupabase(subscription);
    state.pushSubscriptionActive = true;
    showToast("התראות הופעלו ✓");
  } catch (e) {
    console.error("Enable push failed:", e);
    showToast("שגיאה בהפעלת התראות ⚠️");
  } finally {
    state.notificationBusy = false;
    render();
  }
}

async function sendTestPushNotification() {
  if (state.notificationTestBusy) return;
  state.notificationTestBusy = true;
  render();
  try {
    const userId = requireUserIdOrThrow("sendTestPushNotification");
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription?.endpoint) throw new Error("No current device subscription");

   const res = await fetch("https://jezibgdemidhebbcpdch.supabase.co/functions/v1/send-test-push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY
      },
      body: JSON.stringify({ user_id: userId, endpoint: subscription.endpoint })
    });
    if (!res.ok) throw new Error(await res.text());
    showToast("התראת בדיקה נשלחה ✓");
  } catch (e) {
    console.error("Test push failed:", e);
    showToast("שליחת התראת בדיקה נכשלה ⚠️");
  } finally {
    state.notificationTestBusy = false;
    render();
  }
}

async function openTelegramLinkSheet() {
  const existing = document.getElementById("tg-link-modal");
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement("div");
  overlay.id = "tg-link-modal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:3000;display:flex;align-items:flex-end;justify-content:center";

  const sheet = document.createElement("div");
  sheet.style.cssText = "background:var(--card);border-radius:22px 22px 0 0;padding:24px 20px 32px;width:100%;max-width:430px;box-sizing:border-box;direction:rtl;animation:slideUp 0.28s ease both";
  sheet.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
      <div style="font-size:17px;font-weight:800;color:var(--text-primary)">קשר לבוט טלגרם</div>
      <button id="tg-close" style="width:32px;height:32px;border:none;background:var(--surface);border-radius:999px;cursor:pointer;color:var(--text-hint);font-size:20px;display:flex;align-items:center;justify-content:center">×</button>
    </div>
    <div id="tg-sheet-body" style="text-align:center;padding:24px;color:var(--text-hint);font-size:13px">יוצר קישור...</div>
  `;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  sheet.querySelector("#tg-close").addEventListener("click", () => overlay.remove());

  try {
    const userId = requireUserIdOrThrow("openTelegramLinkSheet");

    // יצירת קוד דרך Edge Function (מתחמק מ-RLS)
    const res = await fetch(SUPABASE_URL + "/functions/v1/create-telegram-code", {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY },
      body: JSON.stringify({ user_id: userId })
    });
    if (!res.ok) throw new Error(await res.text());
    const { code } = await res.json();
    if (!code) throw new Error("No code returned");

    const tgUrl = `https://t.me/GymBuddyIL_bot?start=${code}`;
    const body = sheet.querySelector("#tg-sheet-body");
    body.innerHTML = `
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;line-height:1.6;text-align:right">
        לחץ על הכפתור כדי לפתוח את הבוט ולקשר את החשבון
      </div>
      <a id="tg-open-btn" href="${tgUrl}" target="_blank" rel="noopener"
         style="display:block;width:100%;padding:14px;background:var(--accent);color:#fff;border:none;border-radius:14px;cursor:pointer;font-size:16px;font-weight:700;font-family:inherit;text-decoration:none;box-sizing:border-box;margin-bottom:12px;text-align:center">
        פתח בטלגרם 📱
      </a>
      <div style="font-size:11px;color:var(--text-hint);margin-bottom:16px;text-align:right">הקישור תקף ל-10 דקות</div>
      <button id="tg-close2" style="width:100%;padding:13px;background:var(--surface);color:var(--text-secondary);border:1.5px solid var(--border-med);border-radius:14px;font-family:inherit;font-size:14px;cursor:pointer">סגור</button>
    `;
    body.querySelector("#tg-open-btn").addEventListener("click", () => {
      setTimeout(() => {
        document.getElementById("tg-link-modal")?.remove();
      }, 2000);
    });
    body.querySelector("#tg-close2").addEventListener("click", () => overlay.remove());
  } catch (e) {
    console.error("Telegram link failed:", e);
    const body = sheet.querySelector("#tg-sheet-body");
    if (body) body.innerHTML = `<div style="color:var(--red);font-size:13px;text-align:center;padding:16px">שגיאה ביצירת קישור ⚠️</div>`;
  }
}

function showExerciseGraph(exName) {
  document.getElementById("ex-graph-modal")?.remove();
  const dataPoints = [];
  state.sessions.forEach(session => {
    const sets = session.exercises?.[exName];
    if (!sets || !sets.length) return;
    const maxW = Math.max(...sets.map(s => s.weight || 0));
    if (maxW > 0) dataPoints.push({ date: session.date, weight: maxW });
  });
  if (!dataPoints.length) { showToast("אין נתונים לתרגיל זה"); return; }

  const overlay = document.createElement("div");
  overlay.id = "ex-graph-modal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:flex-end;justify-content:center";

  const maxW = Math.max(...dataPoints.map(d => d.weight));
  const minW = Math.min(...dataPoints.map(d => d.weight));
  const pad = 40; const W = 340; const H = 180; const gH = H - pad*0.8;

  const pts = dataPoints.map((d, i) => {
    const x = pad + (i / Math.max(dataPoints.length - 1, 1)) * (W - pad*1.5);
    const y = pad*0.4 + (1 - (d.weight - minW) / Math.max(maxW - minW, 1)) * gH;
    return { x, y, ...d };
  });

  const polyline = pts.map(p => `${p.x},${p.y}`).join(" ");
  const areaPath = `M${pts[0].x},${H} ` + pts.map(p=>`L${p.x},${p.y}`).join(" ") + ` L${pts[pts.length-1].x},${H} Z`;

  const dots = pts.map((p,i) => {
    const isFirst = i === 0;
    const isLast = i === pts.length - 1;
    const isPR = p.weight === maxW;
    const showLabel = isFirst || isLast || isPR || pts.length <= 6;
    const anchor = isFirst ? "start" : isLast ? "end" : "middle";
    const labelColor = isPR ? "#15803d" : "#111827";
    const labelY = p.y > 28 ? p.y - 10 : p.y + 20;
    return `
      <circle cx="${p.x}" cy="${p.y}" r="${isPR ? 5 : 4}" fill="${isPR ? "#15803d" : "#111827"}" stroke="#fff" stroke-width="2"/>
      ${showLabel ? `<text x="${p.x}" y="${labelY}" text-anchor="${anchor}" font-size="11" font-weight="700" fill="${labelColor}">${p.weight}</text>` : ""}
    `;
  }).join("");

  const labels = pts.filter((_,i) => i===0 || i===pts.length-1 || pts.length<=5).map(p =>
    `<text x="${p.x}" y="${H+14}" text-anchor="middle" font-size="10" fill="#9ca3af">${new Date(p.date).toLocaleDateString("he-IL",{day:"numeric",month:"numeric"})}</text>`
  ).join("");

  const sheet = document.createElement("div");
  sheet.style.cssText = "background:var(--card);border-radius:20px 20px 0 0;padding:20px 20px 32px;width:100%;max-width:420px;direction:rtl;animation:slideUp 0.3s cubic-bezier(0.22,1,0.36,1) both";
  sheet.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-size:16px;font-weight:700;color:var(--text-primary)">${escapeHtml(exName)}</div>
        <div style="font-size:12px;color:var(--text-hint);margin-top:2px">שיא: ${maxW} ק"ג · ${dataPoints.length} אימונים</div>
      </div>
      <button onclick="document.getElementById('ex-graph-modal').remove()" style="background:var(--surface);border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:18px;color:var(--text-hint);display:flex;align-items:center;justify-content:center">×</button>
    </div>
    <svg viewBox="0 0 ${W} ${H+20}" width="100%" style="overflow:visible">
      <defs>
        <linearGradient id="gfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#111827" stop-opacity="0.12"/>
          <stop offset="100%" stop-color="#111827" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#gfill)"/>
      <polyline points="${polyline}" fill="none" stroke="#111827" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
      ${labels}
    </svg>
  `;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", e => { if(e.target===overlay) overlay.remove(); });
}

function openWorkoutExtraPicker(resetTarget = true) {
  if (resetTarget) state.libraryPickerTargetWorkoutId = null;
  document.getElementById("ex-picker-modal")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "ex-picker-modal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:flex-end;justify-content:center";

  const CAT_ORDER_EX = ["chest","back","shoulders","arms","legs","core","cardio"];
  const byCategory = {};
  state.exerciseLibrary.forEach(ex => {
    const cat = ex.category || "other";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(ex);
  });

  let listHtml = CAT_ORDER_EX.filter(cat => byCategory[cat]).map(cat => {
    const catData = CATEGORIES.find(c => c.id === cat);
    const catLabel = catData ? catData.label : cat;
    const catIcon = catData ? catData.icon : "more-horizontal";
    const items = byCategory[cat].map(ex => `
      <div class="ex-pick-item" data-name="${escapeHtml(ex.name)}" data-cat="${escapeHtml(ex.category||"")}"
        style="display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;border-bottom:0.5px solid var(--border)">
        <span style="flex:1;font-size:14px;color:var(--text-primary)">${escapeHtml(ex.name)}</span>
        <i data-lucide="chevron-left" style="width:14px;height:14px;color:var(--text-hint)"></i>
      </div>`).join("");
    return `<div>
      <div style="display:flex;align-items:center;gap:5px;padding:8px 16px 4px;background:var(--surface)">
        <i data-lucide="${catIcon}" style="width:11px;height:11px;color:var(--text-hint)"></i>
        <span style="font-size:10px;font-weight:700;color:var(--text-hint);text-transform:uppercase;letter-spacing:0.05em">${catLabel}</span>
      </div>${items}</div>`;
  }).join("");

  const sheet = document.createElement("div");
  sheet.style.cssText = "background:var(--card);border-radius:20px 20px 0 0;width:100%;max-width:420px;direction:rtl;animation:slideUp 0.3s cubic-bezier(0.22,1,0.36,1) both;max-height:80vh;display:flex;flex-direction:column";
  sheet.innerHTML = `
    <div style="padding:16px 16px 10px;border-bottom:1px solid var(--border);flex-shrink:0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-size:15px;font-weight:700;color:var(--text-primary)">תרגיל חד-פעמי</span>
        <button onclick="document.getElementById('ex-picker-modal').remove()" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--text-hint)">×</button>
      </div>
      <input id="ex-extra-search" placeholder="חיפוש..." autocomplete="off"
        style="width:100%;font-family:inherit;font-size:14px;background:var(--surface);border:1px solid var(--border-med);border-radius:8px;padding:8px 12px;color:var(--text-primary);outline:none;box-sizing:border-box;direction:rtl">
    </div>
    <div id="ex-extra-list" style="overflow-y:auto;flex:1">${listHtml}</div>
  `;

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", e => { if(e.target===overlay) overlay.remove(); });
  if (window.lucide) lucide.createIcons({ el: sheet });
  setTimeout(() => sheet.querySelector("#ex-extra-search")?.focus(), 100);

  // חיפוש
  sheet.querySelector("#ex-extra-search").addEventListener("input", function() {
    const q = this.value.trim().toLowerCase();
    const list = sheet.querySelector("#ex-extra-list");
    if (!q) { list.innerHTML = listHtml; if (window.lucide) lucide.createIcons({ el: list }); bindExtraItems(list); return; }
    const filtered = state.exerciseLibrary.filter(ex => ex.name.toLowerCase().includes(q));
    list.innerHTML = filtered.map(ex => `<div class="ex-pick-item" data-name="${escapeHtml(ex.name)}" data-cat="${escapeHtml(ex.category||"")}"
        style="display:flex;align-items:center;gap:10px;padding:11px 16px;cursor:pointer;border-bottom:0.5px solid var(--border)">
        <span style="flex:1;font-size:14px;color:var(--text-primary)">${escapeHtml(ex.name)}</span>
      </div>`).join("") || `<div style="padding:20px;text-align:center;color:var(--text-hint);font-size:13px">לא נמצא</div>`;
    bindExtraItems(list);
  });

  bindExtraItems(sheet.querySelector("#ex-extra-list"));
}

function openExercisePicker(workoutId) {
  dlog("[library-add] openExercisePicker called with workoutId:", workoutId);
  state.libraryPickerTargetWorkoutId = workoutId;
  dlog("[library-add] stored target workout id:", state.libraryPickerTargetWorkoutId);
  openWorkoutExtraPicker(false);
}
window.openExercisePicker = openExercisePicker;

function bindExtraItems(container) {
  container.querySelectorAll(".ex-pick-item").forEach(item => {
    item.addEventListener("click", () => {
      const name = item.dataset.name;
      const category = item.dataset.cat || null;
      dlog("[library-add] exercise selected:", { name, category, itemDataset: { ...item.dataset } });
      document.getElementById("ex-picker-modal")?.remove();
      const targetWorkoutId = state.libraryPickerTargetWorkoutId || null;
      dlog("[library-add] target workout id at selection:", targetWorkoutId);
      if (targetWorkoutId) {
        const workout = getWorkout(targetWorkoutId);
        dlog("[library-add] workout found before mutation:", workout ? { id: workout.id, name: workout.name, exercisesCount: (workout.exercises || []).length } : null);
        if (workout) {
          const beforeLen = workout.exercises.length;
          const exists = workout.exercises.some(ex => (typeof ex === "string" ? ex : ex.name) === name);
          if (!exists) workout.exercises.push({ name, rest: 60, category });
          const afterLen = workout.exercises.length;
          dlog("[library-add] exercises length before/after:", { beforeLen, afterLen, exists });
          saveWorkouts();
          state.manageOpenId = targetWorkoutId;
        }
        state.libraryPickerTargetWorkoutId = null;
        dlog("[library-add] final workouts snapshot before render:", state.workouts.map(w => ({ id: w.id, name: w.name, exercisesCount: (w.exercises || []).length })));
        dlog("[library-add] calling render after insertion path");
        render();
        return;
      }
      if (!state.workoutExtras) state.workoutExtras = [];
      if (!state.workoutExtras.includes(name)) state.workoutExtras.push(name);
      if (!state.exercises[name]) {
        const isCardio = category === "cardio";
        state.exercises[name] = isCardio
          ? [{num:1, minutes:0}]
          : [{num:1,weight:0,reps:0},{num:2,weight:0,reps:0},{num:3,weight:0,reps:0}];
      }
      state.openExercise = name;
      saveInProgress();
      render();
    });
    item.addEventListener("mouseenter", () => item.style.background = "var(--surface)");
    item.addEventListener("mouseleave", () => item.style.background = "");
  });
}

function bindWorkoutDragDrop() {
  let dragSrcW = null, touchDragSrcW = null;
  document.querySelectorAll(".workout-drag").forEach(card => {
    card.addEventListener("dragstart", e => {
      dragSrcW = card; card.classList.add("dragging"); e.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => { card.classList.remove("dragging"); dragSrcW = null; });
    card.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
    card.addEventListener("drop", e => {
      e.preventDefault();
      if (!dragSrcW || dragSrcW === card) return;
      const fromIdx = parseInt(dragSrcW.dataset.widx);
      const toIdx = parseInt(card.dataset.widx);
      const moved = state.workouts.splice(fromIdx, 1)[0];
      state.workouts.splice(toIdx, 0, moved);
      saveWorkouts(); render();
    });

    const handle = card.querySelector(".workout-drag-handle");
    if (!handle) return;
    handle.addEventListener("touchstart", e => {
      touchDragSrcW = card; card.classList.add("dragging"); e.stopPropagation();
    }, { passive: true });
    handle.addEventListener("touchmove", e => {
      if (!touchDragSrcW) return;
      e.preventDefault();
      const touch = e.touches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const target = el ? el.closest(".workout-drag") : null;
      document.querySelectorAll(".workout-drag").forEach(c => c.style.borderTop = "");
      if (target && target !== touchDragSrcW) target.style.borderTop = "2px solid var(--accent)";
    }, { passive: false });
    handle.addEventListener("touchend", e => {
      if (!touchDragSrcW) return;
      const touch = e.changedTouches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const target = el ? el.closest(".workout-drag") : null;
      document.querySelectorAll(".workout-drag").forEach(c => c.style.borderTop = "");
      touchDragSrcW.classList.remove("dragging");
      if (target && target !== touchDragSrcW) {
        const fromIdx = parseInt(touchDragSrcW.dataset.widx);
        const toIdx = parseInt(target.dataset.widx);
        const moved = state.workouts.splice(fromIdx, 1)[0];
        state.workouts.splice(toIdx, 0, moved);
        saveWorkouts(); render();
      }
      touchDragSrcW = null;
    }, { passive: false });
  });
}

// ── Transfer Code ─────────────────────────────────────────────────────────────

let _transferCodeTimer = null;

function getTransferCodeCountdown() {
  if (!state.transferCodeExpiry) return null;
  const remaining = new Date(state.transferCodeExpiry) - Date.now();
  if (remaining <= 0) return null;
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

async function generateTransferCode() {
  const userId = ensureUserId();
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  try {
    await sbDelete(`account_transfer_codes?user_id=eq.${userId}`);
    await sbPost("account_transfer_codes", { code, user_id: userId, expires_at: expiresAt });
    state.transferCode = code;
    state.transferCodeExpiry = expiresAt;
    render();
    if (_transferCodeTimer) clearInterval(_transferCodeTimer);
    _transferCodeTimer = setInterval(() => {
      const el = document.getElementById("transfer-code-timer");
      if (!el) { clearInterval(_transferCodeTimer); return; }
      const remaining = getTransferCodeCountdown();
      if (!remaining) {
        clearInterval(_transferCodeTimer);
        state.transferCode = null;
        state.transferCodeExpiry = null;
        render();
        return;
      }
      el.textContent = `פג תוקף בעוד ${remaining}`;
    }, 1000);
  } catch (e) {
    showToast("שגיאה ביצירת קוד ⚠️");
    console.error("[generateTransferCode]", e);
  }
}

async function redeemTransferCode() {
  const input = document.getElementById("transfer-code-input");
  const code = input?.value?.trim();
  if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
    showToast("הזן קוד בן 6 ספרות");
    return;
  }
  try {
    const now = new Date().toISOString();
    const rows = await sbGet(`account_transfer_codes?code=eq.${code}&expires_at=gt.${encodeURIComponent(now)}`);
    if (!rows || !rows.length) {
      showToast("קוד לא תקין או שפג תוקפו ⚠️");
      return;
    }
    const { user_id } = rows[0];
    await sbDelete(`account_transfer_codes?code=eq.${code}`);
    localStorage.setItem("gym_user_id_v1", user_id);
    showToast("החשבון הועבר בהצלחה! טוען מחדש...");
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    showToast("שגיאה בהעברת החשבון ⚠️");
    console.error("[redeemTransferCode]", e);
  }
}
}
