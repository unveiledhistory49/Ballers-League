-- ═══════════════════════════════════════════════════════════════
-- BALLERS LEAGUE — Add Match Stage Migration
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ═══════════════════════════════════════════════════════════════

-- Add stage column to matches table to support Cup and Playoffs
ALTER TABLE matches ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'league';

-- Add a column to record Golden Goal Winner for Playoff / Cup ties
ALTER TABLE matches ADD COLUMN IF NOT EXISTS golden_goal_winner_id INTEGER DEFAULT NULL;
