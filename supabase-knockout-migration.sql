-- ═══════════════════════════════════════════════════════════════
-- BALLERS LEAGUE — Knockout Tournament Database Migration
-- Format: 8-Team Knockout • 2-Legged Ties • Golden Goal Decider
-- ═══════════════════════════════════════════════════════════════

-- 1. Make home_id, away_id, and team names nullable to allow placeholder future round ties
ALTER TABLE matches ALTER COLUMN home_id DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN away_id DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN home_player DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN away_player DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN home_club DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN away_club DROP NOT NULL;

-- 2. Add tie_id and leg columns for two-legged bracket tracking
ALTER TABLE matches ADD COLUMN IF NOT EXISTS tie_id INTEGER DEFAULT 1;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS leg INTEGER DEFAULT 1;

-- 3. Set top 8 teams to active, and archive remaining teams
UPDATE teams SET is_active = TRUE WHERE id <= 8;
UPDATE teams SET is_active = FALSE WHERE id > 8;
