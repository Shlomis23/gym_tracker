// ── weight-ui.js ─────────────────────────────────────────────────

function isoDateFromLocal(dateLike) {
  const dt = new Date(dateLike);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildDateSelector(prefix, isoDate) {
  const [yStr, mStr, dStr] = (isoDate || isoDateFromLocal(new Date())).split("-");
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  const day = parseInt(dStr, 10);
  const currentYear = new Date().getFullYear();

  const yearOptions = Array.from({ length: 8 }, (_, i) => currentYear - i)
    .map(y => `<option value="${y}" ${y === year ? "selected" : ""}>${y}</option>`)
    .join("");
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)
    .map(m => `<option value="${m}" ${m === month ? "selected" : ""}>${m}</option>`)
    .join("");
  const maxDays = new Date(year, month, 0).getDate();
  const dayOptions = Array.from({ length: maxDays }, (_, i) => i + 1)
    .map(d => `<option value="${d}" ${d === day ? "selected" : ""}>${d}</option>`)
    .join("");

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
      <select id="${prefix}-day" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border-med);border-radius:10px;background:var(--card);font-family:inherit">${dayOptions}</select>
      <select id="${prefix}-month" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border-med);border-radius:10px;background:var(--card);font-family:inherit">${monthOptions}</select>
      <select id="${prefix}-year" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border-med);border-radius:10px;background:var(--card);font-family:inherit">${yearOptions}</select>
    </div>
  `;
}

function readIsoDateFromSelector(container, prefix) {
  const day = parseInt(container.querySelector(`#${prefix}-day`)?.value || "", 10);
  const month = parseInt(container.querySelector(`#${prefix}-month`)?.value || "", 10);
  const year = parseInt(container.querySelector(`#${prefix}-year`)?.value || "", 10);
  if (!day || !month || !year) return null;
  const maxDays = new Date(year, month, 0).getDate();
  const normalizedDay = Math.min(day, maxDays);
  return `${year}-${String(month).padStart(2, "0")}-${String(normalizedDay).padStart(2, "0")}`;
}

function buildInp(type, step, placeholder, fontSize) {
  const inp = document.createElement("input");
  inp.type = type; inp.step = step; inp.placeholder = placeholder;
  inp.style.cssText = `width:100%;text-align:center;font-size:${fontSize};font-family:inherit;background:var(--surface);border:1px solid var(--border-med);border-radius:10px;padding:10px;color:var(--text-primary);outline:none;box-sizing:border-box`;
  return inp;
}
function buildLabel(text) {
  const l = document.createElement("label");
  l.style.cssText = "font-size:12px;color:var(--text-secondary);font-weight:600;display:block;margin-bottom:6px";
  l.innerHTML = text; return l;
}
function buildWrap(mb) {
  const d = document.createElement("div"); d.style.marginBottom = mb || "16px"; return d;
}

function showGoalModal() {
  if (document.getElementById("goal-modal")) return; // already open
  const wGoal = state.weightGoal || {};
  const selectedGoalMode = (typeof getWeightGoalMode === "function") ? getWeightGoalMode(wGoal) : "maintain";
  document.getElementById("goal-modal")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "goal-modal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2100;display:flex;align-items:flex-end;justify-content:center";
  const sheet = document.createElement("div");
  sheet.style.cssText = "background:var(--card);border-radius:22px 22px 0 0;padding:20px 16px 16px;width:100%;max-width:430px;box-sizing:border-box;direction:rtl;max-height:86vh;overflow:auto";

  sheet.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
      <div>
        <div style="font-size:17px;font-weight:800;color:var(--text-primary)">עריכת יעד</div>
        <div style="font-size:12px;color:var(--text-hint);margin-top:3px">הגדר משקל התחלתי ויעד</div>
      </div>
      <button id="goal-close" style="width:30px;height:30px;border:none;background:var(--surface);border-radius:999px;cursor:pointer;color:var(--text-hint);font-size:18px">×</button>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border-med);border-radius:12px;padding:12px;margin-bottom:10px">
      <label style="display:block;font-size:12px;color:var(--text-secondary);font-weight:600;margin-bottom:6px">משקל התחלתי (ק״ג)</label>
      <input id="goal-start-inp" type="number" inputmode="decimal" step="0.1" placeholder="לדוגמה 91.0" value="${wGoal.start_weight ?? ""}" style="width:100%;box-sizing:border-box;display:block;padding:11px 12px;border:1px solid var(--border-med);border-radius:10px;background:var(--card);font-family:inherit;font-size:16px">
    </div>
    <div style="background:var(--surface);border:1px solid var(--border-med);border-radius:12px;padding:12px;margin-bottom:14px">
      <label style="display:block;font-size:12px;color:var(--text-secondary);font-weight:600;margin-bottom:6px">יעד משקל (ק״ג)</label>
      <input id="goal-target-inp" type="number" inputmode="decimal" step="0.1" placeholder="לדוגמה 78.0" value="${wGoal.goal_weight ?? ""}" style="width:100%;box-sizing:border-box;display:block;padding:11px 12px;border:1px solid var(--border-med);border-radius:10px;background:var(--card);font-family:inherit;font-size:16px">
    </div>
    <div style="background:var(--surface);border:1px solid var(--border-med);border-radius:12px;padding:12px;margin-bottom:14px">
      <label style="display:block;font-size:12px;color:var(--text-secondary);font-weight:600;margin-bottom:6px">מצב יעד</label>
      <select id="goal-mode-inp" style="width:100%;box-sizing:border-box;display:block;padding:11px 12px;border:1px solid var(--border-med);border-radius:10px;background:var(--card);font-family:inherit;font-size:16px">
        <option value="cut" ${selectedGoalMode === "cut" ? "selected" : ""}>חיטוב</option>
        <option value="maintain" ${selectedGoalMode === "maintain" ? "selected" : ""}>תחזוקה</option>
        <option value="lean_bulk" ${selectedGoalMode === "lean_bulk" ? "selected" : ""}>מסה נקייה</option>
      </select>
    </div>
    <button id="goal-save-btn" class="btn-primary" style="margin-bottom:8px">שמור יעד</button>
    <button id="goal-cancel-btn" style="width:100%;padding:12px;background:var(--surface);border:1px solid var(--border-med);color:var(--text-secondary);border-radius:10px;font-family:inherit;cursor:pointer">ביטול</button>
  `;

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  sheet.querySelector("#goal-close").addEventListener("click", () => overlay.remove());
  sheet.querySelector("#goal-cancel-btn").addEventListener("click", () => overlay.remove());
  sheet.querySelector("#goal-save-btn").addEventListener("click", async () => {
    const startVal = parseFloat(sheet.querySelector("#goal-start-inp").value);
    const goalVal = parseFloat(sheet.querySelector("#goal-target-inp").value);
    const goalModeVal = sheet.querySelector("#goal-mode-inp").value || "maintain";
    if (!Number.isFinite(startVal) || !Number.isFinite(goalVal) || startVal <= 0 || goalVal <= 0) {
      showToast("הזן משקל התחלתי ויעד תקינים");
      return;
    }
    try {
      await saveWeightGoal(startVal, goalVal, goalModeVal);
      overlay.remove();
      render();
      showToast("היעד נשמר ✓");
    } catch (_) {}
  });
}

function showWeightModal() {
  if (document.getElementById("weight-modal")) return; // already open
  const latest = getLatestWeight();
  const todayIso = isoDateFromLocal(new Date());

  document.getElementById("weight-modal")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "weight-modal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:flex-end;justify-content:center";
  const sheet = document.createElement("div");
  sheet.style.cssText = "background:var(--card);border-radius:22px 22px 0 0;padding:20px 16px 16px;width:100%;max-width:430px;box-sizing:border-box;direction:rtl;max-height:86vh;overflow:auto";

  sheet.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div style="font-size:18px;font-weight:800;color:var(--text-primary)">עדכון משקל יומי</div>
      <button id="weight-close" style="width:32px;height:32px;border:none;background:var(--surface);border-radius:999px;cursor:pointer;color:var(--text-hint);font-size:20px;display:flex;align-items:center;justify-content:center">×</button>
    </div>

    <div style="margin-bottom:16px">
      <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">תאריך מדידה</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button id="daily-date-today" style="padding:12px;border-radius:12px;border:2px solid var(--accent);background:var(--accent);color:#fff;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer">היום</button>
        <button id="daily-date-other" style="padding:12px;border-radius:12px;border:2px solid var(--border-med);background:var(--surface);color:var(--text-secondary);font-family:inherit;font-size:14px;font-weight:600;cursor:pointer">תאריך אחר</button>
      </div>
      <input type="date" id="daily-date-inp" value="${todayIso}" max="${todayIso}"
        style="display:none;width:100%;margin-top:10px;font-family:inherit;font-size:15px;padding:11px 12px;border:1.5px solid var(--border-med);border-radius:12px;background:var(--surface);color:var(--text-primary);box-sizing:border-box;direction:ltr;text-align:center">
    </div>

    <div style="margin-bottom:16px">
      <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">משקל (ק״ג)</div>
      <input id="daily-weight-inp" type="number" inputmode="decimal" step="0.1" min="1"
        placeholder="0.0" value="${latest ? latest.weight : ""}"
        style="width:100%;box-sizing:border-box;display:block;padding:16px;border:1.5px solid var(--border-med);border-radius:14px;background:var(--surface);font-family:inherit;font-size:28px;font-weight:700;color:var(--text-primary);outline:none;text-align:center">
    </div>

    <div style="margin-bottom:20px">
      <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">הערה <span style="font-weight:400;color:var(--text-hint)">(אופציונלי)</span></div>
      <textarea id="daily-note-inp" rows="2" placeholder="למשל: אחרי אימון, בוקר..."
        style="width:100%;box-sizing:border-box;display:block;padding:12px;border:1.5px solid var(--border-med);border-radius:14px;background:var(--surface);font-family:inherit;font-size:14px;color:var(--text-primary);resize:none;outline:none"></textarea>
    </div>

    <button id="daily-save-btn" style="width:100%;padding:15px;background:var(--accent);color:#fff;border:none;border-radius:14px;cursor:pointer;font-size:16px;font-weight:700;font-family:inherit;margin-bottom:10px">שמור שקילה</button>
    <button id="daily-cancel-btn" style="width:100%;padding:13px;background:var(--surface);color:var(--text-secondary);border:1.5px solid var(--border-med);border-radius:14px;font-family:inherit;font-size:14px;cursor:pointer">סגור</button>
  `;

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  sheet.querySelector("#weight-close").addEventListener("click", () => overlay.remove());
  sheet.querySelector("#daily-cancel-btn").addEventListener("click", () => overlay.remove());

  const dDateInp = sheet.querySelector("#daily-date-inp");
  const dTodayBtn = sheet.querySelector("#daily-date-today");
  const dOtherBtn = sheet.querySelector("#daily-date-other");

  function setDailyDateActive(selectedIso) {
    const sel = selectedIso === todayIso;
    dTodayBtn.style.background = sel ? "var(--accent)" : "var(--surface)";
    dTodayBtn.style.color = sel ? "#fff" : "var(--text-secondary)";
    dTodayBtn.style.borderColor = sel ? "var(--accent)" : "var(--border-med)";
    dOtherBtn.style.background = !sel ? "var(--accent)" : "var(--surface)";
    dOtherBtn.style.color = !sel ? "#fff" : "var(--text-secondary)";
    dOtherBtn.style.borderColor = !sel ? "var(--accent)" : "var(--border-med)";
    dOtherBtn.textContent = !sel ? formatDate(selectedIso + "T12:00:00") : "תאריך אחר";
    dDateInp.style.display = !sel ? "block" : "none";
  }

  dTodayBtn.addEventListener("click", () => { dDateInp.value = todayIso; setDailyDateActive(todayIso); });
  dOtherBtn.addEventListener("click", () => { dDateInp.style.display = "block"; dDateInp.focus(); });
  dDateInp.addEventListener("change", () => setDailyDateActive(dDateInp.value));

  sheet.querySelector("#daily-save-btn").addEventListener("click", async () => {
    const dateVal = dDateInp.value;
    const weightVal = parseFloat(sheet.querySelector("#daily-weight-inp").value);
    const noteVal = sheet.querySelector("#daily-note-inp").value.trim();
    if (!dateVal || !Number.isFinite(weightVal) || weightVal <= 0) {
      showToast("הזן תאריך ומשקל תקינים");
      return;
    }
    const measuredAt = new Date(`${dateVal}T09:00:00`).toISOString();
    try {
      await saveWeightLog(weightVal, measuredAt, noteVal);
      overlay.remove();
      haptic("medium");
      render();
    } catch (_) {}
  });
}

async function openWeightEntryModal(logId) {
  if (document.getElementById("weight-entry-modal")) return; // already open
  const logs = getWeightLogsAsc();
  const editing = logId ? logs.find(l => l.id === logId) : null;
  const todayIso = isoDateFromLocal(new Date());
  const defaultDate = editing ? isoDateFromLocal(editing.measured_at) : todayIso;
  const defaultWeight = editing ? editing.weight : (getLatestWeight()?.weight || "");
  const defaultNote = editing?.note || "";

  document.getElementById("weight-entry-modal")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "weight-entry-modal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:2100;display:flex;align-items:flex-end;justify-content:center";
  const isToday = defaultDate === todayIso;
  overlay.innerHTML = `
    <div style="background:var(--card);border-radius:22px 22px 0 0;padding:24px 16px 20px;width:100%;max-width:430px;box-sizing:border-box;direction:rtl;animation:slideUp 0.28s ease both;max-height:86vh;overflow:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div style="font-size:18px;font-weight:800;color:var(--text-primary)">${editing ? "עריכת שקילה" : "הוספת שקילה"}</div>
        <button id="weight-close" style="width:32px;height:32px;border:none;background:var(--surface);border-radius:999px;cursor:pointer;color:var(--text-hint);font-size:20px;display:flex;align-items:center;justify-content:center">×</button>
      </div>

      <div style="margin-bottom:16px">
        <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">תאריך מדידה</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button id="w-date-today" style="padding:12px;border-radius:12px;border:2px solid ${isToday ? "var(--accent)" : "var(--border-med)"};background:${isToday ? "var(--accent)" : "var(--surface)"};color:${isToday ? "#fff" : "var(--text-secondary)"};font-family:inherit;font-size:14px;font-weight:700;cursor:pointer">היום</button>
          <button id="w-date-other" style="padding:12px;border-radius:12px;border:2px solid ${!isToday ? "var(--accent)" : "var(--border-med)"};background:${!isToday ? "var(--accent)" : "var(--surface)"};color:${!isToday ? "#fff" : "var(--text-secondary)"};font-family:inherit;font-size:14px;font-weight:600;cursor:pointer">${!isToday ? formatDate(defaultDate + "T12:00:00") : "תאריך אחר"}</button>
        </div>
        <input type="date" id="w-date-inp" value="${defaultDate}" max="${todayIso}"
          style="display:${isToday ? "none" : "block"};width:100%;margin-top:10px;font-family:inherit;font-size:15px;padding:11px 12px;border:1.5px solid var(--border-med);border-radius:12px;background:var(--surface);color:var(--text-primary);box-sizing:border-box;direction:ltr;text-align:center">
      </div>

      <div style="margin-bottom:16px">
        <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">משקל (ק״ג)</div>
        <input id="weight-value-inp" type="number" inputmode="decimal" step="0.1" min="1" value="${defaultWeight}"
          style="width:100%;box-sizing:border-box;display:block;padding:16px;border:1.5px solid var(--border-med);border-radius:14px;background:var(--surface);font-family:inherit;font-size:28px;font-weight:700;color:var(--text-primary);outline:none;text-align:center">
      </div>

      <div style="margin-bottom:20px">
        <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">הערה <span style="font-weight:400;color:var(--text-hint)">(אופציונלי)</span></div>
        <textarea id="weight-note-inp" rows="2" placeholder="למשל: אחרי אימון, בוקר..."
          style="width:100%;box-sizing:border-box;display:block;padding:12px;border:1.5px solid var(--border-med);border-radius:14px;background:var(--surface);font-family:inherit;font-size:14px;color:var(--text-primary);resize:none;outline:none">${escapeHtml(defaultNote)}</textarea>
      </div>

      <button id="weight-save-btn" style="width:100%;padding:15px;background:var(--accent);color:#fff;border:none;border-radius:14px;cursor:pointer;font-size:16px;font-weight:700;font-family:inherit;margin-bottom:10px">${editing ? "שמור שינויים" : "שמור שקילה"}</button>
      <button id="weight-cancel-btn" style="width:100%;padding:13px;background:var(--surface);color:var(--text-secondary);border:1.5px solid var(--border-med);border-radius:14px;font-family:inherit;font-size:14px;cursor:pointer">ביטול</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector("#weight-close").addEventListener("click", () => overlay.remove());
  overlay.querySelector("#weight-cancel-btn").addEventListener("click", () => overlay.remove());

  const wDateInp = overlay.querySelector("#w-date-inp");
  const wTodayBtn = overlay.querySelector("#w-date-today");
  const wOtherBtn = overlay.querySelector("#w-date-other");

  function setWDateActive(selectedIso) {
    const sel = selectedIso === todayIso;
    wTodayBtn.style.background = sel ? "var(--accent)" : "var(--surface)";
    wTodayBtn.style.color = sel ? "#fff" : "var(--text-secondary)";
    wTodayBtn.style.borderColor = sel ? "var(--accent)" : "var(--border-med)";
    wOtherBtn.style.background = !sel ? "var(--accent)" : "var(--surface)";
    wOtherBtn.style.color = !sel ? "#fff" : "var(--text-secondary)";
    wOtherBtn.style.borderColor = !sel ? "var(--accent)" : "var(--border-med)";
    wOtherBtn.textContent = !sel ? formatDate(selectedIso + "T12:00:00") : "תאריך אחר";
    wDateInp.style.display = !sel ? "block" : "none";
  }

  wTodayBtn.addEventListener("click", () => {
    wDateInp.value = todayIso;
    setWDateActive(todayIso);
  });

  wOtherBtn.addEventListener("click", () => {
    wDateInp.style.display = "block";
    wDateInp.focus();
  });

  wDateInp.addEventListener("change", () => setWDateActive(wDateInp.value));

  overlay.querySelector("#weight-save-btn").addEventListener("click", async () => {
    const dateVal = wDateInp.value;
    const weightVal = parseFloat(overlay.querySelector("#weight-value-inp").value);
    const noteVal = overlay.querySelector("#weight-note-inp").value.trim();
    if (!dateVal || !Number.isFinite(weightVal) || weightVal <= 0) {
      showToast("נא למלא תאריך ומשקל תקין");
      return;
    }
    const measuredAt = new Date(`${dateVal}T09:00:00`).toISOString();
    const matchedDay = logs.find(l => l.measured_date === dateVal);
    try {
      if (editing) {
        if (matchedDay && matchedDay.id !== editing.id) {
          showToast("כבר קיימת שקילה בתאריך הזה");
          return;
        }
        await updateWeightLog(editing.id, weightVal, measuredAt, noteVal);
      } else if (matchedDay) {
        await updateWeightLog(matchedDay.id, weightVal, measuredAt, noteVal);
        showToast("עודכן במקום רשומה קיימת לאותו יום ✓");
      } else {
        await saveWeightLog(weightVal, measuredAt, noteVal);
      }
      overlay.remove();
      render();
    } catch (_) {}
  });
}

function getWeightRangeDays() {
  return Number(state.weightRangeDays || 7);
}

function getWeightCustomRange() {
  if (!state.weightCustomRange) {
    state.weightCustomRange = { from: "", to: "" };
  }
  return state.weightCustomRange;
}

function selectCustomWeightRange() {
  const logs = getWeightLogsAsc();
  const customRange = getWeightCustomRange();
  if (!customRange.from && logs.length) customRange.from = logs[0].measured_date;
  if (!customRange.to && logs.length) customRange.to = logs[logs.length - 1].measured_date;
  state.weightRangeMode = "custom";
  render();
}

function setCustomWeightRangeDate(field, value) {
  const customRange = getWeightCustomRange();
  customRange[field] = value || "";
  state.weightRangeMode = "custom";
  render();
}

async function copyWeightWeeklySummary() {
  const allLogs = getWeightLogsAsc();
  if (!allLogs.length) return;

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const prevWeekEnd = new Date(weekStart);
  prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
  prevWeekEnd.setHours(23, 59, 59, 999);
  const prevWeekStart = new Date(prevWeekEnd);
  prevWeekStart.setDate(prevWeekStart.getDate() - 6);
  prevWeekStart.setHours(0, 0, 0, 0);

  const currentLogs = allLogs.filter(l => { const d = new Date(l.measured_at); return d >= weekStart && d <= today; });
  const prevLogs = allLogs.filter(l => { const d = new Date(l.measured_at); return d >= prevWeekStart && d <= prevWeekEnd; });

  if (!currentLogs.length) { showToast("אין שקילות ב-7 ימים האחרונים"); return; }

  const currentAvg = currentLogs.reduce((sum, l) => sum + Number(l.weight), 0) / currentLogs.length;
  const prevAvg = prevLogs.length ? prevLogs.reduce((sum, l) => sum + Number(l.weight), 0) / prevLogs.length : null;
  const delta = prevAvg !== null ? currentAvg - prevAvg : null;

  const rangeLine = `${formatDateShort(currentLogs[0].measured_at)} - ${formatDateShort(currentLogs[currentLogs.length - 1].measured_at)}`;
  const deltaLine = delta === null
    ? "שינוי משבוע קודם: אין נתונים לשבוע הקודם"
    : `שינוי משבוע קודם: ${delta > 0 ? "+" : ""}${delta.toFixed(1)} ק״ג`;

  const lines = [
    "*סיכום שקילות*",
    rangeLine,
    "",
    ...currentLogs.map(log => {
      const dayName = new Date(log.measured_at).toLocaleDateString("he-IL", { weekday: "short" });
      return `${dayName}, ${formatDateShort(log.measured_at)} - ${Number(log.weight).toFixed(1)} ק״ג`;
    }),
    "",
    `*ממוצע שבועי: ${currentAvg.toFixed(1)} ק״ג*`,
    prevAvg !== null ? `ממוצע שבוע קודם: ${prevAvg.toFixed(1)} ק״ג` : "ממוצע שבוע קודם: אין נתונים",
    deltaLine
  ];

  const text = lines.join("\n");
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  showToast("סיכום שבועי הועתק");
}

async function copyWeightRangeSummary() {
  if (state.weightRangeMode !== "custom") return;
  const logs = getWeightRangeLogs(getWeightRangeDays());
  if (!logs.length) return;

  const first = logs[0];
  const last = logs[logs.length - 1];
  const avg = logs.reduce((sum, log) => sum + Number(log.weight), 0) / logs.length;
  const customRange = getWeightCustomRange();
  const fromDate = customRange.from ? new Date(`${customRange.from}T00:00:00`) : new Date(first.measured_at);
  const toDate = customRange.to ? new Date(`${customRange.to}T00:00:00`) : new Date(last.measured_at);
  const selectedRangeDays = Math.max(1, Math.floor((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1);

  const rangeLine = `${formatDateShort(first.measured_at)} - ${formatDateShort(last.measured_at)}`;
  const lines = selectedRangeDays <= 7
    ? [
        "*סיכום שקילות*",
        rangeLine,
        "",
        ...logs.map(log => {
          const dayName = new Date(log.measured_at).toLocaleDateString("he-IL", { weekday: "short" });
          return `${dayName}, ${formatDateShort(log.measured_at)} - ${Number(log.weight).toFixed(1)} ק״ג`;
        }),
        "",
        `*ממוצע שבועי: ${avg.toFixed(1)} ק״ג*`
      ]
    : [
        "*סיכום שקילות*",
        rangeLine,
        "",
        `*משקל ממוצע לתקופה זו: ${avg.toFixed(1)} ק״ג*`
      ];
  const text = lines.join("\n");

  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  showToast("סיכום הטווח הועתק");
}

function getWeightRangeLogs(days) {
  const logs = getWeightLogsAsc();
  if (!logs.length) return [];
  if (state.weightRangeMode === "custom") {
    const customRange = getWeightCustomRange();
    if (!customRange.from || !customRange.to) return logs;
    const fromDate = new Date(`${customRange.from}T00:00:00`);
    const toDate = new Date(`${customRange.to}T23:59:59.999`);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return logs;
    if (fromDate > toDate) return [];
    return logs.filter(l => {
      const measured = new Date(l.measured_at);
      return measured >= fromDate && measured <= toDate;
    });
  }
  if (days === 0) return logs;
  const lastDate = new Date(logs[logs.length - 1].measured_at);
  const threshold = new Date(lastDate);
  threshold.setDate(threshold.getDate() - (days - 1));
  return logs.filter(l => new Date(l.measured_at) >= threshold);
}

function getWeightMovingAverage(logs, windowDays) {
  return logs.map((log) => {
    const logDate = new Date(log.measured_at);
    logDate.setHours(23, 59, 59, 999);
    const windowStart = new Date(logDate);
    windowStart.setDate(windowStart.getDate() - (windowDays - 1));
    windowStart.setHours(0, 0, 0, 0);
    const subset = logs.filter(l => {
      const d = new Date(l.measured_at);
      return d >= windowStart && d <= logDate;
    });
    const avg = subset.reduce((sum, item) => sum + Number(item.weight), 0) / subset.length;
    return { ...log, movingAvg: Number(avg.toFixed(2)) };
  });
}

function aggregateWeightByWeek(logs) {
  if (!logs.length) return [];
  const buckets = new Map();
  logs.forEach(log => {
    const weekKey = getWeekStart(log.measured_at).toISOString().slice(0, 10);
    if (!buckets.has(weekKey)) buckets.set(weekKey, []);
    buckets.get(weekKey).push(log);
  });
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, weekLogs]) => {
      const avgWeight = weekLogs.reduce((sum, item) => sum + Number(item.weight), 0) / weekLogs.length;
      const lastLog = weekLogs[weekLogs.length - 1];
      return {
        ...lastLog,
        weight: Number(avgWeight.toFixed(2))
      };
    });
}

function renderWeightChart(series, options = {}) {
  if (series.length < 2) {
    return `<div style="height:240px;display:flex;align-items:center;justify-content:center;color:var(--text-hint);font-size:13px">צריך לפחות 2 שקילות להצגת גרף</div>`;
  }
  const rangeDays = Number(options.rangeDays || 0);
  const denseThreshold = rangeDays >= 180 ? 28 : rangeDays >= 90 ? 40 : 55;
  const isDense = series.length > denseThreshold || !!options.denseHint;
  const targetPoints = rangeDays >= 180 ? 30 : rangeDays >= 90 ? 42 : 56;
  const keepEvery = Math.max(1, Math.ceil(series.length / targetPoints));
  const chartSeries = !isDense
    ? series
    : series.filter((_, idx) => idx === 0 || idx === series.length - 1 || idx % keepEvery === 0);

  const width = 1000;
  const height = 220;
  const pad = 28;
  const minY = Math.min(...series.map(p => Math.min(p.weight, p.movingAvg)));
  const maxY = Math.max(...series.map(p => Math.max(p.weight, p.movingAvg)));
  const spanY = Math.max(maxY - minY, 0.1);
  const stepX = (width - pad * 2) / Math.max(chartSeries.length - 1, 1);
  const points = chartSeries.map((p, i) => {
    const x = pad + i * stepX;
    const yW = height - pad - ((p.weight - minY) / spanY) * (height - pad * 2);
    const yAvg = height - pad - ((p.movingAvg - minY) / spanY) * (height - pad * 2);
    return { ...p, x, yW, yAvg };
  });
  const lineWeight = points.map(p => `${p.x},${p.yW}`).join(" ");
  const lineAvg = points.map(p => `${p.x},${p.yAvg}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const areaAvg = `${first.x},${height - pad} ${points.map(p => `${p.x},${p.yAvg}`).join(" ")} ${last.x},${height - pad}`;
  const gridLines = [0.25, 0.5, 0.75].map(ratio => {
    const y = height - pad - (height - pad * 2) * ratio;
    return `<line x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-opacity="0.7" />`;
  }).join("");
  const circlePoints = isDense
    ? points.filter((_, idx) => idx === 0 || idx === points.length - 1 || idx % Math.max(1, Math.ceil(points.length / 12)) === 0)
    : points;
  const weightStrokeOpacity = isDense ? 0.32 : 0.55;
  const weightStrokeWidth = isDense ? 1.2 : 1.8;
  const chartId = `weight-chart-${Math.random().toString(36).slice(2, 8)}`;
  const selected = circlePoints[circlePoints.length - 1];
  const minLabel = minY.toFixed(1);
  const maxLabel = maxY.toFixed(1);
  const midLabel = ((minY + maxY) / 2).toFixed(1);
  const widestScaleLabel = [maxLabel, midLabel, minLabel].sort((a, b) => b.length - a.length)[0];
  return `
    <div class="card" style="padding:10px;border-radius:12px">
      <div id="${chartId}-selected" style="display:flex;justify-content:space-between;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:8px 10px;margin-bottom:8px">
        <div>
          <div style="font-size:11px;color:var(--text-hint)">נקודה נבחרת</div>
          <div id="${chartId}-date" style="font-size:12px;color:var(--text-secondary);margin-top:2px">${formatDate(selected.measured_at)}</div>
        </div>
        <div style="text-align:left">
          <div id="${chartId}-weight" style="font-size:18px;font-weight:700;color:var(--text-primary)">${Number(selected.weight).toFixed(1)} ק״ג</div>
          <div id="${chartId}-avg" style="font-size:11px;color:var(--green)">ממוצע: ${Number(selected.movingAvg).toFixed(1)}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:stretch;direction:ltr">
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:0 5px;position:relative;overflow:hidden">
          <div style="visibility:hidden;font-size:11px;font-weight:700;white-space:nowrap">${widestScaleLabel}</div>
          <div style="position:absolute;top:${(pad / height) * 100}%;left:6px;transform:translateY(-50%);font-size:11px;font-weight:700;color:var(--text-secondary);text-align:left">${maxLabel}</div>
          <div style="position:absolute;top:50%;left:6px;transform:translateY(-50%);font-size:10px;color:var(--text-hint);text-align:left">${midLabel}</div>
          <div style="position:absolute;top:${((height - pad) / height) * 100}%;left:6px;transform:translateY(-50%);font-size:11px;font-weight:700;color:var(--text-secondary);text-align:left">${minLabel}</div>
          <div style="position:absolute;bottom:6px;left:6px;font-size:9px;color:var(--text-hint);text-align:left">ק״ג</div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column">
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="display:block;width:100%;height:240px;background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);border:1px solid var(--border);border-radius:12px;overflow:hidden">
          <defs>
            <linearGradient id="${chartId}-avg-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#22c55e" stop-opacity="0.18"></stop>
              <stop offset="100%" stop-color="#22c55e" stop-opacity="0.02"></stop>
            </linearGradient>
          </defs>
          ${gridLines}
          <polygon points="${areaAvg}" fill="url(#${chartId}-avg-fill)"></polygon>
          <polyline points="${lineWeight}" fill="none" stroke="var(--text-hint)" stroke-opacity="${weightStrokeOpacity}" stroke-width="${weightStrokeWidth}" stroke-linecap="round"></polyline>
          <polyline points="${lineAvg}" fill="none" stroke="var(--green)" stroke-width="3.2" stroke-linecap="round"></polyline>
          ${circlePoints.map((p, idx) => {
            const isActive = idx === circlePoints.length - 1;
            const baseR = isDense ? 4.8 : 6;
            return `<circle data-chart-id="${chartId}" data-base-r="${baseR}" data-idx="${idx}" cx="${p.x}" cy="${p.yW}" r="${isActive ? baseR + 1.6 : baseR}" fill="${isActive ? "var(--blue)" : "var(--accent)"}" opacity="${isActive ? "1" : "0.9"}" stroke="#fff" stroke-width="1.5" style="cursor:pointer" onclick="selectWeightChartPoint('${chartId}', ${idx}, '${p.measured_at}', ${Number(p.weight).toFixed(2)}, ${Number(p.movingAvg).toFixed(2)})"><title>${formatDate(p.measured_at)} · ${Number(p.weight).toFixed(1)} ק״ג</title></circle>`;
          }).join("")}
        </svg>
        <div style="display:flex;justify-content:space-between;padding:4px 2px 0;font-size:10px;color:var(--text-hint)">
          <span>${formatDateShort(chartSeries[0].measured_at)}</span>
          <span>${formatDateShort(chartSeries[Math.floor((chartSeries.length - 1) / 2)].measured_at)}</span>
          <span>${formatDateShort(chartSeries[chartSeries.length - 1].measured_at)}</span>
        </div>
        </div>
      </div>
      <div style="display:flex;gap:12px;align-items:center;justify-content:flex-start;margin-top:8px;font-size:11px;color:var(--text-secondary)">
        <span style="display:inline-flex;align-items:center;gap:5px"><span style="width:16px;height:0;border-top:2px solid var(--text-hint);opacity:${weightStrokeOpacity}"></span>משקל בפועל</span>
        <span style="display:inline-flex;align-items:center;gap:5px"><span style="width:16px;height:0;border-top:3px solid var(--green)"></span>ממוצע נע</span>
      </div>
    </div>
  `;
}

function selectWeightChartPoint(chartId, idx, measuredAt, weight, movingAvg) {
  const dateEl = document.getElementById(`${chartId}-date`);
  const weightEl = document.getElementById(`${chartId}-weight`);
  const avgEl = document.getElementById(`${chartId}-avg`);
  if (dateEl) dateEl.textContent = formatDate(measuredAt);
  if (weightEl) weightEl.textContent = `${Number(weight).toFixed(1)} ק״ג`;
  if (avgEl) avgEl.textContent = `ממוצע: ${Number(movingAvg).toFixed(1)}`;

  const nodes = document.querySelectorAll(`circle[data-chart-id="${chartId}"]`);
  nodes.forEach(node => {
    const nodeIdx = Number(node.getAttribute("data-idx"));
    const baseR = Number(node.getAttribute("data-base-r")) || 6;
    const isActive = nodeIdx === Number(idx);
    node.setAttribute("r", isActive ? String(baseR + 1.6) : String(baseR));
    node.setAttribute("fill", isActive ? "var(--blue)" : "var(--accent)");
    node.setAttribute("opacity", isActive ? "1" : "0.9");
  });
}
