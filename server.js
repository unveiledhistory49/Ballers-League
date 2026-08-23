/**
 * Ballers League — Knockout Tournament Server
 * 
 * Express backend serving the knockout tournament frontend + APIs.
 * Uses database.json as the persistent JSON database.
 * Admin authentication via secret key.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { generateFixtures, getTieResult, advanceTournament, shuffle } = require('./lib/generate-fixtures');

const app = express();
const PORT = 3000;

// ── Config ─────────────────────────────────────────────────────
const ADMIN_KEY = process.env.ADMIN_KEY || 'ballersleague2026';
const DB_PATH = path.join(__dirname, 'database.json');
const FIXTURES_PATH = path.join(__dirname, 'fixtures.json');

// ── Middleware ──────────────────────────────────────────────────
app.use(express.json());

// Cache-control middleware to prevent caching of API responses
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
    const backupPath = path.join(__dirname, 'database.backup.json');
    if (fs.existsSync(backupPath)) {
      const db = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
      saveDB(db);
      return db;
    }

    if (fs.existsSync(FIXTURES_PATH)) {
      const fixtureData = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf-8'));
      const db = {
        league: fixtureData.league || 'Ballers League',
        teams: fixtureData.teams.map(t => ({ ...t, isActive: true })),
        clubs: [
          { name: "Man U",       logoUrl: "logos/england_manchester-united_256x256.football-logos.cc.png", primaryColor: "#da020e", textColor: "#fff", shortName: "MU" },
          { name: "Tottenham",   logoUrl: "logos/england_tottenham_256x256.football-logos.cc.png",         primaryColor: "#132257", textColor: "#fff", shortName: "TOT" },
          { name: "Liverpool",   logoUrl: "logos/england_liverpool_256x256.football-logos.cc.png",         primaryColor: "#c8102e", textColor: "#fff", shortName: "LIV" },
          { name: "Barcelona",   logoUrl: "logos/spain_barcelona_256x256.football-logos.cc.png",           primaryColor: "#a50044", textColor: "#fff", shortName: "BAR" },
          { name: "Man City",    logoUrl: "logos/england_manchester-city_256x256.football-logos.cc.png",    primaryColor: "#6cabdd", textColor: "#1c2c5b", shortName: "MCI" },
          { name: "Arsenal FC",  logoUrl: "logos/england_arsenal_256x256.football-logos.cc.png",            primaryColor: "#ef0107", textColor: "#fff", shortName: "ARS" },
          { name: "Bayern",      logoUrl: "logos/germany_bayern-munchen_256x256.football-logos.cc.png",    primaryColor: "#dc052d", textColor: "#fff", shortName: "BAY" },
          { name: "PSG",         logoUrl: "logos/france_paris-saint-germain_256x256.football-logos.cc.png", primaryColor: "#004170", textColor: "#fff", shortName: "PSG" },
          { name: "Chelsea",     logoUrl: "logos/chelsea.football-logos.cc.png",                           primaryColor: "#034694", textColor: "#fff", shortName: "CHE" },
          { name: "Real Madrid", logoUrl: "logos/spain_real-madrid_256x256.football-logos.cc.png",         primaryColor: "#ffffff", textColor: "#111", shortName: "RMA" }
        ],
        seasons: [
          {
            id: 1,
            name: fixtureData.season || 'Season 1',
            status: 'active',
            headline: 'Welcome to Ballers League Knockout Tournament! 8 Teams battle across 2-legged ties for the Championship.',
            fixtures: fixtureData.fixtures,
          }
        ],
      };
      saveDB(db);
      return db;
    }
  }

  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));

  // Ensure active season has advancement updated
  const activeSeason = getActiveSeason(db);
  if (activeSeason && activeSeason.fixtures) {
    activeSeason.fixtures = advanceTournament(activeSeason.fixtures, db.teams);
  }

  return db;
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
  const backupPath = path.join(__dirname, 'database.backup.json');
  fs.writeFileSync(backupPath, JSON.stringify(db, null, 2), 'utf-8');
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

// ── GET /api/data — Full tournament data (teams + fixtures for a season) ──
app.get('/api/data', (req, res) => {
  try {
    const db = loadDB();

    let season;
    if (req.query.season) {
      season = getSeasonById(db, parseInt(req.query.season, 10));
    }
    if (!season) {
      season = getActiveSeason(db);
    }

    if (season && season.fixtures) {
      season.fixtures = advanceTournament(season.fixtures, db.teams);
    }

    res.json({
      league: db.league || 'Ballers League',
      season: season ? season.name : 'Season 1',
      seasonId: season ? season.id : 1,
      seasons: db.seasons.map(s => ({ id: s.id, name: s.name, status: s.status, headline: s.headline || null })),
      teams: db.teams,
      clubs: db.clubs || [],
      fixtures: season ? season.fixtures : [],
      headline: season ? (season.headline || null) : null,
    });
  } catch (err) {
    console.error('API /data error:', err);
    res.status(500).json({ error: 'Failed to load tournament data' });
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
    const { matchday, homeId, awayId, option, seasonId, voterName, matchId } = req.body;

    if (!option || !voterName) {
      return res.status(400).json({ error: 'Missing option or voterName' });
    }

    if (option !== 'home' && option !== 'draw' && option !== 'away') {
      return res.status(400).json({ error: 'Invalid option. Must be home, draw, or away' });
    }

    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const ip = rawIp.split(',')[0].trim();

    const db = loadDB();
    let season = seasonId ? getSeasonById(db, parseInt(seasonId, 10)) : getActiveSeason(db);
    if (!season) return res.status(404).json({ error: 'Season not found' });

    let match = null;
    if (matchId !== undefined) {
      for (const md of season.fixtures) {
        match = md.matches.find(m => m.id === parseInt(matchId, 10));
        if (match) break;
      }
    }

    if (!match && matchday !== undefined) {
      const md = season.fixtures.find(f => f.matchday === parseInt(matchday, 10));
      if (md) {
        match = md.matches.find(
          m => m.home && m.away && m.home.id === parseInt(homeId, 10) && m.away.id === parseInt(awayId, 10)
        );
      }
    }

    if (!match) return res.status(404).json({ error: 'Match not found' });

    if (!match.predictions) {
      match.predictions = { home: 0, draw: 0, away: 0, ips: [], voters: [] };
    }
    if (!match.predictions.ips) match.predictions.ips = [];
    if (!match.predictions.voters) match.predictions.voters = [];

    // Check if voter already voted
    let existingVoteIndex = -1;
    if (voterName === 'Guest') {
      existingVoteIndex = match.predictions.voters.findIndex(v => v.name === 'Guest' && v.ip === ip);
    } else {
      existingVoteIndex = match.predictions.voters.findIndex(v => v.name === voterName);
    }

    if (existingVoteIndex > -1) {
      const previousPick = match.predictions.voters[existingVoteIndex].pick;
      if (previousPick !== option) {
        if (match.predictions[previousPick] > 0) {
          match.predictions[previousPick]--;
        }
        match.predictions[option] = (match.predictions[option] || 0) + 1;
        match.predictions.voters[existingVoteIndex].pick = option;
        match.predictions.voters[existingVoteIndex].ip = ip;
      }
    } else {
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

// ── PUT /api/admin/match — Update a match result & auto-advance bracket ──
app.put('/api/admin/match', requireAdmin, (req, res) => {
  try {
    const { matchday, homeId, awayId, matchId, homeScore, awayScore, status, homeStreamUrl, awayStreamUrl, seasonId, isMotw, goldenGoalWinnerId } = req.body;

    const db = loadDB();
    let season = seasonId ? getSeasonById(db, parseInt(seasonId, 10)) : getActiveSeason(db);
    if (!season) return res.status(404).json({ error: 'Season not found' });

    let match = null;
    let md = null;

    if (matchId !== undefined) {
      for (const mday of season.fixtures) {
        const found = mday.matches.find(m => m.id === parseInt(matchId, 10));
        if (found) {
          match = found;
          md = mday;
          break;
        }
      }
    }

    if (!match && matchday !== undefined) {
      md = season.fixtures.find(f => f.matchday === parseInt(matchday, 10));
      if (md) {
        match = md.matches.find(
          m => m.home && m.away && m.home.id === parseInt(homeId, 10) && m.away.id === parseInt(awayId, 10)
        );
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
        md.matches.forEach(m => { m.isMotw = false; });
        match.isMotw = true;
      } else {
        match.isMotw = false;
      }
    }

    // Auto-advance tournament bracket with resolved stage winners
    season.fixtures = advanceTournament(season.fixtures, db.teams);

    saveDB(db);

    res.json({
      success: true,
      message: `Updated match status to ${match.status}`,
      match,
      fixtures: season.fixtures
    });
  } catch (err) {
    console.error('Error updating match:', err);
    res.status(500).json({ error: 'Failed to update match' });
  }
});

// ── DELETE /api/admin/match — Reset a match or matchday ──────────────
app.delete('/api/admin/match', requireAdmin, (req, res) => {
  try {
    const { matchday, homeId, awayId, matchId, seasonId } = req.body;
    const db = loadDB();
    let season = seasonId ? getSeasonById(db, parseInt(seasonId, 10)) : getActiveSeason(db);
    if (!season) return res.status(404).json({ error: 'Season not found' });

    if (matchId !== undefined) {
      for (const md of season.fixtures) {
        const match = md.matches.find(m => m.id === parseInt(matchId, 10));
        if (match) {
          match.homeScore = null;
          match.awayScore = null;
          match.status = 'upcoming';
          match.isMotw = false;
          match.goldenGoalWinnerId = null;
          match.predictions = { home: 0, draw: 0, away: 0, ips: [], voters: [] };
          break;
        }
      }
    } else if (matchday !== undefined) {
      const md = season.fixtures.find(f => f.matchday === parseInt(matchday, 10));
      if (md) {
        if (homeId !== undefined && awayId !== undefined) {
          const match = md.matches.find(m => m.home && m.away && m.home.id === homeId && m.away.id === awayId);
          if (match) {
            match.homeScore = null;
            match.awayScore = null;
            match.status = 'upcoming';
            match.isMotw = false;
            match.goldenGoalWinnerId = null;
            match.predictions = { home: 0, draw: 0, away: 0, ips: [], voters: [] };
          }
        } else {
          md.matches.forEach(m => {
            m.homeScore = null;
            m.awayScore = null;
            m.status = 'upcoming';
            m.isMotw = false;
            m.goldenGoalWinnerId = null;
            m.predictions = { home: 0, draw: 0, away: 0, ips: [], voters: [] };
          });
        }
      }
    }

    season.fixtures = advanceTournament(season.fixtures, db.teams);
    saveDB(db);

    res.json({ success: true, message: 'Match reset successfully', fixtures: season.fixtures });
  } catch (err) {
    console.error('Error resetting match:', err);
    res.status(500).json({ error: 'Failed to reset match' });
  }
});

// ── POST /api/admin/tournament/draw — Draw or randomize Quarterfinal ties ──
app.post('/api/admin/tournament/draw', requireAdmin, (req, res) => {
  try {
    const { seasonId, randomize } = req.body;
    const db = loadDB();
    let season = seasonId ? getSeasonById(db, parseInt(seasonId, 10)) : getActiveSeason(db);
    if (!season) return res.status(404).json({ error: 'Season not found' });

    let activeTeams = db.teams.filter(t => t.isActive !== false).slice(0, 8);
    if (activeTeams.length < 8) {
      return res.status(400).json({ error: `Tournament requires 8 active teams (found ${activeTeams.length})` });
    }

    if (randomize) {
      activeTeams = shuffle(activeTeams);
    }

    season.fixtures = generateFixtures(activeTeams);
    saveDB(db);

    res.json({
      success: true,
      message: `Generated Quarterfinal bracket with 8 teams${randomize ? ' (random draw)' : ''}.`,
      fixtures: season.fixtures
    });
  } catch (err) {
    console.error('Tournament draw error:', err);
    res.status(500).json({ error: 'Failed to generate tournament draw: ' + err.message });
  }
});

// ── POST /api/admin/tournament/advance — Manually trigger bracket advancement ──
app.post('/api/admin/tournament/advance', requireAdmin, (req, res) => {
  try {
    const { seasonId } = req.body;
    const db = loadDB();
    let season = seasonId ? getSeasonById(db, parseInt(seasonId, 10)) : getActiveSeason(db);
    if (!season) return res.status(404).json({ error: 'Season not found' });

    season.fixtures = advanceTournament(season.fixtures, db.teams);
    saveDB(db);

    res.json({ success: true, message: 'Tournament bracket progression updated.', fixtures: season.fixtures });
  } catch (err) {
    console.error('Tournament advance error:', err);
    res.status(500).json({ error: 'Failed to advance tournament: ' + err.message });
  }
});

// ── PUT /api/admin/headline — Update announcement banner ─────────────
app.put('/api/admin/headline', requireAdmin, (req, res) => {
  try {
    const { headline, seasonId } = req.body;
    const db = loadDB();
    let season = seasonId ? getSeasonById(db, parseInt(seasonId, 10)) : getActiveSeason(db);
    if (!season) return res.status(404).json({ error: 'Season not found' });

    season.headline = headline ? headline.trim() : null;
    saveDB(db);

    res.json({ success: true, message: 'Headline banner updated.', headline: season.headline });
  } catch (err) {
    console.error('Headline error:', err);
    res.status(500).json({ error: 'Failed to update headline' });
  }
});

// ── POST /api/admin/player — Add player ─────────────────────────────
app.post('/api/admin/player', requireAdmin, (req, res) => {
  try {
    const { player, club, photoUrl } = req.body;
    if (!player || !club) {
      return res.status(400).json({ error: 'Missing player name or club name.' });
    }

    const db = loadDB();
    const maxId = db.teams.reduce((max, t) => t.id > max ? t.id : max, 0);
    const newTeam = {
      id: maxId + 1,
      player: player.trim(),
      club: club.trim(),
      photoUrl: photoUrl ? photoUrl.trim() : null,
      isActive: true,
    };

    db.teams.push(newTeam);
    saveDB(db);

    res.json({ success: true, message: `Player ${player} (${club}) added.`, team: newTeam });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add player: ' + err.message });
  }
});

// ── PUT /api/admin/player — Edit player ────────────────────────────
app.put('/api/admin/player', requireAdmin, (req, res) => {
  try {
    const { id, player, club, photoUrl, isActive } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing team id.' });

    const db = loadDB();
    const team = db.teams.find(t => t.id === parseInt(id, 10));
    if (!team) return res.status(404).json({ error: 'Player not found.' });

    if (player) team.player = player.trim();
    if (club) team.club = club.trim();
    if (photoUrl !== undefined) team.photoUrl = photoUrl ? photoUrl.trim() : null;
    if (isActive !== undefined) team.isActive = !!isActive;

    if (player || club) {
      updateTeamDetailsInFixtures(db, team.id, team.player, team.club);
    }

    saveDB(db);
    res.json({ success: true, message: 'Player details updated.', team });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update player: ' + err.message });
  }
});

// ── DELETE /api/admin/player — Delete or deactivate player ────────
app.delete('/api/admin/player', requireAdmin, (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing team id.' });

    const db = loadDB();
    const team = db.teams.find(t => t.id === parseInt(id, 10));
    if (!team) return res.status(404).json({ error: 'Player not found.' });

    team.isActive = false;
    saveDB(db);
    res.json({ success: true, message: `Player ${team.player} deactivated.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate player: ' + err.message });
  }
});

// ── POST /api/admin/club — Add Club ────────────────────────────────
app.post('/api/admin/club', requireAdmin, (req, res) => {
  try {
    const { name, logoUrl, primaryColor, textColor, shortName } = req.body;
    if (!name || !logoUrl || !primaryColor || !textColor || !shortName) {
      return res.status(400).json({ error: 'Missing required club details.' });
    }

    const db = loadDB();
    if (!db.clubs) db.clubs = [];

    if (db.clubs.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) {
      return res.status(400).json({ error: 'Club already exists.' });
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
    res.json({ success: true, message: `Club ${name} added.`, club: newClub });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add club: ' + err.message });
  }
});

// ── PUT /api/admin/club — Edit Club ────────────────────────────────
app.put('/api/admin/club', requireAdmin, (req, res) => {
  try {
    const { name, logoUrl, primaryColor, textColor, shortName } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing club name.' });

    const db = loadDB();
    const club = db.clubs.find(c => c.name.toLowerCase() === name.trim().toLowerCase());
    if (!club) return res.status(404).json({ error: 'Club not found.' });

    if (logoUrl) club.logoUrl = logoUrl.trim();
    if (primaryColor) club.primaryColor = primaryColor.trim();
    if (textColor) club.textColor = textColor.trim();
    if (shortName) club.shortName = shortName.trim().toUpperCase();

    saveDB(db);
    res.json({ success: true, message: `Club ${name} updated.`, club });
  } catch (err) {
    res.status(500).json({ error: 'Failed to edit club: ' + err.message });
  }
});

// ── DELETE /api/admin/club — Delete Club ───────────────────────────
app.delete('/api/admin/club', requireAdmin, (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing club name.' });

    const db = loadDB();
    const inUse = db.teams.some(t => t.club.toLowerCase() === name.trim().toLowerCase());
    if (inUse) {
      return res.status(400).json({ error: 'Cannot delete club: currently in use by a player.' });
    }

    db.clubs = db.clubs.filter(c => c.name.toLowerCase() !== name.trim().toLowerCase());
    saveDB(db);
    res.json({ success: true, message: `Club ${name} deleted.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete club: ' + err.message });
  }
});

// ── POST /api/admin/season — Create new Tournament Season ──────────
app.post('/api/admin/season', requireAdmin, (req, res) => {
  try {
    const { name } = req.body;
    const db = loadDB();

    const newSeasonName = name && name.trim() ? name.trim() : `Season ${db.seasons.length + 1}`;
    const maxId = db.seasons.reduce((max, s) => s.id > max ? s.id : max, 0);
    const newId = maxId + 1;

    // Archive current active seasons
    db.seasons.forEach(s => {
      if (s.status === 'active') s.status = 'completed';
    });

    const activeTeams = db.teams.filter(t => t.isActive !== false).slice(0, 8);
    const newFixtures = generateFixtures(activeTeams);

    const newSeason = {
      id: newId,
      name: newSeasonName,
      status: 'active',
      headline: `Welcome to ${newSeasonName} Knockout Tournament!`,
      fixtures: newFixtures,
    };

    db.seasons.push(newSeason);
    saveDB(db);

    res.json({
      success: true,
      message: `${newSeasonName} created successfully with 8-team knockout bracket.`,
      season: newSeason,
    });
  } catch (err) {
    console.error('Error creating season:', err);
    res.status(500).json({ error: 'Failed to create new season: ' + err.message });
  }
});

// ── GET /api/h2h — Head-to-Head record between two players ────────
app.get('/api/h2h', (req, res) => {
  try {
    const homeId = parseInt(req.query.home, 10);
    const awayId = parseInt(req.query.away, 10);
    if (!homeId || !awayId) return res.status(400).json({ error: 'Missing home or away ID' });

    const db = loadDB();
    let winsA = 0, winsB = 0, draws = 0;
    const recentResults = [];
    const matches = [];

    for (const season of db.seasons) {
      if (!season.fixtures) continue;
      for (const md of season.fixtures) {
        for (const m of md.matches) {
          if (m.status !== 'completed' || m.homeScore === null || !m.home || !m.away) continue;
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
            seasonId: season.id,
            matchday: md.matchday,
            stage: m.stage,
            leg: m.leg,
            homeId: m.home.id, awayId: m.away.id,
            homeScore: m.homeScore, awayScore: m.awayScore,
            homePlayer: m.home.player, awayPlayer: m.away.player,
            goldenGoalWinnerId: m.goldenGoalWinnerId || null,
          });
        }
      }
    }

    res.json({ homeId, awayId, totalPlayed: matches.length, winsA, draws, winsB, recentForm: recentResults.slice(-5), matches });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load H2H data' });
  }
});

// ── GET /api/records — Records across all tournament seasons ────────
app.get('/api/records', (req, res) => {
  try {
    const db = loadDB();
    const allMatches = [];

    for (const season of db.seasons) {
      if (!season.fixtures) continue;
      for (const md of season.fixtures) {
        for (const m of md.matches) {
          if (m.status === 'completed' && m.homeScore !== null && m.home && m.away && m.home.id !== null && m.away.id !== null) {
            allMatches.push({
              homeId: m.home.id, awayId: m.away.id,
              homeScore: m.homeScore, awayScore: m.awayScore,
              homePlayer: m.home.player, awayPlayer: m.away.player,
              homeClub: m.home.club, awayClub: m.away.club,
              seasonId: season.id, matchday: md.matchday,
              stage: m.stage, leg: m.leg,
              goldenGoalWinnerId: m.goldenGoalWinnerId || null,
            });
          }
        }
      }
    }

    res.json({
      matches: allMatches,
      seasons: db.seasons.map(s => ({ id: s.id, name: s.name, status: s.status, headline: s.headline || null })),
      teams: db.teams,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load records data' });
  }
});

// ── Serve Admin Page ───────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ── Start Server ───────────────────────────────────────────────
app.listen(PORT, () => {
  loadDB();
  console.log(`\n🏆 Ballers League Knockout Tournament Server`);
  console.log(`${'─'.repeat(50)}`);
  console.log(`🌐 Tournament Site: http://localhost:${PORT}`);
  console.log(`🔑 Admin Panel:    http://localhost:${PORT}/admin`);
  console.log(`${'─'.repeat(50)}\n`);
});
