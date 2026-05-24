-- ═══════════════════════════════════════════════════════════════
-- BALLERS LEAGUE — Multi-Season Migration
-- Run this in the Supabase SQL Editor ONCE to add multi-season support
-- to your existing Season 1 data.
-- ═══════════════════════════════════════════════════════════════

-- 1. Create the seasons table
CREATE TABLE IF NOT EXISTS seasons (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Insert Season 1
INSERT INTO seasons (id, name, status) VALUES (1, 'Season 1', 'active')
ON CONFLICT (id) DO NOTHING;

-- 3. Add season_id column to matches (default 1 for existing rows)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS season_id INTEGER DEFAULT 1 REFERENCES seasons(id);

-- 4. Set season_id = 1 for all existing matches
UPDATE matches SET season_id = 1 WHERE season_id IS NULL;

-- 5. Make season_id NOT NULL
ALTER TABLE matches ALTER COLUMN season_id SET NOT NULL;

-- 6. Drop the old unique constraint and create the new one
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_matchday_home_id_away_id_key;
ALTER TABLE matches ADD CONSTRAINT matches_season_matchday_home_away_key 
  UNIQUE(season_id, matchday, home_id, away_id);

-- 7. Add index for faster season queries
CREATE INDEX IF NOT EXISTS idx_matches_season ON matches(season_id);

-- 8. Enable RLS on seasons table
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;

-- 9. RLS policies for seasons
CREATE POLICY "Public read seasons" ON seasons FOR SELECT USING (true);
CREATE POLICY "Service insert seasons" ON seasons FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update seasons" ON seasons FOR UPDATE USING (true);

-- Done!
-- Your existing Season 1 data is now tagged with season_id = 1.
-- The new season API endpoint can create Season 2, 3, etc.
