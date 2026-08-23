const { getSupabase } = require('../_lib/supabase');
const { generateFixtures } = require('../../lib/generate-fixtures');

module.exports = async function handler(req, res) {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized. Invalid admin key.' });
  }

  const supabase = getSupabase();

  if (req.method === 'POST') {
    return handleCreate(req, res, supabase);
  } else if (req.method === 'PUT') {
    return handleUpdate(req, res, supabase);
  } else if (req.method === 'DELETE') {
    return handleDelete(req, res, supabase);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
};

async function handleCreate(req, res, supabase) {
  try {
    const { player, club, photoUrl } = req.body;
    if (!player || !club) {
      return res.status(400).json({ error: 'Missing username (player) or club name.' });
    }

    const { data: teams, error: teamsErr } = await supabase
      .from('teams')
      .select('*')
      .order('id');

    if (teamsErr) throw teamsErr;

    const maxId = teams.reduce((max, t) => t.id > max ? t.id : max, 0);
    const newTeamId = maxId + 1;

    const newTeam = {
      id: newTeamId,
      player: player.trim(),
      club: club.trim(),
      photo_url: photoUrl ? photoUrl.trim() : null,
      is_active: true
    };

    const { error: insertTeamErr } = await supabase
      .from('teams')
      .insert(newTeam);

    if (insertTeamErr) throw insertTeamErr;

    res.status(200).json({
      success: true,
      message: `Registered ${player} (${club}) successfully.`,
      team: newTeam,
    });
  } catch (err) {
    console.error('Add player API error:', err);
    res.status(500).json({ error: 'Failed to add player: ' + err.message });
  }
}

async function handleUpdate(req, res, supabase) {
  try {
    const { id, player, club, photoUrl, isActive } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing team id.' });

    const updateData = {};
    if (player) updateData.player = player.trim();
    if (club) updateData.club = club.trim();
    if (photoUrl !== undefined) updateData.photo_url = photoUrl ? photoUrl.trim() : null;
    if (isActive !== undefined) updateData.is_active = !!isActive;

    const { data: updatedTeam, error: teamErr } = await supabase
      .from('teams')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (teamErr) throw teamErr;

    res.status(200).json({ success: true, message: 'Player details updated successfully.', team: updatedTeam });
  } catch (err) {
    console.error('Edit player API error:', err);
    res.status(500).json({ error: 'Failed to edit player: ' + err.message });
  }
}

async function handleDelete(req, res, supabase) {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing team id.' });

    const { error: archiveErr } = await supabase
      .from('teams')
      .update({ is_active: false })
      .eq('id', id);

    if (archiveErr) throw archiveErr;

    res.status(200).json({ success: true, message: `Player archived/deactivated.` });
  } catch (err) {
    console.error('Delete player API error:', err);
    res.status(500).json({ error: 'Failed to deactivate player: ' + err.message });
  }
}
