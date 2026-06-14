const { getSupabase } = require('../_lib/supabase');
const { generateFixtures } = require('../../lib/generate-fixtures');

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
    const { player, club, photoUrl, division } = req.body;
    const playerDiv = parseInt(division, 10) || 1;

    if (!player || !club) {
      return res.status(400).json({ error: 'Missing username (player) or club name.' });
    }

    // Get active season
    const { data: seasons, error: seasonsErr } = await supabase
      .from('seasons')
      .select('*')
      .order('id');

    if (seasonsErr) throw seasonsErr;

    const activeSeason = seasons.find(s => s.status === 'active');
    if (!activeSeason) {
      return res.status(400).json({ error: 'No active season found' });
    }

    // Check if any matches in this division have been played in the active season
    const { data: matches, error: matchesErr } = await supabase
      .from('matches')
      .select('status')
      .eq('season_id', activeSeason.id)
      .eq('division', playerDiv);

    if (matchesErr) throw matchesErr;

    const seasonStarted = matches && matches.some(m => m.status !== 'upcoming');
    if (seasonStarted) {
      return res.status(400).json({ 
        error: `Cannot add player to Division ${playerDiv} in the active season. Matches have already started.` 
      });
    }

    // Fetch all teams to calculate new unique ID
    const { data: teams, error: teamsErr } = await supabase
      .from('teams')
      .select('*')
      .order('id');

    if (teamsErr) throw teamsErr;

    const maxId = teams.reduce((max, t) => t.id > max ? t.id : max, 0);
    const newTeamId = maxId + 1;

    // Insert new team row
    const newTeam = {
      id: newTeamId,
      player: player.trim(),
      club: club.trim(),
      photo_url: photoUrl ? photoUrl.trim() : null,
      division: playerDiv,
      is_active: true
    };

    const { error: insertTeamErr } = await supabase
      .from('teams')
      .insert(newTeam);

    if (insertTeamErr) throw insertTeamErr;

    // Combine active existing teams of the same division with the new one
    const activeTeams = [...teams.filter(t => t.is_active !== false && (t.division || 1) === playerDiv), newTeam];

    // Generate new fixtures for the active list of teams in this division
    const fixtures = generateFixtures(activeTeams);

    // Delete old active season matches for this division
    const { error: deleteMatchesErr } = await supabase
      .from('matches')
      .delete()
      .eq('season_id', activeSeason.id)
      .eq('division', playerDiv);

    if (deleteMatchesErr) throw deleteMatchesErr;

    // Flatten and insert all new matches
    const allMatches = [];
    for (const md of fixtures) {
      for (const m of md.matches) {
        allMatches.push({
          season_id: activeSeason.id,
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
          division: playerDiv
        });
      }
    }

    const { error: insertMatchesErr } = await supabase
      .from('matches')
      .insert(allMatches);

    if (insertMatchesErr) throw insertMatchesErr;

    res.status(200).json({
      success: true,
      message: `Registered ${player} (${club}) in Division ${playerDiv} successfully. Re-generated ${allMatches.length} fixtures across ${fixtures.length} matchdays.`,
      team: newTeam,
      totalMatches: allMatches.length,
      totalMatchdays: fixtures.length,
    });

  } catch (err) {
    console.error('Add player API error:', err);
    res.status(500).json({ error: 'Failed to add player: ' + err.message });
  }
}

async function handleUpdate(req, res, supabase) {
  try {
    const { id, player, club, photoUrl, division, isActive } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing team id.' });

    const updateData = {};
    if (player) updateData.player = player.trim();
    if (club) updateData.club = club.trim();
    if (photoUrl !== undefined) updateData.photo_url = photoUrl ? photoUrl.trim() : null;
    if (division !== undefined) updateData.division = parseInt(division, 10);
    if (isActive !== undefined) updateData.is_active = !!isActive;

    const { data: updatedTeam, error: teamErr } = await supabase
      .from('teams')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (teamErr) throw teamErr;

    // Get active season to check if we can regenerate fixtures (only if matches haven't started)
    const { data: seasons, error: seasonsErr } = await supabase
      .from('seasons')
      .select('*')
      .order('id');

    if (seasonsErr) throw seasonsErr;

    const activeSeason = seasons.find(s => s.status === 'active');
    if (activeSeason && (isActive !== undefined || division !== undefined)) {
      const { data: matches, error: matchesErr } = await supabase
        .from('matches')
        .select('status')
        .eq('season_id', activeSeason.id);

      if (matchesErr) throw matchesErr;

      const seasonStarted = matches && matches.some(m => m.status !== 'upcoming');
      if (!seasonStarted) {
        // Fetch all teams that are active
        const { data: teams, error: teamsErr } = await supabase
          .from('teams')
          .select('*')
          .eq('is_active', true)
          .order('id');

        if (teamsErr) throw teamsErr;

        const div1Teams = teams.filter(t => (t.division || 1) === 1);
        const div2Teams = teams.filter(t => (t.division || 1) === 2);

        let fixtures = [];
        if (div2Teams.length >= 2) {
          const f1 = generateFixtures(div1Teams);
          const f2 = generateFixtures(div2Teams);
          const combineFixtures = (a, b) => {
            const combined = [];
            const maxMatchday = Math.max(a.length, b.length);
            for (let md = 1; md <= maxMatchday; md++) {
              const mdMatches = [];
              const div1Md = a.find(x => x.matchday === md);
              const div2Md = b.find(x => x.matchday === md);
              if (div1Md) mdMatches.push(...div1Md.matches.map(m => ({ ...m, division: 1 })));
              if (div2Md) mdMatches.push(...div2Md.matches.map(m => ({ ...m, division: 2 })));
              if (mdMatches.length > 0) combined.push({ matchday: md, matches: mdMatches });
            }
            return combined;
          };
          fixtures = combineFixtures(f1, f2);
        } else {
          const f1 = generateFixtures(div1Teams);
          fixtures = f1.map(md => ({
            matchday: md.matchday,
            matches: md.matches.map(m => ({ ...m, division: 1 }))
          }));
        }

        // Delete old active season matches
        const { error: deleteMatchesErr } = await supabase
          .from('matches')
          .delete()
          .eq('season_id', activeSeason.id);

        if (deleteMatchesErr) throw deleteMatchesErr;

        const allMatches = [];
        for (const md of fixtures) {
          for (const m of md.matches) {
            allMatches.push({
              season_id: activeSeason.id,
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
              division: m.division || 1,
            });
          }
        }

        const { error: insertMatchesErr } = await supabase
          .from('matches')
          .insert(allMatches);

        if (insertMatchesErr) throw insertMatchesErr;
      }
    }

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

    // Find active season
    const { data: seasons, error: seasonsErr } = await supabase
      .from('seasons')
      .select('*')
      .order('id');

    if (seasonsErr) throw seasonsErr;

    const activeSeason = seasons.find(s => s.status === 'active');
    let seasonStarted = false;

    if (activeSeason) {
      const { data: matches, error: matchesErr } = await supabase
        .from('matches')
        .select('status')
        .eq('season_id', activeSeason.id);

      if (matchesErr) throw matchesErr;
      seasonStarted = matches && matches.some(m => m.status !== 'upcoming');
    }

    if (!seasonStarted) {
      // Hard delete from team list if season hasn't started
      const { error: deleteTeamErr } = await supabase
        .from('teams')
        .delete()
        .eq('id', id);

      if (deleteTeamErr) throw deleteTeamErr;

      if (activeSeason) {
        const { data: teams, error: teamsErr } = await supabase
          .from('teams')
          .select('*')
          .eq('is_active', true)
          .order('id');

        if (teamsErr) throw teamsErr;

        const div1Teams = teams.filter(t => (t.division || 1) === 1);
        const div2Teams = teams.filter(t => (t.division || 1) === 2);

        let fixtures = [];
        if (div2Teams.length >= 2) {
          const f1 = generateFixtures(div1Teams);
          const f2 = generateFixtures(div2Teams);
          const combineFixtures = (a, b) => {
            const combined = [];
            const maxMatchday = Math.max(a.length, b.length);
            for (let md = 1; md <= maxMatchday; md++) {
              const mdMatches = [];
              const div1Md = a.find(x => x.matchday === md);
              const div2Md = b.find(x => x.matchday === md);
              if (div1Md) mdMatches.push(...div1Md.matches.map(m => ({ ...m, division: 1 })));
              if (div2Md) mdMatches.push(...div2Md.matches.map(m => ({ ...m, division: 2 })));
              if (mdMatches.length > 0) combined.push({ matchday: md, matches: mdMatches });
            }
            return combined;
          };
          fixtures = combineFixtures(f1, f2);
        } else {
          const f1 = generateFixtures(div1Teams);
          fixtures = f1.map(md => ({
            matchday: md.matchday,
            matches: md.matches.map(m => ({ ...m, division: 1 }))
          }));
        }

        const { error: deleteMatchesErr } = await supabase
          .from('matches')
          .delete()
          .eq('season_id', activeSeason.id);

        if (deleteMatchesErr) throw deleteMatchesErr;

        const allMatches = [];
        for (const md of fixtures) {
          for (const m of md.matches) {
            allMatches.push({
              season_id: activeSeason.id,
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
              division: m.division || 1,
            });
          }
        }

        const { error: insertMatchesErr } = await supabase
          .from('matches')
          .insert(allMatches);

        if (insertMatchesErr) throw insertMatchesErr;
      }
      res.status(200).json({ success: true, message: `Player deleted and fixtures re-generated.` });
    } else {
      // Archive if season has started
      const { error: archiveErr } = await supabase
        .from('teams')
        .update({ is_active: false })
        .eq('id', id);

      if (archiveErr) throw archiveErr;

      res.status(200).json({ success: true, message: `Player archived (deactivated for future seasons).` });
    }
  } catch (err) {
    console.error('Delete player API error:', err);
    res.status(500).json({ error: 'Failed to delete/archive player: ' + err.message });
  }
}
