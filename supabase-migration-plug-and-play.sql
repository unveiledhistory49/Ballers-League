-- ============================================================
-- Migration: Add clubs table and team activation status
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Create the clubs table
CREATE TABLE IF NOT EXISTS clubs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  logo_url TEXT NOT NULL,
  primary_color TEXT NOT NULL,
  text_color TEXT NOT NULL,
  short_name TEXT NOT NULL
);

-- 2. Seed the clubs table with default clubs
INSERT INTO clubs (name, logo_url, primary_color, text_color, short_name) VALUES
  ('Man U',       'logos/england_manchester-united_256x256.football-logos.cc.png', '#da020e', '#fff', 'MU'),
  ('Tottenham',   'logos/england_tottenham_256x256.football-logos.cc.png',         '#132257', '#fff', 'TOT'),
  ('Liverpool',   'logos/england_liverpool_256x256.football-logos.cc.png',         '#c8102e', '#fff', 'LIV'),
  ('Barcelona',   'logos/spain_barcelona_256x256.football-logos.cc.png',           '#a50044', '#fff', 'BAR'),
  ('Man City',    'logos/england_manchester-city_256x256.football-logos.cc.png',    '#6cabdd', '#1c2c5b', 'MCI'),
  ('Arsenal FC',  'logos/england_arsenal_256x256.football-logos.cc.png',            '#ef0107', '#fff', 'ARS'),
  ('Bayern',      'logos/germany_bayern-munchen_256x256.football-logos.cc.png',    '#dc052d', '#fff', 'BAY'),
  ('PSG',         'logos/france_paris-saint-germain_256x256.football-logos.cc.png', '#004170', '#fff', 'PSG'),
  ('Chelsea',     'logos/chelsea.football-logos.cc.png',                           '#034694', '#fff', 'CHE'),
  ('Real Madrid', 'logos/spain_real-madrid_256x256.football-logos.cc.png',         '#ffffff', '#111', 'RMA')
ON CONFLICT (name) DO NOTHING;

-- 3. Add active status column to teams table
ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- 4. Enable Row Level Security (RLS) on clubs table
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Policies for clubs table
CREATE POLICY "Public read clubs" ON clubs FOR SELECT USING (true);
CREATE POLICY "Service insert clubs" ON clubs FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update clubs" ON clubs FOR UPDATE USING (true);
CREATE POLICY "Service delete clubs" ON clubs FOR DELETE USING (true);
