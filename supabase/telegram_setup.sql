-- Telegram linking tables for GymBuddy bot

CREATE TABLE IF NOT EXISTS telegram_links (
  telegram_id BIGINT PRIMARY KEY,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes')
);

-- Index for quick lookup by user_id
CREATE INDEX IF NOT EXISTS telegram_links_user_id_idx ON telegram_links (user_id);
CREATE INDEX IF NOT EXISTS telegram_link_codes_user_id_idx ON telegram_link_codes (user_id);

-- telegram_link_codes: allow anon inserts (app uses anon key with user-supplied user_id)
ALTER TABLE telegram_link_codes ENABLE ROW LEVEL SECURITY;

-- Allow any anonymous client to insert a code (the app uses anon key, not auth.uid())
CREATE POLICY "anon insert codes" ON telegram_link_codes
  FOR INSERT WITH CHECK (true);

-- Allow deletion by code value (used by the Edge Function via service role, bypasses RLS)
-- No additional RLS needed for SELECT/DELETE since Edge Function uses service role key

-- telegram_links: only accessible via service role (Edge Function)
ALTER TABLE telegram_links ENABLE ROW LEVEL SECURITY;
-- No policies = only service role can access
