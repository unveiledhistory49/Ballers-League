-- ============================================================
-- Migration: Add missing DELETE policy on matches table
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Add the missing DELETE policy
CREATE POLICY "Service delete matches" ON matches FOR DELETE USING (true);

-- 2. Clean up duplicate cup matches created by failed re-draws.
--    This keeps only the LATEST set of matches for each cup stage
--    (the ones with the highest IDs, i.e. the most recent insert).
--    Run this ONLY if you attempted re-draws that appeared to succeed
--    but showed the same pairings.

-- First, let's see if there are duplicates (optional check):
-- SELECT stage, COUNT(*) FROM matches WHERE stage LIKE 'cup_%' GROUP BY stage;

-- Delete older duplicate cup_r16 matches (keep only the 4 newest):
DELETE FROM matches
WHERE id IN (
  SELECT id FROM matches
  WHERE stage = 'cup_r16'
  AND id NOT IN (
    SELECT id FROM matches WHERE stage = 'cup_r16' ORDER BY id DESC LIMIT 4
  )
);

-- Delete older duplicate cup_qf matches (keep only the 4 newest):
DELETE FROM matches
WHERE id IN (
  SELECT id FROM matches
  WHERE stage = 'cup_qf'
  AND id NOT IN (
    SELECT id FROM matches WHERE stage = 'cup_qf' ORDER BY id DESC LIMIT 4
  )
);

-- Delete older duplicate cup_sf matches (keep only the 2 newest):
DELETE FROM matches
WHERE id IN (
  SELECT id FROM matches
  WHERE stage = 'cup_sf'
  AND id NOT IN (
    SELECT id FROM matches WHERE stage = 'cup_sf' ORDER BY id DESC LIMIT 2
  )
);

-- Delete older duplicate cup_final matches (keep only the 1 newest):
DELETE FROM matches
WHERE id IN (
  SELECT id FROM matches
  WHERE stage = 'cup_final'
  AND id NOT IN (
    SELECT id FROM matches WHERE stage = 'cup_final' ORDER BY id DESC LIMIT 1
  )
);
