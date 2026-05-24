const { getSupabase } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
  // Verify admin key
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized. Invalid admin key.' });
  }

  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { headline } = req.body;
    let seasonId = req.body.seasonId;

    if (headline === undefined) {
      return res.status(400).json({ error: 'Missing headline parameter' });
    }

    const supabase = getSupabase();

    if (!seasonId) {
      // Find active season
      const { data: seasons, error: seasonsErr } = await supabase
        .from('seasons')
        .select('*')
        .order('id');

      if (seasonsErr) throw seasonsErr;

      const activeSeason = seasons.find(s => s.status === 'active');
      if (!activeSeason) {
        return res.status(400).json({ error: 'No active season found' });
      }
      seasonId = activeSeason.id;
    }

    // Update headline
    const { error: updateErr } = await supabase
      .from('seasons')
      .update({ headline: headline ? headline.trim() : null })
      .eq('id', seasonId);

    if (updateErr) throw updateErr;

    res.status(200).json({
      success: true,
      message: 'Headline updated successfully',
      seasonId,
      headline
    });
  } catch (err) {
    console.error('Update headline error:', err);
    res.status(500).json({ error: 'Failed to update headline: ' + err.message });
  }
};
