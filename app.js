/* ═══════════════════════════════════════════════════════════════
   BALLERS LEAGUE — APP LOGIC
   Standings + Fixtures with swipe navigation
   Fetches live data from the backend API
   ═══════════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────────
let leagueData = null;
let currentMatchday = 0; // 0-indexed
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
  document.getElementById(`nav-${page}`).classList.add("active");

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

  const btn = document.getElementById(type === "standings" ? "btn-download-standings" : "btn-download-fixtures");
  btn.classList.add("downloading");
  showSnapshotOverlay();

  // Build the off-screen render container
  let container = document.getElementById("snapshot-container");
  if (container) container.remove();

  container = document.createElement("div");
  container.id = "snapshot-container";
  container.className = "snapshot-render";
  container.innerHTML = type === "standings" ? buildStandingsSnapshot() : buildFixturesSnapshot();
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
      : `ballers-league-matchday-${leagueData.fixtures[currentMatchday].matchday}.png`;
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

