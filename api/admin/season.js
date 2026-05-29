const { getSupabase } = require('../_lib/supabase');
const { generateFixtures } = require('../../lib/generate-fixtures');

module.exports = async function handler(req, res) {
  // Verify admin key
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    return handleCreateSeason(req, res);
  } else if (req.method === 'GET') {
    return handleGetSeasons(req, res);
  } else if (req.method === 'PUT') {
    return handleUpdateDeductions(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
};

async function handleGetSeasons(req, res) {
  try {
    const supabase = getSupabase();
    const { data: seasons, error } = await supabase
      .from('seasons')
      .select('*')
      .order('id');

    if (error) throw error;

    res.status(200).json({ seasons });
  } catch (err) {
    console.error('Get seasons error:', err);
    res.status(500).json({ error: 'Failed to get seasons' });
  }
}

async function handleCreateSeason(req, res) {
  try {
    const supabase = getSupabase();

    // 1. Get the current active season
    const { data: seasons, error: seasonsErr } = await supabase
      .from('seasons')
      .select('*')
      .order('id');

    if (seasonsErr) throw seasonsErr;

    const activeSeason = seasons.find(s => s.status === 'active');
    if (!activeSeason) {
      return res.status(400).json({ error: 'No active season found' });
    }

    // 2. Check that all matches in the current season are completed
    const { data: pendingMatches, error: pendingErr } = await supabase
      .from('matches')
      .select('id')
      .eq('season_id', activeSeason.id)
      .neq('status', 'completed')
      .limit(1);

    if (pendingErr) throw pendingErr;

    if (pendingMatches && pendingMatches.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot start a new season — there are uncompleted matches in the current season' 
      });
    }

    // 3. Mark current season as completed
    const { error: updateErr } = await supabase
      .from('seasons')
      .update({ status: 'completed' })
      .eq('id', activeSeason.id);

    if (updateErr) throw updateErr;

    // 4. Create the new season
    const newSeasonNumber = seasons.length + 1;
    const newSeasonName = `Season ${newSeasonNumber}`;

    const { data: newSeason, error: insertSeasonErr } = await supabase
      .from('seasons')
      .insert({ name: newSeasonName, status: 'active' })
      .select()
      .single();

    if (insertSeasonErr) throw insertSeasonErr;

    // 5. Get teams (only active ones)
    const { data: teams, error: teamsErr } = await supabase
      .from('teams')
      .select('*')
      .eq('is_active', true)
      .order('id');

    if (teamsErr) throw teamsErr;

    if (!teams || teams.length < 2) {
      return res.status(400).json({
        error: 'Cannot start a new season — there must be at least 2 active teams to generate fixtures.'
      });
    }

    // 6. Generate new fixtures using the shared algorithm
    const fixtures = generateFixtures(teams);

    // 7. Flatten and insert all matches with the new season_id
    const allMatches = [];
    for (const md of fixtures) {
      for (const m of md.matches) {
        allMatches.push({
          season_id: newSeason.id,
          matchday: md.matchday,
          home_id: m.home.id,
          home_player: m.home.player,
          home_club: m.home.club,
          away_id: m.away.id,
          away_player: m.away.player,
          away_club: m.away.club,
          home_score: null,
          away_score: null,
          status: 'upcoming',
        });
      }
    }

    // Insert all matches in a single query
    const { error: insertErr } = await supabase
      .from('matches')
      .insert(allMatches);

    if (insertErr) throw insertErr;

    res.status(200).json({
      success: true,
      message: `${newSeasonName} created with ${allMatches.length} matches`,
      season: newSeason,
      totalMatches: allMatches.length,
      totalMatchdays: fixtures.length,
    });
  } catch (err) {
    console.error('Create season error:', err);
    res.status(500).json({ error: 'Failed to create new season: ' + err.message });
  }
}

async function handleUpdateDeductions(req, res) {
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
}

