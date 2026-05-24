-- ═══════════════════════════════════════════════════════════════
-- BALLERS LEAGUE — Add Season Headline Column Migration
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ═══════════════════════════════════════════════════════════════

-- Add headline column to seasons table
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS headline TEXT DEFAULT NULL;
