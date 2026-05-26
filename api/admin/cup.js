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
    const { round, seasonId, force } = req.body;
    if (!round) {
      return res.status(400).json({ error: 'Missing round parameter (cup_r16, cup_qf, cup_sf, cup_final)' });
    }

    const supabase = getSupabase();

    // 1. Get season
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

    // 2. Fetch all teams
    const { data: teams, error: teamsErr } = await supabase
        .from('teams')
        .select('*')
        .order('id');
    if (teamsErr) throw teamsErr;

    // 3. Fetch existing matches for this season to see what is already played/drawn
    const { data: matches, error: matchesErr } = await supabase
      .from('matches')
      .select('*')
      .eq('season_id', activeSeasonId);
    if (matchesErr) throw matchesErr;

    // Filter matches of this cup stage to check if already drawn
    const stageMatches = matches.filter(m => m.stage === round);
    if (stageMatches.length > 0) {
      if (force) {
        const hasStarted = stageMatches.some(m => m.status !== 'upcoming');
        if (hasStarted) {
          return res.status(400).json({ error: `Cannot re-draw ${getRoundLabel(round)}. Some matches in this round are already in progress or completed.` });
        }
        const { error: deleteErr } = await supabase
          .from('matches')
          .delete()
          .eq('season_id', activeSeasonId)
          .eq('stage', round);
        if (deleteErr) throw deleteErr;
      } else {
        return res.status(400).json({ error: `Draw for ${round} has already been generated for this season.` });
      }
    }

    const activeTeams = teams.filter(t => t.is_active !== false);
    let drawTeams = [];

    // Helper to get winner from a match
    const getMatchWinner = (m) => {
      if (m.home_score > m.away_score) return m.home_id;
      if (m.away_score > m.home_score) return m.away_id;
      if (m.golden_goal_winner_id) return m.golden_goal_winner_id;
      return null; // Tied and no golden goal winner recorded
    };

    if (round === 'cup_r16') {
      const N = activeTeams.length;
      if (N <= 8) {
        return res.status(400).json({ error: `League has ${N} active players. You should draw Quarter-finals directly.` });
      }
      // Calculate next power of 2 (which is 16 for N > 8 and N <= 16)
      const nextPower = Math.pow(2, Math.ceil(Math.log2(N)));
      const numByes = nextPower - N;
      const numPlay = N - numByes;

      const shuffledTeams = shuffleArray(activeTeams);
      const byeTeams = shuffledTeams.slice(0, numByes);
      const playingTeams = shuffledTeams.slice(numByes);

      drawTeams = playingTeams;
    } else if (round === 'cup_qf') {
      const r16Matches = matches.filter(m => m.stage === 'cup_r16');
      if (r16Matches.length === 0) {
        if (activeTeams.length <= 8) {
          drawTeams = activeTeams;
        } else {
          return res.status(400).json({ error: 'Round of 16 has not been generated yet.' });
        }
      } else {
        // Check if all completed
        const incomplete = r16Matches.filter(m => m.status !== 'completed');
        if (incomplete.length > 0) {
          return res.status(400).json({ error: 'Cannot draw Quarter-finals. Some Round of 16 matches are incomplete.' });
        }

        // Collect winners
        const winners = [];
        for (const m of r16Matches) {
          const w = getMatchWinner(m);
          if (!w) {
            return res.status(400).json({ error: `Match ${m.home_player} vs ${m.away_player} ended in a tie. Please specify a Golden Goal winner first.` });
          }
          winners.push(w);
        }

        // Collect bye teams (active teams who didn't play in R16)
        const playedIds = new Set(r16Matches.flatMap(m => [m.home_id, m.away_id]));
        const byeTeams = activeTeams.filter(t => !playedIds.has(t.id));

        // Combine
        drawTeams = [...winners, ...byeTeams.map(t => t.id)].map(id => activeTeams.find(t => t.id === id));
      }
    } else if (round === 'cup_sf') {
      const qfMatches = matches.filter(m => m.stage === 'cup_qf');
      if (qfMatches.length === 0) {
        if (activeTeams.length <= 4) {
          drawTeams = activeTeams;
        } else {
          return res.status(400).json({ error: 'Quarter-finals have not been generated yet.' });
        }
      } else {
        const incomplete = qfMatches.filter(m => m.status !== 'completed');
        if (incomplete.length > 0) {
          return res.status(400).json({ error: 'Cannot draw Semi-finals. Some Quarter-final matches are incomplete.' });
        }

        const winners = [];
        for (const m of qfMatches) {
          const w = getMatchWinner(m);
          if (!w) {
            return res.status(400).json({ error: `Match ${m.home_player} vs ${m.away_player} ended in a tie. Please specify a Golden Goal winner first.` });
          }
          winners.push(w);
        }

        drawTeams = winners.map(id => activeTeams.find(t => t.id === id));
      }
    } else if (round === 'cup_final') {
      const sfMatches = matches.filter(m => m.stage === 'cup_sf');
      if (sfMatches.length === 0) {
        if (activeTeams.length <= 2) {
          drawTeams = activeTeams;
        } else {
          return res.status(400).json({ error: 'Semi-finals have not been generated yet.' });
        }
      } else {
        const incomplete = sfMatches.filter(m => m.status !== 'completed');
        if (incomplete.length > 0) {
          return res.status(400).json({ error: 'Cannot draw Final. Semi-final matches are incomplete.' });
        }

        const winners = [];
        for (const m of sfMatches) {
          const w = getMatchWinner(m);
          if (!w) {
            return res.status(400).json({ error: `Match ${m.home_player} vs ${m.away_player} ended in a tie. Please specify a Golden Goal winner first.` });
          }
          winners.push(w);
        }

        drawTeams = winners.map(id => activeTeams.find(t => t.id === id));
      }
    } else {
      return res.status(400).json({ error: 'Invalid cup round' });
    }

    // Pair up drawTeams randomly
    const shuffledDraw = shuffleArray(drawTeams);
    const newMatches = [];
    const matchdayNumber = getMatchdayNumber(round);

    for (let i = 0; i < shuffledDraw.length; i += 2) {
      const home = shuffledDraw[i];
      const away = shuffledDraw[i + 1];
      newMatches.push({
        season_id: activeSeasonId,
        matchday: matchdayNumber,
        home_id: home.id,
        home_player: home.player,
        home_club: home.club,
        away_id: away.id,
        away_player: away.player,
        away_club: away.club,
        home_score: null,
        away_score: null,
        status: 'upcoming',
        stage: round,
      });
    }

    // Insert new matches
    const { error: insertErr } = await supabase
      .from('matches')
      .insert(newMatches);

    if (insertErr) throw insertErr;

    res.status(200).json({
      success: true,
      message: `Draw generated for ${getRoundLabel(round)}. Created ${newMatches.length} matches.`,
      matches: newMatches
    });

  } catch (err) {
    console.error('Cup draw error:', err);
    res.status(500).json({ error: 'Failed to generate cup draw: ' + err.message });
  }
};

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getMatchdayNumber(round) {
  // Use mapping to separate from league matchdays (which are 1-22)
  if (round === 'cup_r16') return 101;
  if (round === 'cup_qf') return 102;
  if (round === 'cup_sf') return 103;
  if (round === 'cup_final') return 104;
  return 100;
}

function getRoundLabel(round) {
  if (round === 'cup_r16') return 'Round of 16';
  if (round === 'cup_qf') return 'Quarter-finals';
  if (round === 'cup_sf') return 'Semi-finals';
  if (round === 'cup_final') return 'Final';
  return round;
}
