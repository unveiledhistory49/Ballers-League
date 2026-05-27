-- ============================================================
-- Migration: Add missing RLS policies for teams table
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Allow updates on teams (used by player edit)
CREATE POLICY "Service update teams" ON teams FOR UPDATE USING (true);

-- Allow deletes on teams (used by player delete/archive)
CREATE POLICY "Service delete teams" ON teams FOR DELETE USING (true);
