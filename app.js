/* ═══════════════════════════════════════════════════════════════
   BALLERS LEAGUE — APP LOGIC
   Standings + Fixtures with swipe navigation
   Fetches live data from the backend API
   ═══════════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────────
let leagueData = null;
let currentMatchday = 0; // 0-indexed
let selectedTeamIdForHistory = null;
let touchStartX = 0;
let touchEndX = 0;
const SWIPE_THRESHOLD = 50;

// ── Club colors for logo placeholders ──────────────────────────
const clubColors = {
  "Man U":       { bg: "#da020e", text: "#fff" },
  "Tottenham":   { bg: "#132257", text: "#fff" },
  "Liverpool":   { bg: "#c8102e", text: "#fff" },
  "Barcelona":   { bg: "#a50044", text: "#fff" },
  "Man City":    { bg: "#6cabdd", text: "#1c2c5b" },
  "Arsenal FC":  { bg: "#ef0107", text: "#fff" },
  "Bayern":      { bg: "#dc052d", text: "#fff" },
  "PSG":         { bg: "#004170", text: "#fff" },
};

// ── Club short names for logos ─────────────────────────────────
const clubShort = {
  "Man U": "MU",
  "Tottenham": "TOT",
  "Liverpool": "LIV",
  "Barcelona": "BAR",
  "Man City": "MCI",
  "Arsenal FC": "ARS",
  "Bayern": "BAY",
  "PSG": "PSG",
};

// ── Club logo file paths ───────────────────────────────────────
const clubLogos = {
  "Man U":       "logos/england_manchester-united_256x256.football-logos.cc.png",
  "Tottenham":   "logos/england_tottenham_256x256.football-logos.cc.png",
  "Liverpool":   "logos/england_liverpool_256x256.football-logos.cc.png",
  "Barcelona":   "logos/spain_barcelona_256x256.football-logos.cc.png",
  "Man City":    "logos/england_manchester-city_256x256.football-logos.cc.png",
  "Arsenal FC":  "logos/england_arsenal_256x256.football-logos.cc.png",
  "Bayern":      "logos/germany_bayern-munchen_256x256.football-logos.cc.png",
  "PSG":         "logos/france_paris-saint-germain_256x256.football-logos.cc.png",
};

// ── Init ───────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Try API first (local Express server), fall back to static fixtures.json (Vercel)
    let res;
    try {
      res = await fetch("/api/data");
      if (!res.ok) throw new Error("API not available");
      leagueData = await res.json();
    } catch {
      res = await fetch("/fixtures.json");
      leagueData = await res.json();
    }
    renderStandings();
    renderFixtures();
    setupSwipeGestures();
  } catch (err) {
    console.error("Failed to load league data:", err);
  }
});

// ═══════════════════════════════════════════════════════════════
// PAGE SWITCHING
// ═══════════════════════════════════════════════════════════════
function switchPage(page) {
  // Update nav
  document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
  const navTab = document.getElementById(`nav-${page}`);
  if (navTab) navTab.classList.add("active");

  // Update pages
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const activePage = document.getElementById(`page-${page}`);
  activePage.classList.remove("active");

  // Force re-trigger animation
  void activePage.offsetWidth;
  activePage.classList.add("active");

  // Scroll to top
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ═══════════════════════════════════════════════════════════════
// STANDINGS — Computed from real match data
// ═══════════════════════════════════════════════════════════════
function computeStandings() {
  const teams = leagueData.teams;
  const standings = {};

  // Init all teams at zero
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

  // Process only completed fixtures
  let lastCompletedMatchday = 0;

  leagueData.fixtures.forEach(md => {
    md.matches.forEach(m => {
      if (m.status === "completed" && m.homeScore !== null && m.awayScore !== null) {
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
          home.form.push("W");
          away.form.push("L");
        } else if (m.homeScore < m.awayScore) {
          away.wins++;
          away.points += 3;
          home.losses++;
          home.form.push("L");
          away.form.push("W");
        } else {
          home.draws++;
          away.draws++;
          home.points += 1;
          away.points += 1;
          home.form.push("D");
          away.form.push("D");
        }

        lastCompletedMatchday = Math.max(lastCompletedMatchday, md.matchday);
      }
    });
  });

  // Keep only last 5 form entries
  Object.values(standings).forEach(s => {
    s.form = s.form.slice(-5);
  });

  // Sort: Points desc → GD desc → GF desc → Alphabetical
  const sorted = Object.values(standings).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.goalsFor - a.goalsAgainst;
    const gdB = b.goalsFor - b.goalsAgainst;
    if (gdB !== gdA) return gdB - gdA;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.player.localeCompare(b.player);
  });

  return { standings: sorted, lastCompletedMatchday };
}

function renderStandings() {
  const { standings, lastCompletedMatchday } = computeStandings();

  // Update matchday label
  document.getElementById("standings-matchday").textContent =
    `Matchday ${lastCompletedMatchday} of ${leagueData.fixtures.length}`;

  const body = document.getElementById("standings-body");
  body.innerHTML = "";

  standings.forEach((team, idx) => {
    const pos = idx + 1;
    const row = document.createElement("div");
    row.className = "table-row";
    row.onclick = () => showTeamHistory(team.id);
    if (pos <= 4) row.classList.add("top-zone");
    if (pos >= standings.length - 2) row.classList.add("danger-zone");
    row.style.animationDelay = `${idx * 0.04}s`;

    const colors = clubColors[team.club] || { bg: "#333", text: "#fff" };
    const short = clubShort[team.club] || team.club.substring(0, 3).toUpperCase();

    // Position badge
    let posHTML;
    if (pos <= 3) {
      posHTML = `<span class="pos-badge pos-${pos}">${pos}</span>`;
    } else {
      posHTML = `${pos}`;
    }

    // Form dots — show last 5 or empty placeholders
    const last5 = (team.form || []).slice(-5);
    const formDots = Array.from({ length: 5 }, (_, i) => {
      const result = last5[i];
      if (!result) return `<span class="form-dot empty"></span>`;
      const cls = result === "W" ? "win" : result === "D" ? "draw" : "loss";
      return `<span class="form-dot ${cls}" title="${result === 'W' ? 'Win' : result === 'D' ? 'Draw' : 'Loss'}"></span>`;
    }).join("");

    // Logo
    const logoSrc = clubLogos[team.club];
    const logoHTML = logoSrc
      ? `<img src="${logoSrc}" alt="${team.club}" loading="lazy">`
      : short;

    row.innerHTML = `
      <div class="col-pos">${posHTML}</div>
      <div class="col-club">
        <div class="club-logo" style="${!logoSrc ? `background: ${colors.bg}; color: ${colors.text}; border-color: ${colors.bg}40;` : ''}">
          ${logoHTML}
        </div>
        <div class="club-info">
          <span class="club-player">${team.player}</span>
          <span class="club-team">${team.club}</span>
        </div>
      </div>
      <div class="col-stat">${team.played}</div>
      <div class="col-stat">${team.wins}</div>
      <div class="col-stat">${team.draws}</div>
      <div class="col-stat">${team.losses}</div>
      <div class="col-gls">${team.goalsFor}:${team.goalsAgainst}</div>
      <div class="col-pts">${team.points}</div>
      <div class="col-form">${formDots}</div>
    `;

    body.appendChild(row);
  });
}

// ═══════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════
function renderFixtures(direction = null) {
  if (!leagueData) return;

  const fixtures = leagueData.fixtures;
  const md = fixtures[currentMatchday];
  if (!md) return;

  // Update nav
  document.getElementById("fixture-matchday-label").textContent = `Matchday ${md.matchday}`;
  document.getElementById("fixture-matchday-counter").textContent =
    `${currentMatchday + 1} / ${fixtures.length}`;

  // Arrow states
  document.getElementById("btn-prev-md").disabled = currentMatchday === 0;
  document.getElementById("btn-next-md").disabled = currentMatchday === fixtures.length - 1;

  // Render cards
  const container = document.getElementById("fixtures-container");

  // Apply slide animation
  if (direction) {
    container.classList.remove("slide-left", "slide-right");
    void container.offsetWidth;
    container.classList.add(direction === 1 ? "slide-left" : "slide-right");
  }

  container.innerHTML = "";

  md.matches.forEach((match, idx) => {
    const card = document.createElement("div");
    card.className = "fixture-card";
    card.style.animationDelay = `${idx * 0.06}s`;
    card.onclick = () => togglePredictionCard(card, md.matchday, match.home.id, match.away.id);

    const homeColors = clubColors[match.home.club] || { bg: "#333", text: "#fff" };
    const awayColors = clubColors[match.away.club] || { bg: "#333", text: "#fff" };
    const homeShort = clubShort[match.home.club] || match.home.club.substring(0, 3).toUpperCase();
    const awayShort = clubShort[match.away.club] || match.away.club.substring(0, 3).toUpperCase();
    const homeLogoSrc = clubLogos[match.home.club];
    const awayLogoSrc = clubLogos[match.away.club];
    const homeLogoHTML = homeLogoSrc
      ? `<img src="${homeLogoSrc}" alt="${match.home.club}" loading="lazy">`
      : homeShort;
    const awayLogoHTML = awayLogoSrc
      ? `<img src="${awayLogoSrc}" alt="${match.away.club}" loading="lazy">`
      : awayShort;

    let scoreHTML;
    if (match.status === "completed" && match.homeScore !== null) {
      scoreHTML = `
        <div class="score-display">
          <span>${match.homeScore}</span>
          <span class="score-separator">-</span>
          <span>${match.awayScore}</span>
        </div>
        <span class="score-ft">FT</span>
      `;
    } else if (match.status === "live") {
      scoreHTML = `<span class="score-live">LIVE</span>`;
    } else {
      scoreHTML = `<span class="score-upcoming">VS</span>`;
    }

    card.innerHTML = `
      <div class="fixture-label">
        <span>Home</span>
        <span>Away</span>
      </div>
      <div class="fixture-match">
        <div class="fixture-team">
          <div class="fixture-team-logo" style="${!homeLogoSrc ? `background: ${homeColors.bg}; color: ${homeColors.text}; border-color: ${homeColors.bg}40;` : ''}">
            ${homeLogoHTML}
          </div>
          <span class="fixture-team-player">${match.home.player}</span>
          <span class="fixture-team-club">${match.home.club}</span>
        </div>
        <div class="fixture-score">
          ${scoreHTML}
        </div>
        <div class="fixture-team">
          <div class="fixture-team-logo" style="${!awayLogoSrc ? `background: ${awayColors.bg}; color: ${awayColors.text}; border-color: ${awayColors.bg}40;` : ''}">
            ${awayLogoHTML}
          </div>
          <span class="fixture-team-player">${match.away.player}</span>
          <span class="fixture-team-club">${match.away.club}</span>
        </div>
      </div>
    `;

    const predDiv = document.createElement("div");
    predDiv.className = "fixture-prediction";
    card.appendChild(predDiv);

    container.appendChild(card);
  });
}

function changeMatchday(delta) {
  const newIdx = currentMatchday + delta;
  if (newIdx < 0 || newIdx >= leagueData.fixtures.length) return;
  currentMatchday = newIdx;
  renderFixtures(delta);
}

// ═══════════════════════════════════════════════════════════════
// SWIPE GESTURES
// ═══════════════════════════════════════════════════════════════
function setupSwipeGestures() {
  const fixturesPage = document.getElementById("page-fixtures");

  fixturesPage.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  fixturesPage.addEventListener("touchend", (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  }, { passive: true });

  // Hide swipe hint after first swipe
  let hintShown = true;
  fixturesPage.addEventListener("touchend", () => {
    if (hintShown) {
      const hint = document.getElementById("swipe-hint");
      if (hint) hint.classList.add("hidden");
      hintShown = false;
    }
  }, { passive: true });
}

function handleSwipe() {
  const diff = touchStartX - touchEndX;
  if (Math.abs(diff) < SWIPE_THRESHOLD) return;

  if (diff > 0) {
    changeMatchday(1);
  } else {
    changeMatchday(-1);
  }
}

// ═══════════════════════════════════════════════════════════════
// KEYBOARD NAVIGATION (Fixtures)
// ═══════════════════════════════════════════════════════════════
document.addEventListener("keydown", (e) => {
  const fixturesActive = document.getElementById("page-fixtures").classList.contains("active");
  if (!fixturesActive) return;

  if (e.key === "ArrowLeft") {
    changeMatchday(-1);
  } else if (e.key === "ArrowRight") {
    changeMatchday(1);
  }
});

// ═══════════════════════════════════════════════════════════════
// SNAPSHOT DOWNLOAD
// ═══════════════════════════════════════════════════════════════

function showSnapshotOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "snapshot-overlay";
  overlay.id = "snapshot-overlay";
  overlay.innerHTML = `
    <div class="snapshot-toast">
      <div class="snapshot-spinner"></div>
      <span>Rendering snapshot…</span>
    </div>
  `;
  document.body.appendChild(overlay);
}

function hideSnapshotOverlay() {
  const overlay = document.getElementById("snapshot-overlay");
  if (overlay) {
    overlay.style.opacity = "0";
    overlay.style.transition = "opacity 0.3s ease";
    setTimeout(() => overlay.remove(), 300);
  }
}

function buildSnapshotHeader(subtitleText) {
  return `
    <div class="snap-header">
      <svg class="snap-logo" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="20" cy="20" r="19" stroke="white" stroke-width="1.5"/>
        <path d="M20 5 L25 15 L35 17 L28 25 L30 35 L20 30 L10 35 L12 25 L5 17 L15 15 Z" fill="white" opacity="0.9"/>
      </svg>
      <div class="snap-title-wrap">
        <h3>Ballers League</h3>
        <div class="snap-subtitle">${subtitleText}</div>
      </div>
      <div class="snap-badge">Season 1</div>
    </div>
  `;
}

function buildStandingsSnapshot() {
  const { standings, lastCompletedMatchday } = computeStandings();
  const totalMDs = leagueData.fixtures.length;

  let html = buildSnapshotHeader(`Standings — Matchday ${lastCompletedMatchday} of ${totalMDs}`);

  // Table header
  html += `
    <div class="snap-table-header">
      <span style="width:28px;text-align:center">#</span>
      <span style="flex:1;padding-left:8px">Club</span>
      <span style="width:26px;text-align:center">P</span>
      <span style="width:26px;text-align:center">W</span>
      <span style="width:26px;text-align:center">D</span>
      <span style="width:26px;text-align:center">L</span>
      <span style="width:46px;text-align:center">GLS</span>
      <span style="width:32px;text-align:center">PTS</span>
      <span style="width:70px;text-align:right">Last 5</span>
    </div>
  `;

  // Rows
  standings.forEach((team, idx) => {
    const pos = idx + 1;
    const zoneClass = pos <= 4 ? "snap-top" : (pos >= standings.length - 2 ? "snap-danger" : "");
    
    let posHTML;
    if (pos <= 3) {
      posHTML = `<span class="snap-pos-badge snap-pos-${pos}">${pos}</span>`;
    } else {
      posHTML = `${pos}`;
    }

    const logoSrc = clubLogos[team.club];
    const logoHTML = logoSrc
      ? `<img src="${logoSrc}" alt="${team.club}">`
      : `<span style="font-size:8px;font-weight:700;color:rgba(255,255,255,0.5)">${(clubShort[team.club] || team.club.substring(0,3).toUpperCase())}</span>`;

    const last5 = (team.form || []).slice(-5);
    const formDots = Array.from({ length: 5 }, (_, i) => {
      const r = last5[i];
      if (!r) return `<span class="snap-form-dot e"></span>`;
      const cls = r === "W" ? "w" : r === "D" ? "d" : "l";
      return `<span class="snap-form-dot ${cls}"></span>`;
    }).join("");

    html += `
      <div class="snap-row ${zoneClass}">
        <div class="snap-col-pos">${posHTML}</div>
        <div class="snap-col-club">
          <div class="snap-club-logo">${logoHTML}</div>
          <div class="snap-club-info">
            <span class="snap-club-player">${team.player}</span>
            <span class="snap-club-team">${team.club}</span>
          </div>
        </div>
        <div class="snap-col-stat">${team.played}</div>
        <div class="snap-col-stat">${team.wins}</div>
        <div class="snap-col-stat">${team.draws}</div>
        <div class="snap-col-stat">${team.losses}</div>
        <div class="snap-col-gls">${team.goalsFor}:${team.goalsAgainst}</div>
        <div class="snap-col-pts">${team.points}</div>
        <div class="snap-col-form">${formDots}</div>
      </div>
    `;
  });

  html += `<div class="snap-footer">ballersleague.vercel.app · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>`;

  return html;
}

function buildFixturesSnapshot() {
  const md = leagueData.fixtures[currentMatchday];
  if (!md) return "";

  let html = buildSnapshotHeader(`Matchday ${md.matchday} — Fixtures & Results`);

  html += `<div class="snap-fix-title">Matchday ${md.matchday}</div>`;

  md.matches.forEach(match => {
    const homeLogoSrc = clubLogos[match.home.club];
    const awayLogoSrc = clubLogos[match.away.club];
    const homeLogoHTML = homeLogoSrc
      ? `<img src="${homeLogoSrc}" alt="${match.home.club}">`
      : `<span style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.5)">${(clubShort[match.home.club] || match.home.club.substring(0,3).toUpperCase())}</span>`;
    const awayLogoHTML = awayLogoSrc
      ? `<img src="${awayLogoSrc}" alt="${match.away.club}">`
      : `<span style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.5)">${(clubShort[match.away.club] || match.away.club.substring(0,3).toUpperCase())}</span>`;

    let scoreHTML;
    if (match.status === "completed" && match.homeScore !== null) {
      scoreHTML = `
        <div class="snap-score-nums">
          <span>${match.homeScore}</span>
          <span class="snap-score-sep">-</span>
          <span>${match.awayScore}</span>
        </div>
        <span class="snap-score-ft">FT</span>
      `;
    } else {
      scoreHTML = `<span class="snap-score-vs">VS</span>`;
    }

    html += `
      <div class="snap-fixture-card">
        <div class="snap-fix-labels">
          <span>Home</span>
          <span>Away</span>
        </div>
        <div class="snap-fix-match">
          <div class="snap-fix-team">
            <div class="snap-fix-logo">${homeLogoHTML}</div>
            <span class="snap-fix-player">${match.home.player}</span>
            <span class="snap-fix-club">${match.home.club}</span>
          </div>
          <div class="snap-fix-score">${scoreHTML}</div>
          <div class="snap-fix-team">
            <div class="snap-fix-logo">${awayLogoHTML}</div>
            <span class="snap-fix-player">${match.away.player}</span>
            <span class="snap-fix-club">${match.away.club}</span>
          </div>
        </div>
      </div>
    `;
  });

  html += `<div class="snap-footer">ballersleague.vercel.app · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>`;

  return html;
}

async function downloadSnapshot(type) {
  if (!leagueData) return;

  const btn = document.getElementById(
    type === "standings" ? "btn-download-standings" : 
    (type === "fixtures" ? "btn-download-fixtures" : "btn-download-history")
  );
  btn.classList.add("downloading");
  showSnapshotOverlay();

  // Build the off-screen render container
  let container = document.getElementById("snapshot-container");
  if (container) container.remove();

  container = document.createElement("div");
  container.id = "snapshot-container";
  container.className = "snapshot-render";
  
  if (type === "standings") {
    container.innerHTML = buildStandingsSnapshot();
  } else if (type === "fixtures") {
    container.innerHTML = buildFixturesSnapshot();
  } else if (type === "history") {
    container.innerHTML = buildHistorySnapshot();
  }
  document.body.appendChild(container);

  // Wait for images to load
  const images = container.querySelectorAll("img");
  if (images.length > 0) {
    await Promise.all(
      Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      })
    );
  }

  // Small delay to ensure layout is painted
  await new Promise(r => setTimeout(r, 100));

  try {
    const canvas = await html2canvas(container, {
      backgroundColor: "#050505",
      scale: 2,
      useCORS: true,
      logging: false,
      width: 480,
      windowWidth: 480,
    });

    // Download
    const link = document.createElement("a");
    const filename = type === "standings"
      ? `ballers-league-standings.png`
      : (type === "fixtures"
        ? `ballers-league-matchday-${leagueData.fixtures[currentMatchday].matchday}.png`
        : `ballers-league-${leagueData.teams.find(t => t.id === selectedTeamIdForHistory).player.toLowerCase()}-history.png`);
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (err) {
    console.error("Snapshot failed:", err);
    alert("Failed to generate snapshot. Please try again.");
  } finally {
    container.remove();
    btn.classList.remove("downloading");
    hideSnapshotOverlay();
  }
}

// ═══════════════════════════════════════════════════════════════
// TEAM FIXTURE HISTORY
// ═══════════════════════════════════════════════════════════════
function showTeamHistory(teamId) {
  selectedTeamIdForHistory = teamId;
  const team = leagueData.teams.find(t => t.id === teamId);
  if (!team) return;

  // Banner details
  document.getElementById("history-team-player").textContent = team.player;
  document.getElementById("history-team-club").textContent = team.club;

  const colors = clubColors[team.club] || { bg: "#333", text: "#fff" };
  const short = clubShort[team.club] || team.club.substring(0, 3).toUpperCase();
  const logoSrc = clubLogos[team.club];
  const logoHTML = logoSrc
    ? `<img src="${logoSrc}" alt="${team.club}" loading="lazy">`
    : short;

  const logoContainer = document.getElementById("history-team-logo-container");
  if (logoSrc) {
    logoContainer.style.background = "";
    logoContainer.style.color = "";
    logoContainer.style.borderColor = "";
  } else {
    logoContainer.style.background = colors.bg;
    logoContainer.style.color = colors.text;
    logoContainer.style.borderColor = `${colors.bg}40`;
  }
  logoContainer.innerHTML = logoHTML;

  // Filter and Render Matches
  const container = document.getElementById("history-container");
  container.innerHTML = "";

  leagueData.fixtures.forEach((md, idx) => {
    const match = md.matches.find(m => m.home.id === teamId || m.away.id === teamId);
    if (!match) return;

    const card = document.createElement("div");
    card.className = "fixture-card history-card";
    card.style.animationDelay = `${idx * 0.04}s`;
    card.onclick = () => togglePredictionCard(card, md.matchday, match.home.id, match.away.id);

    // Compute result badge & styling
    let outcome = "";
    let outcomeClass = "";
    let outcomeBadge = "";
    if (match.status === "completed" && match.homeScore !== null && match.awayScore !== null) {
      if (match.home.id === teamId) {
        outcome = match.homeScore > match.awayScore ? "W" : (match.homeScore < match.awayScore ? "L" : "D");
      } else {
        outcome = match.awayScore > match.homeScore ? "W" : (match.awayScore < match.homeScore ? "L" : "D");
      }
      outcomeClass = `result-${outcome.toLowerCase()}`;
      const badgeClass = outcome === "W" ? "win" : (outcome === "L" ? "loss" : "draw");
      outcomeBadge = `<span class="match-result-badge ${badgeClass}">${outcome}</span>`;
    }

    if (outcomeClass) {
      card.classList.add(outcomeClass);
    }

    const homeColors = clubColors[match.home.club] || { bg: "#333", text: "#fff" };
    const awayColors = clubColors[match.away.club] || { bg: "#333", text: "#fff" };
    const homeShort = clubShort[match.home.club] || match.home.club.substring(0, 3).toUpperCase();
    const awayShort = clubShort[match.away.club] || match.away.club.substring(0, 3).toUpperCase();
    const homeLogoSrc = clubLogos[match.home.club];
    const awayLogoSrc = clubLogos[match.away.club];
    const homeLogoHTML = homeLogoSrc ? `<img src="${homeLogoSrc}" alt="${match.home.club}" loading="lazy">` : homeShort;
    const awayLogoHTML = awayLogoSrc ? `<img src="${awayLogoSrc}" alt="${match.away.club}" loading="lazy">` : awayShort;

    let scoreHTML;
    if (match.status === "completed" && match.homeScore !== null) {
      scoreHTML = `
        <div class="score-display">
          <span>${match.homeScore}</span>
          <span class="score-separator">-</span>
          <span>${match.awayScore}</span>
        </div>
        <span class="score-ft">FT</span>
      `;
    } else if (match.status === "live") {
      scoreHTML = `<span class="score-live">LIVE</span>`;
    } else {
      scoreHTML = `<span class="score-upcoming">VS</span>`;
    }

    // Highlight our team's side
    const isHome = match.home.id === teamId;
    const homeHighlight = isHome ? "style='color: var(--accent-gold); font-weight: 700;'" : "";
    const awayHighlight = !isHome ? "style='color: var(--accent-gold); font-weight: 700;'" : "";

    card.innerHTML = `
      <div class="fixture-label">
        <span>Matchday ${md.matchday}</span>
        ${outcomeBadge}
      </div>
      <div class="fixture-match">
        <div class="fixture-team">
          <div class="fixture-team-logo" style="${!homeLogoSrc ? `background: ${homeColors.bg}; color: ${homeColors.text}; border-color: ${homeColors.bg}40;` : ''}">
            ${homeLogoHTML}
          </div>
          <span class="fixture-team-player" ${homeHighlight}>${match.home.player}</span>
          <span class="fixture-team-club">${match.home.club}</span>
        </div>
        <div class="fixture-score">
          ${scoreHTML}
        </div>
        <div class="fixture-team">
          <div class="fixture-team-logo" style="${!awayLogoSrc ? `background: ${awayColors.bg}; color: ${awayColors.text}; border-color: ${awayColors.bg}40;` : ''}">
            ${awayLogoHTML}
          </div>
          <span class="fixture-team-player" ${awayHighlight}>${match.away.player}</span>
          <span class="fixture-team-club">${match.away.club}</span>
        </div>
      </div>
    `;

    const predDiv = document.createElement("div");
    predDiv.className = "fixture-prediction";
    card.appendChild(predDiv);

    container.appendChild(card);
  });

  switchPage("history");
}

function buildHistorySnapshot() {
  const team = leagueData.teams.find(t => t.id === selectedTeamIdForHistory);
  if (!team) return "";

  let html = buildSnapshotHeader(`${team.player} (${team.club}) — Fixture History`);

  html += `
    <div class="snap-history-banner">
      <div class="snap-history-team-logo">
        ${clubLogos[team.club] ? `<img src="${clubLogos[team.club]}" alt="${team.club}">` : `<span style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.5)">${(clubShort[team.club] || team.club.substring(0,3).toUpperCase())}</span>`}
      </div>
      <div class="snap-history-team-info">
        <h3>${team.player}</h3>
        <span>${team.club}</span>
      </div>
    </div>
  `;

  html += `<div class="snap-history-grid">`;

  // Collect matches
  const matches = [];
  leagueData.fixtures.forEach(md => {
    const match = md.matches.find(m => m.home.id === team.id || m.away.id === team.id);
    if (match) {
      matches.push({ matchday: md.matchday, ...match });
    }
  });

  matches.forEach(match => {
    const homeLogoSrc = clubLogos[match.home.club];
    const awayLogoSrc = clubLogos[match.away.club];
    const homeLogoHTML = homeLogoSrc
      ? `<img src="${homeLogoSrc}" alt="${match.home.club}">`
      : `<span style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.5)">${(clubShort[match.home.club] || match.home.club.substring(0,3).toUpperCase())}</span>`;
    const awayLogoHTML = awayLogoSrc
      ? `<img src="${awayLogoSrc}" alt="${match.away.club}">`
      : `<span style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.5)">${(clubShort[match.away.club] || match.away.club.substring(0,3).toUpperCase())}</span>`;

    let scoreHTML;
    if (match.status === "completed" && match.homeScore !== null) {
      scoreHTML = `
        <div class="snap-score-nums">
          <span>${match.homeScore}</span>
          <span class="snap-score-sep">-</span>
          <span>${match.awayScore}</span>
        </div>
      `;
    } else {
      scoreHTML = `<span class="snap-score-vs">VS</span>`;
    }

    let resultHTML = "";
    if (match.status === "completed" && match.homeScore !== null) {
      let outcome = "";
      if (match.home.id === team.id) {
        outcome = match.homeScore > match.awayScore ? "W" : (match.homeScore < match.awayScore ? "L" : "D");
      } else {
        outcome = match.awayScore > match.homeScore ? "W" : (match.awayScore < match.homeScore ? "L" : "D");
      }
      const cls = outcome === "W" ? "w" : (outcome === "L" ? "l" : "d");
      resultHTML = `<span class="snap-history-result-badge ${cls}">${outcome}</span>`;
    }

    html += `
      <div class="snap-history-card-item">
        <div class="snap-history-card-header">
          <span>Matchday ${match.matchday}</span>
          ${resultHTML}
        </div>
        <div class="snap-fix-match">
          <div class="snap-fix-team">
            <div class="snap-fix-logo">${homeLogoHTML}</div>
            <span class="snap-fix-player" ${match.home.id === team.id ? 'style="color:#c8a84e;font-weight:700;"' : ''}>${match.home.player}</span>
          </div>
          <div class="snap-fix-score">${scoreHTML}</div>
          <div class="snap-fix-team">
            <div class="snap-fix-logo">${awayLogoHTML}</div>
            <span class="snap-fix-player" ${match.away.id === team.id ? 'style="color:#c8a84e;font-weight:700;"' : ''}>${match.away.player}</span>
          </div>
        </div>
      </div>
    `;
  });

  html += `</div>`;

  html += `<div class="snap-footer">ballersleague.vercel.app · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>`;

  return html;
}

// ═══════════════════════════════════════════════════════════════
// MATCH PREDICTIONS & SAFEGUARDS
// ═══════════════════════════════════════════════════════════════

function togglePredictionCard(card, matchday, homeId, awayId) {
  const isExpanded = card.classList.contains("expanded");

  // Collapse all other expanded cards
  document.querySelectorAll(".fixture-card.expanded").forEach(c => {
    if (c !== card) {
      c.classList.remove("expanded");
      // Stop and pause video players in collapsed cards
      const video = c.querySelector("video");
      if (video) video.pause();
    }
  });

  if (isExpanded) {
    card.classList.remove("expanded");
    // Pause video
    const video = card.querySelector("video");
    if (video) video.pause();
  } else {
    card.classList.add("expanded");
    const predContainer = card.querySelector(".fixture-prediction");
    if (predContainer) {
      const md = leagueData.fixtures.find(f => f.matchday === matchday);
      const match = md.matches.find(m => m.home.id === homeId && m.away.id === awayId);

      const isLive = match.status === "live";
      const isUpcoming = match.status === "upcoming";

      let tabsHTML = "";
      if (isLive || isUpcoming) {
        tabsHTML = `
          <div class="fixture-expanded-tabs" onclick="event.stopPropagation()">
            <button class="fixture-expanded-tab ${!isLive ? 'active' : ''}" id="tab-pred-${matchday}-${homeId}-${awayId}" onclick="switchPanel(event, ${matchday}, ${homeId}, ${awayId}, 'pred')">Prediction</button>
            <button class="fixture-expanded-tab ${isLive ? 'active' : ''}" id="tab-live-${matchday}-${homeId}-${awayId}" onclick="switchPanel(event, ${matchday}, ${homeId}, ${awayId}, 'live')">Watch Live</button>
          </div>
        `;
      }

      predContainer.innerHTML = `
        ${tabsHTML}
        <div class="fixture-panel ${!isLive ? 'active' : ''}" id="panel-pred-${matchday}-${homeId}-${awayId}" onclick="event.stopPropagation()">
          <div class="prediction-poll-wrapper"></div>
        </div>
        ${(isLive || isUpcoming) ? `
          <div class="fixture-panel ${isLive ? 'active' : ''}" id="panel-live-${matchday}-${homeId}-${awayId}" onclick="event.stopPropagation()">
            <div class="live-stream-wrapper"></div>
          </div>
        ` : ''}
      `;

      // Render prediction widget inside wrapper
      const pollWrapper = predContainer.querySelector(".prediction-poll-wrapper");
      renderPredictionWidget(
        pollWrapper,
        matchday,
        homeId,
        awayId,
        match.home.club,
        match.away.club,
        match.status,
        match.predictions
      );

      // Render video player inside stream wrapper
      if (isLive || isUpcoming) {
        const streamWrapper = predContainer.querySelector(".live-stream-wrapper");
        renderStreamPlayer(streamWrapper, matchday, homeId, awayId, match.home.player, match.away.player, isLive);
      }
    }
  }
}

function getMatchVotes(matchday, homeId, awayId, serverPredictions) {
  // Deterministic seed for background mock votes
  const seed = (parseInt(matchday) * 7 + parseInt(homeId) * 13 + parseInt(awayId) * 17) % 100;
  
  const homeMock = 20 + (seed % 50);   // 20 to 69
  const awayMock = 15 + ((seed * 3) % 45); // 15 to 59
  const drawMock = 10 + ((seed * 7) % 30);  // 10 to 39

  const homeReal = (serverPredictions && serverPredictions.home) || 0;
  const awayReal = (serverPredictions && serverPredictions.away) || 0;
  const drawReal = (serverPredictions && serverPredictions.draw) || 0;

  const home = homeMock + homeReal;
  const away = awayMock + awayReal;
  const draw = drawMock + drawReal;
  const total = home + away + draw;

  return { home, draw, away, total };
}

function renderPredictionWidget(container, matchday, homeId, awayId, homeClub, awayClub, matchStatus, serverPredictions) {
  const localStorageKey = `prediction-${matchday}-${homeId}-${awayId}`;
  const userVote = localStorage.getItem(localStorageKey);
  const isCompleted = matchStatus === "completed";
  const hasVoted = userVote !== null || isCompleted;

  const mockVotes = getMatchVotes(matchday, homeId, awayId, serverPredictions);

  const homePercent = mockVotes.total > 0 ? Math.round((mockVotes.home / mockVotes.total) * 100) : 33;
  const awayPercent = mockVotes.total > 0 ? Math.round((mockVotes.away / mockVotes.total) * 100) : 33;
  const drawPercent = mockVotes.total > 0 ? 100 - homePercent - awayPercent : 34;

  const homeLogoSrc = clubLogos[homeClub];
  const awayLogoSrc = clubLogos[awayClub];
  const homeShort = clubShort[homeClub] || homeClub.substring(0, 3).toUpperCase();
  const awayShort = clubShort[awayClub] || awayClub.substring(0, 3).toUpperCase();

  let optionsHTML = "";
  if (!hasVoted) {
    optionsHTML = `
      <button class="prediction-btn" onclick="castPredictionVote(event, ${matchday}, ${homeId}, ${awayId}, 'home', '${homeClub}', '${awayClub}', '${matchStatus}')">
        ${homeLogoSrc ? `<img src="${homeLogoSrc}" alt="${homeClub}">` : ""}
        <span>${homeShort}</span>
      </button>
      <button class="prediction-btn" onclick="castPredictionVote(event, ${matchday}, ${homeId}, ${awayId}, 'draw', '${homeClub}', '${awayClub}', '${matchStatus}')">
        <span>X</span>
      </button>
      <button class="prediction-btn" onclick="castPredictionVote(event, ${matchday}, ${homeId}, ${awayId}, 'away', '${homeClub}', '${awayClub}', '${matchStatus}')">
        ${awayLogoSrc ? `<img src="${awayLogoSrc}" alt="${awayClub}">` : ""}
        <span>${awayShort}</span>
      </button>
    `;
  } else {
    const homeSelected = userVote === "home" ? "selected" : "";
    const drawSelected = userVote === "draw" ? "selected" : "";
    const awaySelected = userVote === "away" ? "selected" : "";

    optionsHTML = `
      <button class="prediction-btn ${homeSelected}">
        <div class="prediction-btn-fill" style="width: ${homePercent}%;"></div>
        ${homeLogoSrc ? `<img src="${homeLogoSrc}" alt="${homeClub}">` : ""}
        <span>${homeShort}</span>
        <span class="prediction-percent">${homePercent}%</span>
      </button>
      <button class="prediction-btn ${drawSelected}">
        <div class="prediction-btn-fill" style="width: ${drawPercent}%;"></div>
        <span>X</span>
        <span class="prediction-percent">${drawPercent}%</span>
      </button>
      <button class="prediction-btn ${awaySelected}">
        <div class="prediction-btn-fill" style="width: ${awayPercent}%;"></div>
        ${awayLogoSrc ? `<img src="${awayLogoSrc}" alt="${awayClub}">` : ""}
        <span>${awayShort}</span>
        <span class="prediction-percent">${awayPercent}%</span>
      </button>
    `;
  }

  const title = isCompleted ? "Final Votes" : "Who will win?";
  const subtitle = isCompleted 
    ? `Total votes: ${mockVotes.total}` 
    : (userVote ? `Total votes: ${mockVotes.total}` : "Cast your vote!");

  container.innerHTML = `
    <div class="prediction-title-row">
      <span class="prediction-title">${title}</span>
      <span class="prediction-subtitle">${subtitle}</span>
    </div>
    <div class="prediction-options ${hasVoted ? 'voted' : ''}">
      ${optionsHTML}
    </div>
  `;
}

async function castPredictionVote(event, matchday, homeId, awayId, selectedOption, homeClub, awayClub, matchStatus) {
  event.stopPropagation(); // Avoid collapsing parent card
  const localStorageKey = `prediction-${matchday}-${homeId}-${awayId}`;

  try {
    const res = await fetch("/api/prediction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchday, homeId, awayId, option: selectedOption })
    });

    const data = await res.json();
    if (!res.ok) {
      if (data.error === "Already voted from this IP") {
        // Safe check failed, IP already voted
        localStorage.setItem(localStorageKey, selectedOption);
        alert("You have already voted on this match from this IP address.");
      } else {
        throw new Error(data.error || "Failed to vote");
      }
    } else {
      // Vote successful
      localStorage.setItem(localStorageKey, selectedOption);
      const md = leagueData.fixtures.find(f => f.matchday === matchday);
      const match = md.matches.find(m => m.home.id === homeId && m.away.id === awayId);
      match.predictions = data.predictions;
    }
  } catch (err) {
    console.warn("Prediction API failed, using local fallback:", err);
    localStorage.setItem(localStorageKey, selectedOption);
  }

  const card = event.target.closest(".fixture-card");
  if (card) {
    const pollWrapper = card.querySelector(".prediction-poll-wrapper");
    const target = pollWrapper || card.querySelector(".fixture-prediction");
    const md = leagueData.fixtures.find(f => f.matchday === matchday);
    const match = md.matches.find(m => m.home.id === homeId && m.away.id === awayId);
    renderPredictionWidget(
      target,
      matchday,
      homeId,
      awayId,
      homeClub,
      awayClub,
      matchStatus,
      match.predictions
    );
  }
}

// ── Streaming Configuration
const STREAM_VIDEO_URL = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";

// Toggle panels (Prediction tab vs Stream Player tab)
function switchPanel(event, matchday, homeId, awayId, type) {
  event.stopPropagation();

  const tabPred = document.getElementById(`tab-pred-${matchday}-${homeId}-${awayId}`);
  const tabLive = document.getElementById(`tab-live-${matchday}-${homeId}-${awayId}`);

  const panelPred = document.getElementById(`panel-pred-${matchday}-${homeId}-${awayId}`);
  const panelLive = document.getElementById(`panel-live-${matchday}-${homeId}-${awayId}`);

  if (type === 'pred') {
    if (tabPred) tabPred.classList.add('active');
    if (tabLive) tabLive.classList.remove('active');
    if (panelPred) panelPred.classList.add('active');
    if (panelLive) {
      panelLive.classList.remove('active');
      const video = panelLive.querySelector("video");
      if (video) video.pause();
    }
  } else {
    if (tabPred) tabPred.classList.remove('active');
    if (tabLive) tabLive.classList.add('active');
    if (panelPred) panelPred.classList.remove('active');
    if (panelLive) {
      panelLive.classList.add('active');
      const video = panelLive.querySelector("video");
      if (video) video.play().catch(() => {});
    }
  }
}

// Render custom simulation live stream player
function renderStreamPlayer(container, matchday, homeId, awayId, homePlayer, awayPlayer, isLive) {
  if (!isLive) {
    container.innerHTML = `
      <div class="stream-player-container" style="display:flex;flex-direction:column;align-items:center;justify-content:center;aspect-ratio:16/9;background:#000;border:1px solid var(--border-medium);border-radius:12px;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 7l-7 5 7 5V7z"></path>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
        </svg>
        <span style="font-size:0.8rem;color:var(--text-muted);font-weight:700;margin-top:12px;">Match has not started</span>
        <span style="font-size:0.65rem;color:var(--text-muted);opacity:0.8;">Stream will be available once the match is live.</span>
      </div>
    `;
    return;
  }

  const playerId = `video-${matchday}-${homeId}-${awayId}`;

  container.innerHTML = `
    <div class="stream-player-container" id="player-container-${playerId}">
      <div class="stream-feed-selector">
        <button class="stream-feed-btn active" id="btn-feed-home-${playerId}" onclick="changeStreamFeed(event, '${playerId}', 'home', '${homePlayer}', '${awayPlayer}')">
          ${homePlayer}'s Feed
        </button>
        <button class="stream-feed-btn" id="btn-feed-away-${playerId}" onclick="changeStreamFeed(event, '${playerId}', 'away', '${homePlayer}', '${awayPlayer}')">
          ${awayPlayer}'s Feed
        </button>
      </div>

      <div class="stream-video-wrapper">
        <video id="${playerId}" src="${STREAM_VIDEO_URL}" autoplay muted loop playsinline></video>
        
        <div class="stream-buffering-overlay" id="overlay-buffer-${playerId}">
          <div class="stream-spinner"></div>
          <span class="stream-buffering-text" id="text-buffer-${playerId}">CONNECTING TO MATCH...</span>
        </div>

        <div class="stream-controls-overlay">
          <div class="stream-controls-left">
            <button class="stream-control-btn" onclick="toggleStreamPlay(event, '${playerId}')" id="btn-play-${playerId}" title="Pause">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
            </button>
            
            <div class="volume-slider-container">
              <button class="stream-control-btn" onclick="toggleStreamMute(event, '${playerId}')" id="btn-volume-${playerId}" title="Mute">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77zM3 9v6h4l5 5V4L7 9H3z"></path>
                </svg>
              </button>
              <input type="range" class="volume-slider" min="0" max="1" step="0.1" value="0" oninput="changeStreamVolume(event, '${playerId}')" id="slider-volume-${playerId}">
            </div>
          </div>

          <div class="stream-controls-right">
            <div class="quality-selector">
              <button class="quality-btn" onclick="toggleQualityMenu(event, '${playerId}')" id="btn-quality-${playerId}">
                <span>720p</span>
                <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M5 7 L10 13 L15 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                </svg>
              </button>
              <div class="quality-menu" id="menu-quality-${playerId}">
                <button class="quality-item active" onclick="changeStreamQuality(event, '${playerId}', '720p')">720p</button>
                <button class="quality-item" onclick="changeStreamQuality(event, '${playerId}', '480p')">480p</button>
                <button class="quality-item" onclick="changeStreamQuality(event, '${playerId}', '360p')">360p</button>
              </div>
            </div>

            <button class="stream-control-btn" onclick="toggleStreamFullscreen(event, '${playerId}')" title="Fullscreen">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Bind dropdown click listener to close when clicked outside
  if (!window.hasGlobalQualityMenuListener) {
    document.addEventListener("click", () => {
      document.querySelectorAll(".quality-menu.show").forEach(m => m.classList.remove("show"));
    });
    window.hasGlobalQualityMenuListener = true;
  }
}

// Custom Player Controls logic
function toggleStreamPlay(event, playerId) {
  event.stopPropagation();
  const video = document.getElementById(playerId);
  const btn = document.getElementById(`btn-play-${playerId}`);
  if (!video || !btn) return;

  if (video.paused) {
    video.play().catch(() => {});
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16"></rect>
        <rect x="14" y="4" width="4" height="16"></rect>
      </svg>
    `;
    btn.title = "Pause";
  } else {
    video.pause();
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z"></path>
      </svg>
    `;
    btn.title = "Play";
  }
}

function toggleStreamMute(event, playerId) {
  event.stopPropagation();
  const video = document.getElementById(playerId);
  const slider = document.getElementById(`slider-volume-${playerId}`);
  const btn = document.getElementById(`btn-volume-${playerId}`);
  if (!video || !slider || !btn) return;

  if (video.muted || video.volume === 0) {
    video.muted = false;
    video.volume = 0.5;
    slider.value = 0.5;
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77zM3 9v6h4l5 5V4L7 9H3z"></path>
      </svg>
    `;
  } else {
    video.muted = true;
    video.volume = 0;
    slider.value = 0;
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"></path>
      </svg>
    `;
  }
}

function changeStreamVolume(event, playerId) {
  event.stopPropagation();
  const video = document.getElementById(playerId);
  const slider = event.target;
  const btn = document.getElementById(`btn-volume-${playerId}`);
  if (!video || !btn) return;

  video.volume = slider.value;
  video.muted = slider.value == 0;

  if (video.muted) {
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"></path>
      </svg>
    `;
  } else {
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77zM3 9v6h4l5 5V4L7 9H3z"></path>
      </svg>
    `;
  }
}

function toggleQualityMenu(event, playerId) {
  event.stopPropagation();
  const menu = document.getElementById(`menu-quality-${playerId}`);
  if (menu) menu.classList.toggle("show");
}

function changeStreamQuality(event, playerId, quality) {
  event.stopPropagation();
  const menu = document.getElementById(`menu-quality-${playerId}`);
  const btn = document.getElementById(`btn-quality-${playerId}`);
  const overlay = document.getElementById(`overlay-buffer-${playerId}`);
  const text = document.getElementById(`text-buffer-${playerId}`);
  const video = document.getElementById(playerId);

  if (menu) menu.classList.remove("show");
  if (btn) btn.querySelector("span").textContent = quality;

  if (overlay && text) {
    text.textContent = `SWITCHING TO ${quality.toUpperCase()}...`;
    overlay.classList.add("active");
  }

  if (video) {
    video.pause();
  }

  setTimeout(() => {
    if (overlay) overlay.classList.remove("active");
    if (video) {
      if (quality === '360p') {
        video.style.filter = 'blur(1.5px) contrast(0.95)';
      } else if (quality === '480p') {
        video.style.filter = 'blur(0.6px)';
      } else {
        video.style.filter = 'none';
      }
      video.play().catch(() => {});
    }
  }, 900);

  if (menu) {
    menu.querySelectorAll(".quality-item").forEach(item => {
      if (item.textContent === quality) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });
  }
}

function changeStreamFeed(event, playerId, type, homePlayer, awayPlayer) {
  event.stopPropagation();
  const overlay = document.getElementById(`overlay-buffer-${playerId}`);
  const text = document.getElementById(`text-buffer-${playerId}`);
  const btnHome = document.getElementById(`btn-feed-home-${playerId}`);
  const btnAway = document.getElementById(`btn-feed-away-${playerId}`);
  const video = document.getElementById(playerId);

  if (btnHome && btnAway) {
    if (type === 'home') {
      btnHome.classList.add("active");
      btnAway.classList.remove("active");
    } else {
      btnHome.classList.remove("active");
      btnAway.classList.add("active");
    }
  }

  if (overlay && text) {
    const activePlayer = type === 'home' ? homePlayer : awayPlayer;
    text.textContent = `CONNECTING TO ${activePlayer.toUpperCase()}'S FEED...`;
    overlay.classList.add("active");
  }

  if (video) {
    video.pause();
  }

  setTimeout(() => {
    if (overlay) overlay.classList.remove("active");
    if (video) {
      video.src = STREAM_VIDEO_URL + (type === 'away' ? "?feed=away" : "");
      video.play().catch(() => {});
    }
  }, 1000);
}

function toggleStreamFullscreen(event, playerId) {
  event.stopPropagation();
  const container = document.getElementById(`player-container-${playerId}`);
  if (!container) return;

  if (!document.fullscreenElement) {
    container.requestFullscreen().catch(err => {
      console.error(`Fullscreen failed: ${err.message}`);
    });
  } else {
    document.exitFullscreen();
  }
}


