const { getSupabase } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized. Invalid admin key.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, seasonId } = req.body;
    if (!action) {
      return res.status(400).json({ error: 'Missing action parameter (generate_semis, generate_final)' });
    }

    const supabase = getSupabase();

    // 1. Get active season
    let activeSeasonId = seasonId;
    if (!activeSeasonId) {
      const { data: seasons, error: seasonsErr } = await supabase
        .from('seasons')
        .select('*')
        .order('id');
      if (seasonsErr) throw seasonsErr;
      const activeSeason = seasons.find(s => s.status === 'active');
      if (!activeSeason) {
        return res.status(400).json({ error: 'No active season found' });
      }
      activeSeasonId = activeSeason.id;
    }

    // 2. Fetch matches for this season
    const { data: matches, error: matchesErr } = await supabase
      .from('matches')
      .select('*')
      .eq('season_id', activeSeasonId);
    if (matchesErr) throw matchesErr;

    // 3. Fetch all teams
    const { data: teams, error: teamsErr } = await supabase
      .from('teams')
      .select('*');
    if (teamsErr) throw teamsErr;

    if (action === 'generate_semis') {
      // Generate Semi-finals (1st vs 4th, 2nd vs 3rd)
      // Check if already generated
      const existingSemis = matches.filter(m => m.stage === 'champions_semi_1' || m.stage === 'champions_semi_2');
      if (existingSemis.length > 0) {
        return res.status(400).json({ error: 'Semi-finals have already been generated.' });
      }

      // Check if regular season is complete (all stage = 'league' matches completed)
      const leagueMatches = matches.filter(m => !m.stage || m.stage === 'league');
      const incompleteLeague = leagueMatches.filter(m => m.status !== 'completed');
      if (incompleteLeague.length > 0) {
        return res.status(400).json({ error: 'Regular season is not completed yet. Incomplete matches remain.' });
      }

      // Calculate final standings
      const standings = computeStandings(teams, leagueMatches);
      if (standings.length < 4) {
        return res.status(400).json({ error: 'Not enough teams to generate playoffs.' });
      }

      const first = standings[0];
      const second = standings[1];
      const third = standings[2];
      const fourth = standings[3];

      // Semi-finals: 2 legs
      // Leg 1: Lower rank plays home
      // Match A: 4th vs 1st
      // Match B: 3rd vs 2nd
      // Leg 2: Higher rank plays home
      // Match C: 1st vs 4th
      // Match D: 2nd vs 3rd

      const playoffMatches = [
        // Leg 1 (Matchday 201)
        {
          season_id: activeSeasonId,
          matchday: 201,
          home_id: fourth.id, home_player: fourth.player, home_club: fourth.club,
          away_id: first.id, away_player: first.player, away_club: first.club,
          stage: 'champions_semi_1', status: 'upcoming'
        },
        {
          season_id: activeSeasonId,
          matchday: 201,
          home_id: third.id, home_player: third.player, home_club: third.club,
          away_id: second.id, away_player: second.player, away_club: second.club,
          stage: 'champions_semi_1', status: 'upcoming'
        },
        // Leg 2 (Matchday 202)
        {
          season_id: activeSeasonId,
          matchday: 202,
          home_id: first.id, home_player: first.player, home_club: first.club,
          away_id: fourth.id, away_player: fourth.player, away_club: fourth.club,
          stage: 'champions_semi_2', status: 'upcoming'
        },
        {
          season_id: activeSeasonId,
          matchday: 202,
          home_id: second.id, home_player: second.player, home_club: second.club,
          away_id: third.id, away_player: third.player, away_club: third.club,
          stage: 'champions_semi_2', status: 'upcoming'
        }
      ];

      const { error: insertErr } = await supabase
        .from('matches')
        .insert(playoffMatches);
      if (insertErr) throw insertErr;

      return res.status(200).json({
        success: true,
        message: 'Champions Cup semi-final fixtures generated.',
        matches: playoffMatches
      });

    } else if (action === 'generate_final') {
      // Generate single-legged final (Matchday 203)
      const existingFinal = matches.filter(m => m.stage === 'champions_final');
      if (existingFinal.length > 0) {
        return res.status(400).json({ error: 'Champions Cup final has already been generated.' });
      }

      // Fetch semi-final matches
      const semi1Matches = matches.filter(m => m.stage === 'champions_semi_1');
      const semi2Matches = matches.filter(m => m.stage === 'champions_semi_2');

      if (semi1Matches.length === 0 || semi2Matches.length === 0) {
        return res.status(400).json({ error: 'Semi-finals have not been fully drawn.' });
      }

      const allSemis = [...semi1Matches, ...semi2Matches];
      const incompleteSemis = allSemis.filter(m => m.status !== 'completed');
      if (incompleteSemis.length > 0) {
        return res.status(400).json({ error: 'Cannot generate final. Semi-final matches are not fully completed.' });
      }

      // Determine winners of Tie 1 (1st vs 4th) and Tie 2 (2nd vs 3rd)
      // Find matches between 1 and 4
      const tie1Matches = allSemis.filter(m =>
        (m.home_id === semi2Matches[0].home_id && m.away_id === semi2Matches[0].away_id) ||
        (m.home_id === semi2Matches[0].away_id && m.away_id === semi2Matches[0].home_id)
      );

      // Tie 1: first vs fourth
      const firstId = semi2Matches[0].home_id;
      const fourthId = semi2Matches[0].away_id;
      const winner1 = getPlayoffTieWinner(allSemis, firstId, fourthId);

      // Tie 2: second vs third
      const secondId = semi2Matches[1].home_id;
      const thirdId = semi2Matches[1].away_id;
      const winner2 = getPlayoffTieWinner(allSemis, secondId, thirdId);

      if (!winner1 || !winner2) {
        return res.status(400).json({
          error: 'Could not resolve semi-final winners. Please ensure tied aggregate scores have a Golden Goal winner recorded.'
        });
      }

      const team1 = teams.find(t => t.id === winner1);
      const team2 = teams.find(t => t.id === winner2);

      const finalMatch = {
        season_id: activeSeasonId,
        matchday: 203,
        home_id: team1.id, home_player: team1.player, home_club: team1.club,
        away_id: team2.id, away_player: team2.player, away_club: team2.club,
        stage: 'champions_final', status: 'upcoming'
      };

      const { error: insertErr } = await supabase
        .from('matches')
        .insert(finalMatch);
      if (insertErr) throw insertErr;

      return res.status(200).json({
        success: true,
        message: `Champions Cup Final drawn: ${team1.player} vs ${team2.player}`,
        match: finalMatch
      });
    }

  } catch (err) {
    console.error('Playoffs draw error:', err);
    res.status(500).json({ error: 'Failed to manage playoffs: ' + err.message });
  }
};

function computeStandings(teams, leagueMatches) {
  const standings = {};
  teams.forEach(t => {
    standings[t.id] = { ...t, points: 0, goalsFor: 0, goalsAgainst: 0, wins: 0, draws: 0, losses: 0, played: 0 };
  });

  leagueMatches.forEach(m => {
    if (m.status === 'completed' && m.home_score !== null && m.away_score !== null) {
      const home = standings[m.home_id];
      const away = standings[m.away_id];
      if (!home || !away) return;
      home.played++;
      away.played++;
      home.goalsFor += m.home_score;
      home.goalsAgainst += m.away_score;
      away.goalsFor += m.away_score;
      away.goalsAgainst += m.home_score;

      if (m.home_score > m.away_score) {
        home.wins++;
        home.points += 3;
        away.losses++;
      } else if (m.home_score < m.away_score) {
        away.wins++;
        away.points += 3;
        home.losses++;
      } else {
        home.draws++;
        away.draws++;
        home.points += 1;
        away.points += 1;
      }
    }
  });

  return Object.values(standings).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.goalsFor - a.goalsAgainst;
    const gdB = b.goalsFor - b.goalsAgainst;
    if (gdB !== gdA) return gdB - gdA;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.player.localeCompare(b.player);
  });
}

function getPlayoffTieWinner(matches, teamAId, teamBId) {
  const tieMatches = matches.filter(m =>
    (m.home_id === teamAId && m.away_id === teamBId) ||
    (m.home_id === teamBId && m.away_id === teamAId)
  );

  if (tieMatches.length < 2) return null;

  let scoreA = 0;
  let scoreB = 0;
  let secondLegMatch = null;

  for (const m of tieMatches) {
    if (m.stage === 'champions_semi_2') {
      secondLegMatch = m;
    }
    if (m.home_id === teamAId) {
      scoreA += m.home_score || 0;
      scoreB += m.away_score || 0;
    } else {
      scoreB += m.home_score || 0;
      scoreA += m.away_score || 0;
    }
  }

  if (scoreA > scoreB) return teamAId;
  if (scoreB > scoreA) return teamBId;

  // Aggregate tie! Fall back to golden goal winner of leg 2
  if (secondLegMatch && secondLegMatch.golden_goal_winner_id) {
    return secondLegMatch.golden_goal_winner_id;
  }

  return null;
}
