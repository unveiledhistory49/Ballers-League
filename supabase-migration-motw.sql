-- ═══════════════════════════════════════════════════════════════
-- BALLERS LEAGUE — Match of the Week Migration
-- Run this in the Supabase SQL Editor ONCE to add manual MOTW support.
-- ═══════════════════════════════════════════════════════════════

-- Add is_motw column to matches (defaults to FALSE)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS is_motw BOOLEAN NOT NULL DEFAULT FALSE;
