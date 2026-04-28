// ── init.js ──────────────────────────────────────────────────────

const ALLOW_EMPTY_WORKOUT_SYNC = false;
const STORAGE_USER_ID = "gym_user_id_v1";

function getUidFromCookie() {
  var m = document.cookie.match(/(?:^|;\s*)gym_uid=([0-9a-f-]{36})/i);
  return m ? m[1] : null;
}
function saveUidToCookie(uid) {
  document.cookie = 'gym_uid=' + uid + '; max-age=31536000; SameSite=Strict; path=/';
}

function ensureUserId() {
  if (state.userId) return state.userId;
  let saved = localStorage.getItem(STORAGE_USER_ID);
  if (!saved) saved = getUidFromCookie();
  if (saved) {
    state.userId = saved;
    localStorage.setItem(STORAGE_USER_ID, saved);
    saveUidToCookie(saved);
    return saved;
  }
  const generated = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ("uid-" + Date.now());
  state.userId = generated;
  localStorage.setItem(STORAGE_USER_ID, generated);
  saveUidToCookie(generated);
  return generated;
}

function requireUserIdOrThrow(contextLabel) {
  const userId = ensureUserId();
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new Error(`${contextLabel}: missing user_id`);
  }
  return userId;
}

try { state.sessions = JSON.parse(localStorage.getItem(STORAGE_SESSIONS) || "[]"); } catch (e) { console.warn("[init] failed to parse sessions from localStorage:", e); }

window.addEventListener("load", async function() {
  const loader = document.getElementById("app-loader");

  // ─── מצב צפייה משותפת ────────────────────────────────────────────
  const shareToken = new URLSearchParams(location.search).get("share");
  if (shareToken) {
    state.screen = "dashboard";
    state.readonly = true;
    try {
      const result = await loadSharedData(shareToken);
      if (result === "expired") {
        if (loader) loader.remove();
        document.getElementById("main-content").innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;padding:32px;text-align:center;direction:rtl">
            <div style="font-size:48px;margin-bottom:16px">🔒</div>
            <div style="font-size:20px;font-weight:700;color:var(--text-primary);margin-bottom:8px">הקישור פג תוקף</div>
            <div style="font-size:14px;color:var(--text-hint)">בקש מבעל החשבון לשלוח קישור חדש</div>
          </div>`;
        return;
      }
    } catch (e) {
      console.error("Share load failed:", e);
      if (loader) loader.remove();
      document.getElementById("main-content").innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;padding:32px;text-align:center;direction:rtl">
          <div style="font-size:20px;font-weight:700;color:var(--red)">שגיאה בטעינת הנתונים</div>
        </div>`;
      return;
    }
    if (loader) { loader.style.opacity = "0"; setTimeout(() => loader.remove(), 350); }
    render();
    return;
  }
  // ─────────────────────────────────────────────────────────────────

  state.screen = "dashboard";
  const results = await Promise.allSettled([
  loadSessionsFromSupabase(),
  loadWeightData(),
  loadWorkoutsFromSupabase(),
  loadSettingsFromSupabase(),
  loadExerciseLibrary()
]);

const failed = results
  .map((r, i) => ({ r, i }))
  .filter(x => x.r.status === "rejected");

if (failed.length) {
  console.error("Some data failed to load:", failed);
  showToast("חלק מהנתונים לא נטענו ⚠️");
}
  runRuntimeDataAudit();
  await syncPushSubscriptionState();

  // שחזר אימון שהיה בתהליך לפני סגירת האפליקציה
  const hadInProgress = loadInProgress();
  if (hadInProgress) {
    state.screen = "home";
    setTimeout(() => showToast("ממשיך אימון קודם 💪"), 400);
  }

  if (loader) {
    loader.style.opacity = "0";
    setTimeout(() => loader.remove(), 350);
  }
  render();
});
