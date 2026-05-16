/**
 * Seed script — Reads fixtures.json and inserts all matches into Supabase.
 * Run once after setting up the database.
 * 
 * Usage: node seed-supabase.js
 * 
 * Requires environment variables:
 *   SUPABASE_URL=https://xxxxx.supabase.co
 *   SUPABASE_ANON_KEY=eyJ...
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.');
  console.error('   Set them before running: $env:SUPABASE_URL="..."; $env:SUPABASE_ANON_KEY="..."');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function seed() {
  console.log('\n🏆 Ballers League — Seeding Supabase');
  console.log('─'.repeat(40));

  // Load fixtures
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf-8'));

  // Flatten all matches
  const allMatches = [];
  for (const md of data.fixtures) {
    for (const m of md.matches) {
      allMatches.push({
        matchday: md.matchday,
        home_id: m.home.id,
        home_player: m.home.player,
        home_club: m.home.club,
        away_id: m.away.id,
        away_player: m.away.player,
        away_club: m.away.club,
        home_score: m.homeScore,
        away_score: m.awayScore,
        status: m.status,
      });
    }
  }

  console.log(`📦 Inserting ${allMatches.length} matches...`);

  // Insert in batches of 50
  for (let i = 0; i < allMatches.length; i += 50) {
    const batch = allMatches.slice(i, i + 50);
    const { error } = await supabase.from('matches').upsert(batch, {
      onConflict: 'matchday,home_id,away_id',
    });

    if (error) {
      console.error(`❌ Error inserting batch at ${i}:`, error.message);
      return;
    }
    console.log(`   ✓ Inserted ${Math.min(i + 50, allMatches.length)} / ${allMatches.length}`);
  }

  console.log('─'.repeat(40));
  console.log('✅ Seeding complete!\n');
}

seed().catch(console.error);
