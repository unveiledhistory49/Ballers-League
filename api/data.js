const { getSupabase } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabase();

    // Fetch teams
    const { data: teams, error: teamsErr } = await supabase
      .from('teams')
      .select('*')
      .order('id');

    if (teamsErr) throw teamsErr;

    // Fetch all matches ordered by matchday
    const { data: matches, error: matchesErr } = await supabase
      .from('matches')
      .select('*')
      .order('matchday')
      .order('id');

    if (matchesErr) throw matchesErr;

    // Group matches by matchday (same shape as fixtures.json)
    const fixtureMap = {};
    for (const m of matches) {
      if (!fixtureMap[m.matchday]) {
        fixtureMap[m.matchday] = {
          matchday: m.matchday,
          matches: [],
        };
      }
      fixtureMap[m.matchday].matches.push({
        home: { id: m.home_id, player: m.home_player, club: m.home_club },
        away: { id: m.away_id, player: m.away_player, club: m.away_club },
        homeScore: m.home_score,
        awayScore: m.away_score,
        status: m.status,
      });
    }

    const fixtures = Object.values(fixtureMap).sort((a, b) => a.matchday - b.matchday);

    res.status(200).json({
      league: 'Ballers League',
      season: 'Season 1',
      teams,
      fixtures,
    });
  } catch (err) {
    console.error('API /data error:', err);
    res.status(500).json({ error: 'Failed to load data' });
  }
};
