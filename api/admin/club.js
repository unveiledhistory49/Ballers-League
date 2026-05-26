const { getSupabase } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
  // 1. Verify admin key
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
    const { name, logoUrl, primaryColor, textColor, shortName } = req.body;
    if (!name || !logoUrl || !primaryColor || !textColor || !shortName) {
      return res.status(400).json({ error: 'Missing required club details.' });
    }

    const { data: newClub, error } = await supabase
      .from('clubs')
      .insert({
        name: name.trim(),
        logo_url: logoUrl.trim(),
        primary_color: primaryColor.trim(),
        text_color: textColor.trim(),
        short_name: shortName.trim().toUpperCase()
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Club name already exists.' });
      }
      throw error;
    }

    res.status(200).json({ success: true, message: `Club ${name} added successfully.`, club: newClub });
  } catch (err) {
    console.error('API add club error:', err);
    res.status(500).json({ error: 'Failed to add club: ' + err.message });
  }
}

async function handleUpdate(req, res, supabase) {
  try {
    const { name, logoUrl, primaryColor, textColor, shortName } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing club name to identify target.' });

    const updateData = {};
    if (logoUrl) updateData.logo_url = logoUrl.trim();
    if (primaryColor) updateData.primary_color = primaryColor.trim();
    if (textColor) updateData.text_color = textColor.trim();
    if (shortName) updateData.short_name = shortName.trim().toUpperCase();

    const { data: updatedClub, error } = await supabase
      .from('clubs')
      .update(updateData)
      .eq('name', name.trim())
      .select()
      .single();

    if (error) throw error;

    res.status(200).json({ success: true, message: `Club ${name} updated successfully.`, club: updatedClub });
  } catch (err) {
    console.error('API edit club error:', err);
    res.status(500).json({ error: 'Failed to edit club: ' + err.message });
  }
}

async function handleDelete(req, res, supabase) {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing club name.' });

    // Check if in use by teams
    const { data: inUseTeams, error: checkError } = await supabase
      .from('teams')
      .select('id')
      .eq('club', name.trim())
      .limit(1);

    if (checkError) throw checkError;

    if (inUseTeams && inUseTeams.length > 0) {
      return res.status(400).json({ error: 'Cannot delete club. It is currently in use by one or more players.' });
    }

    const { error } = await supabase
      .from('clubs')
      .delete()
      .eq('name', name.trim());

    if (error) throw error;

    res.status(200).json({ success: true, message: `Club ${name} deleted successfully.` });
  } catch (err) {
    console.error('API delete club error:', err);
    res.status(500).json({ error: 'Failed to delete club: ' + err.message });
  }
}
