async function loadExerciseLibrary() {
  try {
    const rows = await sbGet("exercise_library?select=*&order=name.asc");
    state.exerciseLibrary = rows || [];
    // אכלוס ראשוני — הוסף תרגילים קיימים שחסרים במאגר
    await seedLibraryFromWorkouts();
  } catch(e) { console.error("Library load failed:", e); }
}

async function seedLibraryFromWorkouts() {
  const existingNames = new Set(state.exerciseLibrary.map(e => e.name));
  const toAdd = [];
  state.workouts.forEach(w => {
    w.exercises.forEach(ex => {
      const name = typeof ex === "string" ? ex : ex.name;
      const category = ex.category || null;
      if (name && !existingNames.has(name)) {
        existingNames.add(name);
        toAdd.push({ name, category });
      }
    });
  });
  if (!toAdd.length) return;
  try {
    const added = await sbPost("exercise_library", toAdd);
    state.exerciseLibrary = [...state.exerciseLibrary, ...added];
  } catch(e) { console.error("Seed library failed:", e); }
}

async function addToLibrary(name, category) {
  const exists = state.exerciseLibrary.find(e => e.name === name);
  if (exists) return exists;
  try {
    const rows = await sbPost("exercise_library", { name, category: category || null });
    const entry = rows[0];
    state.exerciseLibrary.push(entry);
    return entry;
  } catch(e) { console.error("Add to library failed:", e); return null; }
}

async function updateLibraryEntry(id, name, category) {
  try {
   const res = await fetch(SUPABASE_URL + "/rest/v1/exercise_library?id=eq." + id, {
  method: "PATCH",
  headers: { ...SB_HEADERS, Prefer: "return=representation" },
  body: JSON.stringify({ name, category: category || null })
});
if (!res.ok) throw new Error(await res.text());
    const entry = state.exerciseLibrary.find(e => e.id === id);
    const oldName = entry?.name; // שמור לפני העדכון
    if (entry) { entry.name = name; entry.category = category || null; }
    // עדכן גם ב-workouts לפי השם הישן
    state.workouts.forEach(w => {
      w.exercises.forEach(ex => {
        if ((typeof ex==="string"?ex:ex.name) === oldName) {
          if (typeof ex !== "string") { ex.name = name; ex.category = category || null; }
        }
      });
    });
    saveWorkouts();
    render(); // רענן תצוגה
 } catch(e) {
  console.error("Update library failed:", e);
  showToast("שגיאה בעדכון תרגיל ⚠️");
}
}

async function deleteFromLibrary(id) {
  try {
    await sbDelete("exercise_library?id=eq." + id);
    state.exerciseLibrary = state.exerciseLibrary.filter(e => e.id !== id);
    render();
  } catch(e) { console.error("Delete library failed:", e); }
}

function renderLibraryScreen() {
  return `<div style="padding:14px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <button onclick="navigate('manage')" style="display:flex;align-items:center;gap:6px;background:none;border:none;cursor:pointer;color:var(--text-secondary);font-family:inherit;font-size:13px;padding:0">
        <i data-lucide="chevron-right" style="width:16px;height:16px"></i> חזרה לניהול תוכנית
      </button>
      <button onclick="openLibraryAddExercise()" style="display:flex;align-items:center;gap:5px;background:var(--accent);border:none;border-radius:8px;padding:7px 12px;cursor:pointer;color:#fff;font-family:inherit;font-size:13px;font-weight:600">
        <i data-lucide="plus" style="width:15px;height:15px"></i> הוסף
      </button>
    </div>
    ${renderLibraryManager()}
  </div>`;
}

function openLibraryAddExercise() {
  document.getElementById("ex-picker-modal")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "ex-picker-modal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:flex-end;justify-content:center";
  const sheet = document.createElement("div");
  sheet.style.cssText = "background:var(--card);border-radius:20px 20px 0 0;padding:24px 20px 32px;width:100%;direction:rtl;animation:slideUp 0.3s cubic-bezier(0.22,1,0.36,1) both;box-sizing:border-box";
  sheet.innerHTML = `
    <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:16px">הוסף תרגיל למאגר</div>
    <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px">שם תרגיל</label>
    <input id="lib-new-name" placeholder="שם..." autocomplete="off"
      style="width:100%;font-family:inherit;font-size:14px;background:var(--surface);border:1px solid var(--border-med);border-radius:8px;padding:10px 12px;color:var(--text-primary);outline:none;box-sizing:border-box;direction:rtl;margin-bottom:14px">
    <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px">קטגוריה</label>
    <select id="lib-new-cat" style="width:100%;font-family:inherit;font-size:14px;background:var(--surface);border:1px solid var(--border-med);border-radius:8px;padding:10px 12px;color:var(--text-primary);outline:none;box-sizing:border-box;margin-bottom:20px">
      <option value="" disabled selected>בחר קטגוריה</option>
      ${CATEGORIES.map(c=>`<option value="${c.id}">${c.label}</option>`).join("")}
    </select>
    <button id="lib-new-confirm" style="width:100%;padding:13px;background:var(--accent);color:#fff;border:none;border-radius:12px;cursor:pointer;font-size:15px;font-weight:700;font-family:inherit">הוסף למאגר</button>
  `;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", e => { if(e.target===overlay) overlay.remove(); });
  setTimeout(() => sheet.querySelector("#lib-new-name")?.focus(), 100);
  sheet.querySelector("#lib-new-confirm").addEventListener("click", async () => {
    const name = sheet.querySelector("#lib-new-name").value.trim();
    const category = sheet.querySelector("#lib-new-cat").value || null;
    if (!name) { sheet.querySelector("#lib-new-name").style.borderColor = "var(--red)"; return; }
    if (!category) { sheet.querySelector("#lib-new-cat").style.borderColor = "var(--red)"; showToast("יש לבחור קטגוריה"); return; }
    const exists = state.exerciseLibrary.find(e => e.name === name);
    if (exists) { showToast("תרגיל זה כבר קיים במאגר"); return; }
    overlay.remove();
    await addToLibrary(name, category);
    showToast("נוסף למאגר ✓");
    render();
  });
}

// ─── ניהול מאגר ───
function renderLibraryManager() {
  const byCategory = {};
  const CAT_ORDER_LIB = ["chest","back","shoulders","arms","legs","core","cardio"];
  state.exerciseLibrary.forEach(ex => {
    const cat = ex.category || null;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(ex);
  });

  if (!state.exerciseLibrary.length) return `<div style="padding:20px;text-align:center;color:var(--text-hint);font-size:13px">המאגר ריק</div>`;

  return CAT_ORDER_LIB.filter(cat => byCategory[cat]).map(cat => {
    const catData = CATEGORIES.find(c => c.id === cat);
    const catLabel = catData ? catData.label : "כללי";
    const catIcon = catData ? catData.icon : "more-horizontal";
    return `<div style="margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:5px;padding:6px 2px 4px">
        <i data-lucide="${catIcon}" style="width:12px;height:12px;color:var(--text-hint)"></i>
        <span style="font-size:11px;font-weight:700;color:var(--text-hint);text-transform:uppercase;letter-spacing:0.04em">${catLabel}</span>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        ${byCategory[cat].map((ex,i,arr) => `
          <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:${i<arr.length-1?"1px solid var(--border)":"none"}">
            <span style="flex:1;font-size:13px;color:var(--text-primary)">${ex.name}</span>
           <button onclick='openLibraryEdit(${JSON.stringify(ex.id)},${JSON.stringify(ex.name)},${JSON.stringify(ex.category||"")})'
              class="icon-btn"><i data-lucide="pencil" style="width:13px;height:13px"></i></button>
            <button onclick="if(confirm('למחוק מהמאגר?'))deleteFromLibrary('${ex.id}')"
              class="icon-btn" style="color:var(--red)"><i data-lucide="trash-2" style="width:13px;height:13px"></i></button>
          </div>`).join("")}
      </div>
    </div>`;
  }).join("");
}

function openLibraryEdit(id, name, category) {
  document.getElementById("lib-edit-modal")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "lib-edit-modal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:flex-end;justify-content:center";
  const sheet = document.createElement("div");
  sheet.style.cssText = "background:var(--card);border-radius:20px 20px 0 0;padding:24px 20px 32px;width:100%;max-width:420px;direction:rtl;animation:slideUp 0.3s cubic-bezier(0.22,1,0.36,1) both";
  sheet.innerHTML = `
    <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:16px">עריכת תרגיל במאגר</div>
    <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px">שם תרגיל</label>
    <input id="lib-edit-name" value="${name}"
      style="width:100%;font-family:inherit;font-size:14px;background:var(--surface);border:1px solid var(--border-med);border-radius:8px;padding:10px 12px;color:var(--text-primary);outline:none;box-sizing:border-box;direction:rtl;margin-bottom:14px">
    <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px">קטגוריה</label>
    <select id="lib-edit-cat" style="width:100%;font-family:inherit;font-size:14px;background:var(--surface);border:1px solid var(--border-med);border-radius:8px;padding:10px 12px;color:var(--text-primary);outline:none;box-sizing:border-box;margin-bottom:20px">
      <option value="">ללא קטגוריה</option>
      ${CATEGORIES.map(c=>`<option value="${c.id}" ${category===c.id?"selected":""}>${c.label}</option>`).join("")}
    </select>
    <button id="lib-save-btn" style="width:100%;padding:13px;background:var(--accent);color:#fff;border:none;border-radius:12px;cursor:pointer;font-size:15px;font-weight:700;font-family:inherit">שמור שינויים</button>
  `;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", e => { if(e.target===overlay) overlay.remove(); });
  setTimeout(() => sheet.querySelector("#lib-edit-name")?.focus(), 100);
  sheet.querySelector("#lib-save-btn").addEventListener("click", async () => {
    const newName = sheet.querySelector("#lib-edit-name").value.trim();
    const newCat = sheet.querySelector("#lib-edit-cat").value || null;
    if (!newName) return;
    overlay.remove();
    await updateLibraryEntry(id, newName, newCat);
    showToast("התרגיל עודכן ✓");
    render();
  });
}

function openExercisePicker(workoutId) {
  document.getElementById("ex-picker-modal")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "ex-picker-modal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:flex-end;justify-content:center";

  const CAT_ORDER_EX = ["chest","back","shoulders","arms","legs","core","cardio"];
  const byCategory = {};
  state.exerciseLibrary.forEach(ex => {
    const cat = ex.category || null;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(ex);
  });

  let listHtml = CAT_ORDER_EX.filter(cat => byCategory[cat]).map(cat => {
    const catData = CATEGORIES.find(c => c.id === cat);
    const catLabel = catData ? catData.label : "כללי";
    const catIcon = catData ? catData.icon : "more-horizontal";
    const items = byCategory[cat].map(ex => `
      <div class="ex-pick-item" data-name="${ex.name}" data-cat="${ex.category||""}"
        style="display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;border-bottom:0.5px solid var(--border)">
        <span style="flex:1;font-size:14px;color:var(--text-primary)">${ex.name}</span>
        <i data-lucide="chevron-left" style="width:14px;height:14px;color:var(--text-hint)"></i>
      </div>`).join("");
    return `<div>
      <div style="display:flex;align-items:center;gap:5px;padding:8px 16px 4px;background:var(--surface)">
        <i data-lucide="${catIcon}" style="width:11px;height:11px;color:var(--text-hint)"></i>
        <span style="font-size:10px;font-weight:700;color:var(--text-hint);text-transform:uppercase;letter-spacing:0.05em">${catLabel}</span>
      </div>
      ${items}
    </div>`;
  }).join("");

  const sheet = document.createElement("div");
  sheet.style.cssText = "background:var(--card);border-radius:20px 20px 0 0;width:100%;max-width:420px;direction:rtl;animation:slideUp 0.3s cubic-bezier(0.22,1,0.36,1) both;max-height:80vh;display:flex;flex-direction:column";
  sheet.innerHTML = `
    <div style="padding:16px 16px 10px;border-bottom:1px solid var(--border);flex-shrink:0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-size:15px;font-weight:700;color:var(--text-primary)">בחר תרגיל</span>
        <button onclick="document.getElementById('ex-picker-modal').remove()" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--text-hint);line-height:1">×</button>
      </div>
      <input id="ex-picker-search" placeholder="חיפוש..." autocomplete="off"
        style="width:100%;font-family:inherit;font-size:14px;background:var(--surface);border:1px solid var(--border-med);border-radius:8px;padding:8px 12px;color:var(--text-primary);outline:none;box-sizing:border-box;direction:rtl">
    </div>
    <div id="ex-picker-list" style="overflow-y:auto;flex:1">${listHtml || "<div style='padding:30px;text-align:center;color:var(--text-hint);font-size:13px'>המאגר ריק — הוסף תרגיל חדש</div>"}</div>
    <div style="padding:12px 16px;border-top:1px solid var(--border);flex-shrink:0">
      <button onclick="openNewExerciseForm('${workoutId}')" style="width:100%;padding:11px;background:var(--accent);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px">
        <i data-lucide="plus" style="width:15px;height:15px"></i> תרגיל חדש שלא במאגר
      </button>
    </div>
  `;

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", e => { if(e.target===overlay) overlay.remove(); });
  if (window.lucide) lucide.createIcons({ el: sheet });
  setTimeout(() => sheet.querySelector("#ex-picker-search")?.focus(), 100);

  sheet.querySelector("#ex-picker-search").addEventListener("input", function() {
    const q = this.value.trim().toLowerCase();
    const list = sheet.querySelector("#ex-picker-list");
    if (!q) { list.innerHTML = listHtml; if (window.lucide) lucide.createIcons({ el: list }); bindPickerItems(list, workoutId); return; }
    const filtered = state.exerciseLibrary.filter(ex => ex.name.toLowerCase().includes(q));
    list.innerHTML = filtered.length
      ? filtered.map(ex => `<div class="ex-pick-item" data-name="${ex.name}" data-cat="${ex.category||""}"
          style="display:flex;align-items:center;gap:10px;padding:11px 16px;cursor:pointer;border-bottom:0.5px solid var(--border)">
          <span style="flex:1;font-size:14px;color:var(--text-primary)">${ex.name}</span>
        </div>`).join("")
      : `<div style="padding:20px;text-align:center;color:var(--text-hint);font-size:13px">לא נמצא — הוסף תרגיל חדש</div>`;
    bindPickerItems(list, workoutId);
  });

  bindPickerItems(sheet.querySelector("#ex-picker-list"), workoutId);
}

function bindPickerItems(container, workoutId) {
  container.querySelectorAll(".ex-pick-item").forEach(item => {
    item.addEventListener("click", () => {
      const name = item.dataset.name;
      const category = item.dataset.cat || null;
      if (category === "cardio") {
        const w = getWorkout(workoutId);
        if (w) { w.exercises.push({ name, rest: 0, category }); saveWorkouts(); }
        document.getElementById("ex-picker-modal")?.remove();
        render();
      } else {
        openRestPicker(workoutId, name, category);
      }
    });
    item.addEventListener("mouseenter", () => item.style.background = "var(--surface)");
    item.addEventListener("mouseleave", () => item.style.background = "");
  });
}

function openRestPicker(workoutId, name, category) {
  document.getElementById("ex-picker-modal")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "ex-picker-modal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:flex-end;justify-content:center";
  const catData = CATEGORIES.find(c => c.id === category);
  const catLabel = catData ? catData.label : "";
  const sheet = document.createElement("div");
  sheet.style.cssText = "background:var(--card);border-radius:20px 20px 0 0;padding:24px 20px 32px;width:100%;max-width:420px;direction:rtl;animation:slideUp 0.3s cubic-bezier(0.22,1,0.36,1) both";
  sheet.innerHTML = `
    <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:4px">${name}</div>
    ${catLabel ? `<div style="font-size:12px;color:var(--text-hint);margin-bottom:18px">${catLabel}</div>` : `<div style="margin-bottom:18px"></div>`}
    <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:8px">זמן מנוחה (שניות)</label>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
      <button onclick="adjustRest(-15)" style="width:36px;height:36px;background:var(--surface);border:1px solid var(--border-med);border-radius:8px;cursor:pointer;font-size:18px;color:var(--text-primary);font-family:inherit">−</button>
      <span id="rest-val-display" style="font-size:22px;font-weight:700;color:var(--text-primary);min-width:60px;text-align:center">60</span>
      <button onclick="adjustRest(15)" style="width:36px;height:36px;background:var(--surface);border:1px solid var(--border-med);border-radius:8px;cursor:pointer;font-size:18px;color:var(--text-primary);font-family:inherit">+</button>
      <span style="font-size:13px;color:var(--text-hint)">שנ׳</span>
    </div>
    <button id="rest-confirm-btn" style="width:100%;padding:13px;background:var(--accent);color:#fff;border:none;border-radius:12px;cursor:pointer;font-size:15px;font-weight:700;font-family:inherit">הוסף לאימון</button>
  `;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", e => { if(e.target===overlay) overlay.remove(); });

  window._pickerRestVal = 60;
  window.adjustRest = (delta) => {
    window._pickerRestVal = Math.max(15, Math.min(600, window._pickerRestVal + delta));
    sheet.querySelector("#rest-val-display").textContent = window._pickerRestVal;
  };
  sheet.querySelector("#rest-confirm-btn").addEventListener("click", () => {
    const w = getWorkout(workoutId);
    if (w) { w.exercises.push({ name, rest: window._pickerRestVal, category: category||null }); saveWorkouts(); }
    overlay.remove();
    render();
  });
}

function openNewExerciseForm(workoutId) {
  document.getElementById("ex-picker-modal")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "ex-picker-modal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:flex-end;justify-content:center";
  const sheet = document.createElement("div");
  sheet.style.cssText = "background:var(--card);border-radius:20px 20px 0 0;padding:24px 20px 32px;width:100%;max-width:420px;direction:rtl;animation:slideUp 0.3s cubic-bezier(0.22,1,0.36,1) both";
  sheet.innerHTML = `
    <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:16px">תרגיל חדש</div>
    <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px">שם תרגיל</label>
    <input id="new-ex-name" placeholder="שם..." autocomplete="off"
      style="width:100%;font-family:inherit;font-size:14px;background:var(--surface);border:1px solid var(--border-med);border-radius:8px;padding:10px 12px;color:var(--text-primary);outline:none;box-sizing:border-box;direction:rtl;margin-bottom:14px">
    <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px">קטגוריה</label>
    <select id="new-ex-cat" style="width:100%;font-family:inherit;font-size:14px;background:var(--surface);border:1px solid var(--border-med);border-radius:8px;padding:10px 12px;color:var(--text-primary);outline:none;box-sizing:border-box;margin-bottom:14px">
      <option value="">ללא קטגוריה</option>
      ${CATEGORIES.map(c=>`<option value="${c.id}">${c.label}</option>`).join("")}
    </select>
    <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:8px">זמן מנוחה</label>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
      <button onclick="adjustNewRest(-15)" style="width:36px;height:36px;background:var(--surface);border:1px solid var(--border-med);border-radius:8px;cursor:pointer;font-size:18px;color:var(--text-primary);font-family:inherit">−</button>
      <span id="new-rest-display" style="font-size:22px;font-weight:700;color:var(--text-primary);min-width:60px;text-align:center">60</span>
      <button onclick="adjustNewRest(15)" style="width:36px;height:36px;background:var(--surface);border:1px solid var(--border-med);border-radius:8px;cursor:pointer;font-size:18px;color:var(--text-primary);font-family:inherit">+</button>
      <span style="font-size:13px;color:var(--text-hint)">שנ׳</span>
    </div>
    <button id="new-ex-confirm" style="width:100%;padding:13px;background:var(--accent);color:#fff;border:none;border-radius:12px;cursor:pointer;font-size:15px;font-weight:700;font-family:inherit">הוסף לאימון ולמאגר</button>
  `;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", e => { if(e.target===overlay) overlay.remove(); });
  setTimeout(() => sheet.querySelector("#new-ex-name")?.focus(), 100);

  window._newRestVal = 60;
  window.adjustNewRest = (delta) => {
    window._newRestVal = Math.max(15, Math.min(600, window._newRestVal + delta));
    sheet.querySelector("#new-rest-display").textContent = window._newRestVal;
  };
  sheet.querySelector("#new-ex-confirm").addEventListener("click", async () => {
    const name = sheet.querySelector("#new-ex-name").value.trim();
    const category = sheet.querySelector("#new-ex-cat").value || null;
    if (!name) { sheet.querySelector("#new-ex-name").style.borderColor = "var(--red)"; return; }
    const w = getWorkout(workoutId);
    if (w) { w.exercises.push({ name, rest: window._newRestVal, category }); saveWorkouts(); }
    await addToLibrary(name, category);
    overlay.remove();
    render();
  });
}

Object.assign(window, {
  loadExerciseLibrary,
  seedLibraryFromWorkouts,
  addToLibrary,
  updateLibraryEntry,
  deleteFromLibrary,
  renderLibraryScreen,
  openExercisePicker,
  openRestPicker,
  openNewExerciseForm,
  openLibraryAddExercise,
  renderLibraryManager,
  openLibraryEdit
});
