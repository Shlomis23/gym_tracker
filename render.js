// ── render.js ────────────────────────────────────────────────────

function navigate(screen) {
  if (state.readonly && (screen === "manage" || screen === "home")) return;
  if (state.screen === "manage" && screen !== "manage") {
    // נקה pending goal אם לא נשמר
    state.pendingGoal = null;
    const empty = state.workouts.filter(w => w.exercises.length === 0);
    if (empty.length > 0) {
      const names = empty.map(w => w.name).join(", ");
      if (confirm("השארת אימון ריק (" + names + "), האם למחוק?")) {
        state.workouts = state.workouts.filter(w => w.exercises.length > 0);
        saveWorkouts();
      } else {
        return;
      }
    }
  }
  if (state.workoutId) saveInProgress();
  state.screen = screen;
  if (screen === "home") {
    loadInProgress(); // רענן מה-localStorage בכל ניווט לאימון
  }
  ["dashboard","home","history","manage","library"].forEach(s => {
    const el = document.getElementById("nav-"+s);
    if (el) el.classList.toggle("active", s === screen);
  });
  const titles = { dashboard:"דשבורד", home:"אימון חדש", history:"היסטוריה", manage:"ניהול תוכנית", library:"מאגר תרגילים" };
  document.getElementById("screen-title").textContent = titles[screen] || "";
  render();
}

function render() {
  try {
    if (state.readonly) document.body.classList.add("readonly");
    const el = document.getElementById("main-content");
    let screenHtml = "";
    if (state.screen === "dashboard") screenHtml = renderDashboard();
    else if (state.screen === "home") screenHtml = state.workoutId ? renderWorkout() : renderChoose();
    else if (state.screen === "history") screenHtml = renderHistory();
    else if (state.screen === "library") screenHtml = renderLibraryScreen();
    else {
      dlog("[library-add] render() -> manage screen");
      screenHtml = renderManage();
    }
    const readonlyBanner = state.readonly
      ? `<div style="background:#1e293b;color:#94a3b8;text-align:center;font-size:12px;padding:7px 16px;direction:rtl">
          <i data-lucide="eye" style="width:12px;height:12px;vertical-align:middle;margin-left:5px"></i>מצב צפייה בלבד
         </div>`
      : "";
    el.innerHTML = readonlyBanner + renderSyncNotice() + screenHtml;
    if (window.lucide) {
      requestAnimationFrame(() => lucide.createIcons());
    }
    bindDelButtons();
    bindDragDrop();
    if (state.screen === "library" && typeof bindLibraryButtons === "function") bindLibraryButtons();
    const dot = document.getElementById("inprogress-dot");
    if (dot) dot.style.display = state.workoutId ? "block" : "none";
    if (state.screen === "dashboard") {
      requestAnimationFrame(() => requestAnimationFrame(bindScrollAnimations));
    }
    if (state.screen === "manage") setTimeout(bindWorkoutDragDrop, 0);
  } catch (e) {
    console.error("[render] Unhandled error during render:", e);
    const el = document.getElementById("main-content");
    if (el && !el.dataset.errorShown) {
      el.dataset.errorShown = "1";
      el.innerHTML = `<div style="padding:32px;text-align:center;direction:rtl">
        <div style="font-size:32px;margin-bottom:12px">⚠️</div>
        <div style="font-weight:700;font-size:16px;color:var(--red);margin-bottom:8px">שגיאה בטעינת המסך</div>
        <div style="font-size:13px;color:var(--text-hint);margin-bottom:20px">נסה לרענן את האפליקציה</div>
        <button onclick="location.reload()" style="padding:10px 24px;background:var(--accent);color:#fff;border:none;border-radius:12px;font-size:14px;font-family:inherit;cursor:pointer">רענן</button>
      </div>`;
      setTimeout(() => { delete el.dataset.errorShown; }, 5000);
    }
  }
}

function bindDelButtons() {
  document.querySelectorAll("[data-del-session]:not([data-bound])").forEach(btn => {
    btn.dataset.bound = "1";
    btn.addEventListener("click", function() {
      const idx = parseInt(this.dataset.delSession);
      const session = state.sessions[idx];
      if (!session) return;
      state.sessions.splice(idx, 1); saveSessions(); render();
      showUndoToast(
        "האימון נמחק",
        () => { deleteSessionFromSupabase(session.id); },
        () => { state.sessions.splice(idx, 0, session); saveSessions(); render(); }
      );
    });
  });
  document.querySelectorAll("[data-del-weight]:not([data-bound])").forEach(btn => {
    btn.dataset.bound = "1";
    btn.addEventListener("click", function() {
      const id = this.dataset.delWeight;
      const log = state.weightLogs.find(l => String(l.id) === String(id));
      if (!log) return;
      state.weightLogs = state.weightLogs.filter(l => String(l.id) !== String(id));
      if (!state.weightLogs.length) state.weightGoal = { start_weight: null, goal_weight: null, goal_mode: "maintain" };
      saveWeightCache(); render();
      showUndoToast(
        "השקילה נמחקה",
        async () => { try { await sbDelete("body_weight_logs?id=eq." + encodeURIComponent(id)); } catch (e) { console.error("Weight delete failed:", e); showToast("שגיאה במחיקה ⚠️"); } },
        () => { state.weightLogs.push(log); state.weightLogs = getWeightLogsAsc(); saveWeightCache(); render(); }
      );
    });
  });
}

let dragSrc = null;
let touchDragSrc = null;
let touchPlaceholder = null;

function bindDragDrop() {
  document.querySelectorAll(".ex-row-drag:not([data-bound])").forEach(row => {
    row.dataset.bound = "1";

    // ── Desktop drag ──────────────────────────────────────────────
    row.setAttribute("draggable", "true");
    row.addEventListener("dragstart", e => {
      dragSrc = row;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      dragSrc = null;
    });
    row.addEventListener("dragover", e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    row.addEventListener("drop", e => {
      e.preventDefault();
      if (!dragSrc || dragSrc === row) return;
      const wid = row.dataset.wid;
      const fromIdx = parseInt(dragSrc.dataset.idx);
      const toIdx = parseInt(row.dataset.idx);
      const w = getWorkout(wid);
      if (!w) return;
      const moved = w.exercises.splice(fromIdx, 1)[0];
      w.exercises.splice(toIdx, 0, moved);
      saveWorkouts(); render();
    });

    // ── Mobile touch ──────────────────────────────────────────────
    const handle = row.querySelector(".drag-handle");
    if (!handle) return;

    handle.addEventListener("touchstart", e => {
      touchDragSrc = row;
      row.classList.add("dragging");
      e.preventDefault();
    }, { passive: false });

    handle.addEventListener("touchmove", e => {
      if (!touchDragSrc) return;
      e.preventDefault();
      const touch = e.touches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const target = el ? el.closest(".ex-row-drag") : null;
      document.querySelectorAll(".ex-row-drag").forEach(r => r.style.borderTop = "");
      if (target && target !== touchDragSrc) {
        target.style.borderTop = "2px solid var(--accent)";
      }
    }, { passive: false });

    handle.addEventListener("touchend", e => {
      if (!touchDragSrc) return;
      const touch = e.changedTouches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const target = el ? el.closest(".ex-row-drag") : null;
      document.querySelectorAll(".ex-row-drag").forEach(r => r.style.borderTop = "");
      touchDragSrc.classList.remove("dragging");
      if (target && target !== touchDragSrc) {
        const wid = target.dataset.wid;
        const fromIdx = parseInt(touchDragSrc.dataset.idx);
        const toIdx = parseInt(target.dataset.idx);
        const w = getWorkout(wid);
        if (w) {
          const moved = w.exercises.splice(fromIdx, 1)[0];
          w.exercises.splice(toIdx, 0, moved);
          saveWorkouts(); render();
        }
      }
      touchDragSrc = null;
    }, { passive: false });
  });
}
