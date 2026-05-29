const { getSupabase } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { matchday, homeId, awayId, option, seasonId, voterName, stage } = req.body;

    if (matchday === undefined || homeId === undefined || awayId === undefined || !option || !voterName) {
      return res.status(400).json({ error: 'Missing matchday, homeId, awayId, option, or voterName' });
    }

    if (option !== 'home' && option !== 'draw' && option !== 'away') {
      return res.status(400).json({ error: 'Invalid option. Must be home, draw, or away' });
    }

    // Capture requester's IP on Vercel serverless proxy
    const rawIp = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '127.0.0.1';
    const ip = rawIp.split(',')[0].trim();

    const supabase = getSupabase();
    const stageStr = stage || 'league';

    // Build query — scope by season if provided
    let fetchQuery = supabase
      .from('matches')
      .select('predictions')
      .eq('matchday', parseInt(matchday, 10))
      .eq('home_id', parseInt(homeId, 10))
      .eq('away_id', parseInt(awayId, 10))
      .eq('stage', stageStr);

    if (seasonId) {
      fetchQuery = fetchQuery.eq('season_id', parseInt(seasonId, 10));
    }

    const { data: match, error: fetchErr } = await fetchQuery.single();

    if (fetchErr) throw fetchErr;

    // Initialize predictions if missing
    let predictions = match.predictions || { home: 0, draw: 0, away: 0, ips: [], voters: [] };
    if (!predictions.ips) {
      predictions.ips = [];
    }
    if (!predictions.voters) {
      predictions.voters = [];
    }

    // Check if they already voted
    let existingVoteIndex = -1;
    if (voterName === 'Guest') {
      existingVoteIndex = predictions.voters.findIndex(v => v.name === 'Guest' && v.ip === ip);
    } else {
      existingVoteIndex = predictions.voters.findIndex(v => v.name === voterName);
    }

    if (existingVoteIndex > -1) {
      // Change vote!
      const previousPick = predictions.voters[existingVoteIndex].pick;
      if (previousPick !== option) {
        // Decrement previous pick
        if (predictions[previousPick] > 0) {
          predictions[previousPick]--;
        }
        // Increment new pick
        predictions[option] = (predictions[option] || 0) + 1;
        // Update pick
        predictions.voters[existingVoteIndex].pick = option;
        predictions.voters[existingVoteIndex].ip = ip;
      }
    } else {
      // New vote!
      if (!predictions.ips.includes(ip)) {
        predictions.ips.push(ip);
      }
      predictions.voters.push({ name: voterName, pick: option, ip });
      predictions[option] = (predictions[option] || 0) + 1;
    }

    // Update match row — scope by season if provided
    let updateQuery = supabase
      .from('matches')
      .update({ predictions })
      .eq('matchday', parseInt(matchday, 10))
      .eq('home_id', parseInt(homeId, 10))
      .eq('away_id', parseInt(awayId, 10))
      .eq('stage', stageStr);

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
