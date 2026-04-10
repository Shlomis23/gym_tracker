(function () {
  function haptic(type) {
    if (!navigator.vibrate) return;
    if (type === "light") navigator.vibrate(10);
    else if (type === "medium") navigator.vibrate(30);
    else if (type === "success") navigator.vibrate([40, 30, 60]);
  }

  function showToast(msg, icon) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.innerHTML = icon ? `<span>${icon}</span>${msg}` : msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2800);
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("he-IL", {
      day: "numeric",
      month: "numeric",
      year: "2-digit",
      weekday: "short"
    });
  }

  function formatDateShort(iso) {
    return new Date(iso).toLocaleDateString("he-IL", {
      day: "numeric",
      month: "numeric"
    });
  }

  function formatVolume(v) {
    return v >= 1000 ? (v / 1000).toFixed(1) + " טון" : v + " ק״ג";
  }

  function formatRest(sec) {
    return sec >= 60
      ? Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0") + " דק׳"
      : sec + " שנ׳";
  }

  function calcVolume(sets) {
    return sets.reduce((s, r) => s + (r.weight || 0) * (r.reps || 0), 0);
  }

  function calcSessionVolume(exercises) {
    return Object.values(exercises || {}).reduce((total, sets) => total + calcVolume(sets), 0);
  }

  function getExNames(workout) {
    return (workout?.exercises ?? []).map(e => (typeof e === "string" ? e : e.name));
  }

  function getExRest(workout, name) {
    const exercise = (workout?.exercises ?? []).find(ex => (typeof ex === "string" ? ex : ex.name) === name);
    return exercise?.rest || 60;
  }

  function isValidNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sanitizeText(value, maxLen = 120) {
    const clean = String(value ?? "")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return clean.slice(0, maxLen);
  }

  let _undoTimer = null;
  let _undoPendingCommit = null;

  function showUndoToast(msg, onCommit, onUndo) {
    // Commit any previous pending deletion before showing new one
    if (_undoTimer !== null) {
      clearTimeout(_undoTimer);
      _undoTimer = null;
      if (_undoPendingCommit) { _undoPendingCommit(); _undoPendingCommit = null; }
    }

    const el = document.getElementById("toast");
    if (!el) { onCommit(); return; }

    el.innerHTML = `${msg} <button id="undo-action-btn" style="margin-right:10px;padding:3px 12px;border:1.5px solid rgba(255,255,255,0.5);background:transparent;color:#fff;border-radius:6px;font-family:inherit;font-size:12px;cursor:pointer;font-weight:600">בטל</button>`;
    el.classList.add("show");
    _undoPendingCommit = onCommit;

    _undoTimer = setTimeout(() => {
      el.classList.remove("show");
      if (_undoPendingCommit) { _undoPendingCommit(); _undoPendingCommit = null; }
      _undoTimer = null;
    }, 5000);

    const btn = document.getElementById("undo-action-btn");
    if (btn) {
      btn.addEventListener("click", () => {
        clearTimeout(_undoTimer);
        _undoTimer = null;
        _undoPendingCommit = null;
        el.classList.remove("show");
        if (onUndo) onUndo();
        showToast("הפעולה בוטלה");
      }, { once: true });
    }
  }

  // ─── Render throttle ──────────────────────────────────────────────────────────
  // Batches multiple rapid render() calls into one per animation frame.
  // Use for high-frequency interactions (typing, toggle, set operations).
  // Use render() directly only where the update must be synchronous (navigation).
  let _renderScheduled = false;
  function scheduleRender() {
    if (_renderScheduled) return;
    _renderScheduled = true;
    requestAnimationFrame(() => {
      _renderScheduled = false;
      if (typeof render === "function") render();
    });
  }

  Object.assign(window, {
    haptic,
    showToast,
    showUndoToast,
    scheduleRender,
    formatDate,
    formatDateShort,
    formatVolume,
    formatRest,
    calcVolume,
    calcSessionVolume,
    getExNames,
    getExRest,
    isValidNumber,
    toNumber,
    escapeHtml,
    sanitizeText
  });
})();
