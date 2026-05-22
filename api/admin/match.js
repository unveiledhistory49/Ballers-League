const { getSupabase } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
  // Verify admin key
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'PUT') {
    return handleUpdate(req, res);
  } else if (req.method === 'DELETE') {
    return handleReset(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
};

async function handleUpdate(req, res) {
  try {
    const { matchday, homeId, awayId, homeScore, awayScore } = req.body;

    if (matchday === undefined || homeId === undefined || awayId === undefined) {
      return res.status(400).json({ error: 'Missing matchday, homeId, or awayId' });
    }
    if (homeScore === undefined || awayScore === undefined) {
      return res.status(400).json({ error: 'Missing homeScore or awayScore' });
    }

    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('matches')
      .update({
        home_score: parseInt(homeScore, 10),
        away_score: parseInt(awayScore, 10),
        status: 'completed',
      })
      .eq('matchday', matchday)
      .eq('home_id', homeId)
      .eq('away_id', awayId)
      .select()
      .single();

    if (error) throw error;

    res.status(200).json({
      success: true,
      message: `Updated: ${data.home_player} ${data.home_score} - ${data.away_score} ${data.away_player}`,
      match: data,
    });
  } catch (err) {
    console.error('Match update error:', err);
    res.status(500).json({ error: 'Failed to update match' });
  }
}

async function handleReset(req, res) {
  try {
    const { matchday, homeId, awayId } = req.body;

    const supabase = getSupabase();

    let query = supabase
      .from('matches')
      .update({
        home_score: null,
        away_score: null,
        status: 'upcoming',
      })
      .eq('matchday', matchday);

    if (homeId !== undefined && awayId !== undefined) {
      query = query.eq('home_id', homeId).eq('away_id', awayId);
    }

    const { error } = await query;

    if (error) throw error;

    res.status(200).json({ 
      success: true, 
      message: homeId !== undefined ? 'Match reset to upcoming' : `Reset all matches for matchday ${matchday}` 
    });
  } catch (err) {
    console.error('Match reset error:', err);
    res.status(500).json({ error: 'Failed to reset match' });
  }
}
