/**
 * Ballers League — Knockout Tournament Fixture Generator & Bracket Engine
 * 
 * 8 Teams Knockout Tournament:
 * - Quarterfinals (4 two-legged ties)
 * - Semifinals (2 two-legged ties)
 * - 3rd Place Playoff (1 two-legged tie)
 * - Finals (1 two-legged tie)
 * 
 * Rules:
 * - Aggregate score across Leg 1 (Home) and Leg 2 (Away).
 * - No away goals rule.
 * - Golden Goal winner decides ties if aggregate is equal after Leg 2.
 */

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Creates a blank/placeholder team object
 */
function createPlaceholderTeam(label) {
  return {
    id: null,
    player: label,
    club: 'TBD',
    isPlaceholder: true,
  };
}

/**
 * Calculate the outcome of a two-legged tie between Team A and Team B.
 * Leg 1: Team A is Home, Team B is Away.
 * Leg 2: Team B is Home, Team A is Away.
 */
function getTieResult(leg1Match, leg2Match) {
  if (!leg1Match || !leg2Match) {
    return { isComplete: false, winner: null, loser: null, aggregateA: 0, aggregateB: 0, isTied: false };
  }

  const teamA = leg1Match.home;
  const teamB = leg1Match.away;

  if (!teamA || !teamB || teamA.id === null || teamB.id === null) {
    return { isComplete: false, winner: null, loser: null, aggregateA: 0, aggregateB: 0, isTied: false };
  }

  const leg1Played = leg1Match.status === 'completed' && leg1Match.homeScore !== null && leg1Match.awayScore !== null;
  const leg2Played = leg2Match.status === 'completed' && leg2Match.homeScore !== null && leg2Match.awayScore !== null;

  const leg1Home = leg1Match.homeScore || 0; // Team A
  const leg1Away = leg1Match.awayScore || 0; // Team B

  const leg2Home = leg2Match.homeScore || 0; // Team B
  const leg2Away = leg2Match.awayScore || 0; // Team A

  const aggregateA = (leg1Played ? leg1Home : 0) + (leg2Played ? leg2Away : 0);
  const aggregateB = (leg1Played ? leg1Away : 0) + (leg2Played ? leg2Home : 0);

  if (!leg1Played || !leg2Played) {
    return {
      isComplete: false,
      winner: null,
      loser: null,
      aggregateA,
      aggregateB,
      isTied: false,
      leg1Played,
      leg2Played,
    };
  }

  if (aggregateA > aggregateB) {
    return { isComplete: true, winner: teamA, loser: teamB, aggregateA, aggregateB, isTied: false, method: 'aggregate' };
  } else if (aggregateB > aggregateA) {
    return { isComplete: true, winner: teamB, loser: teamA, aggregateA, aggregateB, isTied: false, method: 'aggregate' };
  } else {
    // Tied on aggregate! Check Golden Goal (stored on leg 2 match or leg 1 match)
    const ggWinnerId = leg2Match.goldenGoalWinnerId || leg1Match.goldenGoalWinnerId;
    if (ggWinnerId === teamA.id) {
      return { isComplete: true, winner: teamA, loser: teamB, aggregateA, aggregateB, isTied: true, method: 'golden_goal', goldenGoalWinnerId: ggWinnerId };
    } else if (ggWinnerId === teamB.id) {
      return { isComplete: true, winner: teamB, loser: teamA, aggregateA, aggregateB, isTied: true, method: 'golden_goal', goldenGoalWinnerId: ggWinnerId };
    } else {
      // Golden Goal not yet recorded
      return { isComplete: false, winner: null, loser: null, aggregateA, aggregateB, isTied: true, method: 'needs_golden_goal' };
    }
  }
}

/**
 * Generate full 8-team knockout fixtures (Matchdays 1 to 6)
 */
function generateFixtures(teams) {
  const activeTeams = teams.filter(t => t.isActive !== false).slice(0, 8);
  if (activeTeams.length < 8) {
    throw new Error(`Knockout tournament requires 8 teams, but found only ${activeTeams.length}`);
  }

  // Standard seeding: 1v8, 4v5, 2v7, 3v6
  const qfPairs = [
    { home: activeTeams[0], away: activeTeams[7], tieId: 1 },
    { home: activeTeams[3], away: activeTeams[4], tieId: 2 },
    { home: activeTeams[1], away: activeTeams[6], tieId: 3 },
    { home: activeTeams[2], away: activeTeams[5], tieId: 4 },
  ];

  let matchIdCounter = 1;

  // Matchday 1: Quarterfinals — Leg 1
  const md1Matches = qfPairs.map(p => ({
    id: matchIdCounter++,
    stage: 'quarterfinals',
    tieId: p.tieId,
    leg: 1,
    home: { id: p.home.id, player: p.home.player, club: p.home.club },
    away: { id: p.away.id, player: p.away.player, club: p.away.club },
    homeScore: null,
    awayScore: null,
    status: 'upcoming',
    isMotw: false,
    goldenGoalWinnerId: null,
    predictions: { home: 0, draw: 0, away: 0, ips: [], voters: [] }
  }));

  // Matchday 2: Quarterfinals — Leg 2 (Reversed Home/Away)
  const md2Matches = qfPairs.map(p => ({
    id: matchIdCounter++,
    stage: 'quarterfinals',
    tieId: p.tieId,
    leg: 2,
    home: { id: p.away.id, player: p.away.player, club: p.away.club },
    away: { id: p.home.id, player: p.home.player, club: p.home.club },
    homeScore: null,
    awayScore: null,
    status: 'upcoming',
    isMotw: false,
    goldenGoalWinnerId: null,
    predictions: { home: 0, draw: 0, away: 0, ips: [], voters: [] }
  }));

  // Matchday 3: Semifinals — Leg 1
  const md3Matches = [
    {
      id: matchIdCounter++,
      stage: 'semifinals',
      tieId: 1,
      leg: 1,
      home: createPlaceholderTeam('Winner QF 1'),
      away: createPlaceholderTeam('Winner QF 2'),
      homeScore: null,
      awayScore: null,
      status: 'upcoming',
      isMotw: false,
      goldenGoalWinnerId: null,
      predictions: { home: 0, draw: 0, away: 0, ips: [], voters: [] }
    },
    {
      id: matchIdCounter++,
      stage: 'semifinals',
      tieId: 2,
      leg: 1,
      home: createPlaceholderTeam('Winner QF 3'),
      away: createPlaceholderTeam('Winner QF 4'),
      homeScore: null,
      awayScore: null,
      status: 'upcoming',
      isMotw: false,
      goldenGoalWinnerId: null,
      predictions: { home: 0, draw: 0, away: 0, ips: [], voters: [] }
    }
  ];

  // Matchday 4: Semifinals — Leg 2
  const md4Matches = [
    {
      id: matchIdCounter++,
      stage: 'semifinals',
      tieId: 1,
      leg: 2,
      home: createPlaceholderTeam('Winner QF 2'),
      away: createPlaceholderTeam('Winner QF 1'),
      homeScore: null,
      awayScore: null,
      status: 'upcoming',
      isMotw: false,
      goldenGoalWinnerId: null,
      predictions: { home: 0, draw: 0, away: 0, ips: [], voters: [] }
    },
    {
      id: matchIdCounter++,
      stage: 'semifinals',
      tieId: 2,
      leg: 2,
      home: createPlaceholderTeam('Winner QF 4'),
      away: createPlaceholderTeam('Winner QF 3'),
      homeScore: null,
      awayScore: null,
      status: 'upcoming',
      isMotw: false,
      goldenGoalWinnerId: null,
      predictions: { home: 0, draw: 0, away: 0, ips: [], voters: [] }
    }
  ];

  // Matchday 5: 3rd Place & Final — Leg 1
  const md5Matches = [
    {
      id: matchIdCounter++,
      stage: 'third_place',
      tieId: 1,
      leg: 1,
      home: createPlaceholderTeam('Loser SF 1'),
      away: createPlaceholderTeam('Loser SF 2'),
      homeScore: null,
      awayScore: null,
      status: 'upcoming',
      isMotw: false,
      goldenGoalWinnerId: null,
      predictions: { home: 0, draw: 0, away: 0, ips: [], voters: [] }
    },
    {
      id: matchIdCounter++,
      stage: 'final',
      tieId: 1,
      leg: 1,
      home: createPlaceholderTeam('Winner SF 1'),
      away: createPlaceholderTeam('Winner SF 2'),
      homeScore: null,
      awayScore: null,
      status: 'upcoming',
      isMotw: false,
      goldenGoalWinnerId: null,
      predictions: { home: 0, draw: 0, away: 0, ips: [], voters: [] }
    }
  ];

  // Matchday 6: 3rd Place & Final — Leg 2
  const md6Matches = [
    {
      id: matchIdCounter++,
      stage: 'third_place',
      tieId: 1,
      leg: 2,
      home: createPlaceholderTeam('Loser SF 2'),
      away: createPlaceholderTeam('Loser SF 1'),
      homeScore: null,
      awayScore: null,
      status: 'upcoming',
      isMotw: false,
      goldenGoalWinnerId: null,
      predictions: { home: 0, draw: 0, away: 0, ips: [], voters: [] }
    },
    {
      id: matchIdCounter++,
      stage: 'final',
      tieId: 1,
      leg: 2,
      home: createPlaceholderTeam('Winner SF 2'),
      away: createPlaceholderTeam('Winner SF 1'),
      homeScore: null,
      awayScore: null,
      status: 'upcoming',
      isMotw: false,
      goldenGoalWinnerId: null,
      predictions: { home: 0, draw: 0, away: 0, ips: [], voters: [] }
    }
  ];

  return [
    { matchday: 1, stage: 'quarterfinals', name: 'Quarter-finals (Leg 1)', matches: md1Matches },
    { matchday: 2, stage: 'quarterfinals', name: 'Quarter-finals (Leg 2)', matches: md2Matches },
    { matchday: 3, stage: 'semifinals', name: 'Semi-finals (Leg 1)', matches: md3Matches },
    { matchday: 4, stage: 'semifinals', name: 'Semi-finals (Leg 2)', matches: md4Matches },
    { matchday: 5, stage: 'final_and_third', name: 'Final & 3rd Place (Leg 1)', matches: md5Matches },
    { matchday: 6, stage: 'final_and_third', name: 'Final & 3rd Place (Leg 2)', matches: md6Matches },
  ];
}

/**
 * Automatically advances completed stage winners to subsequent rounds
 */
function advanceTournament(fixtures, teams) {
  if (!fixtures || fixtures.length < 6) return fixtures;

  const teamLookup = {};
  if (teams) {
    teams.forEach(t => {
      teamLookup[t.id] = t;
    });
  }

  const qfLeg1Matches = fixtures[0]?.matches || [];
  const qfLeg2Matches = fixtures[1]?.matches || [];
  const sfLeg1Matches = fixtures[2]?.matches || [];
  const sfLeg2Matches = fixtures[3]?.matches || [];
  const finalsLeg1Matches = fixtures[4]?.matches || [];
  const finalsLeg2Matches = fixtures[5]?.matches || [];

  // 1. Evaluate Quarterfinals (Ties 1..4)
  const qfResults = [];
  for (let tie = 1; tie <= 4; tie++) {
    const leg1 = qfLeg1Matches.find(m => m.tieId === tie);
    const leg2 = qfLeg2Matches.find(m => m.tieId === tie);
    const result = getTieResult(leg1, leg2);
    qfResults.push({ tieId: tie, result });
  }

  // Update SF 1: Winner QF 1 vs Winner QF 2
  const qf1 = qfResults[0].result;
  const qf2 = qfResults[1].result;
  const qf3 = qfResults[2].result;
  const qf4 = qfResults[3].result;

  const sf1Leg1 = sfLeg1Matches.find(m => m.tieId === 1);
  const sf1Leg2 = sfLeg2Matches.find(m => m.tieId === 1);
  const sf2Leg1 = sfLeg1Matches.find(m => m.tieId === 2);
  const sf2Leg2 = sfLeg2Matches.find(m => m.tieId === 2);

  if (sf1Leg1 && sf1Leg2) {
    if (qf1.isComplete && qf1.winner) {
      sf1Leg1.home = { id: qf1.winner.id, player: qf1.winner.player, club: qf1.winner.club };
      sf1Leg2.away = { id: qf1.winner.id, player: qf1.winner.player, club: qf1.winner.club };
    }
    if (qf2.isComplete && qf2.winner) {
      sf1Leg1.away = { id: qf2.winner.id, player: qf2.winner.player, club: qf2.winner.club };
      sf1Leg2.home = { id: qf2.winner.id, player: qf2.winner.player, club: qf2.winner.club };
    }
  }

  if (sf2Leg1 && sf2Leg2) {
    if (qf3.isComplete && qf3.winner) {
      sf2Leg1.home = { id: qf3.winner.id, player: qf3.winner.player, club: qf3.winner.club };
      sf2Leg2.away = { id: qf3.winner.id, player: qf3.winner.player, club: qf3.winner.club };
    }
    if (qf4.isComplete && qf4.winner) {
      sf2Leg1.away = { id: qf4.winner.id, player: qf4.winner.player, club: qf4.winner.club };
      sf2Leg2.home = { id: qf4.winner.id, player: qf4.winner.player, club: qf4.winner.club };
    }
  }

  // 2. Evaluate Semifinals (Ties 1..2)
  const sf1Result = getTieResult(sf1Leg1, sf1Leg2);
  const sf2Result = getTieResult(sf2Leg1, sf2Leg2);

  const thirdLeg1 = finalsLeg1Matches.find(m => m.stage === 'third_place');
  const thirdLeg2 = finalsLeg2Matches.find(m => m.stage === 'third_place');
  const finalLeg1 = finalsLeg1Matches.find(m => m.stage === 'final');
  const finalLeg2 = finalsLeg2Matches.find(m => m.stage === 'final');

  // Update 3rd Place Playoff: Loser SF 1 vs Loser SF 2
  if (thirdLeg1 && thirdLeg2) {
    if (sf1Result.isComplete && sf1Result.loser) {
      thirdLeg1.home = { id: sf1Result.loser.id, player: sf1Result.loser.player, club: sf1Result.loser.club };
      thirdLeg2.away = { id: sf1Result.loser.id, player: sf1Result.loser.player, club: sf1Result.loser.club };
    }
    if (sf2Result.isComplete && sf2Result.loser) {
      thirdLeg1.away = { id: sf2Result.loser.id, player: sf2Result.loser.player, club: sf2Result.loser.club };
      thirdLeg2.home = { id: sf2Result.loser.id, player: sf2Result.loser.player, club: sf2Result.loser.club };
    }
  }

  // Update Final: Winner SF 1 vs Winner SF 2
  if (finalLeg1 && finalLeg2) {
    if (sf1Result.isComplete && sf1Result.winner) {
      finalLeg1.home = { id: sf1Result.winner.id, player: sf1Result.winner.player, club: sf1Result.winner.club };
      finalLeg2.away = { id: sf1Result.winner.id, player: sf1Result.winner.player, club: sf1Result.winner.club };
    }
    if (sf2Result.isComplete && sf2Result.winner) {
      finalLeg1.away = { id: sf2Result.winner.id, player: sf2Result.winner.player, club: sf2Result.winner.club };
      finalLeg2.home = { id: sf2Result.winner.id, player: sf2Result.winner.player, club: sf2Result.winner.club };
    }
  }

  return fixtures;
}

module.exports = {
  generateFixtures,
  getTieResult,
  advanceTournament,
  shuffle
};
