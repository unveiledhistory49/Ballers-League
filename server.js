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

const app = express();
const PORT = 3000;

// ── Config ─────────────────────────────────────────────────────
const ADMIN_KEY = 'ballersleague2026'; // Change this to your secret key
const DB_PATH = path.join(__dirname, 'database.json');
const FIXTURES_PATH = path.join(__dirname, 'fixtures.json');

// ── Middleware ──────────────────────────────────────────────────
app.use(express.json());
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
      season: fixtureData.season,
      teams: fixtureData.teams,
      fixtures: fixtureData.fixtures,
    };
    saveDB(db);
    return db;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
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

// ── GET /api/data — Full league data (teams + fixtures) ────────
app.get('/api/data', (req, res) => {
  try {
    const db = loadDB();
    res.json(db);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load data' });
  }
});

// ── GET /api/standings — Computed standings ─────────────────────
app.get('/api/standings', (req, res) => {
  try {
    const db = loadDB();
    const standings = computeStandings(db);
    res.json(standings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute standings' });
  }
});

// ── GET /api/fixtures — All fixtures ───────────────────────────
app.get('/api/fixtures', (req, res) => {
  try {
    const db = loadDB();
    res.json({ fixtures: db.fixtures });
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
    const { matchday, homeId, awayId, option } = req.body;

    if (matchday === undefined || homeId === undefined || awayId === undefined || !option) {
      return res.status(400).json({ error: 'Missing matchday, homeId, awayId, or option' });
    }

    if (option !== 'home' && option !== 'draw' && option !== 'away') {
      return res.status(400).json({ error: 'Invalid option. Must be home, draw, or away' });
    }

    // Capture requester's IP
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    const db = loadDB();

    // Find the matchday
    const md = db.fixtures.find(f => f.matchday === parseInt(matchday, 10));
    if (!md) {
      return res.status(404).json({ error: `Matchday ${matchday} not found` });
    }

    // Find the match
    const match = md.matches.find(
      m => m.home.id === parseInt(homeId, 10) && m.away.id === parseInt(awayId, 10)
    );
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // Initialize predictions if missing
    if (!match.predictions) {
      match.predictions = { home: 0, draw: 0, away: 0, ips: [] };
    }
    if (!match.predictions.ips) {
      match.predictions.ips = [];
    }

    // Check if IP already voted
    if (match.predictions.ips.includes(ip)) {
      return res.status(400).json({ error: 'Already voted from this IP' });
    }

    // Record vote
    match.predictions.ips.push(ip);
    match.predictions[option] = (match.predictions[option] || 0) + 1;

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
    const { matchday, homeId, awayId, homeScore, awayScore } = req.body;

    if (matchday === undefined || homeId === undefined || awayId === undefined) {
      return res.status(400).json({ error: 'Missing matchday, homeId, or awayId' });
    }

    if (homeScore === undefined || awayScore === undefined) {
      return res.status(400).json({ error: 'Missing homeScore or awayScore' });
    }

    const db = loadDB();

    // Find the matchday
    const md = db.fixtures.find(f => f.matchday === matchday);
    if (!md) {
      return res.status(404).json({ error: `Matchday ${matchday} not found` });
    }

    // Find the match
    const match = md.matches.find(
      m => m.home.id === homeId && m.away.id === awayId
    );
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // Update
    match.homeScore = parseInt(homeScore, 10);
    match.awayScore = parseInt(awayScore, 10);
    match.status = 'completed';

    saveDB(db);

    res.json({
      success: true,
      message: `Updated: ${match.home.player} ${match.homeScore} - ${match.awayScore} ${match.away.player}`,
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
    const { matchday, homeId, awayId } = req.body;

    const db = loadDB();
    const md = db.fixtures.find(f => f.matchday === matchday);
    if (!md) return res.status(404).json({ error: 'Matchday not found' });

    // If homeId and awayId are not specified, reset the whole matchday
    if (homeId === undefined && awayId === undefined) {
      md.matches.forEach(m => {
        m.homeScore = null;
        m.awayScore = null;
        m.status = 'upcoming';
      });
      saveDB(db);
      return res.json({ success: true, message: `Reset all matches for matchday ${matchday}` });
    }

    const match = md.matches.find(
      m => m.home.id === homeId && m.away.id === awayId
    );
    if (!match) return res.status(404).json({ error: 'Match not found' });

    match.homeScore = null;
    match.awayScore = null;
    match.status = 'upcoming';

    saveDB(db);

    res.json({ success: true, message: 'Match reset to upcoming' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset match' });
  }
});

// ── PUT /api/admin/match/reset — Reset a match result (Legacy) ──
app.put('/api/admin/match/reset', requireAdmin, (req, res) => {
  try {
    const { matchday, homeId, awayId } = req.body;

    const db = loadDB();
    const md = db.fixtures.find(f => f.matchday === matchday);
    if (!md) return res.status(404).json({ error: 'Matchday not found' });

    const match = md.matches.find(
      m => m.home.id === homeId && m.away.id === awayId
    );
    if (!match) return res.status(404).json({ error: 'Match not found' });

    match.homeScore = null;
    match.awayScore = null;
    match.status = 'upcoming';

    saveDB(db);

    res.json({ success: true, message: 'Match reset to upcoming' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset match' });
  }
});

// ═══════════════════════════════════════════════════════════════
// STANDINGS COMPUTATION
// ═══════════════════════════════════════════════════════════════
function computeStandings(db) {
  const standings = {};

  db.teams.forEach(t => {
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

  db.fixtures.forEach(md => {
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
    totalMatchdays: db.fixtures.length,
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
