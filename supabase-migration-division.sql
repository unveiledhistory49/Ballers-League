-- Add division column to teams table (default 1)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS division INTEGER NOT NULL DEFAULT 1;

-- Add division column to matches table (default 1 for league matches)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS division INTEGER DEFAULT 1;

-- Create promotions_relegations table to track history
CREATE TABLE IF NOT EXISTS promotions_relegations (
  id SERIAL PRIMARY KEY,
  season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
  team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  direction TEXT NOT NULL, -- 'promoted' or 'relegated'
  from_division INTEGER NOT NULL,
  to_division INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for division queries
CREATE INDEX IF NOT EXISTS idx_teams_division ON teams(division);
CREATE INDEX IF NOT EXISTS idx_matches_division ON matches(division);
