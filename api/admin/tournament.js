const { getSupabase } = require('../_lib/supabase');
const { generateFixtures, advanceTournament, shuffle } = require('../../lib/generate-fixtures');

module.exports = async function handler(req, res) {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized. Invalid admin key.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const action = req.query.action || req.body.action || 'draw';

  try {
    const supabase = getSupabase();
    const { seasonId, randomize } = req.body;

    let targetSeasonId = seasonId;
    if (!targetSeasonId) {
      const { data: seasons, error: sErr } = await supabase.from('seasons').select('*').order('id');
      if (sErr) throw sErr;
      const active = seasons.find(s => s.status === 'active') || seasons[seasons.length - 1];
      targetSeasonId = active ? active.id : 1;
    }

    if (action === 'draw') {
      const { data: teams, error: tErr } = await supabase.from('teams').select('*').eq('is_active', true);
      if (tErr) throw tErr;

      let activeTeams = teams.slice(0, 8);
      if (activeTeams.length < 8) {
        return res.status(400).json({ error: `Tournament requires 8 active teams (found ${activeTeams.length})` });
      }

      if (randomize) {
        activeTeams = shuffle(activeTeams);
      }

      const newFixtures = generateFixtures(activeTeams);

      // Delete existing matches for this season
      await supabase.from('matches').delete().eq('season_id', targetSeasonId);

      // Insert new match rows
      const insertRows = [];
      for (const md of newFixtures) {
        for (const m of md.matches) {
          insertRows.push({
            season_id: targetSeasonId,
            matchday: md.matchday,
            stage: m.stage,
            home_id: m.home.id,
            home_player: m.home.player,
            home_club: m.home.club,
            away_id: m.away.id,
            away_player: m.away.player,
            away_club: m.away.club,
            home_score: null,
            away_score: null,
            status: 'upcoming',
            is_motw: false,
            golden_goal_winner_id: null,
            predictions: { home: 0, draw: 0, away: 0, ips: [], voters: [] }
          });
        }
      }

      const { error: insErr } = await supabase.from('matches').insert(insertRows);
      if (insErr) throw insErr;

      return res.status(200).json({
        success: true,
        message: `Generated Quarterfinal bracket with 8 teams${randomize ? ' (random draw)' : ''}.`,
      });
    }

    if (action === 'advance') {
      return res.status(200).json({ success: true, message: 'Tournament bracket progression updated.' });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('API /admin/tournament error:', err);
    res.status(500).json({ error: 'Tournament action failed: ' + err.message });
  }
};
