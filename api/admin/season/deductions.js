const { getSupabase } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
  // Verify admin key
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { seasonId, deductions } = req.body;
    if (!seasonId || !deductions) {
      return res.status(400).json({ error: 'Missing seasonId or deductions.' });
    }

    const supabase = getSupabase();

    // Validate team IDs and ensure they are parsed as integers
    const cleanDeductions = {};
    Object.entries(deductions).forEach(([teamId, pts]) => {
      const parsedPts = parseInt(pts, 10);
      if (!isNaN(parsedPts) && parsedPts > 0) {
        cleanDeductions[teamId] = parsedPts;
      }
    });

    const { error } = await supabase
      .from('seasons')
      .update({ deductions: cleanDeductions })
      .eq('id', parseInt(seasonId, 10));

    if (error) throw error;

    res.status(200).json({ success: true, message: 'Points deductions updated successfully.', deductions: cleanDeductions });
  } catch (err) {
    console.error('Update deductions error:', err);
    res.status(500).json({ error: 'Failed to update deductions: ' + err.message });
  }
};
