/**
 * Ballers League — Shared Fixture Generation Module
 * 
 * Generates a full double round-robin schedule (home & away) for all teams.
 * Matchdays are randomized. No home fixture is the same as an away fixture.
 * 
 * Usage:
 *   const { generateFixtures } = require('./lib/generate-fixtures');
 *   const fixtures = generateFixtures(teams);
 */

// ── Helper: Shuffle array (Fisher-Yates) ──────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Round-Robin scheduling using circle method ─────────
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

/**
 * Generate a full double round-robin fixture list for the given teams.
 * 
 * @param {Array} teams - Array of team objects with { id, player, club }
 * @returns {Array} fixtures - Array of matchday objects: { matchday, matches: [...] }
 */
function generateFixtures(teams) {
  const n = teams.length;
  const isOdd = n % 2 !== 0;
  const teamIndices = teams.map((_, i) => i);
  const dummyIdx = n;

  if (isOdd) {
    teamIndices.push(dummyIdx);
  }

  // Generate first half (legs)
  const firstHalfRounds = generateRounds(teamIndices);

  // Generate second half (reverse home/away)
  const secondHalfRounds = firstHalfRounds.map(round =>
    round.map(match => ({ homeIdx: match.awayIdx, awayIdx: match.homeIdx }))
  );

  // Shuffle the round order within their respective halves (to keep home/away opponents separated)
  const shuffledFirstHalf = shuffle(firstHalfRounds);
  const shuffledSecondHalf = shuffle(secondHalfRounds);
  const allRounds = [...shuffledFirstHalf, ...shuffledSecondHalf];

  // Also shuffle match order within each round
  const finalRounds = allRounds.map(round => shuffle(round));

  // Build the final fixture list
  const fixtures = finalRounds.map((round, idx) => {
    const actualMatches = round.filter(match => match.homeIdx !== dummyIdx && match.awayIdx !== dummyIdx);
    return {
      matchday: idx + 1,
      matches: actualMatches.map(match => ({
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
        status: "upcoming",
      })),
    };
  });

  // Validation
  const pairSet = new Set();
  for (const md of fixtures) {
    for (const m of md.matches) {
      pairSet.add(`${m.home.id}-${m.away.id}`);
    }
  }

  const expectedTotal = n * (n - 1);
  if (pairSet.size !== expectedTotal) {
    throw new Error(`Fixture generation validation failed: got ${pairSet.size} unique pairs, expected ${expectedTotal}`);
  }

  return fixtures;
}

module.exports = { generateFixtures, shuffle };
