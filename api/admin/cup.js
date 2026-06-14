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

    if (round === 'cup_preliminary') {
      const N = activeTeams.length;
      if (N <= 16) {
        return res.status(400).json({ error: `League has ${N} active players. You should draw Round of 16 directly.` });
      }

      // We need exactly 16 teams for Round of 16.
      // Preliminary round will narrow the remaining spots.
      // If we have N teams:
      // Number of matches in preliminary = N - 16
      // Number of playing teams = 2 * (N - 16)
      // Number of bye teams = N - 2 * (N - 16) = 32 - N
      const numMatches = N - 16;
      const numPlay = 2 * numMatches;
      const numByes = N - numPlay;

      // Seed bye teams based on Division 1 standings.
      const div1Teams = activeTeams.filter(t => (t.division || 1) === 1);
      const div2Teams = activeTeams.filter(t => (t.division || 1) === 2);

      const standingsMap = {};
      div1Teams.forEach(t => {
        standingsMap[t.id] = { id: t.id, player: t.player, club: t.club, points: 0, goalsFor: 0, goalsAgainst: 0, wins: 0, draws: 0, losses: 0, played: 0 };
      });

      matches.forEach(m => {
        if (m.stage && m.stage !== 'league') return;
        const home = standingsMap[m.home_id];
        const away = standingsMap[m.away_id];
        if (!home || !away) return;

        if (m.status === 'completed' && m.home_score !== null && m.away_score !== null) {
          home.played++; away.played++;
          home.goalsFor += m.home_score; home.goalsAgainst += m.away_score;
          away.goalsFor += m.away_score; away.goalsAgainst += m.home_score;
          if (m.home_score > m.away_score) {
            home.wins++; home.points += 3; away.losses++;
          } else if (m.home_score < m.away_score) {
            away.wins++; away.points += 3; home.losses++;
          } else {
            home.draws++; away.draws++; home.points += 1; away.points += 1;
          }
        }
      });

      const sortedDiv1 = div1Teams.sort((a, b) => {
        const sa = standingsMap[a.id];
        const sb = standingsMap[b.id];
        if (sb.points !== sa.points) return sb.points - sa.points;
        const gdA = sa.goalsFor - sa.goalsAgainst;
        const gdB = sb.goalsFor - sb.goalsAgainst;
        if (gdB !== gdA) return gdB - gdA;
        if (sb.goalsFor !== sa.goalsFor) return sb.goalsFor - sa.goalsFor;
        return a.player.localeCompare(b.player);
      });

      // Top numByes teams of Div 1 get byes. The rest of Div 1 + all of Div 2 play.
      const byeTeams = sortedDiv1.slice(0, numByes);
      const playingTeams = [
        ...sortedDiv1.slice(numByes),
        ...div2Teams
      ];

      drawTeams = playingTeams;
    } else if (round === 'cup_r16') {
      const prelimMatches = matches.filter(m => m.stage === 'cup_preliminary');
      if (prelimMatches.length > 0) {
        // Check if prelim complete
        const incomplete = prelimMatches.filter(m => m.status !== 'completed');
        if (incomplete.length > 0) {
          return res.status(400).json({ error: 'Cannot draw Round of 16. Some Preliminary matches are incomplete.' });
        }

        // Collect winners
        const winners = [];
        for (const m of prelimMatches) {
          const w = getMatchWinner(m);
          if (!w) {
            return res.status(400).json({ error: `Match ${m.home_player} vs ${m.away_player} ended in a tie. Please specify a Golden Goal winner first.` });
          }
          winners.push(w);
        }

        // Collect bye teams (active teams who did not play in prelim)
        const playedIds = new Set(prelimMatches.flatMap(m => [m.home_id, m.away_id]));
        const byeTeams = activeTeams.filter(t => !playedIds.has(t.id));

        drawTeams = [...winners, ...byeTeams.map(t => t.id)].map(id => activeTeams.find(t => t.id === id));
      } else {
        const N = activeTeams.length;
        if (N <= 8) {
          return res.status(400).json({ error: `League has ${N} active players. You should draw Quarter-finals directly.` });
        }
        const nextPower = Math.pow(2, Math.ceil(Math.log2(N)));
        const numByes = nextPower - N;

        const shuffledTeams = shuffleArray(activeTeams);
        const byeTeams = shuffledTeams.slice(0, numByes);
        const playingTeams = shuffledTeams.slice(numByes);

        drawTeams = playingTeams;
      }
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
  if (round === 'cup_preliminary') return 100;
  if (round === 'cup_r16') return 101;
  if (round === 'cup_qf') return 102;
  if (round === 'cup_sf') return 103;
  if (round === 'cup_final') return 104;
  return 100;
}

function getRoundLabel(round) {
  if (round === 'cup_preliminary') return 'Preliminary Round';
  if (round === 'cup_r16') return 'Round of 16';
  if (round === 'cup_qf') return 'Quarter-finals';
  if (round === 'cup_sf') return 'Semi-finals';
  if (round === 'cup_final') return 'Final';
  return round;
}
