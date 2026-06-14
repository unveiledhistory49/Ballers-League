-- ═══════════════════════════════════════════════════════════════
-- BALLERS LEAGUE — Complete Database Update Migration
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- to add all updates including Division 2, clubs, headlines, and deductions.
-- ═══════════════════════════════════════════════════════════════

-- 1. Division 2 & Promotion/Relegation Support
ALTER TABLE teams ADD COLUMN IF NOT EXISTS division INTEGER NOT NULL DEFAULT 1;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS division INTEGER DEFAULT 1;

CREATE TABLE IF NOT EXISTS promotions_relegations (
  id SERIAL PRIMARY KEY,
  season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
  team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  direction TEXT NOT NULL, -- 'promoted' or 'relegated'
  from_division INTEGER NOT NULL,
  to_division INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teams_division ON teams(division);
CREATE INDEX IF NOT EXISTS idx_matches_division ON matches(division);

-- 2. Clubs Table & Active Status
CREATE TABLE IF NOT EXISTS clubs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  logo_url TEXT NOT NULL,
  primary_color TEXT NOT NULL,
  text_color TEXT NOT NULL,
  short_name TEXT NOT NULL
);

INSERT INTO clubs (name, logo_url, primary_color, text_color, short_name) VALUES
  ('Man U',       'logos/england_manchester-united_256x256.football-logos.cc.png', '#da020e', '#fff', 'MU'),
  ('Tottenham',   'logos/england_tottenham_256x256.football-logos.cc.png',         '#132257', '#fff', 'TOT'),
  ('Liverpool',   'logos/england_liverpool_256x256.football-logos.cc.png',         '#c8102e', '#fff', 'LIV'),
  ('Barcelona',   'logos/spain_barcelona_256x256.football-logos.cc.png',           '#a50044', '#fff', 'BAR'),
  ('Man City',    'logos/england_manchester-city_256x256.football-logos.cc.png',    '#6cabdd', '#1c2c5b', 'MCI'),
  ('Arsenal FC',  'logos/england_arsenal_256x256.football-logos.cc.png',            '#ef0107', '#fff', 'ARS'),
  ('Bayern',      'logos/germany_bayern-munchen_256x256.football-logos.cc.png',    '#dc052d', '#fff', 'BAY'),
  ('PSG',         'logos/france_paris-saint-germain_256x256.football-logos.cc.png', '#004170', '#fff', 'PSG'),
  ('Chelsea',     'logos/chelsea.football-logos.cc.png',                           '#034694', '#fff', 'CHE'),
  ('Real Madrid', 'logos/spain_real-madrid_256x256.football-logos.cc.png',         '#ffffff', '#111', 'RMA')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

-- Recreate policies if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read clubs') THEN
    CREATE POLICY "Public read clubs" ON clubs FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service insert clubs') THEN
    CREATE POLICY "Service insert clubs" ON clubs FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service update clubs') THEN
    CREATE POLICY "Service update clubs" ON clubs FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service delete clubs') THEN
    CREATE POLICY "Service delete clubs" ON clubs FOR DELETE USING (true);
  END IF;
END
$$;

-- 3. Season Headline & Deductions
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS headline TEXT DEFAULT NULL;
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS deductions JSONB DEFAULT '{}'::jsonb;
