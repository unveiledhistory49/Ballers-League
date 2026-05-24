-- ═══════════════════════════════════════════════════════════════
-- BALLERS LEAGUE — Add Player Profile Picture Migration
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ═══════════════════════════════════════════════════════════════

-- Add photo_url column to teams table
ALTER TABLE teams ADD COLUMN IF NOT EXISTS photo_url TEXT DEFAULT NULL;
