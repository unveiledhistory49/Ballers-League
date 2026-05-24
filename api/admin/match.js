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
    const { matchday, homeId, awayId, homeScore, awayScore, status, homeStreamUrl, awayStreamUrl, seasonId } = req.body;

    if (matchday === undefined || homeId === undefined || awayId === undefined) {
      return res.status(400).json({ error: 'Missing matchday, homeId, or awayId' });
    }

    const updateData = {
      status: status || 'completed',
      home_stream_url: homeStreamUrl || null,
      away_stream_url: awayStreamUrl || null
    };

    if (homeScore !== undefined && homeScore !== null && homeScore !== '') {
      updateData.home_score = parseInt(homeScore, 10);
    } else {
      updateData.home_score = null;
    }

    if (awayScore !== undefined && awayScore !== null && awayScore !== '') {
      updateData.away_score = parseInt(awayScore, 10);
    } else {
      updateData.away_score = null;
    }

    const supabase = getSupabase();

    let query = supabase
      .from('matches')
      .update(updateData)
      .eq('matchday', matchday)
      .eq('home_id', homeId)
      .eq('away_id', awayId);

    // Scope by season if provided
    if (seasonId) {
      query = query.eq('season_id', seasonId);
    }

    const { data, error } = await query.select().single();

    if (error) throw error;

    res.status(200).json({
      success: true,
      message: `Updated match status to ${data.status}`,
      match: data,
    });
  } catch (err) {
    console.error('Match update error:', err);
    res.status(500).json({ error: 'Failed to update match' });
  }
}

async function handleReset(req, res) {
  try {
    const { matchday, homeId, awayId, seasonId } = req.body;

    const supabase = getSupabase();

    let query = supabase
      .from('matches')
      .update({
        home_score: null,
        away_score: null,
        status: 'upcoming',
      })
      .eq('matchday', matchday);

    if (seasonId) {
      query = query.eq('season_id', seasonId);
    }

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
