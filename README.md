# gym_tracker

## Supabase access restore (no Auth flow)

If the app returns `401` / `42501 permission denied` for REST calls (for example `workout_sessions` / `weight_goal`), run:

```sql
\i sql/restore_postgrest_grants.sql
```

in your SQL tool (or copy-paste the file contents into the Supabase SQL editor).
