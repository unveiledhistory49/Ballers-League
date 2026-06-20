-- ============================================================
-- Migration: Add Division 2 Teams
-- ============================================================

INSERT INTO teams (player, club, division, is_active) VALUES 
  ('DBossSK30', 'Man U', 2, true),
  ('Shadowdonny', 'Barcelona', 2, true),
  ('AxDLol', 'Chelsea', 2, true),
  ('Emmzy', 'Man U', 2, true),
  ('YoungLegend', 'Man City', 2, true),
  ('CUM__SHOT**', 'Real Madrid', 2, true),
  ('Lone_Wolf', 'Arsenal FC', 2, true),
  ('AUR4F4RM3R', 'Chelsea', 2, true);

-- ============================================================
-- IMPORTANT NOTE REGARDING FIXTURES:
-- Because this is a direct SQL insert, it bypasses the Node.js
-- backend logic that automatically generates the match schedule.
-- 
-- After running this SQL, your 'teams' table will be updated, 
-- but the 'matches' table will not have Division 2 matches yet.
-- 
-- FIX: Go to your Admin Panel -> Player Management.
-- Find any player, click "Edit", and simply click 
-- "Save Changes" (or toggle them inactive then active). 
-- This will trigger the backend to regenerate all fixtures!
-- ============================================================
