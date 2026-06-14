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

    // Fetch active teams and matches before updates to run promotion/relegation
    const { data: teamsBefore, error: teamsBeforeErr } = await supabase
      .from('teams')
      .select('*')
      .eq('is_active', true)
      .order('id');
    if (teamsBeforeErr) throw teamsBeforeErr;

    const { data: activeMatches, error: activeMatchesErr } = await supabase
      .from('matches')
      .select('*')
      .eq('season_id', activeSeason.id);
    if (activeMatchesErr) throw activeMatchesErr;

    const leagueMatches = activeMatches.filter(m => !m.stage || m.stage === 'league');

    // Calculate standings for division promotion/relegation
    const standings = computeStandings(teamsBefore, leagueMatches, activeSeason.deductions);

    const div1Sorted = standings.filter(t => (t.division || 1) === 1);
    const div2Sorted = standings.filter(t => (t.division || 1) === 2);

    if (div1Sorted.length >= 3 && div2Sorted.length >= 3) {
      const relegated = div1Sorted.slice(-3); // Bottom 3 of Div 1
      const promoted = div2Sorted.slice(0, 3); // Top 3 of Div 2

      const updates = [];
      relegated.forEach(t => {
        updates.push(supabase.from('teams').update({ division: 2 }).eq('id', t.id));
      });
      promoted.forEach(t => {
        updates.push(supabase.from('teams').update({ division: 1 }).eq('id', t.id));
      });

      await Promise.all(updates);

      // Record in promotions_relegations history
      const prRecords = [];
      relegated.forEach(t => {
        prRecords.push({
          season_id: activeSeason.id,
          team_id: t.id,
          direction: 'relegated',
          from_division: 1,
          to_division: 2
        });
      });
      promoted.forEach(t => {
        prRecords.push({
          season_id: activeSeason.id,
          team_id: t.id,
          direction: 'promoted',
          from_division: 2,
          to_division: 1
        });
      });

      const { error: prErr } = await supabase
        .from('promotions_relegations')
        .insert(prRecords);
      
      if (prErr) {
        console.error('Error inserting promotions/relegations:', prErr);
      }
    }

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

    // Filter active teams by division
    const div1Teams = teams ? teams.filter(t => (t.division || 1) === 1) : [];
    const div2Teams = teams ? teams.filter(t => (t.division || 1) === 2) : [];

    if (div1Teams.length < 2) {
      return res.status(400).json({
        error: 'Cannot start a new season — there must be at least 2 active teams in Division 1 to generate fixtures.'
      });
    }

    // Helper to combine fixtures for two divisions
    const combineFixtures = (f1, f2) => {
      const combined = [];
      const maxMatchday = Math.max(f1.length, f2.length);
      for (let md = 1; md <= maxMatchday; md++) {
        const mdMatches = [];
        const div1Md = f1.find(x => x.matchday === md);
        const div2Md = f2.find(x => x.matchday === md);
        if (div1Md) {
          mdMatches.push(...div1Md.matches.map(m => ({ ...m, division: 1 })));
        }
        if (div2Md) {
          mdMatches.push(...div2Md.matches.map(m => ({ ...m, division: 2 })));
        }
        if (mdMatches.length > 0) {
          combined.push({
            matchday: md,
            matches: mdMatches
          });
        }
      }
      return combined;
    };

    // 6. Generate new fixtures using the shared algorithm
    let fixtures = [];
    if (div2Teams.length >= 2) {
      const f1 = generateFixtures(div1Teams);
      const f2 = generateFixtures(div2Teams);
      fixtures = combineFixtures(f1, f2);
    } else {
      const f1 = generateFixtures(div1Teams);
      fixtures = f1.map(md => ({
        matchday: md.matchday,
        matches: md.matches.map(m => ({ ...m, division: 1 }))
      }));
    }

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
          division: m.division || 1,
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

function computeStandings(teams, leagueMatches, deductions = null) {
  const standings = {};
  teams.forEach(t => {
    standings[t.id] = { ...t, points: 0, goalsFor: 0, goalsAgainst: 0, wins: 0, draws: 0, losses: 0, played: 0 };
  });

  leagueMatches.forEach(m => {
    if (m.status === 'completed' && m.home_score !== null && m.away_score !== null) {
      const home = standings[m.home_id];
      const away = standings[m.away_id];
      if (!home || !away) return;
      home.played++;
      away.played++;
      home.goalsFor += m.home_score;
      home.goalsAgainst += m.away_score;
      away.goalsFor += m.away_score;
      away.goalsAgainst += m.home_score;

      if (m.home_score > m.away_score) {
        home.wins++;
        home.points += 3;
        away.losses++;
      } else if (m.home_score < m.away_score) {
        away.wins++;
        away.points += 3;
        home.losses++;
      } else {
        home.draws++;
        away.draws++;
        home.points++;
        away.points++;
      }
    }
  });

  if (deductions) {
    Object.entries(deductions).forEach(([teamId, pts]) => {
      const tId = parseInt(teamId, 10);
      if (standings[tId]) {
        standings[tId].points -= parseInt(pts, 10);
      }
    });
  }

  return Object.values(standings).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.goalsFor - a.goalsAgainst;
    const gdB = b.goalsFor - b.goalsAgainst;
    if (gdB !== gdA) return gdB - gdA;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.player.localeCompare(b.player);
  });
}

