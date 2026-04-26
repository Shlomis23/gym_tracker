# CLAUDE.md — GymBuddy

## Project Overview
GymBuddy is a Hebrew-language PWA workout tracker. Stack: Vanilla JS (no framework), Supabase PostgreSQL, Supabase Edge Functions (TypeScript/Deno). No build step — static files served directly. Auth is anonymous: each user gets a UUID stored in localStorage; no login system.

---

## Dev Commands

```bash
# Start local dev server
npx serve -l 8080 .

# Deploy a Supabase Edge Function
supabase functions deploy <function-name>
```

---

## Architecture (non-obvious decisions)

- **Local-first**: all data lives in localStorage; Supabase sync is async and non-blocking. App works fully offline.
- **Module per screen**: `dashboard.js`, `home-ui.js`, `history-ui.js`, `manage-ui.js`, `weight-ui.js` each own one screen. `render.js` orchestrates routing between them.
- **No bundler/transpiler**: all JS must be browser-compatible ES6+ with no `import`/`export` statements. All globals are shared via `window`.
- **RTL Hebrew UI**: all strings are Hebrew. Use `he-IL` locale for date/number formatting.
- **Data layer split**: `*-data.js` files handle Supabase CRUD; `*-domain.js` files handle business logic. Keep them separate.

---

## Database (Supabase)

Project URL: `https://jezibgdemidhebbcpdch.supabase.co`  
Anon key is hardcoded in `config.js` (publishable, safe to expose) — **RLS policies are the real security boundary**.

Key tables:

| Table | Purpose |
|-------|---------|
| `workout_sessions` | Logged workout sessions |
| `session_exercises` | Sets within sessions |
| `workout_plans` | User-defined workout programs |
| `body_weight_logs` | Weight entries |
| `weight_goal` | Active weight goal |
| `user_settings` | Weekly goal and goal history |
| `exercise_library` | Exercise reference per user |
| `share_tokens` | 24-hour read-only share links |
| `push_subscriptions` | Web Push endpoints |
| `telegram_links` | Telegram ↔ user_id mapping |
| `telegram_link_codes` | 15-min Telegram linking codes |

**Rule: every Supabase query must include a `user_id` filter.** No exceptions.  
Migrations live in `supabase/migrations/`.

---

## localStorage Keys (schema-versioned)

| Key | Content |
|-----|---------|
| `gym_user_id_v1` | Anonymous user UUID |
| `gym_sessions_v2` | Workout sessions (JSON) |
| `gym_workouts_v4` | Workout plans (migrated from v1/v2/v3) |
| `gym_settings_v1` | Settings (weekly goal, goal history) |
| `gym_weight_logs_v1` | Weight log entries |
| `gym_weight_goal_v1` | Active weight goal |
| `gym_schema_v` | Schema migration version marker |

**Rule**: when adding a new localStorage key, increment the version suffix and add a migration in `state.js`.

---

## Service Worker

- Cache name: `gymbuddy-cache-v9` — **bump this version whenever you change the cached file list**
- App shell (HTML/CSS/JS/icons) → cache-first
- Supabase API calls → network-first, never cached
- Update flow: new SW detected → banner shown → user clicks "עדכן עכשיו" → `SKIP_WAITING` → reload

---

## Edge Functions

Located in `supabase/functions/`:

| Function | Purpose |
|----------|---------|
| `telegram-bot/` | Hebrew NLP intent handler, 20+ commands |
| `send-test-push/` | Manual push notification tester |
| `send-scheduled-push/` | pg_cron scheduled push notifications |
| `create-telegram-code/` | Generates 15-min Telegram linking codes |

Required env vars (set in Supabase dashboard, not in code):
`TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

---

## Security Rules

- Always call `escapeHtml()` (from `utils.js`) before inserting user content into `innerHTML`
- Never use `eval()` or inline `onclick="..."` string handlers
- All Supabase queries must filter by `user_id` — rely on RLS as the backstop, not the only guard

---

## Known Issues (BUG_REVIEW.md)

- **XSS**: exercise names and session notes are injected via `innerHTML` in some places without escaping
- **Global deletes**: some save functions do delete-all-then-insert without `user_id` scoping — risk of cross-user data deletion
- **Note field not synced**: session `note` exists in localStorage but is not persisted to Supabase (`workout_sessions` table missing the column)
