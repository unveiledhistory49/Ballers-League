const { getSupabase } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { matchday, homeId, awayId, option, seasonId } = req.body;

    if (matchday === undefined || homeId === undefined || awayId === undefined || !option) {
      return res.status(400).json({ error: 'Missing matchday, homeId, awayId, or option' });
    }

    if (option !== 'home' && option !== 'draw' && option !== 'away') {
      return res.status(400).json({ error: 'Invalid option. Must be home, draw, or away' });
    }

    // Capture requester's IP on Vercel serverless proxy
    const rawIp = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '127.0.0.1';
    const ip = rawIp.split(',')[0].trim();

    const supabase = getSupabase();

    // Build query — scope by season if provided
    let fetchQuery = supabase
      .from('matches')
      .select('predictions')
      .eq('matchday', parseInt(matchday, 10))
      .eq('home_id', parseInt(homeId, 10))
      .eq('away_id', parseInt(awayId, 10));

    if (seasonId) {
      fetchQuery = fetchQuery.eq('season_id', parseInt(seasonId, 10));
    }

    const { data: match, error: fetchErr } = await fetchQuery.single();

    if (fetchErr) throw fetchErr;

    // Initialize predictions if missing
    let predictions = match.predictions || { home: 0, draw: 0, away: 0, ips: [] };
    if (!predictions.ips) {
      predictions.ips = [];
    }

    // Check if IP already voted
    if (predictions.ips.includes(ip)) {
      return res.status(400).json({ error: 'Already voted from this IP' });
    }

    // Record vote
    predictions.ips.push(ip);
    predictions[option] = (predictions[option] || 0) + 1;

    // Update match row — scope by season if provided
    let updateQuery = supabase
      .from('matches')
      .update({ predictions })
      .eq('matchday', parseInt(matchday, 10))
      .eq('home_id', parseInt(homeId, 10))
      .eq('away_id', parseInt(awayId, 10));

    if (seasonId) {
      updateQuery = updateQuery.eq('season_id', parseInt(seasonId, 10));
    }

    const { error: updateErr } = await updateQuery;

    if (updateErr) throw updateErr;

    res.status(200).json({
      success: true,
      message: `Vote recorded for ${option}`,
      predictions
    });
  } catch (err) {
    console.error('Serverless prediction API error:', err);
    res.status(500).json({ error: 'Failed to record prediction' });
  }
};
