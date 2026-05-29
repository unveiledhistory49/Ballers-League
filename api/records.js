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

    // Fetch ALL completed matches across all seasons
    const { data: matches, error: matchesErr } = await supabase
      .from('matches')
      .select('*')
      .eq('status', 'completed')
      .order('season_id')
      .order('matchday');

    if (matchesErr) throw matchesErr;

    // Fetch all seasons for labeling
    const { data: seasons, error: seasonsErr } = await supabase
      .from('seasons')
      .select('*')
      .order('id');

    if (seasonsErr) throw seasonsErr;

    // Fetch teams
    const { data: teams, error: teamsErr } = await supabase
      .from('teams')
      .select('*')
      .order('id');

    if (teamsErr) throw teamsErr;

    res.status(200).json({
      matches: matches.map(m => ({
        homeId: m.home_id,
        awayId: m.away_id,
        homeScore: m.home_score,
        awayScore: m.away_score,
        homePlayer: m.home_player,
        awayPlayer: m.away_player,
        homeClub: m.home_club,
        awayClub: m.away_club,
        seasonId: m.season_id,
        matchday: m.matchday,
        stage: m.stage || 'league',
        goldenGoalWinnerId: m.golden_goal_winner_id || null,
      })),
      seasons: seasons.map(s => ({ id: s.id, name: s.name, status: s.status, headline: s.headline || null, deductions: s.deductions || null })),
      teams,
    });
  } catch (err) {
    console.error('Records API error:', err);
    res.status(500).json({ error: 'Failed to load records data' });
  }
};
