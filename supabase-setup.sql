-- ═══════════════════════════════════════════════════════════════
-- BALLERS LEAGUE — Supabase Database Setup
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ═══════════════════════════════════════════════════════════════

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY,
  player TEXT NOT NULL,
  club TEXT NOT NULL
);

-- Matches table
CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
  matchday INTEGER NOT NULL,
  home_id INTEGER NOT NULL REFERENCES teams(id),
  home_player TEXT NOT NULL,
  home_club TEXT NOT NULL,
  away_id INTEGER NOT NULL REFERENCES teams(id),
  away_player TEXT NOT NULL,
  away_club TEXT NOT NULL,
  home_score INTEGER DEFAULT NULL,
  away_score INTEGER DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming',
  predictions JSONB DEFAULT '{"home": 0, "draw": 0, "away": 0, "ips": []}',
  UNIQUE(matchday, home_id, away_id)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_matches_matchday ON matches(matchday);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);

-- ═══════════════════════════════════════════════════════════════
-- Insert Teams
-- ═══════════════════════════════════════════════════════════════
INSERT INTO teams (id, player, club) VALUES
  (1,  'MrLbc',              'Man U'),
  (2,  'KONJI_WARLORD',      'Tottenham'),
  (3,  'PRIME',              'Liverpool'),
  (4,  'NONCHALANT-_-',      'Liverpool'),
  (5,  'CODE',               'Barcelona'),
  (6,  'CAPALOT',            'Man U'),
  (7,  'Primus',             'Man City'),
  (8,  'COA_X',              'Arsenal FC'),
  (9,  'BTCDOCTOR',          'Bayern'),
  (10, 'COMMANDER FAVOUR',   'PSG'),
  (11, 'Old_taker_here',     'Liverpool'),
  (12, 'KC',                 'Man City')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- Enable Row Level Security (RLS)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- Public read access for both tables
CREATE POLICY "Public read teams" ON teams FOR SELECT USING (true);
CREATE POLICY "Public read matches" ON matches FOR SELECT USING (true);

-- Allow all operations for service role (used by API)
CREATE POLICY "Service insert matches" ON matches FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update matches" ON matches FOR UPDATE USING (true);
CREATE POLICY "Service insert teams" ON teams FOR INSERT WITH CHECK (true);
