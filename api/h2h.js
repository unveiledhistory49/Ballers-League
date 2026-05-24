const { getSupabase } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const homeId = parseInt(req.query.home, 10);
    const awayId = parseInt(req.query.away, 10);

    if (!homeId || !awayId) {
      return res.status(400).json({ error: 'Missing home or away query param' });
    }

    const supabase = getSupabase();

    // Fetch all completed matches between these two players (in either direction)
    const { data: matches, error } = await supabase
      .from('matches')
      .select('home_id, away_id, home_score, away_score, home_player, away_player, season_id, matchday')
      .eq('status', 'completed')
      .or(
        `and(home_id.eq.${homeId},away_id.eq.${awayId}),and(home_id.eq.${awayId},away_id.eq.${homeId})`
      )
      .order('season_id')
      .order('matchday');

    if (error) throw error;

    // Compute H2H stats from perspective of the queried homeId
    let winsA = 0, winsB = 0, draws = 0;
    const recentResults = []; // from perspective of homeId

    for (const m of matches) {
      let scoreA, scoreB;
      if (m.home_id === homeId) {
        scoreA = m.home_score;
        scoreB = m.away_score;
      } else {
        scoreA = m.away_score;
        scoreB = m.home_score;
      }

      if (scoreA > scoreB) {
        winsA++;
        recentResults.push('W');
      } else if (scoreA < scoreB) {
        winsB++;
        recentResults.push('L');
      } else {
        draws++;
        recentResults.push('D');
      }
    }

    res.status(200).json({
      homeId,
      awayId,
      totalPlayed: matches.length,
      winsA,
      draws,
      winsB,
      recentForm: recentResults.slice(-5),
      matches: matches.map(m => ({
        seasonId: m.season_id,
        matchday: m.matchday,
        homeId: m.home_id,
        awayId: m.away_id,
        homeScore: m.home_score,
        awayScore: m.away_score,
        homePlayer: m.home_player,
        awayPlayer: m.away_player,
      })),
    });
  } catch (err) {
    console.error('H2H API error:', err);
    res.status(500).json({ error: 'Failed to load H2H data' });
  }
};
