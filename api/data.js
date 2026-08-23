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

    // Fetch seasons
    const { data: seasons, error: seasonsErr } = await supabase
      .from('seasons')
      .select('*')
      .order('id');

    if (seasonsErr) throw seasonsErr;

    let seasonId;
    if (req.query.season) {
      seasonId = parseInt(req.query.season, 10);
    } else {
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

    // Fetch clubs
    const { data: clubs, error: clubsErr } = await supabase
      .from('clubs')
      .select('*')
      .order('name');

    if (clubsErr) throw clubsErr;

    // Fetch matches for this season
    const { data: matches, error: matchesErr } = await supabase
      .from('matches')
      .select('*')
      .eq('season_id', seasonId)
      .order('matchday')
      .order('id');

    if (matchesErr) throw matchesErr;

    // Group matches by matchday
    const fixtureMap = {};
    for (const m of matches) {
      const md = m.matchday;
      if (!fixtureMap[md]) {
        fixtureMap[md] = {
          matchday: md,
          stage: m.stage || 'quarterfinals',
          name: getMatchdayName(md),
          matches: []
        };
      }

      fixtureMap[md].matches.push({
        id: m.id,
        stage: m.stage || 'quarterfinals',
        tieId: m.tie_id || m.tieId || 1,
        leg: m.leg || (md % 2 === 1 ? 1 : 2),
        home: { id: m.home_id, player: m.home_player, club: m.home_club },
        away: { id: m.away_id, player: m.away_player, club: m.away_club },
        homeScore: m.home_score,
        awayScore: m.away_score,
        status: m.status,
        homeStreamUrl: m.home_stream_url,
        awayStreamUrl: m.away_stream_url,
        predictions: m.predictions || { home: 0, draw: 0, away: 0, ips: [], voters: [] },
        isMotw: m.is_motw || false,
        goldenGoalWinnerId: m.golden_goal_winner_id || null,
      });
    }

    const fixtures = Object.values(fixtureMap).sort((a, b) => a.matchday - b.matchday);

    res.status(200).json({
      league: 'Ballers League',
      season: currentSeason ? currentSeason.name : 'Season 1',
      seasonId: seasonId,
      seasons: seasons.map(s => ({ id: s.id, name: s.name, status: s.status, headline: s.headline })),
      teams,
      clubs,
      fixtures,
      headline: currentSeason ? currentSeason.headline : null,
    });
  } catch (err) {
    console.error('API /data error:', err);
    res.status(500).json({ error: 'Failed to load tournament data' });
  }
};

function getMatchdayName(md) {
  switch (md) {
    case 1: return 'Quarter-finals (Leg 1)';
    case 2: return 'Quarter-finals (Leg 2)';
    case 3: return 'Semi-finals (Leg 1)';
    case 4: return 'Semi-finals (Leg 2)';
    case 5: return 'Final & 3rd Place (Leg 1)';
    case 6: return 'Final & 3rd Place (Leg 2)';
    default: return `Matchday ${md}`;
  }
}
