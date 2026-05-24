/**
 * Ballers League — Fixture Generator (CLI)
 * 
 * Generates a full double round-robin schedule (home & away) for all teams.
 * Uses the shared generation module.
 * 
 * Output: fixtures.json in the same directory
 */

const fs = require('fs');
const path = require('path');
const { generateFixtures } = require('./lib/generate-fixtures');

// ── Teams ──────────────────────────────────────────────
const teams = [
  { id: 1,  player: "MrLbc",              club: "Man U" },
  { id: 2,  player: "KONJI_WARLORD",      club: "Tottenham" },
  { id: 3,  player: "PRIME",              club: "Liverpool" },
  { id: 4,  player: "NONCHALANT-_-",      club: "Liverpool" },
  { id: 5,  player: "CODE",               club: "Barcelona" },
  { id: 6,  player: "CAPALOT",            club: "Man U" },
  { id: 7,  player: "Primus",             club: "Man City" },
  { id: 8,  player: "COA_X",              club: "Arsenal FC" },
  { id: 9,  player: "BTCDOCTOR",          club: "Bayern" },
  { id: 10, player: "COMMANDER FAVOUR",   club: "PSG" },
  { id: 11, player: "Old_taker_here",     club: "Liverpool" },
  { id: 12, player: "KC",                 club: "Man City" },
];

// ── Generate fixtures ──────────────────────────────────
const fixtures = generateFixtures(teams);

// ── Stats ──────────────────────────────────────────────
const n = teams.length;
const totalGames = fixtures.reduce((sum, md) => sum + md.matches.length, 0);
const expectedTotal = n * (n - 1);

console.log(`\n🏆 BALLERS LEAGUE — Fixture Generation`);
console.log(`${'─'.repeat(40)}`);
console.log(`Teams:        ${n}`);
console.log(`Matchdays:    ${fixtures.length}`);
console.log(`Total games:  ${totalGames} / ${expectedTotal} expected`);
console.log(`Status:       ${totalGames === expectedTotal ? '✅ VALID' : '❌ INVALID'}`);
console.log(`${'─'.repeat(40)}`);

// ── Preview first 3 matchdays ──────────────────────────
for (let i = 0; i < 3 && i < fixtures.length; i++) {
  const md = fixtures[i];
  console.log(`\n📅 Matchday ${md.matchday}`);
  for (const m of md.matches) {
    console.log(`   ${m.home.player} (${m.home.club})  vs  ${m.away.player} (${m.away.club})`);
  }
}

// ── Save to file ───────────────────────────────────────
const output = {
  league: "Ballers League",
  season: "Season 1",
  generatedAt: new Date().toISOString(),
  teams: teams,
  fixtures: fixtures,
};

const outPath = path.join(__dirname, 'fixtures.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
console.log(`\n💾 Fixtures saved to: ${outPath}\n`);
