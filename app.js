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
    const res = await fetch("/api/data");
    leagueData = await res.json();
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
