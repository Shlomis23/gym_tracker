function getWeekStreak() {
  if (!state.sessions.length) return 0;
  const getWeekKey = (iso) => getWeekStart(iso).toISOString().slice(0,10);
  const weekCounts = {};

  state.sessions.forEach(s => {
    const k = getWeekKey(s.date);
    weekCounts[k] = (weekCounts[k] || 0) + 1;
  });

  const todayWeekKey = getWeekKey(new Date().toISOString());

  // בדוק רק שבועות שהסתיימו, כדי שהשבוע הנוכחי לא ישבור את הרצף באמצע
  const weeks = Object.keys(weekCounts)
    .sort()
    .reverse()
    .filter(w => w !== todayWeekKey);

  let streak = 0;
  let prevWeekKey = null;

  for (const w of weeks) {
    const goalForWeek = getGoalForWeek(w);

    if (weekCounts[w] >= goalForWeek) {
      // וודא שאין חור בין שבועות שהושלמו
      if (prevWeekKey !== null) {
        const prevDate = new Date(prevWeekKey);
        const thisDate = new Date(w);
        const diffWeeks = Math.round((prevDate - thisDate) / (7 * 24 * 60 * 60 * 1000));
        if (diffWeeks > 1) break;
      }
      streak++;
      prevWeekKey = w;
    } else {
      break;
    }
  }

  return streak;
}

function getThisWeekCount() {
  const weekStart = getWeekStart(new Date());
  return state.sessions.filter(s => new Date(s.date) >= weekStart).length;
}

function getPRs() {
  const prs = {};
  state.sessions.forEach(session => {
    Object.entries(session.exercises||{}).forEach(([name, sets]) => {
      sets.forEach(s => {
        if (s.weight > (prs[name]?.weight || 0)) {
          // חפש קטגוריה — קודם בתוכניות הפעילות, אחר כך במאגר
          let category = null;
          state.workouts.forEach(w => {
            const ex = w.exercises.find(e => (typeof e==="string"?e:e.name) === name);
            if (ex?.category) category = ex.category;
          });
          if (!category) {
            const libEntry = state.exerciseLibrary.find(e => e.name === name);
            if (libEntry?.category) category = libEntry.category;
          }
          prs[name] = { weight: s.weight, date: session.date, category };
        }
      });
    });
  });
  return prs;
}

function startCountUp(el) {
  const target = parseFloat(el.dataset.countup);
  const suffix = el.dataset.suffix || "";
  if (isNaN(target) || target === 0) { el.textContent = "0" + suffix; return; }
  const duration = 1100;
  const start = performance.now();
  const isInt = Number.isInteger(target);
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    const val = target * ease;
    el.textContent = (isInt ? Math.round(val) : val.toFixed(1)) + suffix;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function bindScrollAnimations() {
  const cards = document.querySelectorAll(".anim-card");
  if (!cards.length) return;
  if (state.dashboardAnimatedOnce) {
    cards.forEach(card => {
      card.style.opacity = "1";
      card.style.transform = "translateY(0)";
      card.querySelectorAll("[data-countup]").forEach(el => {
        const target = parseFloat(el.dataset.countup);
        const suffix = el.dataset.suffix || "";
        el.textContent = (Number.isInteger(target) ? Math.round(target) : target.toFixed(1)) + suffix;
      });
      card.querySelectorAll(".day-cell-anim").forEach(cell => {
        cell.style.animation = "none";
        cell.style.opacity = "1";
        cell.style.transform = "translateY(0) scale(1)";
      });
    });
    return;
  }
  cards.forEach(card => {
    const delay = parseFloat(card.style.animationDelay) || 0;
    setTimeout(() => {
      card.style.transition = "opacity 0.75s cubic-bezier(0.22, 1, 0.36, 1), transform 0.75s cubic-bezier(0.22, 1, 0.36, 1)";
      card.style.opacity = "1";
      card.style.transform = "translateY(0)";
      card.querySelectorAll("[data-countup]").forEach(startCountUp);
      card.querySelectorAll(".day-cell-anim").forEach(cell => {
        const cellDelay = parseFloat(cell.style.animationDelay) || 0;
        setTimeout(() => {
          cell.style.transition = "opacity 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)";
          cell.style.opacity = "1";
          cell.style.transform = "translateY(0) scale(1)";
        }, cellDelay * 1000);
      });
    }, delay * 1000);
  });
  state.dashboardAnimatedOnce = true;
}

function getDaysSinceLastWorkout() {
  if (!state.sessions.length) return null;
  const last = state.sessions[state.sessions.length - 1];
  const today = new Date(); today.setHours(0,0,0,0);
  const lastDay = new Date(last.date); lastDay.setHours(0,0,0,0);
  const days = Math.round((today - lastDay) / (1000 * 60 * 60 * 24));
  return { days, session: last };
}

function renderDashboard() {
  const next = getNextWorkout();
  const streak = getWeekStreak();
  const thisWeek = getThisWeekCount();
  const thisWeekIso = getWeekStart(new Date()).toISOString().slice(0,10);
  const goal = getGoalForWeek(thisWeekIso);
  const prs = getPRs();
  const prEntries = Object.entries(prs).sort((a, b) => b[1].weight - a[1].weight);
  // קבץ לפי קטגוריה
  const CAT_ORDER = ["chest","back","shoulders","arms","legs","core","cardio"];
  const prByCategory = {};
  prEntries.forEach(([name, pr]) => {
    const cat = pr.category || null;
    if (!prByCategory[cat]) prByCategory[cat] = [];
    prByCategory[cat].push([name, pr]);
  });
  const now = new Date();
const dayOfWeek = now.getDay();

const todayStart = new Date();
todayStart.setHours(0, 0, 0, 0);

const didWorkoutToday = state.sessions.some(s => {
  const d = new Date(s.date);
  d.setHours(0, 0, 0, 0);
  return d.getTime() === todayStart.getTime();
});

// אם עדיין לא היה אימון היום — היום נחשב.
// אם כבר היה אימון היום — סופרים רק את הימים שנותרו אחריו.
const daysLeftInWeek = didWorkoutToday
  ? 6 - dayOfWeek
  : 7 - dayOfWeek;

const workoutsLeft = Math.max(0, goal - thisWeek);
const goalReached = thisWeek >= goal;

  let urgencyCard = "";
  if (!goalReached) {
    const gap = workoutsLeft - daysLeftInWeek;
    const isUrgent = gap >= 1;
    const isBorderline = gap === 0 || (gap < 0 && daysLeftInWeek <= 2);
    const riskLabel = isUrgent ? "סיכון גבוה" : isBorderline ? "סיכון בינוני" : "סיכון נמוך";
    const riskColor = isUrgent ? "var(--red)" : isBorderline ? "var(--orange)" : "var(--green)";
    const urgentColor = isUrgent ? "var(--red)" : isBorderline ? "var(--orange)" : "var(--text-primary)";
    const urgentBg = isUrgent ? "var(--red-bg)" : isBorderline ? "var(--orange-bg)" : "var(--surface)";
    const urgentBorder = isUrgent ? "var(--red)" : isBorderline ? "var(--orange)" : "var(--border)";
    const paceNeeded = daysLeftInWeek > 0 ? (workoutsLeft / daysLeftInWeek) : workoutsLeft;
    const paceText = daysLeftInWeek > 0
      ? `קצב נדרש: ${paceNeeded.toFixed(1)} אימון ליום`
      : (workoutsLeft > 0 ? "היום היום האחרון לעמוד ביעד" : "היעד הושלם");
    const actionMsg = isUrgent
      ? (didWorkoutToday
          ? "פעולה מומלצת: לקבוע אימון נוסף למחר כדי להישאר במסלול."
          : "פעולה מומלצת: לבצע אימון היום.")
      : workoutsLeft === 1
        ? "פעולה מומלצת: לשריין אימון אחד ב-24 השעות הקרובות."
        : "פעולה מומלצת: לקבוע ביומן מראש את האימונים שנותרו השבוע.";
    const msg = isUrgent
      ? "⚠ לא יהיה מספיק זמן — התאמן היום!"
      : daysLeftInWeek === 0
      ? "היום היום האחרון של השבוע — זה הזמן לסגור את היעד"
      : dayOfWeek === 0
      ? "שבוע חדש התחיל — יש לך זמן טוב לעמוד ביעד"
      : workoutsLeft === 1
      ? "עוד אימון אחד ותשלים את היעד השבועי"
      : `עוד ${workoutsLeft} אימונים להשלמת השבוע`;
    const dayWord = daysLeftInWeek === 1 ? "יום" : "ימים";
    const workoutWord = workoutsLeft === 1 ? "אימון" : "אימונים";
    urgencyCard = `<div class="anim-card" style="background:${urgentBg};border:1px solid ${urgentBorder};border-radius:14px;padding:14px 16px;margin-bottom:16px;animation-delay:0.75s">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-size:13px;font-weight:600;color:${urgentColor}">${msg}</span>
        <span style="font-size:10px;font-weight:700;color:${riskColor};background:${isUrgent?"#fee2e2":isBorderline?"#fff7ed":"#ecfdf5"};padding:3px 8px;border-radius:999px;border:1px solid ${isUrgent?"#fecaca":isBorderline?"#fed7aa":"#bbf7d0"}">${riskLabel}</span>
      </div>
      <div style="display:flex;gap:0">
        <div style="flex:1;text-align:center;border-left:1px solid ${urgentBorder}">
          <div style="font-size:26px;font-weight:700;color:${urgentColor};line-height:1"><span data-countup="${daysLeftInWeek}">0</span></div>
          <div style="font-size:11px;color:${urgentColor};margin-top:3px;opacity:0.8">${dayWord} נותרו</div>
        </div>
        <div style="flex:1;text-align:center">
          <div style="font-size:26px;font-weight:700;color:${urgentColor};line-height:1"><span data-countup="${workoutsLeft}">0</span></div>
          <div style="font-size:11px;color:${urgentColor};margin-top:3px;opacity:0.8">${workoutWord} נותרו</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px">
        <span style="font-size:11px;color:${urgentColor};font-weight:600">${paceText}</span>
        <span style="font-size:11px;color:${urgentColor};opacity:0.85">${gap > 0 ? `חסר ${gap} כדי לעמוד בקצב` : gap === 0 ? "בדיוק על הקצה" : `מרווח ביטחון של ${Math.abs(gap)}`}</span>
      </div>
      <div style="margin-top:8px;padding:8px 10px;border-radius:10px;background:#ffffff80;border:1px dashed ${urgentBorder};font-size:12px;color:${urgentColor};font-weight:600">
        ${actionMsg}
      </div>
    </div>`;
  } else {
    urgencyCard = `<div class="anim-card" style="background:var(--green-bg);border:1px solid #86efac;border-radius:14px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;animation-delay:0.75s">
      <div style="font-size:28px;line-height:1">🏆</div>
      <div>
        <div style="font-size:14px;font-weight:700;color:var(--green)">היעד השבועי הושלם יא מלך!</div>
        <div style="font-size:12px;color:var(--green);margin-top:2px;opacity:0.8">${thisWeek} מתוך ${goal} אימונים הושלמו</div>
      </div>
    </div>`;
  }

  const dayNames = ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];
  const todayDow = new Date().getDay();
  const weekStart = getWeekStart(new Date());

  const toLocalDayStart = (dateLike) => {
    const d = new Date(dateLike);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const workedDays = new Set();
  state.sessions.forEach(s => {
    const dayStart = toLocalDayStart(s.date);
    if (dayStart >= weekStart && dayStart <= weekEnd) {
      workedDays.add(dayStart.getDay());
    }
  });

  const pct = goal > 0 ? Math.round((thisWeek / goal) * 100) : 0;
  const pctColor = pct >= 100 ? "var(--green)" : pct >= 50 ? "var(--orange)" : "var(--text-hint)";
  const pctBg = pct >= 100 ? "var(--green-bg)" : pct >= 50 ? "var(--orange-bg)" : "var(--surface)";

  const checkIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  const dayOrder = [0,1,2,3,4,5,6];
  const dayCells = dayOrder.map((dow, idx) => {
    const isToday = dow === todayDow;
    const isPast = todayDow === 0 ? dow === 0 : dow < todayDow || dow === 0 && todayDow > 0;
    const isFuture = !isToday && !isPast;
    const worked = workedDays.has(dow);
    const labelColor = worked ? "var(--green)" : isToday ? "var(--accent)" : isFuture ? "var(--border-med)" : "var(--text-hint)";
    const labelWeight = "600";
    const boxBg = worked ? "var(--green-bg)" : isToday ? "#eef2ff" : isFuture ? "var(--card)" : "var(--surface)";
    const boxBorder = worked
      ? isToday ? "2px solid var(--green)" : "1px solid #86efac"
      : isToday ? "2px solid var(--accent)" : isFuture ? "1px dashed var(--border-med)" : "1px solid var(--border)";
    const animDelay = (idx * 0.08).toFixed(2);
    const initialCellOpacity = "1";
    return `<div class="day-cell-anim" style="display:flex;flex-direction:column;align-items:center;gap:4px;opacity:${initialCellOpacity};animation-delay:${animDelay}s">
      <span style="font-size:10px;color:${labelColor};font-weight:${labelWeight}">${dayNames[dow]}</span>
      <div style="width:100%;aspect-ratio:1;border-radius:8px;background:${boxBg};border:${boxBorder};display:flex;align-items:center;justify-content:center">
        ${worked ? checkIcon : ""}
      </div>
    </div>`;
  }).join("");

  const dumbbellIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0"/><path d="M17.5 6.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0"/><path d="M4 16c0-1.1.9-2 2-2h.5"/><path d="M4 6.5v4"/><path d="M20 6.5v4"/><path d="M9 17h6"/><path d="M15 16.1A2 2 0 0 1 16.5 14H17a2 2 0 0 1 2 2"/><path d="M8 22v-5"/><path d="M16 22v-5"/></svg>`;
  const boltIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;

  const weekCard = `<div class="stat-card anim-card" style="margin-bottom:16px;animation-delay:0.25s">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <span class="stat-label">השבוע</span>
      <span style="font-size:11px;font-weight:600;color:${pctColor};background:${pctBg};padding:2px 8px;border-radius:20px"><span data-countup="${pct}" data-suffix="% מהיעד">0% מהיעד</span></span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-bottom:12px">${dayCells}</div>
    <div style="border-top:1px solid var(--border);padding-top:10px;display:flex;justify-content:space-between;align-items:center">
      <div style="display:flex;align-items:center;gap:6px">
        ${dumbbellIcon}
        <span style="font-size:12px;color:var(--text-secondary);font-weight:500">${thisWeek} מתוך ${goal} אימונים</span>
      </div>
      <div style="display:flex;align-items:center;gap:5px">
        ${boltIcon}
        <span style="font-size:12px;color:var(--orange);font-weight:600">Streak: <span data-countup="${streak}" data-suffix=" שבועות">0 שבועות</span></span>
      </div>
    </div>
  </div>`;

  const inProgress = sessionStorage.getItem("gym_in_progress");
let inProgressId = null;
if (inProgress) {
  try { inProgressId = JSON.parse(inProgress).workoutId || null; } catch {}
}
  const inProgressW = inProgressId ? getWorkout(inProgressId) : null;
  const nextBtn = inProgressW
    ? `<button class="next-btn anim-card" style="background:var(--orange);border-radius:14px;animation-delay:0.1s" onclick="navigate('home')">
         <i data-lucide="play" style="width:20px;height:20px"></i>
         המשך ${inProgressW.name}
       </button>`
    : "";


  // ── Weight card ──────────────────────────────────────────────────
  const latest = getLatestWeight();
  const weightLogsAsc = getWeightLogsAsc();
  const dSinceW = daysSinceWeight();
  const needsUpdate = dSinceW === null || dSinceW >= 7;
  const currentTime = new Date();
  const todayIso = isoDateFromLocal(currentTime);
  const latestLocalIso = latest ? isoDateFromLocal(new Date(latest.measured_at)) : null;
  const hasTodayWeight = !!(latestLocalIso && latestLocalIso === todayIso);
  const shouldPromptDaily = !hasTodayWeight;

  let weightCard = "";
  if (!latest) {
    const emptyBtnBg = shouldPromptDaily ? "var(--orange)" : "var(--accent)";
    const emptyBtnColor = "#fff";
    const emptyBtnLabel = shouldPromptDaily ? "הזן משקל" : "הזן משקל ראשון";
    weightCard = `<div style="background:var(--surface);border:1px dashed var(--border-med);border-radius:14px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="showWeightModal()">
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text-secondary)">My Weight</div>
        <div style="font-size:11px;color:var(--text-hint);margin-top:2px">אין עדיין מדידות משקל שמורות</div>
      </div>
      <button onclick="event.stopPropagation();showWeightModal()" style="background:${emptyBtnBg};border:none;border-radius:8px;padding:7px 12px;cursor:pointer;font-size:12px;color:${emptyBtnColor};font-family:inherit;font-weight:600">${emptyBtnLabel}</button>
    </div>`;
  } else if (latest) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfCurrentWeek = new Date(today);
    startOfCurrentWeek.setDate(today.getDate() - today.getDay()); // Sunday
    const startOfPrevWeek = new Date(startOfCurrentWeek);
    startOfPrevWeek.setDate(startOfCurrentWeek.getDate() - 7);
    const endOfPrevWeek = new Date(startOfCurrentWeek);
    endOfPrevWeek.setMilliseconds(-1); // Saturday 23:59:59.999

    const prevWeekLogs = weightLogsAsc.filter(log => {
      const dt = new Date(log.measured_at);
      return dt >= startOfPrevWeek && dt <= endOfPrevWeek;
    });
    const prevWeekAvg = prevWeekLogs.length
      ? prevWeekLogs.reduce((sum, log) => sum + Number(log.weight), 0) / prevWeekLogs.length
      : null;

    const diff = prevWeekAvg !== null ? (latest.weight - prevWeekAvg) : null;
    const diffColor = diff === null ? "var(--text-hint)" : diff < 0 ? "var(--green)" : diff > 0 ? "var(--red)" : "var(--text-hint)";
    const diffArrow = diff === null ? "" : diff < 0
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`
      : diff > 0
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`
      : "";
    const diffText = diff === null ? "" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)} ק״ג מול ממוצע שבוע שעבר`;
    const cardBorder = needsUpdate ? "var(--orange)" : "var(--border)";
    const cardBg = needsUpdate ? "var(--orange-bg)" : "var(--card)";
    const dailyBtn = hasTodayWeight
      ? `<button onclick="event.preventDefault();event.stopPropagation();return false;" style="display:flex;align-items:center;gap:5px;background:var(--green);border:none;border-radius:8px;padding:6px 12px;cursor:default;font-size:12px;color:#fff;font-family:inherit;font-weight:600;opacity:0.95;pointer-events:none" disabled>שקילה יומית נרשמה</button>`
      : `<button onclick="showWeightModal()" style="display:flex;align-items:center;gap:5px;background:${shouldPromptDaily ? "var(--orange)" : "var(--surface)"};border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;color:${shouldPromptDaily ? "#fff" : "var(--text-secondary)"};font-family:inherit;font-weight:600">הזן משקל</button>`;

    const weightGoalData = state.weightGoal || {};
    const startGoal = Number(weightGoalData.start_weight);
    const targetGoal = Number(weightGoalData.goal_weight);
    const hasGoal = Number.isFinite(startGoal) && Number.isFinite(targetGoal) && startGoal > 0 && targetGoal > 0 && startGoal !== targetGoal;
    const dist = hasGoal ? Math.abs(startGoal - targetGoal) : 0;
    const progressRaw = hasGoal ? Math.abs(startGoal - latest.weight) / dist : 0;
    const progressPct = hasGoal ? Math.max(0, Math.min(100, Math.round(progressRaw * 100))) : 0;
    const goalDirectionDown = hasGoal && targetGoal < startGoal;
    const remaining = hasGoal ? (goalDirectionDown ? latest.weight - targetGoal : targetGoal - latest.weight) : null;
    const done = hasGoal && remaining <= 0;
    const goalStatus = !hasGoal
      ? "הגדר יעד כדי לעקוב אחרי התקדמות"
      : done
      ? "היעד הושג — אלוף!"
      : `נשארו עוד ${remaining.toFixed(1)} ק״ג ליעד`;
    const goalSection = `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
      <div style="margin-bottom:7px">
        <div style="font-size:12px;color:var(--text-secondary);font-weight:600">יעד משקל</div>
        <div style="font-size:11px;color:var(--text-hint);margin-top:2px">${hasGoal ? `<span style="display:inline-flex;gap:4px;align-items:center;direction:rtl;unicode-bidi:isolate"><span>משקל התחלתי: ${startGoal.toFixed(1)}</span><span aria-hidden="true">←</span><span>משקל יעד: ${targetGoal.toFixed(1)} ק״ג</span></span>` : "ללא יעד מוגדר"}</div>
      </div>
      <div style="height:8px;background:var(--surface);border-radius:999px;overflow:hidden;margin-bottom:7px">
        <div style="width:${progressPct}%;height:100%;background:${done ? "var(--green)" : "var(--accent)"};transition:width .25s ease"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px;color:${done ? "var(--green)" : "var(--text-secondary)"}">${goalStatus}</span>
        <span style="font-size:11px;color:var(--text-hint)">${hasGoal ? progressPct + "%" : "--"}</span>
      </div>
    </div>`;

    weightCard = `<div class="anim-card" style="background:${cardBg};border:1px solid ${cardBorder};border-radius:14px;padding:14px 16px;margin-bottom:16px;animation-delay:1.0s">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div>
          <div class="stat-label">משקל נוכחי</div>
          <div style="display:flex;align-items:baseline;gap:5px;margin-top:3px">
            <span style="font-size:32px;font-weight:700;color:var(--text-primary);line-height:1">${latest.weight}</span>
            <span style="font-size:14px;color:var(--text-hint)">ק״ג</span>
          </div>
          ${diff !== null ? `<div style="display:flex;align-items:center;gap:4px;margin-top:4px">${diffArrow}<span style="font-size:12px;color:${diffColor};font-weight:600">${diffText}</span></div>` : ""}
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px;color:var(--text-hint)">${hasTodayWeight ? "השקילה היומית הוזנה להיום" : (needsUpdate ? "לא נשקלת השבוע" : "עודכן לפני " + dSinceW + " ימים (" + formatWeightDate(latest) + ")")}</span>
        ${dailyBtn}
      </div>
      ${goalSection}
    </div>`;
  }
  // ─────────────────────────────────────────────────────────────────

  return `<div style="padding:16px 14px">
    ${nextBtn}

    ${weekCard}

    ${urgencyCard}

    ${weightCard}

    ${prEntries.length ? `<div class="card anim-card" style="padding:0;overflow:hidden;margin-bottom:16px;animation-delay:1.25s">
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:7px">
        <i data-lucide="trophy" style="width:15px;height:15px;color:#d97706"></i>
        <span style="font-weight:700;font-size:14px;color:var(--text-primary)">שיאים אישיים</span>
      </div>
      ${CAT_ORDER.filter(cat => prByCategory[cat]).map((cat, ci, arr) => {
        const catData = CATEGORIES.find(c => c.id === cat);
        const catLabel = catData ? catData.label : "כללי";
        const catIcon = catData ? catData.icon : "more-horizontal";
        const entries = prByCategory[cat];
        const isLast = ci === arr.length - 1;
        return `<div style="border-bottom:${isLast?"none":"1px solid var(--border)"}">
          <div style="display:flex;align-items:center;gap:5px;padding:8px 16px 4px">
            <i data-lucide="${catIcon}" style="width:12px;height:12px;color:var(--text-hint)"></i>
            <span style="font-size:11px;font-weight:700;color:var(--text-hint);text-transform:uppercase;letter-spacing:0.04em">${catLabel}</span>
          </div>
          <div style="padding:0 16px">
            ${entries.map(([name, pr]) =>
              `<div class="pr-row" onclick="showExerciseGraph(\'${name.replace(/\'/g,"\\\'")}\')">
                <span style="color:var(--text-secondary)">${name}</span>
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="font-weight:700;color:var(--text-primary)">${pr.weight} ק"ג</span>
                  <span style="font-size:10px;color:var(--text-hint)">${formatDateShort(pr.date)}</span>
                  <i data-lucide="chevron-left" style="width:12px;height:12px;color:var(--text-hint)"></i>
                </div>
              </div>`).join("")}
          </div>
        </div>`;
      }).join("")}
    </div>` : ""}
  </div>`;
}

window.renderDashboard = renderDashboard;
window.bindScrollAnimations = bindScrollAnimations;
