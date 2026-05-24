const { getSupabase } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const supabase = getSupabase();

    // Fetch all seasons
    const { data: seasons, error: seasonsErr } = await supabase
      .from('seasons')
      .select('*')
      .order('id');

    if (seasonsErr) throw seasonsErr;

    // Determine which season to show
    let seasonId;
    if (req.query.season) {
      seasonId = parseInt(req.query.season, 10);
    } else {
      // Default to the active season, or the latest one
      const activeSeason = seasons.find(s => s.status === 'active');
      seasonId = activeSeason ? activeSeason.id : seasons[seasons.length - 1]?.id || 1;
    }

    const currentSeason = seasons.find(s => s.id === seasonId);

    // Fetch teams
    const { data: teams, error: teamsErr } = await supabase
      .from('teams')
      .select('*')
      .order('id');

    if (teamsErr) throw teamsErr;

    // Fetch matches for the selected season
    const { data: matches, error: matchesErr } = await supabase
      .from('matches')
      .select('*')
      .eq('season_id', seasonId)
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
        homeStreamUrl: m.home_stream_url,
        awayStreamUrl: m.away_stream_url,
        predictions: m.predictions,
      });
    }

    const fixtures = Object.values(fixtureMap).sort((a, b) => a.matchday - b.matchday);

    res.status(200).json({
      league: 'Ballers League',
      season: currentSeason ? currentSeason.name : 'Season 1',
      seasonId: seasonId,
      seasons: seasons.map(s => ({ id: s.id, name: s.name, status: s.status })),
      teams,
      fixtures,
    });
  } catch (err) {
    console.error('API /data error:', err);
    res.status(500).json({ error: 'Failed to load data' });
  }
};
