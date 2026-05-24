const { getSupabase } = require('../_lib/supabase');
const { generateFixtures } = require('../../lib/generate-fixtures');

module.exports = async function handler(req, res) {
  // 1. Verify request method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 2. Verify admin key
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized. Invalid admin key.' });
  }

  try {
    const { player, club, photoUrl } = req.body;

    if (!player || !club) {
      return res.status(400).json({ error: 'Missing username (player) or club name.' });
    }

    const supabase = getSupabase();

    // 3. Get active season
    const { data: seasons, error: seasonsErr } = await supabase
      .from('seasons')
      .select('*')
      .order('id');

    if (seasonsErr) throw seasonsErr;

    const activeSeason = seasons.find(s => s.status === 'active');
    if (!activeSeason) {
      return res.status(400).json({ error: 'No active season found' });
    }

    // 4. Check if any matches have been played in the active season
    const { data: matches, error: matchesErr } = await supabase
      .from('matches')
      .select('status')
      .eq('season_id', activeSeason.id);

    if (matchesErr) throw matchesErr;

    const seasonStarted = matches && matches.some(m => m.status !== 'upcoming');
    if (seasonStarted) {
      return res.status(400).json({ 
        error: 'Cannot add player to the active season. Matches have already started.' 
      });
    }

    // 5. Fetch all teams to calculate new unique ID
    const { data: teams, error: teamsErr } = await supabase
      .from('teams')
      .select('*')
      .order('id');

    if (teamsErr) throw teamsErr;

    const maxId = teams.reduce((max, t) => t.id > max ? t.id : max, 0);
    const newTeamId = maxId + 1;

    // 6. Insert new team row
    const newTeam = {
      id: newTeamId,
      player: player.trim(),
      club: club.trim(),
      photo_url: photoUrl ? photoUrl.trim() : null
    };

    const { error: insertTeamErr } = await supabase
      .from('teams')
      .insert(newTeam);

    if (insertTeamErr) throw insertTeamErr;

    // 7. Combine existing teams with the new one
    const allTeams = [...teams, newTeam];

    // 8. Generate new fixtures for the updated list of teams
    const fixtures = generateFixtures(allTeams);

    // 9. Delete old active season matches
    const { error: deleteMatchesErr } = await supabase
      .from('matches')
      .delete()
      .eq('season_id', activeSeason.id);

    if (deleteMatchesErr) throw deleteMatchesErr;

    // 10. Flatten and insert all new matches
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
        });
      }
    }

    const { error: insertMatchesErr } = await supabase
      .from('matches')
      .insert(allMatches);

    if (insertMatchesErr) throw insertMatchesErr;

    res.status(200).json({
      success: true,
      message: `Registered ${player} (${club}) successfully. Re-generated ${allMatches.length} fixtures across ${fixtures.length} matchdays.`,
      team: newTeam,
      totalMatches: allMatches.length,
      totalMatchdays: fixtures.length,
    });

  } catch (err) {
    console.error('Add player API error:', err);
    res.status(500).json({ error: 'Failed to add player: ' + err.message });
  }
};
