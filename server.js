/**
 * Ballers League — Server
 * 
 * Express backend serving the frontend + API for fixtures & standings.
 * Uses a JSON file (database.json) as the database for simplicity.
 * Admin authentication via a secret key.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { generateFixtures } = require('./lib/generate-fixtures');

const app = express();
const PORT = 3000;

// ── Config ─────────────────────────────────────────────────────
const ADMIN_KEY = process.env.ADMIN_KEY || 'ballersleague2026'; // Load from environment variable or fallback
const DB_PATH = path.join(__dirname, 'database.json');
const FIXTURES_PATH = path.join(__dirname, 'fixtures.json');

// ── Middleware ──────────────────────────────────────────────────
app.use(express.json());

// Cache-control middleware to prevent browser/CDN caching of API responses
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use(express.static(__dirname, {
  index: 'index.html',
  extensions: ['html'],
}));

// ── Database Helpers ───────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    // Initialize from fixtures.json
    const fixtureData = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf-8'));
    const db = {
      league: fixtureData.league,
      teams: fixtureData.teams.map(t => ({ ...t, isActive: true })),
      clubs: [
        { name: "Man U",       logoUrl: "logos/england_manchester-united_256x256.football-logos.cc.png", primaryColor: "#da020e", textColor: "#fff", shortName: "MU" },
        { name: "Tottenham",   logoUrl: "logos/england_tottenham_256x256.football-logos.cc.png",         primaryColor: "#132257", textColor: "#fff", shortName: "TOT" },
        { name: "Liverpool",   logoUrl: "logos/england_liverpool_256x256.football-logos.cc.png",         primaryColor: "#c8102e", textColor: "#fff", shortName: "LIV" },
        { name: "Barcelona",   logoUrl: "logos/spain_barcelona_256x256.football-logos.cc.png",           primaryColor: "#a50044", textColor: "#fff", shortName: "BAR" },
        { name: "Man City",    logoUrl: "logos/england_manchester-city_256x256.football-logos.cc.png",    primaryColor: "#6cabdd", textColor: "#1c2c5b", shortName: "MCI" },
        { name: "Arsenal FC",  logoUrl: "logos/england_arsenal_256x256.football-logos.cc.png",            primaryColor: "#ef0107", textColor: "#fff", shortName: "ARS" },
        { name: "Bayern",      logoUrl: "logos/germany_bayern-munchen_256x256.football-logos.cc.png",    primaryColor: "#dc052d", textColor: "#fff", shortName: "BAY" },
        { name: "PSG",         logoUrl: "logos/france_paris-saint-germain_256x256.football-logos.cc.png", primaryColor: "#004170", textColor: "#fff", shortName: "PSG" }
      ],
      seasons: [
        {
          id: 1,
          name: fixtureData.season || 'Season 1',
          status: 'active',
          fixtures: fixtureData.fixtures,
        }
      ],
    };
    saveDB(db);
    return db;
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));

  // Migration: if old format (flat fixtures), convert to multi-season
  if (db.fixtures && !db.seasons) {
    const migrated = {
      league: db.league,
      teams: db.teams.map(t => ({ ...t, isActive: true })),
      clubs: [
        { name: "Man U",       logoUrl: "logos/england_manchester-united_256x256.football-logos.cc.png", primaryColor: "#da020e", textColor: "#fff", shortName: "MU" },
        { name: "Tottenham",   logoUrl: "logos/england_tottenham_256x256.football-logos.cc.png",         primaryColor: "#132257", textColor: "#fff", shortName: "TOT" },
        { name: "Liverpool",   logoUrl: "logos/england_liverpool_256x256.football-logos.cc.png",         primaryColor: "#c8102e", textColor: "#fff", shortName: "LIV" },
        { name: "Barcelona",   logoUrl: "logos/spain_barcelona_256x256.football-logos.cc.png",           primaryColor: "#a50044", textColor: "#fff", shortName: "BAR" },
        { name: "Man City",    logoUrl: "logos/england_manchester-city_256x256.football-logos.cc.png",    primaryColor: "#6cabdd", textColor: "#1c2c5b", shortName: "MCI" },
        { name: "Arsenal FC",  logoUrl: "logos/england_arsenal_256x256.football-logos.cc.png",            primaryColor: "#ef0107", textColor: "#fff", shortName: "ARS" },
        { name: "Bayern",      logoUrl: "logos/germany_bayern-munchen_256x256.football-logos.cc.png",    primaryColor: "#dc052d", textColor: "#fff", shortName: "BAY" },
        { name: "PSG",         logoUrl: "logos/france_paris-saint-germain_256x256.football-logos.cc.png", primaryColor: "#004170", textColor: "#fff", shortName: "PSG" }
      ],
      seasons: [
        {
          id: 1,
          name: db.season || 'Season 1',
          status: 'active',
          fixtures: db.fixtures,
        }
      ],
    };
    saveDB(migrated);
    return migrated;
  }

  // Seed default clubs if missing
  if (!db.clubs) {
    db.clubs = [
      { name: "Man U",       logoUrl: "logos/england_manchester-united_256x256.football-logos.cc.png", primaryColor: "#da020e", textColor: "#fff", shortName: "MU" },
      { name: "Tottenham",   logoUrl: "logos/england_tottenham_256x256.football-logos.cc.png",         primaryColor: "#132257", textColor: "#fff", shortName: "TOT" },
      { name: "Liverpool",   logoUrl: "logos/england_liverpool_256x256.football-logos.cc.png",         primaryColor: "#c8102e", textColor: "#fff", shortName: "LIV" },
      { name: "Barcelona",   logoUrl: "logos/spain_barcelona_256x256.football-logos.cc.png",           primaryColor: "#a50044", textColor: "#fff", shortName: "BAR" },
      { name: "Man City",    logoUrl: "logos/england_manchester-city_256x256.football-logos.cc.png",    primaryColor: "#6cabdd", textColor: "#1c2c5b", shortName: "MCI" },
      { name: "Arsenal FC",  logoUrl: "logos/england_arsenal_256x256.football-logos.cc.png",            primaryColor: "#ef0107", textColor: "#fff", shortName: "ARS" },
      { name: "Bayern",      logoUrl: "logos/germany_bayern-munchen_256x256.football-logos.cc.png",    primaryColor: "#dc052d", textColor: "#fff", shortName: "BAY" },
      { name: "PSG",         logoUrl: "logos/france_paris-saint-germain_256x256.football-logos.cc.png", primaryColor: "#004170", textColor: "#fff", shortName: "PSG" }
    ];
    saveDB(db);
  }

  // Ensure teams have isActive flag
  let updated = false;
  if (db.teams) {
    db.teams.forEach(t => {
      if (t.isActive === undefined) {
        t.isActive = true;
        updated = true;
      }
    });
    if (updated) saveDB(db);
  }

  return db;
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

function getActiveSeason(db) {
  return db.seasons.find(s => s.status === 'active') || db.seasons[db.seasons.length - 1];
}

function getSeasonById(db, seasonId) {
  return db.seasons.find(s => s.id === seasonId);
}

function updateTeamDetailsInFixtures(db, teamId, player, club) {
  if (!db.seasons) return;
  db.seasons.forEach(season => {
    if (season.fixtures) {
      season.fixtures.forEach(md => {
        if (md.matches) {
          md.matches.forEach(m => {
            if (m.home && m.home.id === teamId) {
              m.home.player = player;
              m.home.club = club;
            }
            if (m.away && m.away.id === teamId) {
              m.away.player = player;
              m.away.club = club;
            }
          });
        }
      });
    }
    if (season.cupFixtures) {
      season.cupFixtures.forEach(md => {
        if (md.matches) {
          md.matches.forEach(m => {
            if (m.home && m.home.id === teamId) {
              m.home.player = player;
              m.home.club = club;
            }
            if (m.away && m.away.id === teamId) {
              m.away.player = player;
              m.away.club = club;
            }
          });
        }
      });
    }
    if (season.playoffFixtures) {
      season.playoffFixtures.forEach(md => {
        if (md.matches) {
          md.matches.forEach(m => {
            if (m.home && m.home.id === teamId) {
              m.home.player = player;
              m.home.club = club;
            }
            if (m.away && m.away.id === teamId) {
              m.away.player = player;
              m.away.club = club;
            }
          });
        }
      });
    }
  });
}

// ── Auth Middleware ─────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized. Invalid admin key.' });
  }
  next();
}

// ═══════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════

// ── GET /api/data — Full league data (teams + fixtures for a season) ──
app.get('/api/data', (req, res) => {
  try {
    const db = loadDB();

    // Determine which season to show
    let season;
    if (req.query.season) {
      season = getSeasonById(db, parseInt(req.query.season, 10));
    }
    if (!season) {
      season = getActiveSeason(db);
    }

    res.json({
      league: db.league,
      season: season.name,
      seasonId: season.id,
      seasons: db.seasons.map(s => ({ id: s.id, name: s.name, status: s.status, headline: s.headline || null })),
      teams: db.teams,
      clubs: db.clubs || [],
      fixtures: season.fixtures || [],
      cupFixtures: season.cupFixtures || [],
      playoffFixtures: season.playoffFixtures || [],
      headline: season.headline || null,
      deductions: season.deductions || {},
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load data' });
  }
});



// ── POST /api/admin/player — Add a player to the league and regenerate fixtures ──
app.post('/api/admin/player', requireAdmin, (req, res) => {
  try {
    const { player, club, photoUrl } = req.body;
    if (!player || !club) {
      return res.status(400).json({ error: 'Missing username (player) or club name.' });
    }

    const db = loadDB();
    const activeSeason = getActiveSeason(db);

    if (!activeSeason) {
      return res.status(400).json({ error: 'No active season found' });
    }

    // Check if any matches have been played in the active season
    const seasonStarted = activeSeason.fixtures.some(md =>
      md.matches.some(m => m.status !== 'upcoming')
    );

    if (seasonStarted) {
      return res.status(400).json({ 
        error: 'Cannot add player to the active season. Matches have already started.' 
      });
    }

    // Fetch maximum ID to calculate the next unique ID
    const maxId = db.teams.reduce((max, t) => t.id > max ? t.id : max, 0);
    const newTeamId = maxId + 1;

    // Create and add new team
    const newTeam = {
      id: newTeamId,
      player: player.trim(),
      club: club.trim(),
      photoUrl: photoUrl ? photoUrl.trim() : null,
      isActive: true
    };

    db.teams.push(newTeam);

    // Regenerate active season's fixtures
    const activeTeams = db.teams.filter(t => t.isActive !== false);
    const newFixtures = generateFixtures(activeTeams);
    activeSeason.fixtures = newFixtures;

    saveDB(db);

    const totalMatches = newFixtures.reduce((sum, md) => sum + md.matches.length, 0);

    res.json({
      success: true,
      message: `Registered ${player} (${club}) successfully. Re-generated ${totalMatches} fixtures across ${newFixtures.length} matchdays.`,
      team: newTeam,
      totalMatches,
      totalMatchdays: newFixtures.length,
    });

  } catch (err) {
    console.error('Local add player error:', err);
    res.status(500).json({ error: 'Failed to add player: ' + err.message });
  }
});

// ── PUT /api/admin/player — Update a player's details ─────────────────
app.put('/api/admin/player', requireAdmin, (req, res) => {
  try {
    const { id, player, club, photoUrl, isActive } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing team id.' });

    const db = loadDB();
    const team = db.teams.find(t => t.id === parseInt(id, 10));
    if (!team) return res.status(404).json({ error: 'Player/team not found.' });

    if (player) team.player = player.trim();
    if (club) team.club = club.trim();
    if (photoUrl !== undefined) team.photoUrl = photoUrl ? photoUrl.trim() : null;
    if (isActive !== undefined) team.isActive = !!isActive;

    // Propagate details to all match occurrences across all seasons/fixtures
    if (player || club) {
      updateTeamDetailsInFixtures(db, team.id, team.player, team.club);
    }

    // If matches haven't started and team activation changed, regenerate fixtures
    const activeSeason = getActiveSeason(db);
    if (activeSeason) {
      const seasonStarted = activeSeason.fixtures.some(md =>
        md.matches.some(m => m.status !== 'upcoming')
      );
      if (!seasonStarted && isActive !== undefined) {
        const activeTeams = db.teams.filter(t => t.isActive !== false);
        activeSeason.fixtures = generateFixtures(activeTeams);
      }
    }

    saveDB(db);
    res.json({ success: true, message: 'Player details updated successfully.', team });
  } catch (err) {
    console.error('Local edit player error:', err);
    res.status(500).json({ error: 'Failed to edit player: ' + err.message });
  }
});

// ── DELETE /api/admin/player — Archive/Soft-delete a player ─────────────
app.delete('/api/admin/player', requireAdmin, (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing team id.' });

    const db = loadDB();
    const team = db.teams.find(t => t.id === parseInt(id, 10));
    if (!team) return res.status(404).json({ error: 'Player/team not found.' });

    const activeSeason = getActiveSeason(db);

    // Check if team is in any other season's fixtures to avoid breaking past season history
    const inOtherSeasons = db.seasons.some(s => {
      if (s.id === activeSeason.id) return false;

      const inFixtures = s.fixtures && s.fixtures.some(md =>
        md.matches.some(m => m.home.id === team.id || m.away.id === team.id)
      );
      const inCup = s.cupFixtures && s.cupFixtures.some(md =>
        md.matches.some(m => m.home.id === team.id || m.away.id === team.id)
      );
      const inPlayoffs = s.playoffFixtures && s.playoffFixtures.some(md =>
        md.matches.some(m => m.home.id === team.id || m.away.id === team.id)
      );

      return inFixtures || inCup || inPlayoffs;
    });

    const activeSeasonStarted = activeSeason ? activeSeason.fixtures.some(md =>
      md.matches.some(m => m.status !== 'upcoming')
    ) : false;

    if (!activeSeasonStarted && !inOtherSeasons) {
      // Hard delete from team list only if it's safe (season hasn't started and no past history)
      db.teams = db.teams.filter(t => t.id !== team.id);
      if (activeSeason) {
        const activeTeams = db.teams.filter(t => t.isActive !== false);
        activeSeason.fixtures = generateFixtures(activeTeams);
      }
      saveDB(db);
      res.json({ success: true, message: `Player ${team.player} deleted and fixtures re-generated.` });
    } else {
      // Archive if season has started or player has history in previous seasons
      team.isActive = false;
      saveDB(db);
      res.json({ success: true, message: `Player ${team.player} archived (deactivated for future seasons).` });
    }
  } catch (err) {
    console.error('Local archive player error:', err);
    res.status(500).json({ error: 'Failed to archive player: ' + err.message });
  }
});

// ── POST /api/admin/club — Add a new club ──────────────────────────────
app.post('/api/admin/club', requireAdmin, (req, res) => {
  try {
    const { name, logoUrl, primaryColor, textColor, shortName } = req.body;
    if (!name || !logoUrl || !primaryColor || !textColor || !shortName) {
      return res.status(400).json({ error: 'Missing required club details.' });
    }

    const db = loadDB();
    if (!db.clubs) db.clubs = [];

    if (db.clubs.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) {
      return res.status(400).json({ error: 'Club name already exists.' });
    }

    const newClub = {
      name: name.trim(),
      logoUrl: logoUrl.trim(),
      primaryColor: primaryColor.trim(),
      textColor: textColor.trim(),
      shortName: shortName.trim().toUpperCase()
    };

    db.clubs.push(newClub);
    saveDB(db);

    res.json({ success: true, message: `Club ${name} added successfully.`, club: newClub });
  } catch (err) {
    console.error('Local add club error:', err);
    res.status(500).json({ error: 'Failed to add club: ' + err.message });
  }
});

// ── PUT /api/admin/club — Edit a club's details ─────────────────────────
app.put('/api/admin/club', requireAdmin, (req, res) => {
  try {
    const { name, logoUrl, primaryColor, textColor, shortName } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing club name to identify target.' });

    const db = loadDB();
    const club = db.clubs.find(c => c.name.toLowerCase() === name.trim().toLowerCase());
    if (!club) return res.status(404).json({ error: 'Club not found.' });

    if (logoUrl) club.logoUrl = logoUrl.trim();
    if (primaryColor) club.primaryColor = primaryColor.trim();
    if (textColor) club.textColor = textColor.trim();
    if (shortName) club.shortName = shortName.trim().toUpperCase();

    saveDB(db);
    res.json({ success: true, message: `Club ${name} updated successfully.`, club });
  } catch (err) {
    console.error('Local edit club error:', err);
    res.status(500).json({ error: 'Failed to edit club: ' + err.message });
  }
});

// ── DELETE /api/admin/club — Delete a club ─────────────────────────────
app.delete('/api/admin/club', requireAdmin, (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing club name.' });

    const db = loadDB();
    const inUse = db.teams.some(t => t.club.toLowerCase() === name.trim().toLowerCase());
    if (inUse) {
      return res.status(400).json({ error: 'Cannot delete club. It is currently in use by one or more players.' });
    }

    db.clubs = db.clubs.filter(c => c.name.toLowerCase() !== name.trim().toLowerCase());
    saveDB(db);

    res.json({ success: true, message: `Club ${name} deleted successfully.` });
  } catch (err) {
    console.error('Local delete club error:', err);
    res.status(500).json({ error: 'Failed to delete club: ' + err.message });
  }
});

// ── POST /api/admin/login — Verify admin key ──────────────────
app.post('/api/admin/login', (req, res) => {
  const { key } = req.body;
  if (key === ADMIN_KEY) {
    res.json({ success: true, message: 'Authenticated' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid key' });
  }
});

// ── POST /api/prediction — Cast a prediction vote ──────────────
app.post('/api/prediction', (req, res) => {
  try {
    const { matchday, homeId, awayId, option, seasonId, voterName } = req.body;

    if (matchday === undefined || homeId === undefined || awayId === undefined || !option || !voterName) {
      return res.status(400).json({ error: 'Missing matchday, homeId, awayId, option, or voterName' });
    }

    if (option !== 'home' && option !== 'draw' && option !== 'away') {
      return res.status(400).json({ error: 'Invalid option. Must be home, draw, or away' });
    }

    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const ip = rawIp.split(',')[0].trim();

    const db = loadDB();

    // Find the correct season
    let season;
    if (seasonId) {
      season = getSeasonById(db, parseInt(seasonId, 10));
    }
    if (!season) {
      season = getActiveSeason(db);
    }

    const md = season.fixtures.find(f => f.matchday === parseInt(matchday, 10));
    if (!md) return res.status(404).json({ error: `Matchday ${matchday} not found` });

    const match = md.matches.find(
      m => m.home.id === parseInt(homeId, 10) && m.away.id === parseInt(awayId, 10)
    );
    if (!match) return res.status(404).json({ error: 'Match not found' });

    if (!match.predictions) {
      match.predictions = { home: 0, draw: 0, away: 0, ips: [], voters: [] };
    }
    if (!match.predictions.ips) {
      match.predictions.ips = [];
    }
    if (!match.predictions.voters) {
      match.predictions.voters = [];
    }

    // Check if they already voted
    let existingVoteIndex = -1;
    if (voterName === 'Guest') {
      existingVoteIndex = match.predictions.voters.findIndex(v => v.name === 'Guest' && v.ip === ip);
    } else {
      existingVoteIndex = match.predictions.voters.findIndex(v => v.name === voterName);
    }

    if (existingVoteIndex > -1) {
      // Change vote!
      const previousPick = match.predictions.voters[existingVoteIndex].pick;
      if (previousPick !== option) {
        // Decrement previous pick
        if (match.predictions[previousPick] > 0) {
          match.predictions[previousPick]--;
        }
        // Increment new pick
        match.predictions[option] = (match.predictions[option] || 0) + 1;
        // Update pick
        match.predictions.voters[existingVoteIndex].pick = option;
        match.predictions.voters[existingVoteIndex].ip = ip; // Update IP if they changed devices
      }
    } else {
      // New vote!
      if (!match.predictions.ips.includes(ip)) {
        match.predictions.ips.push(ip);
      }
      match.predictions.voters.push({ name: voterName, pick: option, ip });
      match.predictions[option] = (match.predictions[option] || 0) + 1;
    }

    saveDB(db);

    res.json({
      success: true,
      message: `Vote recorded for ${option}`,
      predictions: match.predictions,
    });
  } catch (err) {
    console.error('Error recording prediction:', err);
    res.status(500).json({ error: 'Failed to record prediction' });
  }
});

// ── PUT /api/admin/match — Update a match result ──────────────
app.put('/api/admin/match', requireAdmin, (req, res) => {
  try {
    const { matchday, homeId, awayId, homeScore, awayScore, status, homeStreamUrl, awayStreamUrl, seasonId, isMotw, stage, goldenGoalWinnerId } = req.body;

    if (matchday === undefined || homeId === undefined || awayId === undefined) {
      return res.status(400).json({ error: 'Missing matchday, homeId, or awayId' });
    }

    const db = loadDB();

    // Find the correct season
    let season;
    if (seasonId) {
      season = getSeasonById(db, parseInt(seasonId, 10));
    }
    if (!season) {
      season = getActiveSeason(db);
    }

    let match = null;
    let md = null;

    if (stage && stage.startsWith('cup_')) {
      if (!season.cupFixtures) season.cupFixtures = [];
      md = season.cupFixtures.find(f => f.stage === stage);
      if (md) {
        match = md.matches.find(m => m.home.id === homeId && m.away.id === awayId);
      }
    } else if (stage && stage.startsWith('champions_')) {
      if (!season.playoffFixtures) season.playoffFixtures = [];
      md = season.playoffFixtures.find(f => f.stage === stage);
      if (md) {
        match = md.matches.find(m => m.home.id === homeId && m.away.id === awayId);
      }
    } else {
      md = season.fixtures.find(f => f.matchday === matchday);
      if (md) {
        match = md.matches.find(m => m.home.id === homeId && m.away.id === awayId);
      }
    }

    if (!match) return res.status(404).json({ error: 'Match not found' });

    if (homeScore !== undefined && homeScore !== null && homeScore !== '') {
      match.homeScore = parseInt(homeScore, 10);
    } else {
      match.homeScore = null;
    }

    if (awayScore !== undefined && awayScore !== null && awayScore !== '') {
      match.awayScore = parseInt(awayScore, 10);
    } else {
      match.awayScore = null;
    }

    match.status = status || 'completed';
    match.homeStreamUrl = homeStreamUrl || null;
    match.awayStreamUrl = awayStreamUrl || null;

    if (goldenGoalWinnerId !== undefined) {
      match.goldenGoalWinnerId = goldenGoalWinnerId ? parseInt(goldenGoalWinnerId, 10) : null;
    }

    if (isMotw !== undefined && md) {
      if (isMotw) {
        // Clear MOTW for all other matches on this matchday
        md.matches.forEach(m => {
          m.isMotw = false;
        });
        match.isMotw = true;
      } else {
        match.isMotw = false;
      }
    }

    saveDB(db);

    res.json({
      success: true,
      message: `Updated match status to ${match.status}`,
      match,
    });
  } catch (err) {
    console.error('Error updating match:', err);
    res.status(500).json({ error: 'Failed to update match' });
  }
});

// ── POST /api/admin/cup/draw — Generate Cup draw ─────────────
app.post('/api/admin/cup/draw', requireAdmin, (req, res) => {
  try {
    const { round, seasonId, force } = req.body;
    if (!round) return res.status(400).json({ error: 'Missing round parameter (cup_r16, cup_qf, cup_sf, cup_final)' });

    const db = loadDB();
    let season;
    if (seasonId) {
      season = getSeasonById(db, parseInt(seasonId, 10));
    } else {
      season = getActiveSeason(db);
    }

    if (!season) return res.status(404).json({ error: 'Season not found' });

    if (!season.cupFixtures) {
      season.cupFixtures = [];
    }

    const existingIndex = season.cupFixtures.findIndex(f => f.stage === round);
    if (existingIndex !== -1) {
      if (force) {
        const roundData = season.cupFixtures[existingIndex];
        const hasStarted = roundData.matches.some(m => m.status !== 'upcoming');
        if (hasStarted) {
          return res.status(400).json({ error: `Cannot re-draw. Some matches in this round are already in progress or completed.` });
        }
        season.cupFixtures.splice(existingIndex, 1);
      } else {
        return res.status(400).json({ error: `Draw for ${round} already exists.` });
      }
    }

    const activeTeams = db.teams.filter(t => t.isActive !== false);
    let drawTeams = [];

    const getMatchWinner = (m) => {
      if (m.homeScore > m.awayScore) return m.home.id;
      if (m.awayScore > m.homeScore) return m.away.id;
      if (m.goldenGoalWinnerId) return m.goldenGoalWinnerId;
      return null;
    };

    if (round === 'cup_r16') {
      const N = activeTeams.length;
      if (N <= 8) {
        return res.status(400).json({ error: `League has ${N} active players. You should draw Quarter-finals directly.` });
      }
      const nextPower = Math.pow(2, Math.ceil(Math.log2(N)));
      const numByes = nextPower - N;
      const numPlay = N - numByes;

      const shuffled = shuffle(activeTeams);
      const byeTeams = shuffled.slice(0, numByes);
      const playing = shuffled.slice(numByes);
      drawTeams = playing;
    } else if (round === 'cup_qf') {
      const r16Round = season.cupFixtures.find(f => f.stage === 'cup_r16');
      if (!r16Round) {
        if (activeTeams.length <= 8) {
          drawTeams = activeTeams;
        } else {
          return res.status(400).json({ error: 'Round of 16 has not been generated yet.' });
        }
      } else {
        const incomplete = r16Round.matches.some(m => m.status !== 'completed');
        if (incomplete) return res.status(400).json({ error: 'Cannot draw Quarter-finals. Some Round of 16 matches are incomplete.' });

        const winners = [];
        for (const m of r16Round.matches) {
          const w = getMatchWinner(m);
          if (!w) {
            return res.status(400).json({ error: `Match ${m.home.player} vs ${m.away.player} ended in a tie. Please specify a Golden Goal winner first.` });
          }
          winners.push(w);
        }

        const playedIds = new Set(r16Round.matches.flatMap(m => [m.home.id, m.away.id]));
        const byes = activeTeams.filter(t => !playedIds.has(t.id));

        drawTeams = [...winners.map(id => activeTeams.find(t => t.id === id)), ...byes];
      }
    } else if (round === 'cup_sf') {
      const qfRound = season.cupFixtures.find(f => f.stage === 'cup_qf');
      if (!qfRound) {
        if (activeTeams.length <= 4) {
          drawTeams = activeTeams;
        } else {
          return res.status(400).json({ error: 'Quarter-finals have not been generated yet.' });
        }
      } else {
        const incomplete = qfRound.matches.some(m => m.status !== 'completed');
        if (incomplete) return res.status(400).json({ error: 'Cannot draw Semi-finals. Some Quarter-final matches are incomplete.' });

        const winners = [];
        for (const m of qfRound.matches) {
          const w = getMatchWinner(m);
          if (!w) {
            return res.status(400).json({ error: `Match ${m.home.player} vs ${m.away.player} ended in a tie. Please specify a Golden Goal winner first.` });
          }
          winners.push(w);
        }

        drawTeams = winners.map(id => activeTeams.find(t => t.id === id));
      }
    } else if (round === 'cup_final') {
      const sfRound = season.cupFixtures.find(f => f.stage === 'cup_sf');
      if (!sfRound) {
        if (activeTeams.length <= 2) {
          drawTeams = activeTeams;
        } else {
          return res.status(400).json({ error: 'Semi-finals have not been generated yet.' });
        }
      } else {
        const incomplete = sfRound.matches.some(m => m.status !== 'completed');
        if (incomplete) return res.status(400).json({ error: 'Cannot draw Final. Semi-final matches are incomplete.' });

        const winners = [];
        for (const m of sfRound.matches) {
          const w = getMatchWinner(m);
          if (!w) {
            return res.status(400).json({ error: `Match ${m.home.player} vs ${m.away.player} ended in a tie. Please specify a Golden Goal winner first.` });
          }
          winners.push(w);
        }

        drawTeams = winners.map(id => activeTeams.find(t => t.id === id));
      }
    } else {
      return res.status(400).json({ error: 'Invalid cup round' });
    }

    const shuffledDraw = shuffle(drawTeams);
    const matches = [];
    const matchdayNumber = round === 'cup_r16' ? 101 : round === 'cup_qf' ? 102 : round === 'cup_sf' ? 103 : 104;

    for (let i = 0; i < shuffledDraw.length; i += 2) {
      const home = shuffledDraw[i];
      const away = shuffledDraw[i+1];
      matches.push({
        id: Math.floor(Math.random() * 100000),
        home: { id: home.id, player: home.player, club: home.club },
        away: { id: away.id, player: away.player, club: away.club },
        homeScore: null,
        awayScore: null,
        status: 'upcoming',
        stage: round,
      });
    }

    season.cupFixtures.push({
      stage: round,
      matchday: matchdayNumber,
      matches,
    });

    saveDB(db);

    res.json({ success: true, message: `Generated cup draw for ${round}`, matches });
  } catch (err) {
    console.error('Cup draw error:', err);
    res.status(500).json({ error: 'Failed to generate cup draw' });
  }
});

// ── POST /api/admin/playoffs/generate — Champions Cup Playoffs ─────────────
app.post('/api/admin/playoffs/generate', requireAdmin, (req, res) => {
  try {
    const { action, seasonId } = req.body;
    if (!action) return res.status(400).json({ error: 'Missing action parameter (generate_semis, generate_final)' });

    const db = loadDB();
    let season;
    if (seasonId) {
      season = getSeasonById(db, parseInt(seasonId, 10));
    } else {
      season = getActiveSeason(db);
    }

    if (!season) return res.status(404).json({ error: 'Season not found' });

    if (!season.playoffFixtures) {
      season.playoffFixtures = [];
    }

    // Helper: shuffle
    const shuffleArray = (arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    if (action === 'generate_semis') {
      const exists = season.playoffFixtures.some(f => f.stage === 'champions_semi_1');
      if (exists) return res.status(400).json({ error: 'Semi-finals have already been generated.' });

      // Check regular season complete
      const incomplete = season.fixtures.some(md => md.matches.some(m => m.status !== 'completed'));
      if (incomplete) return res.status(400).json({ error: 'Regular season is not completed yet. Incomplete matches remain.' });

      // Calculate standings
      const { standings } = computeStandings(db.teams, season.fixtures, season.deductions);
      if (standings.length < 4) {
        return res.status(400).json({ error: 'Not enough teams to generate playoffs.' });
      }

      const first = standings[0];
      const second = standings[1];
      const third = standings[2];
      const fourth = standings[3];

      const matchIdBase = Math.floor(Math.random() * 100000);

      const semi1Matches = [
        {
          id: matchIdBase + 1,
          home: { id: fourth.id, player: fourth.player, club: fourth.club },
          away: { id: first.id, player: first.player, club: first.club },
          homeScore: null, awayScore: null, status: 'upcoming', stage: 'champions_semi_1'
        },
        {
          id: matchIdBase + 2,
          home: { id: third.id, player: third.player, club: third.club },
          away: { id: second.id, player: second.player, club: second.club },
          homeScore: null, awayScore: null, status: 'upcoming', stage: 'champions_semi_1'
        }
      ];

      const semi2Matches = [
        {
          id: matchIdBase + 3,
          home: { id: first.id, player: first.player, club: first.club },
          away: { id: fourth.id, player: fourth.player, club: fourth.club },
          homeScore: null, awayScore: null, status: 'upcoming', stage: 'champions_semi_2'
        },
        {
          id: matchIdBase + 4,
          home: { id: second.id, player: second.player, club: second.club },
          away: { id: third.id, player: third.player, club: third.club },
          homeScore: null, awayScore: null, status: 'upcoming', stage: 'champions_semi_2'
        }
      ];

      season.playoffFixtures.push({
        stage: 'champions_semi_1',
        matchday: 201,
        matches: semi1Matches,
      });

      season.playoffFixtures.push({
        stage: 'champions_semi_2',
        matchday: 202,
        matches: semi2Matches,
      });

      saveDB(db);

      res.json({ success: true, message: 'Champions Cup semi-finals generated.' });

    } else if (action === 'generate_final') {
      const exists = season.playoffFixtures.some(f => f.stage === 'champions_final');
      if (exists) return res.status(400).json({ error: 'Champions Cup final has already been generated.' });

      const semi1Round = season.playoffFixtures.find(f => f.stage === 'champions_semi_1');
      const semi2Round = season.playoffFixtures.find(f => f.stage === 'champions_semi_2');

      if (!semi1Round || !semi2Round) return res.status(400).json({ error: 'Semi-finals have not been fully drawn.' });

      const allSemis = [...semi1Round.matches, ...semi2Round.matches];
      const incomplete = allSemis.some(m => m.status !== 'completed');
      if (incomplete) return res.status(400).json({ error: 'Cannot generate final. Semi-final matches are not fully completed.' });

      const firstId = semi2Round.matches[0].home.id; // 1st seed
      const fourthId = semi2Round.matches[0].away.id; // 4th seed
      const secondId = semi2Round.matches[1].home.id; // 2nd seed
      const thirdId = semi2Round.matches[1].away.id; // 3rd seed

      const getWinner = (teamAId, teamBId) => {
        let scoreA = 0, scoreB = 0;
        let leg2Match = null;
        allSemis.forEach(m => {
          if (m.stage === 'champions_semi_2' && ((m.home.id === teamAId && m.away.id === teamBId) || (m.home.id === teamBId && m.away.id === teamAId))) {
            leg2Match = m;
          }
          if (m.home.id === teamAId && m.away.id === teamBId) {
            scoreA += m.homeScore || 0;
            scoreB += m.awayScore || 0;
          } else if (m.away.id === teamAId && m.home.id === teamBId) {
            scoreB += m.homeScore || 0;
            scoreA += m.awayScore || 0;
          }
        });
        if (scoreA > scoreB) return teamAId;
        if (scoreB > scoreA) return teamBId;
        return leg2Match ? leg2Match.goldenGoalWinnerId : null;
      };

      const winner1 = getWinner(firstId, fourthId);
      const winner2 = getWinner(secondId, thirdId);

      if (!winner1 || !winner2) {
        return res.status(400).json({ error: 'Could not resolve semi-final winners. Please ensure tied aggregate scores have a Golden Goal winner recorded.' });
      }

      const team1 = db.teams.find(t => t.id === winner1);
      const team2 = db.teams.find(t => t.id === winner2);

      const finalMatch = {
        id: Math.floor(Math.random() * 100000),
        home: { id: team1.id, player: team1.player, club: team1.club },
        away: { id: team2.id, player: team2.player, club: team2.club },
        homeScore: null, awayScore: null, status: 'upcoming', stage: 'champions_final'
      };

      season.playoffFixtures.push({
        stage: 'champions_final',
        matchday: 203,
        matches: [finalMatch],
      });

      saveDB(db);

      res.json({ success: true, message: `Champions Cup final generated between ${team1.player} and ${team2.player}`, match: finalMatch });
    }
  } catch (err) {
    console.error('Playoffs error:', err);
    res.status(500).json({ error: 'Failed to manage playoffs' });
  }
});

// ── PUT /api/admin/headline — Update season headline ──────────
app.put('/api/admin/headline', requireAdmin, (req, res) => {
  try {
    const { headline, seasonId } = req.body;

    if (headline === undefined) {
      return res.status(400).json({ error: 'Missing headline parameter' });
    }

    const db = loadDB();
    let season;
    if (seasonId) {
      season = getSeasonById(db, parseInt(seasonId, 10));
    }
    if (!season) {
      season = getActiveSeason(db);
    }

    if (!season) {
      return res.status(400).json({ error: 'Season not found' });
    }

    season.headline = headline ? headline.trim() : null;
    saveDB(db);

    res.json({
      success: true,
      message: 'Headline updated successfully',
      seasonId: season.id,
      headline: season.headline,
    });
  } catch (err) {
    console.error('Error updating headline:', err);
    res.status(500).json({ error: 'Failed to update headline' });
  }
});

// ── DELETE /api/admin/match — Reset a match or entire matchday ────
app.delete('/api/admin/match', requireAdmin, (req, res) => {
  try {
    const { matchday, homeId, awayId, seasonId, stage } = req.body;

    const db = loadDB();

    let season;
    if (seasonId) {
      season = getSeasonById(db, parseInt(seasonId, 10));
    }
    if (!season) {
      season = getActiveSeason(db);
    }

    let md = null;

    if (stage && stage.startsWith('cup_')) {
      if (!season.cupFixtures) season.cupFixtures = [];
      md = season.cupFixtures.find(f => f.stage === stage);
    } else if (stage && stage.startsWith('champions_')) {
      if (!season.playoffFixtures) season.playoffFixtures = [];
      md = season.playoffFixtures.find(f => f.stage === stage);
    } else {
      md = season.fixtures.find(f => f.matchday === matchday);
    }

    if (!md) return res.status(404).json({ error: 'Matchday or Round not found' });

    if (homeId === undefined && awayId === undefined) {
      md.matches.forEach(m => {
        m.homeScore = null;
        m.awayScore = null;
        m.status = 'upcoming';
        m.isMotw = false;
        m.predictions = { home: 0, draw: 0, away: 0, ips: [], voters: [] };
        m.goldenGoalWinnerId = null;
      });
      saveDB(db);
      return res.json({ success: true, message: `Reset all matches for this round` });
    }

    const match = md.matches.find(
      m => m.home.id === parseInt(homeId, 10) && m.away.id === parseInt(awayId, 10)
    );
    if (!match) return res.status(404).json({ error: 'Match not found' });

    match.homeScore = null;
    match.awayScore = null;
    match.status = 'upcoming';
    match.isMotw = false;
    match.predictions = { home: 0, draw: 0, away: 0, ips: [], voters: [] };
    match.goldenGoalWinnerId = null;

    saveDB(db);

    res.json({ success: true, message: 'Match reset to upcoming' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset match' });
  }
});

// ── POST /api/admin/season — Create a new season ─────────────
app.post('/api/admin/season', requireAdmin, (req, res) => {
  try {
    const db = loadDB();
    const activeSeason = getActiveSeason(db);

    if (!activeSeason) {
      return res.status(400).json({ error: 'No active season found' });
    }

    // Check that all matches are completed
    const hasIncomplete = activeSeason.fixtures.some(md =>
      md.matches.some(m => m.status !== 'completed')
    );

    if (hasIncomplete) {
      return res.status(400).json({
        error: 'Cannot start a new season — there are uncompleted matches in the current season'
      });
    }

    // Mark current season as completed
    activeSeason.status = 'completed';

    // Filter to only include active teams for scheduling
    const activeTeams = db.teams.filter(t => t.isActive !== false);
    if (activeTeams.length < 2) {
      return res.status(400).json({
        error: 'Cannot start a new season — there must be at least 2 active teams to generate fixtures.'
      });
    }

    // Create new season
    const newId = db.seasons.length + 1;
    const newSeasonName = `Season ${newId}`;
    const newFixtures = generateFixtures(activeTeams);

    db.seasons.push({
      id: newId,
      name: newSeasonName,
      status: 'active',
      fixtures: newFixtures,
    });

    saveDB(db);

    const totalMatches = newFixtures.reduce((sum, md) => sum + md.matches.length, 0);

    res.json({
      success: true,
      message: `${newSeasonName} created with ${totalMatches} matches`,
      season: { id: newId, name: newSeasonName, status: 'active' },
      totalMatches,
      totalMatchdays: newFixtures.length,
    });
  } catch (err) {
    console.error('Error creating season:', err);
    res.status(500).json({ error: 'Failed to create new season: ' + err.message });
  }
});

// ── PUT /api/admin/season/deductions — Save season points deductions ──
app.put('/api/admin/season/deductions', requireAdmin, (req, res) => {
  try {
    const { seasonId, deductions } = req.body;
    if (!seasonId || !deductions) {
      return res.status(400).json({ error: 'Missing seasonId or deductions.' });
    }

    const db = loadDB();
    const season = getSeasonById(db, parseInt(seasonId, 10));
    if (!season) return res.status(404).json({ error: 'Season not found.' });

    // Validate team IDs and ensure they are parsed as integers
    const cleanDeductions = {};
    Object.entries(deductions).forEach(([teamId, pts]) => {
      const parsedPts = parseInt(pts, 10);
      if (!isNaN(parsedPts) && parsedPts > 0) {
        cleanDeductions[teamId] = parsedPts;
      }
    });

    season.deductions = cleanDeductions;
    saveDB(db);

    res.json({ success: true, message: 'Points deductions updated successfully.', deductions: cleanDeductions });
  } catch (err) {
    console.error('Local update deductions error:', err);
    res.status(500).json({ error: 'Failed to update deductions: ' + err.message });
  }
});

// ── GET /api/h2h — Head-to-Head record between two players ────
app.get('/api/h2h', (req, res) => {
  try {
    const homeId = parseInt(req.query.home, 10);
    const awayId = parseInt(req.query.away, 10);
    if (!homeId || !awayId) return res.status(400).json({ error: 'Missing home or away' });

    const db = loadDB();
    let winsA = 0, winsB = 0, draws = 0;
    const recentResults = [];
    const matches = [];

    for (const season of db.seasons) {
      for (const md of season.fixtures) {
        for (const m of md.matches) {
          if (m.status !== 'completed' || m.homeScore === null) continue;
          const isMatch = (m.home.id === homeId && m.away.id === awayId) ||
                          (m.home.id === awayId && m.away.id === homeId);
          if (!isMatch) continue;

          let scoreA, scoreB;
          if (m.home.id === homeId) {
            scoreA = m.homeScore; scoreB = m.awayScore;
          } else {
            scoreA = m.awayScore; scoreB = m.homeScore;
          }

          if (scoreA > scoreB) { winsA++; recentResults.push('W'); }
          else if (scoreA < scoreB) { winsB++; recentResults.push('L'); }
          else { draws++; recentResults.push('D'); }

          matches.push({
            seasonId: season.id, matchday: md.matchday,
            homeId: m.home.id, awayId: m.away.id,
            homeScore: m.homeScore, awayScore: m.awayScore,
            homePlayer: m.home.player, awayPlayer: m.away.player,
          });
        }
      }
    }

    res.json({ homeId, awayId, totalPlayed: matches.length, winsA, draws, winsB, recentForm: recentResults.slice(-5), matches });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load H2H data' });
  }
});

// ── GET /api/records — All completed matches across all seasons ──
app.get('/api/records', (req, res) => {
  try {
    const db = loadDB();
    const allMatches = [];

    for (const season of db.seasons) {
      // League matches
      if (season.fixtures) {
        for (const md of season.fixtures) {
          for (const m of md.matches) {
            if (m.status === 'completed' && m.homeScore !== null) {
              allMatches.push({
                homeId: m.home.id, awayId: m.away.id,
                homeScore: m.homeScore, awayScore: m.awayScore,
                homePlayer: m.home.player, awayPlayer: m.away.player,
                homeClub: m.home.club, awayClub: m.away.club,
                seasonId: season.id, matchday: md.matchday,
                stage: m.stage || 'league',
                goldenGoalWinnerId: m.goldenGoalWinnerId || null,
              });
            }
          }
        }
      }
      // Cup matches
      if (season.cupFixtures) {
        for (const md of season.cupFixtures) {
          for (const m of md.matches) {
            if (m.status === 'completed' && m.homeScore !== null) {
              allMatches.push({
                homeId: m.home.id, awayId: m.away.id,
                homeScore: m.homeScore, awayScore: m.awayScore,
                homePlayer: m.home.player, awayPlayer: m.away.player,
                homeClub: m.home.club, awayClub: m.away.club,
                seasonId: season.id, matchday: md.matchday,
                stage: m.stage || md.stage || 'cup',
                goldenGoalWinnerId: m.goldenGoalWinnerId || null,
              });
            }
          }
        }
      }
      // Playoff matches
      if (season.playoffFixtures) {
        for (const md of season.playoffFixtures) {
          for (const m of md.matches) {
            if (m.status === 'completed' && m.homeScore !== null) {
              allMatches.push({
                homeId: m.home.id, awayId: m.away.id,
                homeScore: m.homeScore, awayScore: m.awayScore,
                homePlayer: m.home.player, awayPlayer: m.away.player,
                homeClub: m.home.club, awayClub: m.away.club,
                seasonId: season.id, matchday: md.matchday,
                stage: m.stage || md.stage || 'playoffs',
                goldenGoalWinnerId: m.goldenGoalWinnerId || null,
              });
            }
          }
        }
      }
    }

    res.json({
      matches: allMatches,
      seasons: db.seasons.map(s => ({ id: s.id, name: s.name, status: s.status, headline: s.headline || null, deductions: s.deductions || null })),
      teams: db.teams,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load records data' });
  }
});

// ═══════════════════════════════════════════════════════════════
// STANDINGS COMPUTATION
// ═══════════════════════════════════════════════════════════════
function computeStandings(teams, fixtures, deductions = null) {
  const standings = {};

  teams.forEach(t => {
    standings[t.id] = {
      ...t,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
      form: [],
    };
  });

  let lastCompletedMatchday = 0;

  fixtures.forEach(md => {
    md.matches.forEach(m => {
      if (m.status === 'completed' && m.homeScore !== null && m.awayScore !== null) {
        const home = standings[m.home.id];
        const away = standings[m.away.id];

        if (!home || !away) return;

        home.played++;
        away.played++;
        home.goalsFor += m.homeScore;
        home.goalsAgainst += m.awayScore;
        away.goalsFor += m.awayScore;
        away.goalsAgainst += m.homeScore;

        if (m.homeScore > m.awayScore) {
          home.wins++;
          home.points += 3;
          away.losses++;
          home.form.push('W');
          away.form.push('L');
        } else if (m.homeScore < m.awayScore) {
          away.wins++;
          away.points += 3;
          home.losses++;
          home.form.push('L');
          away.form.push('W');
        } else {
          home.draws++;
          away.draws++;
          home.points++;
          away.points++;
          home.form.push('D');
          away.form.push('D');
        }

        lastCompletedMatchday = Math.max(lastCompletedMatchday, md.matchday);
      }
    });
  });

  // Keep only last 5 form entries
  Object.values(standings).forEach(s => {
    s.form = s.form.slice(-5);
  });

  // Apply points deductions
  if (deductions) {
    Object.entries(deductions).forEach(([teamId, pts]) => {
      const tId = parseInt(teamId, 10);
      if (standings[tId]) {
        standings[tId].points -= parseInt(pts, 10);
      }
    });
  }

  const sorted = Object.values(standings).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.goalsFor - a.goalsAgainst;
    const gdB = b.goalsFor - b.goalsAgainst;
    if (gdB !== gdA) return gdB - gdA;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.player.localeCompare(b.player);
  });

  return {
    standings: sorted,
    lastCompletedMatchday,
    totalMatchdays: fixtures.length,
  };
}

// ═══════════════════════════════════════════════════════════════
// SERVE ADMIN PAGE
// ═══════════════════════════════════════════════════════════════
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ═══════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  // Initialize DB on first run
  loadDB();
  console.log(`\n🏆 Ballers League Server`);
  console.log(`${'─'.repeat(40)}`);
  console.log(`🌐 Website:  http://localhost:${PORT}`);
  console.log(`🔑 Admin:    http://localhost:${PORT}/admin`);
  console.log(`${'─'.repeat(40)}\n`);
});
