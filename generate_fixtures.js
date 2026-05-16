/**
 * Ballers League — Fixture Generator
 * 
 * Generates a full double round-robin schedule (home & away) for all teams.
 * Matchdays are randomized. No home fixture is the same as an away fixture.
 * 
 * Output: fixtures.json in the same directory
 */

const fs = require('fs');
const path = require('path');

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

// ── Helper: Shuffle array (Fisher-Yates) ──────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Generate all possible fixtures ─────────────────────
// Double round-robin: for every pair (A, B), we have A vs B AND B vs A
const allFixtures = [];

for (let i = 0; i < teams.length; i++) {
  for (let j = 0; j < teams.length; j++) {
    if (i !== j) {
      allFixtures.push({
        home: teams[i],
        away: teams[j],
      });
    }
  }
}

// ── Round-Robin scheduling using circle method ─────────
// With N teams (N even), we get N-1 rounds per half, each with N/2 matches
const n = teams.length;
const teamIndices = teams.map((_, i) => i);

function generateRounds(teamIds) {
  const ids = [...teamIds];
  const numRounds = ids.length - 1;
  const halfSize = ids.length / 2;
  const rounds = [];

  // Fix the first team, rotate the rest
  const fixed = ids[0];
  let rotating = ids.slice(1);

  for (let round = 0; round < numRounds; round++) {
    const roundMatches = [];
    const current = [fixed, ...rotating];

    for (let i = 0; i < halfSize; i++) {
      const home = current[i];
      const away = current[current.length - 1 - i];
      roundMatches.push({ homeIdx: home, awayIdx: away });
    }

    rounds.push(roundMatches);

    // Rotate: move last element to the front of rotating array
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, rotating.length - 1)];
  }

  return rounds;
}

// Generate first half (legs)
const firstHalfRounds = generateRounds(teamIndices);

// Generate second half (reverse home/away)
const secondHalfRounds = firstHalfRounds.map(round =>
  round.map(match => ({ homeIdx: match.awayIdx, awayIdx: match.homeIdx }))
);

// Combine and shuffle the round order
const allRounds = [...firstHalfRounds, ...secondHalfRounds];
const shuffledRounds = shuffle(allRounds);

// Also shuffle match order within each round
const finalRounds = shuffledRounds.map(round => shuffle(round));

// ── Build the final fixture list ───────────────────────
const fixtures = finalRounds.map((round, idx) => ({
  matchday: idx + 1,
  matches: round.map(match => ({
    home: {
      id: teams[match.homeIdx].id,
      player: teams[match.homeIdx].player,
      club: teams[match.homeIdx].club,
    },
    away: {
      id: teams[match.awayIdx].id,
      player: teams[match.awayIdx].player,
      club: teams[match.awayIdx].club,
    },
    homeScore: null,
    awayScore: null,
    status: "upcoming", // "upcoming" | "completed"
  })),
}));

// ── Validation ─────────────────────────────────────────
// Every ordered pair (A, B) should appear exactly once
const pairSet = new Set();
let duplicates = 0;

for (const md of fixtures) {
  for (const m of md.matches) {
    const key = `${m.home.id}-${m.away.id}`;
    if (pairSet.has(key)) {
      duplicates++;
      console.error(`⚠ Duplicate fixture: ${m.home.player} vs ${m.away.player}`);
    }
    pairSet.add(key);
  }
}

const expectedTotal = n * (n - 1); // 12 * 11 = 132
console.log(`\n🏆 BALLERS LEAGUE — Fixture Generation`);
console.log(`${'─'.repeat(40)}`);
console.log(`Teams:        ${n}`);
console.log(`Matchdays:    ${fixtures.length}`);
console.log(`Total games:  ${pairSet.size} / ${expectedTotal} expected`);
console.log(`Duplicates:   ${duplicates}`);
console.log(`Status:       ${pairSet.size === expectedTotal && duplicates === 0 ? '✅ VALID' : '❌ INVALID'}`);
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
