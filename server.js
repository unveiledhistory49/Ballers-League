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
const ADMIN_KEY = 'ballersleague2026'; // Change this to your secret key
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
      teams: fixtureData.teams,
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
      teams: db.teams,
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
      seasons: db.seasons.map(s => ({ id: s.id, name: s.name, status: s.status })),
      teams: db.teams,
      fixtures: season.fixtures,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load data' });
  }
});

// ── GET /api/standings — Computed standings for a season ──────
app.get('/api/standings', (req, res) => {
  try {
    const db = loadDB();
    let season;
    if (req.query.season) {
      season = getSeasonById(db, parseInt(req.query.season, 10));
    }
    if (!season) {
      season = getActiveSeason(db);
    }
    const standings = computeStandings(db.teams, season.fixtures);
    res.json(standings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute standings' });
  }
});

// ── GET /api/fixtures — All fixtures for a season ─────────────
app.get('/api/fixtures', (req, res) => {
  try {
    const db = loadDB();
    let season;
    if (req.query.season) {
      season = getSeasonById(db, parseInt(req.query.season, 10));
    }
    if (!season) {
      season = getActiveSeason(db);
    }
    res.json({ fixtures: season.fixtures });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load fixtures' });
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
    const { matchday, homeId, awayId, homeScore, awayScore, status, homeStreamUrl, awayStreamUrl, seasonId, isMotw } = req.body;

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

    const md = season.fixtures.find(f => f.matchday === matchday);
    if (!md) return res.status(404).json({ error: `Matchday ${matchday} not found` });

    const match = md.matches.find(m => m.home.id === homeId && m.away.id === awayId);
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

    if (isMotw !== undefined) {
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

// ── DELETE /api/admin/match — Reset a match or entire matchday ────
app.delete('/api/admin/match', requireAdmin, (req, res) => {
  try {
    const { matchday, homeId, awayId, seasonId } = req.body;

    const db = loadDB();

    let season;
    if (seasonId) {
      season = getSeasonById(db, parseInt(seasonId, 10));
    }
    if (!season) {
      season = getActiveSeason(db);
    }

    const md = season.fixtures.find(f => f.matchday === matchday);
    if (!md) return res.status(404).json({ error: 'Matchday not found' });

    if (homeId === undefined && awayId === undefined) {
      md.matches.forEach(m => {
        m.homeScore = null;
        m.awayScore = null;
        m.status = 'upcoming';
        m.isMotw = false;
        m.predictions = { home: 0, draw: 0, away: 0, ips: [], voters: [] };
      });
      saveDB(db);
      return res.json({ success: true, message: `Reset all matches for matchday ${matchday}` });
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

    // Create new season
    const newId = db.seasons.length + 1;
    const newSeasonName = `Season ${newId}`;
    const newFixtures = generateFixtures(db.teams);

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
      for (const md of season.fixtures) {
        for (const m of md.matches) {
          if (m.status === 'completed' && m.homeScore !== null) {
            allMatches.push({
              homeId: m.home.id, awayId: m.away.id,
              homeScore: m.homeScore, awayScore: m.awayScore,
              homePlayer: m.home.player, awayPlayer: m.away.player,
              homeClub: m.home.club, awayClub: m.away.club,
              seasonId: season.id, matchday: md.matchday,
            });
          }
        }
      }
    }

    res.json({
      matches: allMatches,
      seasons: db.seasons.map(s => ({ id: s.id, name: s.name, status: s.status })),
      teams: db.teams,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load records data' });
  }
});

// ═══════════════════════════════════════════════════════════════
// STANDINGS COMPUTATION
// ═══════════════════════════════════════════════════════════════
function computeStandings(teams, fixtures) {
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
