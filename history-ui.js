// ── history-ui.js ────────────────────────────────────────────────

function onHistoryExerciseQueryInput(inputEl) {
  state.historyExerciseQuery = inputEl.value;
  state.historyPage = 0;
  const cursorPos = inputEl.selectionStart ?? inputEl.value.length;
  scheduleRender();
  requestAnimationFrame(() => {
    const nextInput = document.getElementById("history-exercise-search");
    if (!nextInput) return;
    nextInput.focus();
    nextInput.setSelectionRange(cursorPos, cursorPos);
  });
}

function renderHistory() {
  const tab = state.historyTab || "workouts";
  const tabs = `<div style="display:flex;gap:0;margin:0 14px 14px;background:var(--surface);border-radius:10px;padding:3px">
    <button onclick="state.historyTab='workouts';state.historyPage=0;render()" style="flex:1;padding:8px;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;background:${tab==='workouts'?'var(--card)':'transparent'};color:${tab==='workouts'?'var(--text-primary)':'var(--text-hint)'}">אימונים</button>
    <button onclick="state.historyTab='month';render()" style="flex:1;padding:8px;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;background:${tab==='month'?'var(--card)':'transparent'};color:${tab==='month'?'var(--text-primary)':'var(--text-hint)'}">החודש שלי</button>
    <button onclick="state.historyTab='weight';state.weightHistoryPage=0;render()" style="flex:1;padding:8px;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;background:${tab==='weight'?'var(--card)':'transparent'};color:${tab==='weight'?'var(--text-primary)':'var(--text-hint)'}">משקל</button>
  </div>`;

  if (tab === "month") {
    return renderMonthTab(tabs);
  }

  if (tab === "weight") {
    const allLogs = getWeightLogsAsc();
    if (!allLogs.length) {
      return `<div style="padding:0 14px">${tabs}
        <div class="card" style="padding:26px 18px;text-align:center">
          <div style="font-size:15px;color:var(--text-secondary);margin-bottom:12px">אין נתוני משקל עדיין</div>
          <button onclick="openWeightEntryModal()" class="btn-primary" style="max-width:220px;margin:0 auto">הוסף שקילה ראשונה</button>
        </div>
      </div>`;
    }
    const range = getWeightRangeDays();
    const filtered = getWeightRangeLogs(range);
    const isCustomRange = state.weightRangeMode === "custom";
    const customRange = getWeightCustomRange();
    const customFrom = customRange.from || "";
    const customTo = customRange.to || "";
    const customRangeDays = (customFrom && customTo)
      ? Math.max(1, Math.floor((new Date(`${customTo}T00:00:00`) - new Date(`${customFrom}T00:00:00`)) / (1000 * 60 * 60 * 24)) + 1)
      : 90;
    const customRangeInvalid = isCustomRange && customFrom && customTo && new Date(`${customFrom}T00:00:00`) > new Date(`${customTo}T00:00:00`);
    const hasFilteredData = filtered.length > 0;
    // Compute 7-day rolling average on ALL logs so early points in a short range
    // still benefit from history before the visible window.
    const allLogsWithAvg = getWeightMovingAverage(allLogs, 7);
    const filteredIds = new Set(filtered.map(l => l.id));
    const filteredWithAvg = allLogsWithAvg.filter(l => filteredIds.has(l.id));
    const withAvg = filteredWithAvg;
    const weeklyTrendSeries = filteredWithAvg;
    const chartBase = !isCustomRange && range >= 180 ? aggregateWeightByWeek(filteredWithAvg) : filteredWithAvg;
    const chartSeries = !isCustomRange && range >= 180
      ? getWeightMovingAverage(chartBase, Math.max(2, Math.ceil(chartBase.length / 8)))
      : filteredWithAvg;
    const latest = hasFilteredData ? filtered[filtered.length - 1] : null;
    const latestOverall = allLogs[allLogs.length - 1] || null;
    const first = hasFilteredData ? filtered[0] : null;
    const delta = hasFilteredData
      ? ((weeklyTrendSeries[weeklyTrendSeries.length - 1]?.movingAvg ?? latest.weight) - (weeklyTrendSeries[0]?.movingAvg ?? first.weight))
      : 0;
    const avg7 = hasFilteredData ? (withAvg[withAvg.length - 1]?.movingAvg ?? latest.weight) : 0;
    const summaryCards = `
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px">
        <div class="card" style="padding:10px"><div style="font-size:11px;color:var(--text-hint)">אחרון</div><div style="font-size:19px;font-weight:700">${hasFilteredData ? latest.weight.toFixed(1) : "-"}</div></div>
        <div class="card" style="padding:10px"><div style="font-size:11px;color:var(--text-hint)">ממוצע 7 ימים</div><div style="font-size:19px;font-weight:700;color:var(--green)">${hasFilteredData ? avg7.toFixed(1) : "-"}</div></div>
        <div class="card" style="padding:10px"><div style="font-size:11px;color:var(--text-hint)">שינוי בטווח</div><div style="font-size:19px;font-weight:700;color:${delta < 0 ? "var(--green)" : delta > 0 ? "var(--red)" : "var(--text-primary)"}">${hasFilteredData ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}` : "-"}</div></div>
      </div>
    `;

    const rangeButtons = [
      { days: 7, label: "7 ימים" },
      { days: 30, label: "30 ימים" },
      { days: 90, label: "90 ימים" },
      { days: 180, label: "6 חודשים" },
      { days: 365, label: "שנה" }
    ].map(r => `<button onclick="state.weightRangeMode='preset';state.weightRangeDays=${r.days};state.weightHistoryPage=0;render()" style="padding:7px 10px;border-radius:999px;border:1px solid ${!isCustomRange&&range===r.days?"var(--accent)":"var(--border-med)"};background:${!isCustomRange&&range===r.days?"var(--accent)":"var(--surface)"};color:${!isCustomRange&&range===r.days?"#fff":"var(--text-secondary)"};font-family:inherit;font-size:11px;cursor:pointer">${r.label}</button>`).join("");
    const customRangeBtn = `<button onclick="selectCustomWeightRange()" style="padding:7px 10px;border-radius:999px;border:1px solid ${isCustomRange?"var(--accent)":"var(--border-med)"};background:${isCustomRange?"var(--accent)":"var(--surface)"};color:${isCustomRange?"#fff":"var(--text-secondary)"};font-family:inherit;font-size:11px;cursor:pointer">טווח תאריכים</button>`;
    const showRangeCopy = isCustomRange && hasFilteredData;
    const customRangeControls = isCustomRange ? `
      <div class="card" style="padding:10px;margin-bottom:10px">
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px">בחר טווח תאריכים להצגת המשקלים</div>
        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
          <label style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:120px">
            <span style="font-size:10px;color:var(--text-hint)">מתאריך</span>
            <input type="date" value="${customFrom}" onchange="setCustomWeightRangeDate('from', this.value)" style="padding:8px;border-radius:8px;border:1px solid var(--border-med);background:var(--surface);color:var(--text-primary);font-family:inherit">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:120px">
            <span style="font-size:10px;color:var(--text-hint)">עד תאריך</span>
            <input type="date" value="${customTo}" onchange="setCustomWeightRangeDate('to', this.value)" style="padding:8px;border-radius:8px;border:1px solid var(--border-med);background:var(--surface);color:var(--text-primary);font-family:inherit">
          </label>
        </div>
        ${customRangeInvalid ? `<div style="font-size:11px;color:var(--red);margin-top:8px">תאריך התחלה חייב להיות מוקדם או שווה לתאריך הסיום</div>` : ""}
      </div>
    ` : "";
    const allWeightRows = [...withAvg].reverse();
    const WEIGHT_PAGE_SIZE = 30;
    const weightPage = state.weightHistoryPage || 0;
    const visibleWeightRows = allWeightRows.slice(0, (weightPage + 1) * WEIGHT_PAGE_SIZE);
    const hasMoreWeight = allWeightRows.length > visibleWeightRows.length;
    const rows = visibleWeightRows.map((log, ri) => {
      const prev = allWeightRows[ri + 1];
      const diff = prev ? (log.weight - prev.weight) : null;
      const diffColor = diff === null ? "" : diff < 0 ? "var(--green)" : diff > 0 ? "var(--red)" : "var(--text-hint)";
      const diffText = diff === null ? "" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)} ק״ג`;
      return `<div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px">
        <div>
          <div style="font-size:18px;font-weight:700">${log.weight.toFixed(1)} <span style="font-size:12px;font-weight:500;color:var(--text-hint)">ק״ג</span></div>
          <div style="font-size:11px;color:var(--text-hint);margin-top:2px">${formatWeightDate(log)} · ממוצע 7י: ${log.movingAvg.toFixed(1)}</div>
          ${log.note ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:3px">${escapeHtml(log.note)}</div>` : ""}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          ${diff !== null ? `<span style="font-size:11px;font-weight:700;color:${diffColor}">${diffText}</span>` : ""}
          <button onclick="openWeightEntryModal('${log.id}')" class="icon-btn"><i data-lucide="pencil" style="width:14px;height:14px"></i></button>
          <button data-del-weight="${log.id}" class="del-btn"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
        </div>
      </div>`;
    }).join("");
    const weightLoadMoreBtn = hasMoreWeight
      ? `<div style="padding:4px 0 4px;text-align:center"><button onclick="state.weightHistoryPage=(state.weightHistoryPage||0)+1;render()" style="padding:10px 28px;background:var(--surface);border:1px solid var(--border-med);border-radius:10px;font-family:inherit;font-size:13px;font-weight:600;color:var(--text-secondary);cursor:pointer">הצג עוד (${allWeightRows.length - visibleWeightRows.length})</button></div>`
      : "";
    const weightGoalValues = getWeightGoalValues(state.weightGoal);
    const hasGoalWeight = Number.isFinite(weightGoalValues.target) && weightGoalValues.target > 0;
    const goalGap = (hasGoalWeight && latestOverall) ? Math.abs(Number(latestOverall.weight) - Number(weightGoalValues.target)) : null;
    const goalGapText = goalGap !== null ? `${goalGap.toFixed(1)} ק״ג` : "";
    const goalSummaryText = !hasGoalWeight
      ? "לא הוגדר יעד משקל"
      : goalGap !== null && goalGap <= 0.3
      ? `יעד: ${Number(weightGoalValues.target).toFixed(1)} ק״ג | קרוב ליעד`
      : `יעד: ${Number(weightGoalValues.target).toFixed(1)} ק״ג | פער נוכחי: ${goalGapText}`;
    return `<div style="padding:14px 14px 0">${tabs}
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:10px">${rangeButtons}${customRangeBtn}</div>
      ${customRangeControls}
      ${summaryCards}
      ${hasFilteredData ? renderWeightChart(chartSeries, { rangeDays: isCustomRange ? customRangeDays : range, denseHint: isCustomRange ? customRangeDays >= 90 : range >= 90 }) : `<div class="card" style="padding:18px;text-align:center;color:var(--text-hint);font-size:13px">אין נתוני משקל בטווח התאריכים שנבחר</div>`}
      <div style="margin-top:8px;font-size:11px;color:var(--text-hint)">${goalSummaryText}</div>
      <div style="display:flex;justify-content:flex-start;margin-top:10px">
        <button onclick="openWeightEntryModal()" class="btn-primary" style="width:auto;padding:8px 14px;font-size:12px">הוסף</button>
        ${!isCustomRange && range === 7 ? `<button onclick="copyWeightWeeklySummary()" style="width:auto;padding:8px 12px;font-size:12px;margin-right:8px;background:var(--surface);color:var(--text-secondary);border:1px solid var(--border-med);border-radius:10px;cursor:pointer;font-family:inherit;font-weight:600">העתק סיכום</button>` : ""}
        ${showRangeCopy ? `<button onclick="copyWeightRangeSummary()" style="width:auto;padding:8px 12px;font-size:12px;margin-right:8px;background:var(--surface);color:var(--text-secondary);border:1px solid var(--border-med);border-radius:10px;cursor:pointer;font-family:inherit;font-weight:600">העתק סיכום</button>` : ""}
      </div>
      <div style="margin-top:10px;display:grid;gap:8px;padding-bottom:12px">${rows}</div>
      ${weightLoadMoreBtn}
    </div>`;
  }

  const exportBtn = `<div style="padding:0 0 10px;display:flex;justify-content:flex-start">
    <button onclick="exportCSV()" style="display:flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border-med);border-radius:8px;padding:7px 12px;cursor:pointer;font-size:12px;font-family:inherit;color:var(--text-secondary)">
      <i data-lucide="download" style="width:13px;height:13px"></i> ייצוא CSV
    </button>
  </div>`;

  if (!state.sessions.length) return `<div style="padding:14px">${tabs}${exportBtn}<div style="padding:30px;text-align:center;color:var(--text-hint);font-size:14px">אין אימונים עדיין</div></div>`;

  const improvedCount = (session, prevSameType) => {
    const exNames = Object.keys(session.exercises || {});
    return exNames.filter(name => {
      const sets = (session.exercises[name]||[]).filter(s=>s.weight>0||s.reps>0);
      const prevSets = prevSameType?.exercises?.[name]||[];
      return prevSets.length>0 && sets.some((s,i)=>prevSets[i]&&s.weight>prevSets[i].weight);
    }).length;
  };

  const mode = state.historyWorkoutFilterMode || "all";
  const workoutId = state.historyWorkoutId || "all";
  const exQuery = (state.historyExerciseQuery || "").trim().toLowerCase();

  const workoutOptions = [
    `<option value="all" ${workoutId === "all" ? "selected" : ""}>כל התוכניות</option>`,
    ...state.workouts.map(w => `<option value="${w.id}" ${workoutId === w.id ? "selected" : ""}>${escapeHtml(w.name)}</option>`)
  ].join("");

  const filteredSessions = [...state.sessions].filter((session, idx) => {
    if (workoutId !== "all" && session.workoutId !== workoutId) return false;
    if (exQuery) {
      const names = Object.keys(session.exercises || {}).map(x => x.toLowerCase());
      if (!names.some(n => n.includes(exQuery))) return false;
    }
    if (mode === "improved") {
      const prevSameType = state.sessions.slice(0, idx).reverse().find(s => s.workoutId === session.workoutId);
      return improvedCount(session, prevSameType) > 0;
    }
    return true;
  }).reverse();

  if (!state.expandedSessions) state.expandedSessions = new Set();
  return `<div style="padding:14px">${tabs}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <button onclick="state.historyWorkoutFilterMode='all';state.historyPage=0;render()" style="padding:8px 10px;border-radius:10px;border:1px solid ${mode==='all'?'var(--accent)':'var(--border-med)'};background:${mode==='all'?'var(--accent)':'var(--card)'};color:${mode==='all'?'#fff':'var(--text-secondary)'};font-family:inherit;font-size:12px;cursor:pointer">הכול</button>
      <button onclick="state.historyWorkoutFilterMode='improved';state.historyPage=0;render()" style="padding:8px 10px;border-radius:10px;border:1px solid ${mode==='improved'?'var(--green)':'var(--border-med)'};background:${mode==='improved'?'var(--green-bg)':'var(--card)'};color:${mode==='improved'?'var(--green)':'var(--text-secondary)'};font-family:inherit;font-size:12px;cursor:pointer">רק עם שיפור</button>
    </div>
    <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;margin-bottom:10px">
      <select onchange="state.historyWorkoutId=this.value;state.historyPage=0;render()" style="padding:9px 10px;border:1px solid var(--border-med);border-radius:10px;background:var(--card);font-family:inherit;font-size:12px;color:var(--text-primary)">${workoutOptions}</select>
      <input id="history-exercise-search" type="text" value="${escapeHtml(state.historyExerciseQuery || "")}" oninput="onHistoryExerciseQueryInput(this)" placeholder="חפש לפי תרגיל" style="padding:9px 10px;border:1px solid var(--border-med);border-radius:10px;background:var(--card);font-family:inherit;font-size:12px;color:var(--text-primary)">
    </div>
    ${exportBtn}
    ${(() => {
    if (filteredSessions.length === 0) return `<div style="padding:30px;text-align:center;color:var(--text-hint);font-size:14px">לא נמצאו אימונים לפי הסינון שבחרת</div>`;
    const PAGE_SIZE = 20;
    const currentPage = state.historyPage || 0;
    const visibleSessions = filteredSessions.slice(0, (currentPage + 1) * PAGE_SIZE);
    const hasMore = filteredSessions.length > visibleSessions.length;
    const sessionCards = visibleSessions.map((session) => {
      const originalIdx = state.sessions.findIndex(s => s.id === session.id);
      const w = getWorkout(session.workoutId);
      const wName = w ? w.name : (session.workoutName || session.workoutId);
      const prevSameType = state.sessions.slice(0, originalIdx).reverse().find(s => s.workoutId === session.workoutId);
      const isExpanded = state.expandedSessions.has(session.id);

      const exNames = Object.keys(session.exercises);
      const totalEx = exNames.length;
      const improved = improvedCount(session, prevSameType);

      const sessionVol = calcSessionVolume(session.exercises);
      const summaryChips = `
        <span style="font-size:11px;color:var(--text-hint)">${totalEx} תרגילים</span>
        <span style="font-size:11px;color:var(--text-hint)">·</span>
        <span style="font-size:11px;color:var(--text-hint)">${formatVolume(sessionVol)}</span>
        ${improved > 0 ? `<span style="font-size:11px;color:var(--green);font-weight:600;display:inline-flex;align-items:center;gap:2px"><i data-lucide="trending-up" style="width:11px;height:11px"></i> ${improved} שיפרת</span>` : (prevSameType ? `<span style="font-size:11px;color:var(--text-hint)">ללא שינוי</span>` : "")}
      `;

      const exRows = isExpanded ? exNames.map(name => {
        const sets = (session.exercises[name]||[]).filter(s => s.weight>0||s.reps>0||s.minutes>0);
        if (!sets.length) return "";
        const prevSets = prevSameType?.exercises?.[name]||[];
        const exImproved = prevSets.length>0 && sets.some((s,i) => prevSets[i] && s.weight>prevSets[i].weight);
        const rest = w ? getExRest(w, name) : null;
        const setsTable = sets.map((s,i) => {
          const p=prevSets[i]; const imp=p&&s.weight>p.weight; const reg=p&&s.weight>0&&s.weight<p.weight;
          const failed = !!s.failed;
          if (s.minutes > 0) {
            return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0">
              <span style="min-width:14px;font-size:11px;color:var(--text-hint);font-weight:600">${s.num}</span>
              <span style="font-size:13px;color:var(--text-primary);font-weight:500">${s.minutes} דקות</span>
            </div>`;
          }
          return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0">
            <span style="min-width:14px;font-size:11px;color:${failed?"var(--red)":"var(--text-hint)"};font-weight:600">${s.num}</span>
            <span style="font-size:13px;color:${failed?"var(--red)":"var(--text-primary)"};font-weight:500;min-width:56px">${s.weight} ק״ג</span>
            <span style="font-size:13px;color:${failed?"var(--red)":"var(--text-secondary)"};min-width:44px">× ${s.reps}</span>
            ${failed ? `<span style="font-size:10px;color:var(--red);font-weight:600">כשל</span>` : p?`<i data-lucide="${imp?"trending-up":reg?"trending-down":"minus"}" style="width:13px;height:13px;color:${imp?"var(--green)":reg?"var(--red)":"var(--text-hint)"}"></i>`:""}
          </div>`;
        }).join("");
        return `<div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
            <div style="display:flex;align-items:center;gap:7px">
              <span style="font-size:13px;font-weight:600;color:var(--text-primary)">${escapeHtml(name)}</span>
              ${rest ? `<span class="rest-chip"><i data-lucide="timer" style="width:10px;height:10px"></i> ${formatRest(rest)}</span>` : ""}
            </div>
            ${exImproved ? `<span style="font-size:11px;color:var(--green);font-weight:600;display:flex;align-items:center;gap:3px"><i data-lucide="trending-up" style="width:12px;height:12px"></i> שיפרת</span>` : prevSets.length>0 ? `<span style="font-size:11px;color:var(--text-hint)">ללא שינוי</span>` : ""}
          </div>
          <div style="padding-right:4px">${setsTable}</div>
        </div>`;
      }).join("") : "";

      return `<div class="card" style="padding:0;overflow:hidden">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:13px 16px;cursor:pointer" onclick="toggleHistorySession('${session.id}')">
          <div style="display:flex;align-items:center;gap:7px">
            <i data-lucide="dumbbell" style="width:16px;height:16px;color:var(--text-secondary)"></i>
            <div>
              <span style="font-weight:700;font-size:15px;color:var(--text-primary)">${escapeHtml(wName)}</span>
              <div style="display:flex;align-items:center;gap:8px;margin-top:3px">${summaryChips}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:12px;color:var(--text-hint);display:flex;align-items:center;gap:3px">
              <i data-lucide="clock" style="width:11px;height:11px"></i> ${formatDate(session.date)}
            </span>
            <button class="del-btn" data-del-session="${originalIdx}" onclick="event.stopPropagation()">
              <i data-lucide="trash-2" style="width:15px;height:15px"></i>
            </button>
            <i data-lucide="${isExpanded?"chevron-up":"chevron-down"}" style="width:15px;height:15px;color:var(--text-hint)"></i>
          </div>
        </div>
        ${isExpanded ? `<div style="padding:4px 16px 14px;border-top:1px solid var(--border)">
          ${session.note ? `<div style="display:flex;align-items:flex-start;gap:6px;padding:8px 0 10px;border-bottom:1px solid var(--border);margin-bottom:8px">
            <i data-lucide="message-square" style="width:13px;height:13px;color:var(--text-hint);margin-top:1px;flex-shrink:0"></i>
            <span style="font-size:12px;color:var(--text-secondary);line-height:1.5">${escapeHtml(session.note).replace(/\n/g, "<br>")}</span>
          </div>` : ""}
          ${exRows}
        </div>` : ""}
      </div>`;
    }).join("");
    const loadMoreBtn = hasMore
      ? `<div style="padding:8px 0 4px;text-align:center"><button onclick="state.historyPage=(state.historyPage||0)+1;render()" style="padding:10px 28px;background:var(--surface);border:1px solid var(--border-med);border-radius:10px;font-family:inherit;font-size:13px;font-weight:600;color:var(--text-secondary);cursor:pointer">הצג עוד (${filteredSessions.length - visibleSessions.length})</button></div>`
      : "";
    return sessionCards + loadMoreBtn;
  })()}</div>`;
}

function renderMonthTab(tabs) {
  const now = new Date();
  const monthNames = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

  const viewYear = state.monthViewYear ?? now.getFullYear();
  const viewMonth = state.monthViewMonth ?? now.getMonth();
  state.monthViewYear = viewYear;
  state.monthViewMonth = viewMonth;

  const monthStart = new Date(viewYear, viewMonth, 1);
  const monthEnd = new Date(viewYear, viewMonth + 1, 0);
  const prevMonthStart = new Date(viewYear, viewMonth - 1, 1);
  const prevMonthEnd = new Date(viewYear, viewMonth, 0);

  const sessions = state.sessions.filter(s => {
    const d = new Date(s.date);
    return d >= monthStart && d <= monthEnd;
  });
  const prevSessions = state.sessions.filter(s => {
    const d = new Date(s.date);
    return d >= prevMonthStart && d <= prevMonthEnd;
  });

  const totalVol = sessions.reduce((t, s) => t + calcSessionVolume(s.exercises), 0);
  const totalSets = sessions.reduce((t, s) =>
    t + Object.values(s.exercises||{}).reduce((tt, sets) => tt + sets.filter(x=>x.reps>0).length, 0), 0);
  const prevTotalVol = prevSessions.reduce((t, s) => t + calcSessionVolume(s.exercises), 0);
  const prevTotalSets = prevSessions.reduce((t, s) =>
    t + Object.values(s.exercises||{}).reduce((tt, sets) => tt + sets.filter(x=>x.reps>0).length, 0), 0);

  // PRs broken this month
  const allPRs = {};
  state.sessions.forEach(s => {
    const d = new Date(s.date);
    const inMonth = d >= monthStart && d <= monthEnd;
    Object.entries(s.exercises||{}).forEach(([name, sets]) => {
      const maxW = Math.max(...sets.map(x=>x.weight||0));
      if (!allPRs[name]) allPRs[name] = { before: 0, inMonth: 0 };
      if (inMonth) allPRs[name].inMonth = Math.max(allPRs[name].inMonth, maxW);
      else allPRs[name].before = Math.max(allPRs[name].before, maxW);
    });
  });
  const newPRs = Object.entries(allPRs).filter(([,v]) => v.inMonth > v.before && v.inMonth > 0).length;
  const prevAllPRs = {};
  state.sessions.forEach(s => {
    const d = new Date(s.date);
    const inPrevMonth = d >= prevMonthStart && d <= prevMonthEnd;
    Object.entries(s.exercises||{}).forEach(([name, sets]) => {
      const maxW = Math.max(...sets.map(x=>x.weight||0));
      if (!prevAllPRs[name]) prevAllPRs[name] = { before: 0, inMonth: 0 };
      if (inPrevMonth) prevAllPRs[name].inMonth = Math.max(prevAllPRs[name].inMonth, maxW);
      else if (d < prevMonthStart) prevAllPRs[name].before = Math.max(prevAllPRs[name].before, maxW);
    });
  });
  const prevMonthPrs = Object.entries(prevAllPRs).filter(([,v]) => v.inMonth > v.before && v.inMonth > 0).length;

  // Most improved exercise
  const improvements = {};
  sessions.forEach(s => {
    const d = new Date(s.date);
    const prevSession = state.sessions.filter(x => new Date(x.date) < monthStart && x.workoutId === s.workoutId).slice(-1)[0];
    if (!prevSession) return;
    Object.entries(s.exercises||{}).forEach(([name, sets]) => {
      const cur = Math.max(...sets.map(x=>x.weight||0));
      const prev = Math.max(...(prevSession.exercises?.[name]||[]).map(x=>x.weight||0));
      if (cur > prev) improvements[name] = (improvements[name]||0) + (cur - prev);
    });
  });
  const topEx = Object.entries(improvements).sort((a,b)=>b[1]-a[1])[0];
  const deltaText = (curr, prev, suffix = "") => {
    const diff = curr - prev;
    if (diff === 0) return "ללא שינוי";
    return `${diff > 0 ? "+" : ""}${diff}${suffix} מול חודש קודם`;
  };
  const pctText = (curr, prev) => {
    if (prev <= 0) return curr > 0 ? "נתון חדש החודש" : "אין שינוי";
    const pct = Math.round(((curr - prev) / prev) * 100);
    return `${pct >= 0 ? "+" : ""}${pct}% מול חודש קודם`;
  };
  // calendar grid
  const firstDow = monthStart.getDay();
  const daysInMonth = monthEnd.getDate();
  const workoutDays = new Set(sessions.map(s => new Date(s.date).getDate()));
  const dayNames = ["א","ב","ג","ד","ה","ו","ש"];
  const calCells = [];
  for (let i = 0; i < firstDow; i++) calCells.push(`<div></div>`);
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === now.getDate() && viewMonth === now.getMonth() && viewYear === now.getFullYear();
    const worked = workoutDays.has(d);
    const bg = worked ? "var(--green-bg)" : isToday ? "var(--surface)" : "transparent";
    const border = worked ? "1px solid #86efac" : isToday ? "1px solid var(--border-med)" : "none";
    const color = worked ? "var(--green)" : isToday ? "var(--text-primary)" : "var(--text-hint)";
    const fw = isToday ? "700" : "400";
    calCells.push(`<div style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:8px;background:${bg};border:${border};font-size:13px;color:${color};font-weight:${fw}">${d}</div>`);
  }

  const firstSession = state.sessions.length ? state.sessions[0] : null;
  const firstD = firstSession ? new Date(firstSession.date) : now;
  const firstYear = firstD.getFullYear();
  const firstMonth = firstD.getMonth();
  const isPrev = viewYear > firstYear || (viewYear === firstYear && viewMonth > firstMonth);
  const isNext = viewMonth < now.getMonth() || viewYear < now.getFullYear();

  return `<div style="padding:0 14px 16px">
    ${tabs}

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding:0 2px">
      <button onclick="prevMonth()" style="background:none;border:none;cursor:pointer;padding:6px;color:${isPrev?"var(--text-primary)":"var(--border-med)"};display:flex" ${isPrev?"":"disabled"}>
        <i data-lucide="chevron-right" style="width:18px;height:18px"></i>
      </button>
      <span style="font-weight:700;font-size:15px;color:var(--text-primary)">${monthNames[viewMonth]} ${viewYear}</span>
      <button onclick="nextMonth()" style="background:none;border:none;cursor:pointer;padding:6px;color:${isNext?"var(--text-primary)":"var(--border-med)"};display:flex" ${isNext?"":"disabled"}>
        <i data-lucide="chevron-left" style="width:18px;height:18px"></i>
      </button>
    </div>

    <div class="card" style="padding:14px;margin-bottom:14px">
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:8px">
        ${dayNames.map(d=>`<div style="text-align:center;font-size:10px;color:var(--text-hint);font-weight:600;padding:4px 0">${d}</div>`).join("")}
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">
        ${calCells.join("")}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
      <div class="stat-card">
        <div class="stat-label">אימונים</div>
        <div class="stat-value">${sessions.length}</div>
        <div class="stat-sub">${deltaText(sessions.length, prevSessions.length)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">נפח כולל</div>
        <div class="stat-value" style="font-size:18px">${formatVolume(totalVol)}</div>
        <div class="stat-sub">${pctText(totalVol, prevTotalVol)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">סטים</div>
        <div class="stat-value">${totalSets}</div>
        <div class="stat-sub">${deltaText(totalSets, prevTotalSets)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">שיאים חדשים</div>
        <div class="stat-value" style="color:${newPRs>0?"var(--green)":"var(--text-primary)"}">${newPRs}</div>
        <div class="stat-sub">${deltaText(newPRs, prevMonthPrs)}</div>
      </div>
    </div>

    ${topEx ? `<div class="card" style="padding:12px 16px;display:flex;align-items:center;gap:10px">
      <i data-lucide="trending-up" style="width:18px;height:18px;color:var(--green);flex-shrink:0"></i>
      <div>
        <div style="font-size:11px;color:var(--text-hint);font-weight:600">הכי השתפרת</div>
        <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-top:2px">${topEx[0]}</div>
        <div style="font-size:11px;color:var(--green)">+${topEx[1]} ק״ג מעל האימון הקודם</div>
      </div>
    </div>` : sessions.length === 0 ? `<div style="padding:30px;text-align:center;color:var(--text-hint);font-size:14px">אין אימונים בחודש זה</div>` : ""}
  </div>`;
}

function prevMonth() {
  const firstSession = state.sessions.length ? state.sessions[0] : null;
  const firstD = firstSession ? new Date(firstSession.date) : new Date();
  const firstYear = firstD.getFullYear();
  const firstMonth = firstD.getMonth();
  if (state.monthViewYear === firstYear && state.monthViewMonth <= firstMonth) return;
  if (state.monthViewMonth === 0) { state.monthViewYear--; state.monthViewMonth = 11; }
  else state.monthViewMonth--;
  render();
}
function nextMonth() {
  const now = new Date();
  if (state.monthViewYear > now.getFullYear() || (state.monthViewYear === now.getFullYear() && state.monthViewMonth >= now.getMonth())) return;
  if (state.monthViewMonth === 11) { state.monthViewYear++; state.monthViewMonth = 0; }
  else state.monthViewMonth++;
  render();
}

function toggleHistorySession(id) {
  if (!state.expandedSessions) state.expandedSessions = new Set();
  if (state.expandedSessions.has(id)) state.expandedSessions.delete(id);
  else state.expandedSessions.add(id);
  render();
}
