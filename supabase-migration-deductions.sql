-- ═══════════════════════════════════════════════════════════════
-- BALLERS LEAGUE — Points Deductions Migration
-- Run this in the Supabase SQL Editor ONCE to add points deductions
-- ═══════════════════════════════════════════════════════════════

-- Add deductions column to seasons table
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS deductions JSONB DEFAULT '{}'::jsonb;
