/* ═══════════════════════════════════════════════════════════════
   BALLERS LEAGUE — APP LOGIC
   Standings + Fixtures with swipe navigation
   Fetches live data from the backend API
   ═══════════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────────
let leagueData = null;
let currentMatchday = 0; // 0-indexed
let currentSeasonId = null;
let selectedTeamIdForHistory = null;
let touchStartX = 0;
let touchEndX = 0;
const SWIPE_THRESHOLD = 50;
let cachedRecordsData = null;
let recordsFetchPromise = null;

// ── Dynamic Club configurations ────────────────────────────────
let clubColors = {};
let clubShort = {};
let clubLogos = {};

function initializeClubs(data) {
  clubColors = {};
  clubShort = {};
  clubLogos = {};
  if (data && data.clubs && Array.isArray(data.clubs)) {
    data.clubs.forEach(c => {
      clubColors[c.name] = { bg: c.primaryColor || c.primary_color || "#333", text: c.textColor || c.text_color || "#fff" };
      clubShort[c.name] = c.shortName || c.short_name || c.name.substring(0, 3).toUpperCase();
      clubLogos[c.name] = c.logoUrl || c.logo_url || "";
    });
  }
}

// ── Init ───────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Try API first (local Express server), fall back to static fixtures.json (Vercel)
    let res;
    try {
      res = await fetch("/api/data?_t=" + Date.now());
      if (!res.ok) throw new Error("API not available");
      leagueData = await res.json();
    } catch {
      res = await fetch("/fixtures.json?_t=" + Date.now());
      leagueData = await res.json();
    }
    initializeClubs(leagueData);
    currentSeasonId = leagueData.seasonId || null;
    renderSeasonSelector();
    renderStandings();
    renderFixtures();
    renderStats();
    renderLiveTicker();
    renderNewsMarquee();
    setupSwipeGestures();
    setupSilentRefresh();
  } catch (err) {
    console.error("Failed to load league data:", err);
  }
});

// ── Season Switching ──────────────────────────────────────────
async function loadSeason(seasonId) {
  try {
    const res = await fetch(`/api/data?season=${seasonId}&_t=${Date.now()}`);
    if (!res.ok) throw new Error("Failed to load season data");
    leagueData = await res.json();
    initializeClubs(leagueData);
    currentSeasonId = leagueData.seasonId || seasonId;
    currentMatchday = 0;
    renderSeasonSelector();
    renderStandings();
    renderFixtures();
    renderStats();
    renderLiveTicker();
    renderNewsMarquee();
    if (document.getElementById("page-history").classList.contains("active")) {
      switchPage("standings");
    }
  } catch (err) {
    console.error("Failed to load season:", err);
  }
}

function renderSeasonSelector() {
  const badge = document.querySelector(".season-badge");
  if (!badge) return;
  badge.textContent = leagueData.season || "Season 1";
  const seasons = leagueData.seasons;
  if (!seasons || seasons.length <= 1) {
    badge.classList.remove("has-dropdown");
    badge.onclick = null;
    const old = document.querySelector(".season-dropdown");
    if (old) old.remove();
    return;
  }
  badge.classList.add("has-dropdown");
  let dropdown = document.querySelector(".season-dropdown");
  if (dropdown) dropdown.remove();
  dropdown = document.createElement("div");
  dropdown.className = "season-dropdown";
  dropdown.id = "season-dropdown";
  seasons.forEach(s => {
    const item = document.createElement("button");
    item.className = `season-dropdown-item ${s.id === currentSeasonId ? 'active' : ''}`;
    item.textContent = s.name + (s.status === 'active' ? ' ●' : '');
    item.onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.remove("open");
      if (s.id !== currentSeasonId) loadSeason(s.id);
    };
    dropdown.appendChild(item);
  });
  badge.parentElement.appendChild(dropdown);
  badge.onclick = (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("open");
  };
  document.addEventListener("click", () => dropdown.classList.remove("open"), { once: true });
}

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

  // Load records page data on first visit
  if (page === 'records') {
    renderRecords();
  } else if (page === 'cup') {
    renderBallersCup();
  } else if (page === 'champions') {
    renderChampionsCup();
  } else {
    refreshLeagueDataSilent();
  }
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

  // Filter out inactive teams that haven't played in this season
  const filtered = Object.values(standings).filter(s => {
    const active = s.isActive !== false && s.is_active !== false;
    return active || s.played > 0;
  });

  // Sort: Points desc → GD desc → GF desc → Alphabetical
  const sorted = filtered.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.goalsFor - a.goalsAgainst;
    const gdB = b.goalsFor - b.goalsAgainst;
    if (gdB !== gdA) return gdB - gdA;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.player.localeCompare(b.player);
  });

  return { standings: sorted, lastCompletedMatchday };
}

function computeStandingsUpToMatchday(limit) {
  const teams = leagueData.teams;
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
    };
  });

  leagueData.fixtures.forEach(md => {
    if (limit !== undefined && md.matchday > limit) return;
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
        } else if (m.homeScore < m.awayScore) {
          away.wins++;
          away.points += 3;
          home.losses++;
        } else {
          home.draws++;
          away.draws++;
          home.points += 1;
          away.points += 1;
        }
      }
    });
  });

  const filtered = Object.values(standings).filter(s => {
    const active = s.isActive !== false && s.is_active !== false;
    return active || s.played > 0;
  });

  return filtered.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.goalsFor - a.goalsAgainst;
    const gdB = b.goalsFor - b.goalsAgainst;
    if (gdB !== gdA) return gdB - gdA;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.player.localeCompare(b.player);
  });
}

function renderStandings() {
  const { standings, lastCompletedMatchday } = computeStandings();

  // Update matchday label
  document.getElementById("standings-matchday").textContent =
    `Matchday ${lastCompletedMatchday} of ${leagueData.fixtures.length}`;

  const body = document.getElementById("standings-body");
  body.innerHTML = "";

  let prevStandings = [];
  if (lastCompletedMatchday > 0) {
    prevStandings = computeStandingsUpToMatchday(lastCompletedMatchday - 1);
  }

  standings.forEach((team, idx) => {
    const pos = idx + 1;
    const row = document.createElement("div");
    row.className = "table-row";
    row.onclick = () => showTeamHistory(team.id);
    if (pos <= 4) row.classList.add("top-zone");
    if (pos >= standings.length - 2) row.classList.add("danger-zone");
    row.style.animationDelay = `${idx * 0.04}s`;

    // Compute status badges
    const badges = [];
    const last3 = (team.form || []).slice(-3);
    if (last3.length === 3 && last3.every(r => r === 'W')) {
      badges.push({ icon: '🔥', title: 'On Fire: 3+ win streak!' });
    }
    if (last3.length === 3 && last3.every(r => r === 'L')) {
      badges.push({ icon: '❄️', title: 'Ice Cold: 3+ losing streak' });
    }

    if (pos > 6) {
      // Find last completed match
      let lastMatch = null;
      let lastMatchday = -1;
      leagueData.fixtures.forEach(md => {
        md.matches.forEach(m => {
          if (m.status === 'completed' && m.homeScore !== null && m.awayScore !== null) {
            if (m.home.id === team.id || m.away.id === team.id) {
              if (md.matchday > lastMatchday) {
                lastMatchday = md.matchday;
                lastMatch = m;
              }
            }
          }
        });
      });

      if (lastMatch) {
        let won = false;
        let opponentId = null;
        if (lastMatch.home.id === team.id && lastMatch.homeScore > lastMatch.awayScore) {
          won = true;
          opponentId = lastMatch.away.id;
        } else if (lastMatch.away.id === team.id && lastMatch.awayScore > lastMatch.homeScore) {
          won = true;
          opponentId = lastMatch.home.id;
        }

        if (won && opponentId !== null) {
          const opponentIdx = standings.findIndex(t => t.id === opponentId);
          if (opponentIdx >= 0 && (opponentIdx + 1) <= 4) {
            badges.push({ icon: '🛡️', title: `Giant Killer: Defeated top-4 player ${standings[opponentIdx].player} in their last match!` });
          }
        }
      }
    }

    const badgesHTML = badges.map(b => `<span class="standings-badge-icon" title="${b.title}">${b.icon}</span>`).join('');

    const colors = clubColors[team.club] || { bg: "#333", text: "#fff" };
    const short = clubShort[team.club] || team.club.substring(0, 3).toUpperCase();

    // Position badge
    let posHTML;
    if (pos <= 3) {
      posHTML = `<span class="pos-badge pos-${pos}">${pos}</span>`;
    } else {
      posHTML = `${pos}`;
    }

    let changeHTML = '';
    if (lastCompletedMatchday > 0) {
      const prevIdx = prevStandings.findIndex(t => t.id === team.id);
      const prevRank = prevIdx > -1 ? prevIdx + 1 : pos;
      const change = prevRank - pos;
      if (change > 0) {
        changeHTML = `<span class="pos-change rise" title="Climbed ${change} places">▲</span>`;
      } else if (change < 0) {
        changeHTML = `<span class="pos-change fall" title="Fell ${Math.abs(change)} places">▼</span>`;
      } else {
        changeHTML = `<span class="pos-change same">–</span>`;
      }
    } else {
      changeHTML = `<span class="pos-change same">–</span>`;
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
      <div class="col-pos">${posHTML} ${changeHTML}</div>
      <div class="col-club">
        <div class="club-logo" style="${!logoSrc ? `background: ${colors.bg}; color: ${colors.text}; border-color: ${colors.bg}40;` : ''}">
          ${logoHTML}
        </div>
        <div class="club-info">
          <span class="club-player" onclick="event.stopPropagation(); openPlayerProfile(${team.id})">${team.player} ${badgesHTML} <span class="profile-hint">ⓘ</span></span>
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

  // Render season awards if the season is completed
  renderAwards(standings);
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

  // Find manually selected Match of the Week
  const motwIdx = md.matches.findIndex(m => m.isMotw === true);

  md.matches.forEach((match, idx) => {
    const card = document.createElement("div");
    card.className = `fixture-card ${idx === motwIdx ? 'is-motw' : ''}`;
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
    } else if (match.status === "live" && (match.homeStreamUrl || match.awayStreamUrl)) {
      scoreHTML = `<span class="score-live">LIVE</span>`;
    } else {
      scoreHTML = `<span class="score-upcoming">VS</span>`;
    }

    card.innerHTML = `
      ${idx === motwIdx ? '<div class="motw-badge"><span class="motw-icon">⚡</span> MATCH OF THE WEEK</div>' : ''}
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
      <img class="snap-logo" src="logo.png" alt="Ballers League Logo">
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

  let prevStandings = [];
  if (lastCompletedMatchday > 0) {
    prevStandings = computeStandingsUpToMatchday(lastCompletedMatchday - 1);
  }

  let html = buildSnapshotHeader(`Standings — Matchday ${lastCompletedMatchday} of ${totalMDs}`);

  // Table header
  html += `
    <div class="snap-table-header">
      <span style="width:45px;text-align:center;display:flex;align-items:center;justify-content:center">#</span>
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

    let changeHTML = '';
    if (lastCompletedMatchday > 0) {
      const prevIdx = prevStandings.findIndex(t => t.id === team.id);
      const prevRank = prevIdx > -1 ? prevIdx + 1 : pos;
      const change = prevRank - pos;
      if (change > 0) {
        changeHTML = `<span class="pos-change rise">▲</span>`;
      } else if (change < 0) {
        changeHTML = `<span class="pos-change fall">▼</span>`;
      } else {
        changeHTML = `<span class="pos-change same">–</span>`;
      }
    } else {
      changeHTML = `<span class="pos-change same">–</span>`;
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
        <div class="snap-col-pos">${posHTML} ${changeHTML}</div>
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
    } else if (match.status === "live" && (match.homeStreamUrl || match.awayStreamUrl)) {
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

      const hasStream = !!(match.homeStreamUrl || match.awayStreamUrl);
      const isLive = match.status === "live";

      let tabsHTML = "";
      if (hasStream) {
        tabsHTML = `
          <div class="fixture-expanded-tabs" onclick="event.stopPropagation()">
            <button class="fixture-expanded-tab ${!isLive ? 'active' : ''}" id="tab-pred-${matchday}-${homeId}-${awayId}" onclick="switchPanel(event, ${matchday}, ${homeId}, ${awayId}, 'pred')">Prediction</button>
            <button class="fixture-expanded-tab ${isLive ? 'active' : ''}" id="tab-live-${matchday}-${homeId}-${awayId}" onclick="switchPanel(event, ${matchday}, ${homeId}, ${awayId}, 'live')">Watch Live</button>
          </div>
        `;
      }

      predContainer.innerHTML = `
        ${tabsHTML}
        <div class="fixture-panel ${!isLive || !hasStream ? 'active' : ''}" id="panel-pred-${matchday}-${homeId}-${awayId}" onclick="event.stopPropagation()">
          <div class="prediction-poll-wrapper"></div>
        </div>
        ${hasStream ? `
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

      // Render stream player AFTER the panel expansion animation finishes.
      // Twitch requires the iframe to be fully visible (opacity: 1, not overflow-hidden)
      // before it will load. The .fixture-prediction panel transitions over 300ms,
      // so we wait 350ms before injecting the iframe.
      if (hasStream) {
        setTimeout(() => {
          const streamWrapper = predContainer.querySelector(".live-stream-wrapper");
          if (streamWrapper && card.classList.contains("expanded")) {
            renderStreamPlayer(streamWrapper, matchday, homeId, awayId, match.home.player, match.away.player, match.homeStreamUrl, match.awayStreamUrl);
          }
        }, 350);
      }

      // Fetch and render H2H data
      loadH2HBar(predContainer, homeId, awayId, match.home.player, match.away.player);
    }
  }
}

function getMatchVotes(matchday, homeId, awayId, serverPredictions) {
  const home = (serverPredictions && serverPredictions.home) || 0;
  const away = (serverPredictions && serverPredictions.away) || 0;
  const draw = (serverPredictions && serverPredictions.draw) || 0;
  const total = home + away + draw;

  return { home, draw, away, total };
}

function renderPredictionWidget(container, matchday, homeId, awayId, homeClub, awayClub, matchStatus, serverPredictions) {
  const localStorageKey = `prediction-${matchday}-${homeId}-${awayId}`;
  const userVote = localStorage.getItem(localStorageKey);
  const isCompleted = matchStatus === "completed";

  const mockVotes = getMatchVotes(matchday, homeId, awayId, serverPredictions);

  // If user has voted according to LocalStorage, make sure their vote is counted in the display totals
  if (userVote && mockVotes[userVote] === 0) {
    mockVotes[userVote] = 1;
    mockVotes.total += 1;
  }

  const homePercent = mockVotes.total > 0 ? Math.round((mockVotes.home / mockVotes.total) * 100) : 0;
  const awayPercent = mockVotes.total > 0 ? Math.round((mockVotes.away / mockVotes.total) * 100) : 0;
  const drawPercent = mockVotes.total > 0 ? 100 - homePercent - awayPercent : 0;

  const homeLogoSrc = clubLogos[homeClub];
  const awayLogoSrc = clubLogos[awayClub];
  const homeShort = clubShort[homeClub] || homeClub.substring(0, 3).toUpperCase();
  const awayShort = clubShort[awayClub] || awayClub.substring(0, 3).toUpperCase();

  const activeVoter = localStorage.getItem('voter-name') || '';
  const options = leagueData.teams ? leagueData.teams.map(t => `<option value="${t.player}" ${activeVoter === t.player ? 'selected' : ''}>${t.player}</option>`).join('') : '';

  const getVotersHTMLForOption = (opt) => {
    const optVoters = (serverPredictions && serverPredictions.voters || []).filter(v => v.pick === opt);
    if (optVoters.length === 0) return '<div class="prediction-voters-list"></div>';
    
    const avatars = optVoters.map(v => {
      if (v.name === 'Guest') {
        return `<span class="voter-avatar-fallback guest" title="Guest">G</span>`;
      }
      const team = leagueData.teams ? leagueData.teams.find(t => t.player === v.name) : null;
      const club = team ? team.club : '';
      const logoSrc = clubLogos[club];
      if (logoSrc) {
        return `<img src="${logoSrc}" alt="${v.name}" class="voter-avatar" title="${v.name} (${club})">`;
      }
      return `<span class="voter-avatar-fallback" title="${v.name}">${v.name.substring(0, 2).toUpperCase()}</span>`;
    }).join('');
    
    return `<div class="prediction-voters-list">${avatars}</div>`;
  };

  let optionsHTML = "";
  if (isCompleted) {
    optionsHTML = `
      <div class="prediction-options-grid voted">
        <div class="prediction-option-col">
          <button class="prediction-btn ${userVote === 'home' ? 'selected' : ''}">
            <div class="prediction-btn-fill" style="width: ${homePercent}%;"></div>
            ${homeLogoSrc ? `<img src="${homeLogoSrc}" alt="${homeClub}">` : `<span>${homeShort}</span>`}
            <span class="prediction-percent">${homePercent}%</span>
          </button>
          ${getVotersHTMLForOption('home')}
        </div>
        <div class="prediction-option-col">
          <button class="prediction-btn ${userVote === 'draw' ? 'selected' : ''}">
            <div class="prediction-btn-fill" style="width: ${drawPercent}%;"></div>
            <span>X</span>
            <span class="prediction-percent">${drawPercent}%</span>
          </button>
          ${getVotersHTMLForOption('draw')}
        </div>
        <div class="prediction-option-col">
          <button class="prediction-btn ${userVote === 'away' ? 'selected' : ''}">
            <div class="prediction-btn-fill" style="width: ${awayPercent}%;"></div>
            ${awayLogoSrc ? `<img src="${awayLogoSrc}" alt="${awayClub}">` : `<span>${awayShort}</span>`}
            <span class="prediction-percent">${awayPercent}%</span>
          </button>
          ${getVotersHTMLForOption('away')}
        </div>
      </div>
    `;
  } else {
    const voterDropdownHTML = `
      <div class="prediction-voter-select-row" onclick="event.stopPropagation()">
        <span class="voter-label">Predict as:</span>
        <select class="voter-select" onchange="localStorage.setItem('voter-name', this.value)">
          <option value="" disabled ${activeVoter ? '' : 'selected'}>Choose Player...</option>
          <option value="Guest" ${activeVoter === 'Guest' ? 'selected' : ''}>Guest (Outsider)</option>
          ${options}
        </select>
      </div>
    `;

    optionsHTML = `
      ${voterDropdownHTML}
      <div class="prediction-options-grid active-voting">
        <div class="prediction-option-col">
          <button class="prediction-btn ${userVote === 'home' ? 'selected' : ''}" onclick="castPredictionVote(event, ${matchday}, ${homeId}, ${awayId}, 'home', '${homeClub}', '${awayClub}', '${matchStatus}')">
            ${userVote ? `<div class="prediction-btn-fill" style="width: ${homePercent}%;"></div>` : ''}
            ${homeLogoSrc ? `<img src="${homeLogoSrc}" alt="${homeClub}">` : `<span>${homeShort}</span>`}
            ${userVote ? `<span class="prediction-percent">${homePercent}%</span>` : ''}
          </button>
          ${getVotersHTMLForOption('home')}
        </div>
        <div class="prediction-option-col">
          <button class="prediction-btn ${userVote === 'draw' ? 'selected' : ''}" onclick="castPredictionVote(event, ${matchday}, ${homeId}, ${awayId}, 'draw', '${homeClub}', '${awayClub}', '${matchStatus}')">
            ${userVote ? `<div class="prediction-btn-fill" style="width: ${drawPercent}%;"></div>` : ''}
            <span>X</span>
            ${userVote ? `<span class="prediction-percent">${drawPercent}%</span>` : ''}
          </button>
          ${getVotersHTMLForOption('draw')}
        </div>
        <div class="prediction-option-col">
          <button class="prediction-btn ${userVote === 'away' ? 'selected' : ''}" onclick="castPredictionVote(event, ${matchday}, ${homeId}, ${awayId}, 'away', '${homeClub}', '${awayClub}', '${matchStatus}')">
            ${userVote ? `<div class="prediction-btn-fill" style="width: ${awayPercent}%;"></div>` : ''}
            ${awayLogoSrc ? `<img src="${awayLogoSrc}" alt="${awayClub}">` : `<span>${awayShort}</span>`}
            ${userVote ? `<span class="prediction-percent">${awayPercent}%</span>` : ''}
          </button>
          ${getVotersHTMLForOption('away')}
        </div>
      </div>
    `;
  }

  const title = isCompleted ? "Final Votes" : "Who will win?";
  const subtitle = isCompleted 
    ? `Total votes: ${mockVotes.total}` 
    : (userVote ? `Total votes: ${mockVotes.total} · Click to change vote` : "Cast your vote!");

  container.innerHTML = `
    <div class="prediction-title-row">
      <span class="prediction-title">${title}</span>
      <span class="prediction-subtitle">${subtitle}</span>
    </div>
    <div class="prediction-container-inner">
      ${optionsHTML}
    </div>
  `;
}

async function castPredictionVote(event, matchday, homeId, awayId, selectedOption, homeClub, awayClub, matchStatus) {
  event.stopPropagation(); // Avoid collapsing parent card
  const localStorageKey = `prediction-${matchday}-${homeId}-${awayId}`;

  // Find the selected voter name
  const wrapper = event.target.closest(".fixture-panel");
  const selectEl = wrapper ? wrapper.querySelector(".voter-select") : null;
  const voterName = selectEl ? selectEl.value : (localStorage.getItem('voter-name') || '');

  if (!voterName) {
    alert("Please select your player name from the dropdown before voting!");
    return;
  }

  try {
    const res = await fetch("/api/prediction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchday, homeId, awayId, option: selectedOption, seasonId: currentSeasonId, voterName })
    });

    const data = await res.json();
    if (!res.ok) {
      if (data.error === "Already voted from this IP") {
        // Safe check failed, IP already voted
        localStorage.setItem(localStorageKey, selectedOption);
        alert("You have already voted on this match from this IP address.");
      } else if (data.error === "You have already voted on this match") {
        localStorage.setItem(localStorageKey, selectedOption);
        alert("You have already voted on this match as this player.");
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
    
    // Local fallback logic: increment/update locally!
    const md = leagueData.fixtures.find(f => f.matchday === matchday);
    if (md) {
      const match = md.matches.find(m => m.home.id === homeId && m.away.id === awayId);
      if (match) {
        if (!match.predictions) {
          match.predictions = { home: 0, draw: 0, away: 0, ips: [], voters: [] };
        }
        if (!match.predictions.voters) {
          match.predictions.voters = [];
        }
        
        let existingVoteIndex = -1;
        if (voterName === 'Guest') {
          // In local mock fallback, we can't easily isolate guest IPs, but let's assume one guest per session for simplicity
          existingVoteIndex = match.predictions.voters.findIndex(v => v.name === 'Guest' && v.ip === '127.0.0.1');
        } else {
          existingVoteIndex = match.predictions.voters.findIndex(v => v.name === voterName);
        }

        if (existingVoteIndex > -1) {
          const previousPick = match.predictions.voters[existingVoteIndex].pick;
          if (previousPick !== selectedOption) {
            if (match.predictions[previousPick] > 0) {
              match.predictions[previousPick]--;
            }
            match.predictions[selectedOption] = (match.predictions[selectedOption] || 0) + 1;
            match.predictions.voters[existingVoteIndex].pick = selectedOption;
          }
        } else {
          match.predictions.voters.push({ name: voterName, pick: selectedOption, ip: '127.0.0.1' });
          match.predictions[selectedOption] = (match.predictions[selectedOption] || 0) + 1;
        }
      }
    }
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

// ═══════════════════════════════════════════════════════════════
// MATCH STREAMING — Twitch & Kick Embeds
// ═══════════════════════════════════════════════════════════════

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
    if (panelLive) panelLive.classList.remove('active');
  } else {
    if (tabPred) tabPred.classList.remove('active');
    if (tabLive) tabLive.classList.add('active');
    if (panelPred) panelPred.classList.remove('active');
    if (panelLive) panelLive.classList.add('active');
  }
}

// Parse a stream URL into an embeddable iframe src
function getStreamEmbedUrl(url) {
  if (!url) return null;

  // Use the URL API to properly parse and strip query params / hash fragments
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return null;
  }

  // Twitch channel: https://twitch.tv/channelname or https://www.twitch.tv/channelname?sr=a
  if (parsed.hostname.includes("twitch.tv")) {
    // pathname is e.g. "/0xbtcdoctor" — strip leading slash and any trailing slashes
    const channel = parsed.pathname.replace(/^\/+|\/+$/g, "");
    if (!channel) return null;

    // Twitch requires ALL ancestor domains in the parent chain.
    const hostname = window.location.hostname;
    const parentParams = [`parent=${hostname}`];

    // Extract root domain (e.g. "vercel.app" from "my-app-abc123.vercel.app")
    const domainParts = hostname.split(".");
    if (domainParts.length > 2) {
      const rootDomain = domainParts.slice(-2).join(".");
      parentParams.push(`parent=${rootDomain}`);
    }

    return `https://player.twitch.tv/?channel=${channel}&${parentParams.join("&")}&autoplay=true&muted=true`;
  }

  // Kick channel: https://kick.com/channelname or https://kick.com/channelname?some=param
  if (parsed.hostname.includes("kick.com")) {
    const channel = parsed.pathname.replace(/^\/+|\/+$/g, "");
    if (!channel) return null;
    return `https://player.kick.com/${channel}`;
  }

  return null;
}

// Check if Twitch embed parent needs a warning (IP address or file://)
function shouldShowTwitchParentWarning(url) {
  if (!url || !url.includes("twitch.tv")) return false;
  const hostname = window.location.hostname;
  const isIP = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname);
  const isFile = window.location.protocol === 'file:';
  return isIP || isFile;
}

// Render the Twitch warning block
function renderTwitchParentWarning() {
  const currentAddress = window.location.protocol === 'file:' ? 'direct file access' : window.location.hostname;
  const localPort = window.location.port || '3000';
  return `
    <div class="stream-embed-warning">
      <div class="stream-embed-warning-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      </div>
      <div class="stream-embed-warning-text">
        <strong>Twitch Stream Warning:</strong> Twitch embeds do not support IP addresses or direct file access (current: <code>${currentAddress}</code>). Please access the website via <a href="http://localhost:${localPort}" target="_blank">http://localhost:${localPort}</a> or your production domain for the stream to load properly.
      </div>
    </div>
  `;
}

// Render the stream player with real embeds and feed toggle
function renderStreamPlayer(container, matchday, homeId, awayId, homePlayer, awayPlayer, homeStreamUrl, awayStreamUrl) {
  const playerId = `stream-${matchday}-${homeId}-${awayId}`;
  const hasBothFeeds = !!(homeStreamUrl && awayStreamUrl);
  const defaultFeed = homeStreamUrl ? 'home' : 'away';
  const defaultUrl = homeStreamUrl || awayStreamUrl;

  let feedToggleHTML = "";
  if (hasBothFeeds) {
    feedToggleHTML = `
      <div class="stream-feed-toggle" onclick="event.stopPropagation()">
        <button class="stream-feed-btn active" id="btn-feed-home-${playerId}"
          onclick="switchStreamFeed(event, '${playerId}', 'home', '${encodeURIComponent(homeStreamUrl)}', '${encodeURIComponent(awayStreamUrl)}', '${homePlayer}', '${awayPlayer}')">
          ${homePlayer}
        </button>
        <button class="stream-feed-btn" id="btn-feed-away-${playerId}"
          onclick="switchStreamFeed(event, '${playerId}', 'away', '${encodeURIComponent(homeStreamUrl)}', '${encodeURIComponent(awayStreamUrl)}', '${homePlayer}', '${awayPlayer}')">
          ${awayPlayer}
        </button>
      </div>
    `;
  }

  const embedUrl = getStreamEmbedUrl(defaultUrl);
  const feedLabel = defaultFeed === 'home' ? homePlayer : awayPlayer;

  let embedHTML = "";
  if (embedUrl) {
    embedHTML = `
      <div class="stream-embed-container" id="embed-${playerId}">
        <iframe
          src="${embedUrl}"
          frameborder="0"
          scrolling="no"
          allow="autoplay; fullscreen"
          title="Live stream — ${feedLabel}">
        </iframe>
      </div>
    `;
  } else {
    embedHTML = renderNoStreamPlaceholder(feedLabel);
  }

  const platformLabel = defaultUrl
    ? (defaultUrl.includes("twitch.tv") ? "Twitch" : (defaultUrl.includes("kick.com") ? "Kick" : "Stream"))
    : "";

  const warningHTML = shouldShowTwitchParentWarning(defaultUrl) ? renderTwitchParentWarning() : "";

  container.innerHTML = `
    <div class="stream-player-wrapper" id="player-${playerId}">
      ${feedToggleHTML}
      <div class="stream-embed-area" id="area-${playerId}">
        ${embedHTML}
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
        ${platformLabel ? `<div class="stream-platform-badge">${platformLabel}</div>` : ''}
      </div>
      ${warningHTML}
    </div>
  `;
}

// Render a clean placeholder for when no stream URL is available
function renderNoStreamPlaceholder(playerName) {
  return `
    <div class="stream-no-feed">
      <div class="stream-no-feed-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
      </div>
      <span class="stream-no-feed-text">${playerName ? `${playerName} is not streaming` : 'No stream available'}</span>
    </div>
  `;
}

// Switch between home/away feed iframes
function switchStreamFeed(event, playerId, feed, homeUrlEncoded, awayUrlEncoded, homePlayer, awayPlayer) {
  event.stopPropagation();

  const homeUrl = decodeURIComponent(homeUrlEncoded);
  const awayUrl = decodeURIComponent(awayUrlEncoded);

  const btnHome = document.getElementById(`btn-feed-home-${playerId}`);
  const btnAway = document.getElementById(`btn-feed-away-${playerId}`);

  if (btnHome && btnAway) {
    if (feed === 'home') {
      btnHome.classList.add('active');
      btnAway.classList.remove('active');
    } else {
      btnHome.classList.remove('active');
      btnAway.classList.add('active');
    }
  }

  const selectedUrl = feed === 'home' ? homeUrl : awayUrl;
  const playerName = feed === 'home' ? homePlayer : awayPlayer;
  const area = document.getElementById(`area-${playerId}`);
  if (!area) return;

  const embedUrl = getStreamEmbedUrl(selectedUrl);
  if (embedUrl) {
    area.innerHTML = `
      <div class="stream-embed-container" id="embed-${playerId}">
        <iframe
          src="${embedUrl}"
          frameborder="0"
          scrolling="no"
          allow="autoplay; fullscreen"
          title="Live stream — ${playerName}">
        </iframe>
      </div>
    `;
  } else {
    area.innerHTML = renderNoStreamPlaceholder(playerName);
  }

  // Update platform badge and warning visibility
  const playerContainer = document.getElementById(`player-${playerId}`);
  if (playerContainer) {
    const badge = playerContainer.querySelector('.stream-platform-badge');
    if (badge) {
      const platformLabel = selectedUrl
        ? (selectedUrl.includes("twitch.tv") ? "Twitch" : (selectedUrl.includes("kick.com") ? "Kick" : "Stream"))
        : "";
      badge.textContent = platformLabel;
      badge.style.display = platformLabel ? 'inline-flex' : 'none';
    }

    // Toggle warning box
    let warning = playerContainer.querySelector('.stream-embed-warning');
    const showWarning = shouldShowTwitchParentWarning(selectedUrl);

    if (showWarning) {
      if (!warning) {
        warning = document.createElement('div');
        warning.className = 'stream-embed-warning';
        playerContainer.appendChild(warning);
      }
      const currentAddress = window.location.protocol === 'file:' ? 'direct file access' : window.location.hostname;
      const localPort = window.location.port || '3000';
      warning.innerHTML = `
        <div class="stream-embed-warning-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </div>
        <div class="stream-embed-warning-text">
          <strong>Twitch Stream Warning:</strong> Twitch embeds do not support IP addresses or direct file access (current: <code>${currentAddress}</code>). Please access the website via <a href="http://localhost:${localPort}" target="_blank">http://localhost:${localPort}</a> or your production domain for the stream to load properly.
        </div>
      `;
    } else if (warning) {
      warning.remove();
    }
  }
}

// Fullscreen for stream embed
function toggleStreamFullscreen(event, playerId) {
  event.stopPropagation();
  const container = document.getElementById(`player-${playerId}`);
  if (!container) return;

  if (!document.fullscreenElement) {
    container.requestFullscreen().catch(err => {
      console.error(`Fullscreen failed: ${err.message}`);
    });
  } else {
    document.exitFullscreen();
  }
}

// Expose handlers to global window object
window.switchPanel = switchPanel;
window.castPredictionVote = castPredictionVote;
window.switchStreamFeed = switchStreamFeed;
window.toggleStreamFullscreen = toggleStreamFullscreen;
window.togglePredictionCard = togglePredictionCard;

// ═══════════════════════════════════════════════════════════════
// STATS & LEADERBOARDS
// ═══════════════════════════════════════════════════════════════
function renderStats() {
  if (!leagueData) return;

  const { standings } = computeStandings();

  // ── Top Scorers ──────────────────────────────────
  const scorers = [...standings]
    .filter(s => s.played > 0)
    .sort((a, b) => {
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.played - b.played; // fewer games = better ratio
    });

  const scorersContainer = document.getElementById("stats-top-scorers");
  if (scorersContainer) {
    scorersContainer.innerHTML = scorers.map((s, i) => {
      const rankClass = i === 0 ? 'rank-gold' : i === 1 ? 'rank-silver' : i === 2 ? 'rank-bronze' : '';
      const logoSrc = clubLogos[s.club];
      const logoHTML = logoSrc
        ? `<img src="${logoSrc}" alt="${s.club}" class="stats-row-logo">`
        : `<span class="stats-row-logo-fallback">${clubShort[s.club] || '?'}</span>`;
      const gpg = s.played > 0 ? (s.goalsFor / s.played).toFixed(1) : '0.0';
      return `
        <div class="stats-row ${rankClass}" style="animation-delay: ${i * 0.04}s">
          <div class="stats-rank">${i + 1}</div>
          <div class="stats-player-info">
            ${logoHTML}
            <div>
              <div class="stats-player-name">${s.player}</div>
              <div class="stats-player-club">${s.club}</div>
            </div>
          </div>
          <div class="stats-values">
            <div class="stats-main-value">${s.goalsFor}</div>
            <div class="stats-sub-label">goals</div>
          </div>
          <div class="stats-values stats-secondary">
            <div class="stats-main-value">${gpg}</div>
            <div class="stats-sub-label">per game</div>
          </div>
          <div class="stats-values stats-secondary">
            <div class="stats-main-value">${s.played}</div>
            <div class="stats-sub-label">GP</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ── Best Defence ─────────────────────────────────
  const defence = [...standings]
    .filter(s => s.played > 0)
    .sort((a, b) => {
      const gaPerA = a.goalsAgainst / a.played;
      const gaPerB = b.goalsAgainst / b.played;
      if (gaPerA !== gaPerB) return gaPerA - gaPerB; // fewer = better
      return a.goalsAgainst - b.goalsAgainst;
    });

  const defenceContainer = document.getElementById("stats-best-defence");
  if (defenceContainer) {
    defenceContainer.innerHTML = defence.map((s, i) => {
      const rankClass = i === 0 ? 'rank-gold' : i === 1 ? 'rank-silver' : i === 2 ? 'rank-bronze' : '';
      const logoSrc = clubLogos[s.club];
      const logoHTML = logoSrc
        ? `<img src="${logoSrc}" alt="${s.club}" class="stats-row-logo">`
        : `<span class="stats-row-logo-fallback">${clubShort[s.club] || '?'}</span>`;
      const gapg = s.played > 0 ? (s.goalsAgainst / s.played).toFixed(1) : '0.0';
      return `
        <div class="stats-row ${rankClass}" style="animation-delay: ${i * 0.04}s">
          <div class="stats-rank">${i + 1}</div>
          <div class="stats-player-info">
            ${logoHTML}
            <div>
              <div class="stats-player-name">${s.player}</div>
              <div class="stats-player-club">${s.club}</div>
            </div>
          </div>
          <div class="stats-values">
            <div class="stats-main-value">${s.goalsAgainst}</div>
            <div class="stats-sub-label">conceded</div>
          </div>
          <div class="stats-values stats-secondary">
            <div class="stats-main-value">${gapg}</div>
            <div class="stats-sub-label">per game</div>
          </div>
          <div class="stats-values stats-secondary">
            <div class="stats-main-value">${s.played}</div>
            <div class="stats-sub-label">GP</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ── Biggest Wins ─────────────────────────────────
  const completedMatches = [];
  leagueData.fixtures.forEach(md => {
    md.matches.forEach(m => {
      if (m.status === 'completed' && m.homeScore !== null && m.awayScore !== null) {
        const margin = Math.abs(m.homeScore - m.awayScore);
        const totalGoals = m.homeScore + m.awayScore;
        const winner = m.homeScore > m.awayScore ? m.home : m.away;
        const loser = m.homeScore > m.awayScore ? m.away : m.home;
        completedMatches.push({
          winner, loser, margin, totalGoals,
          homeScore: m.homeScore, awayScore: m.awayScore,
          home: m.home, away: m.away,
          matchday: md.matchday,
        });
      }
    });
  });

  const biggestWins = completedMatches
    .filter(m => m.margin > 0)
    .sort((a, b) => b.margin - a.margin || b.totalGoals - a.totalGoals)
    .slice(0, 5);

  const winsContainer = document.getElementById("stats-biggest-wins");
  if (winsContainer) {
    if (biggestWins.length === 0) {
      winsContainer.innerHTML = '<div class="stats-empty">No completed matches yet</div>';
    } else {
      winsContainer.innerHTML = biggestWins.map((m, i) => {
        const homeLogoSrc = clubLogos[m.home.club];
        const awayLogoSrc = clubLogos[m.away.club];
        const homeLogoHTML = homeLogoSrc
          ? `<img src="${homeLogoSrc}" alt="${m.home.club}" class="bw-logo">`
          : `<span class="bw-logo-text">${clubShort[m.home.club]}</span>`;
        const awayLogoHTML = awayLogoSrc
          ? `<img src="${awayLogoSrc}" alt="${m.away.club}" class="bw-logo">`
          : `<span class="bw-logo-text">${clubShort[m.away.club]}</span>`;
        return `
          <div class="biggest-win-card" style="animation-delay: ${i * 0.06}s">
            <div class="bw-rank">${i + 1}</div>
            <div class="bw-match">
              <div class="bw-team">${homeLogoHTML} <span>${m.home.player}</span></div>
              <div class="bw-score">${m.homeScore} - ${m.awayScore}</div>
              <div class="bw-team">${awayLogoHTML} <span>${m.away.player}</span></div>
            </div>
            <div class="bw-meta">MD ${m.matchday} · +${m.margin} margin</div>
          </div>
        `;
      }).join('');
    }
  }

  // ── Pundit Rankings ──────────────────────────────
  const punditsMap = {};
  if (leagueData && leagueData.teams) {
    leagueData.teams.forEach(t => {
      punditsMap[t.player] = {
        player: t.player,
        club: t.club,
        correct: 0,
        total: 0,
        points: 0
      };
    });
  }

  // Calculate stats from completed matches
  if (leagueData && leagueData.fixtures) {
    leagueData.fixtures.forEach(md => {
      md.matches.forEach(m => {
        if (m.status === 'completed' && m.homeScore !== null && m.awayScore !== null) {
          let actualOutcome = 'draw';
          if (m.homeScore > m.awayScore) {
            actualOutcome = 'home';
          } else if (m.awayScore > m.homeScore) {
            actualOutcome = 'away';
          }

          const voters = (m.predictions && m.predictions.voters) || [];
          voters.forEach(v => {
            if (punditsMap[v.name]) {
              punditsMap[v.name].total += 1;
              if (v.pick === actualOutcome) {
                punditsMap[v.name].correct += 1;
                punditsMap[v.name].points += 3;
              }
            }
          });
        }
      });
    });
  }

  const punditsList = Object.values(punditsMap).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const accA = a.total > 0 ? (a.correct / a.total) : 0;
    const accB = b.total > 0 ? (b.correct / b.total) : 0;
    if (accB !== accA) return accB - accA;
    return b.correct - a.correct;
  });

  const punditContainer = document.getElementById("stats-pundit-rankings");
  if (punditContainer) {
    if (punditsList.length === 0) {
      punditContainer.innerHTML = '<div class="stats-empty">No prediction data available</div>';
    } else {
      punditContainer.innerHTML = punditsList.map((p, i) => {
        const rankClass = i === 0 ? 'rank-gold' : i === 1 ? 'rank-silver' : i === 2 ? 'rank-bronze' : '';
        const logoSrc = clubLogos[p.club];
        const logoHTML = logoSrc
          ? `<img src="${logoSrc}" alt="${p.club}" class="stats-row-logo">`
          : `<span class="stats-row-logo-fallback">${clubShort[p.club] || '?'}</span>`;
        const accuracy = p.total > 0 ? Math.round((p.correct / p.total) * 100) : 0;
        return `
          <div class="stats-row ${rankClass}" style="animation-delay: ${i * 0.04}s">
            <div class="stats-rank">${i + 1}</div>
            <div class="stats-player-info">
              ${logoHTML}
              <div>
                <div class="stats-player-name">${p.player}</div>
                <div class="stats-player-club">${p.club}</div>
              </div>
            </div>
            <div class="stats-values">
              <div class="stats-main-value">${p.points}</div>
              <div class="stats-sub-label">pts</div>
            </div>
            <div class="stats-values stats-secondary">
              <div class="stats-main-value">${accuracy}%</div>
              <div class="stats-sub-label">accuracy</div>
            </div>
            <div class="stats-values stats-secondary">
              <div class="stats-main-value">${p.correct}/${p.total}</div>
              <div class="stats-sub-label">picks</div>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// LIVE MATCH TICKER
// ═══════════════════════════════════════════════════════════════
function renderLiveTicker() {
  if (!leagueData) return;

  const ticker = document.getElementById("live-ticker");
  const tickerText = document.getElementById("live-ticker-text");
  if (!ticker || !tickerText) return;

  // Find all live matches across all matchdays
  const liveMatches = [];
  leagueData.fixtures.forEach(md => {
    md.matches.forEach(m => {
      if (m.status === 'live') {
        liveMatches.push({ match: m, matchday: md.matchday });
      }
    });
  });

  if (liveMatches.length === 0) {
    ticker.style.display = 'none';
    return;
  }

  ticker.style.display = 'block';

  const texts = liveMatches.map(({ match, matchday }) => {
    return `${match.home.player} vs ${match.away.player}`;
  });

  tickerText.textContent = `LIVE NOW: ${texts.join(' · ')}`;

  // Make ticker clickable — switch to fixtures and find the live matchday
  ticker.onclick = () => {
    const firstLive = liveMatches[0];
    const mdIdx = leagueData.fixtures.findIndex(f => f.matchday === firstLive.matchday);
    if (mdIdx >= 0) {
      currentMatchday = mdIdx;
      switchPage('fixtures');
      renderFixtures();
    }
  };
}

// ── NEWS MARQUEE (Banter Board) ───────────────────────────────
function renderNewsMarquee() {
  if (!leagueData) return;

  const container = document.getElementById("news-marquee-container");
  const marqueeText = document.getElementById("news-marquee-text");
  if (!container || !marqueeText) return;

  const headline = leagueData.headline;
  if (!headline || !headline.trim()) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';

  // Split by newlines to support multiple headlines
  const headlineLines = headline.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (headlineLines.length === 0) {
    container.style.display = 'none';
    return;
  }

  // Sorted teams for player-name bolding
  const sortedTeams = (leagueData.teams && leagueData.teams.length > 0)
    ? [...leagueData.teams].sort((a, b) => b.player.length - a.player.length)
    : [];

  // Format each headline individually
  const formattedHeadlines = headlineLines.map(line => {
    // Escape HTML
    let formatted = line
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

    // Restore <strong> and </strong> if they were entered
    formatted = formatted
      .replace(/&lt;strong&gt;/gi, '<strong>')
      .replace(/&lt;\/strong&gt;/gi, '</strong>');

    // Dynamically wrap player/club names in <strong>
    sortedTeams.forEach(t => {
      if (!t.player) return;
      const playerRegex = new RegExp(`\\b(${t.player})\\b`, 'gi');
      formatted = formatted.replace(playerRegex, (match) => {
        return `<strong>${match}</strong>`;
      });
    });

    return formatted;
  });

  const separator = ' &nbsp;&nbsp;&nbsp;&nbsp; · &nbsp;&nbsp;&nbsp;&nbsp; ';
  // Join all headlines with dot separators to form one continuous ticker string
  const singlePass = formattedHeadlines.join(separator);
  // Duplicate the full set for seamless infinite scroll
  marqueeText.innerHTML = `${singlePass}${separator}${singlePass}${separator}${singlePass}`;
}


// ═══════════════════════════════════════════════════════════════
// BATCH 2: H2H, RECORDS, PLAYER PROFILES
// ═══════════════════════════════════════════════════════════════

// ── Head-to-Head History Bar ─────────────────────────────────
async function loadH2HBar(container, homeId, awayId, homePlayer, awayPlayer) {
  let h2hSec = container.querySelector(".h2h-section");
  if (!h2hSec) {
    h2hSec = document.createElement("div");
    h2hSec.className = "h2h-section";
    container.appendChild(h2hSec);
  }
  h2hSec.innerHTML = `<div class="h2h-loading">Loading Head-to-Head history...</div>`;

  try {
    const res = await fetch(`/api/h2h?home=${homeId}&away=${awayId}`);
    if (!res.ok) throw new Error("H2H fetch failed");
    const data = await res.json();

    const total = data.totalPlayed;
    if (total === 0) {
      h2hSec.innerHTML = `
        <div class="h2h-title">📊 Head-to-Head History</div>
        <div class="h2h-empty">No previous matches recorded.</div>
      `;
      return;
    }

    const winsAPct = ((data.winsA / total) * 100).toFixed(0);
    const drawsPct = ((data.draws / total) * 100).toFixed(0);
    const winsBPct = ((data.winsB / total) * 100).toFixed(0);

    const recentDots = data.recentForm.map(form => {
      const cls = form === 'W' ? 'win' : (form === 'L' ? 'loss' : 'draw');
      const label = form === 'W' ? 'Win' : (form === 'L' ? 'Loss' : 'Draw');
      return `<span class="form-dot ${cls}" title="${label}"></span>`;
    }).join("");

    h2hSec.innerHTML = `
      <div class="h2h-title">📊 Head-to-Head History</div>
      <div class="h2h-stats">
        <div class="h2h-stat-side home">
          <span class="h2h-stat-player">${homePlayer}</span>
          <span class="h2h-stat-val">${data.winsA} Win${data.winsA === 1 ? '' : 's'}</span>
        </div>
        <div class="h2h-stat-draw">
          <span class="h2h-stat-val">${data.draws} Draw${data.draws === 1 ? '' : 's'}</span>
        </div>
        <div class="h2h-stat-side away">
          <span class="h2h-stat-val">${data.winsB} Win${data.winsB === 1 ? '' : 's'}</span>
          <span class="h2h-stat-player">${awayPlayer}</span>
        </div>
      </div>
      <div class="h2h-bar-container">
        <div class="h2h-bar home" style="width: ${winsAPct}%" title="${winsAPct}% ${homePlayer} Wins"></div>
        <div class="h2h-bar draw" style="width: ${drawsPct}%" title="${drawsPct}% Draws"></div>
        <div class="h2h-bar away" style="width: ${winsBPct}%" title="${winsBPct}% ${awayPlayer} Wins"></div>
      </div>
      <div class="h2h-form-row">
        <span class="h2h-form-lbl">Recent Meetings (oldest to newest):</span>
        <div class="h2h-form-dots">${recentDots}</div>
      </div>
    `;
  } catch (err) {
    console.error("H2H error, calculating from current season:", err);
    if (leagueData && leagueData.fixtures) {
      let winsA = 0, winsB = 0, draws = 0;
      const recentForm = [];
      const matches = [];
      leagueData.fixtures.forEach(md => {
        md.matches.forEach(m => {
          if (m.status !== 'completed' || m.homeScore === null) return;
          const isMatch = (m.home.id === homeId && m.away.id === awayId) ||
                          (m.home.id === awayId && m.away.id === homeId);
          if (!isMatch) return;

          let scoreA, scoreB;
          if (m.home.id === homeId) {
            scoreA = m.homeScore; scoreB = m.awayScore;
          } else {
            scoreA = m.awayScore; scoreB = m.homeScore;
          }

          if (scoreA > scoreB) { winsA++; recentForm.push('W'); }
          else if (scoreA < scoreB) { winsB++; recentForm.push('L'); }
          else { draws++; recentForm.push('D'); }
          matches.push(m);
        });
      });
      
      const total = matches.length;
      if (total === 0) {
        h2hSec.innerHTML = `
          <div class="h2h-title">📊 Head-to-Head History</div>
          <div class="h2h-empty">No previous matches recorded.</div>
        `;
        return;
      }
      const winsAPct = ((winsA / total) * 100).toFixed(0);
      const drawsPct = ((draws / total) * 100).toFixed(0);
      const winsBPct = ((winsB / total) * 100).toFixed(0);

      const recentDots = recentForm.slice(-5).map(form => {
        const cls = form === 'W' ? 'win' : (form === 'L' ? 'loss' : 'draw');
        const label = form === 'W' ? 'Win' : (form === 'L' ? 'Loss' : 'Draw');
        return `<span class="form-dot ${cls}" title="${label}"></span>`;
      }).join("");

      h2hSec.innerHTML = `
        <div class="h2h-title">📊 Head-to-Head History (Current Season)</div>
        <div class="h2h-stats">
          <div class="h2h-stat-side home">
            <span class="h2h-stat-player">${homePlayer}</span>
            <span class="h2h-stat-val">${winsA} Win${winsA === 1 ? '' : 's'}</span>
          </div>
          <div class="h2h-stat-draw">
            <span class="h2h-stat-val">${draws} Draw${draws === 1 ? '' : 's'}</span>
          </div>
          <div class="h2h-stat-side away">
            <span class="h2h-stat-val">${winsB} Win${winsB === 1 ? '' : 's'}</span>
            <span class="h2h-stat-player">${awayPlayer}</span>
          </div>
        </div>
        <div class="h2h-bar-container">
          <div class="h2h-bar home" style="width: ${winsAPct}%"></div>
          <div class="h2h-bar draw" style="width: ${drawsPct}%"></div>
          <div class="h2h-bar away" style="width: ${winsBPct}%"></div>
        </div>
        <div class="h2h-form-row">
          <span class="h2h-form-lbl">Recent Meetings:</span>
          <div class="h2h-form-dots">${recentDots}</div>
        </div>
      `;
    } else {
      h2hSec.innerHTML = `<div class="h2h-error">Could not load H2H history</div>`;
    }
  }
}

// ── League Records Wall ──────────────────────────────────────
async function renderRecords() {
  const container = document.getElementById("records-container");
  if (!container) return;

  container.innerHTML = `<div class="records-loading">Aggregating league records...</div>`;

  try {
    const res = await fetch("/api/records");
    if (!res.ok) throw new Error("Records fetch failed");
    const data = await res.json();

    const { matches, seasons, teams } = data;

    if (matches.length === 0) {
      container.innerHTML = `<div class="records-loading">No completed matches yet. Check back later!</div>`;
      return;
    }

    // 1. Championships (Most Titles)
    const titles = {};
    seasons.forEach(s => {
      if (s.status !== 'completed') return;
      const seasonMatches = matches.filter(m => m.seasonId === s.id);
      const standings = {};
      teams.forEach(t => {
        standings[t.id] = { id: t.id, player: t.player, club: t.club, points: 0, goalsFor: 0, goalsAgainst: 0 };
      });
      seasonMatches.forEach(m => {
        if (m.stage && m.stage !== 'league') return;
        const home = standings[m.homeId];
        const away = standings[m.awayId];
        if (!home || !away) return;
        home.goalsFor += m.homeScore;
        home.goalsAgainst += m.awayScore;
        away.goalsFor += m.awayScore;
        away.goalsAgainst += m.homeScore;
        if (m.homeScore > m.awayScore) {
          home.points += 3;
        } else if (m.homeScore < m.awayScore) {
          away.points += 3;
        } else {
          home.points += 1;
          away.points += 1;
        }
      });
      const sorted = Object.values(standings).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const gdA = a.goalsFor - a.goalsAgainst;
        const gdB = b.goalsFor - b.goalsAgainst;
        if (gdB !== gdA) return gdB - gdA;
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        return a.player.localeCompare(b.player);
      });
      if (sorted.length > 0) {
        const champion = sorted[0];
        titles[champion.player] = (titles[champion.player] || 0) + 1;
      }
    });

    let maxTitlesPlayer = "None";
    let maxTitlesCount = 0;
    Object.entries(titles).forEach(([player, count]) => {
      if (count > maxTitlesCount) {
        maxTitlesCount = count;
        maxTitlesPlayer = player;
      }
    });
    const titlesText = maxTitlesCount > 0 ? `${maxTitlesPlayer} (${maxTitlesCount} title${maxTitlesCount === 1 ? '' : 's'})` : "None awarded yet";

    // 2. Biggest Win (All-Time)
    let biggestWin = null;
    matches.forEach(m => {
      const margin = Math.abs(m.homeScore - m.awayScore);
      if (!biggestWin || margin > biggestWin.margin) {
        biggestWin = { ...m, margin };
      } else if (biggestWin && margin === biggestWin.margin) {
        const currentMaxScore = Math.max(biggestWin.homeScore, biggestWin.awayScore);
        const thisMaxScore = Math.max(m.homeScore, m.awayScore);
        if (thisMaxScore > currentMaxScore) {
          biggestWin = { ...m, margin };
        }
      }
    });
    let biggestWinText = "—";
    let biggestWinMeta = "";
    if (biggestWin) {
      const winner = biggestWin.homeScore > biggestWin.awayScore ? biggestWin.homePlayer : biggestWin.awayPlayer;
      const winnerScore = Math.max(biggestWin.homeScore, biggestWin.awayScore);
      const loser = biggestWin.homeScore > biggestWin.awayScore ? biggestWin.awayPlayer : biggestWin.homePlayer;
      const loserScore = Math.min(biggestWin.homeScore, biggestWin.awayScore);
      biggestWinText = `${winner} ${winnerScore}-${loserScore} ${loser}`;
      biggestWinMeta = `Season ${biggestWin.seasonId} · Matchday ${biggestWin.matchday}`;
    }

    // 3 & 4. Streaks
    const playerStreaks = {};
    teams.forEach(t => {
      playerStreaks[t.id] = {
        player: t.player,
        currentWin: 0,
        maxWin: 0,
        maxWinSeason: null,
        currentUnbeaten: 0,
        maxUnbeaten: 0,
        maxUnbeatenSeason: null
      };
    });

    const sortedMatches = [...matches].sort((a, b) => a.seasonId - b.seasonId || a.matchday - b.matchday);
    sortedMatches.forEach(m => {
      if (m.stage && m.stage !== 'league') return;
      const home = playerStreaks[m.homeId];
      const away = playerStreaks[m.awayId];
      if (!home || !away) return;

      if (m.homeScore > m.awayScore) {
        home.currentWin++;
        if (home.currentWin > home.maxWin) {
          home.maxWin = home.currentWin;
          home.maxWinSeason = m.seasonId;
        }
        home.currentUnbeaten++;
        if (home.currentUnbeaten > home.maxUnbeaten) {
          home.maxUnbeaten = home.currentUnbeaten;
          home.maxUnbeatenSeason = m.seasonId;
        }
        away.currentWin = 0;
        away.currentUnbeaten = 0;
      } else if (m.homeScore < m.awayScore) {
        away.currentWin++;
        if (away.currentWin > away.maxWin) {
          away.maxWin = away.currentWin;
          away.maxWinSeason = m.seasonId;
        }
        away.currentUnbeaten++;
        if (away.currentUnbeaten > away.maxUnbeaten) {
          away.maxUnbeaten = away.currentUnbeaten;
          away.maxUnbeatenSeason = m.seasonId;
        }
        home.currentWin = 0;
        home.currentUnbeaten = 0;
      } else {
        home.currentWin = 0;
        home.currentUnbeaten++;
        if (home.currentUnbeaten > home.maxUnbeaten) {
          home.maxUnbeaten = home.currentUnbeaten;
          home.maxUnbeatenSeason = m.seasonId;
        }
        away.currentWin = 0;
        away.currentUnbeaten++;
        if (away.currentUnbeaten > away.maxUnbeaten) {
          away.maxUnbeaten = away.currentUnbeaten;
          away.maxUnbeatenSeason = m.seasonId;
        }
      }
    });

    let bestWinStreak = { player: "None", streak: 0, season: "" };
    let bestUnbeaten = { player: "None", streak: 0, season: "" };

    Object.values(playerStreaks).forEach(ps => {
      if (ps.maxWin > bestWinStreak.streak) {
        bestWinStreak = { player: ps.player, streak: ps.maxWin, season: ps.maxWinSeason ? `Season ${ps.maxWinSeason}` : "" };
      }
      if (ps.maxUnbeaten > bestUnbeaten.streak) {
        bestUnbeaten = { player: ps.player, streak: ps.maxUnbeaten, season: ps.maxUnbeatenSeason ? `Season ${ps.maxUnbeatenSeason}` : "" };
      }
    });

    // 5. Highest Scoring Game
    let highGame = null;
    matches.forEach(m => {
      const total = m.homeScore + m.awayScore;
      if (!highGame || total > highGame.total) {
        highGame = { ...m, total };
      }
    });
    let highGameText = "—";
    let highGameMeta = "";
    if (highGame) {
      highGameText = `${highGame.homePlayer} ${highGame.homeScore}-${highGame.awayScore} ${highGame.awayPlayer}`;
      highGameMeta = `${highGame.total} goals · Season ${highGame.seasonId} · MD ${highGame.matchday}`;
    }

    // 6. Most Goals in a Season
    const seasonGoals = {};
    matches.forEach(m => {
      if (m.stage && m.stage !== 'league') return;
      const keyHome = `${m.homeId}-${m.seasonId}`;
      const keyAway = `${m.awayId}-${m.seasonId}`;
      seasonGoals[keyHome] = (seasonGoals[keyHome] || 0) + m.homeScore;
      seasonGoals[keyAway] = (seasonGoals[keyAway] || 0) + m.awayScore;
    });
    let maxSeasonGoals = 0;
    let maxSeasonGoalsPlayer = "—";
    let maxSeasonGoalsSeasonId = null;
    Object.entries(seasonGoals).forEach(([key, goals]) => {
      if (goals > maxSeasonGoals) {
        maxSeasonGoals = goals;
        const [playerId, seasonId] = key.split('-');
        const team = teams.find(t => t.id === parseInt(playerId, 10));
        if (team) {
          maxSeasonGoalsPlayer = team.player;
          maxSeasonGoalsSeasonId = parseInt(seasonId, 10);
        }
      }
    });
    const maxSeasonGoalsText = maxSeasonGoals > 0 ? `${maxSeasonGoalsPlayer} (${maxSeasonGoals} goals)` : "—";
    const maxSeasonGoalsMeta = maxSeasonGoalsSeasonId ? `Season ${maxSeasonGoalsSeasonId}` : "";

    // 7. Most Goals (All-Time)
    const allTimeGoals = {};
    matches.forEach(m => {
      allTimeGoals[m.homePlayer] = (allTimeGoals[m.homePlayer] || 0) + m.homeScore;
      allTimeGoals[m.awayPlayer] = (allTimeGoals[m.awayPlayer] || 0) + m.awayScore;
    });
    let maxAllTimeGoals = 0;
    let maxAllTimeGoalsPlayer = "—";
    Object.entries(allTimeGoals).forEach(([player, goals]) => {
      if (goals > maxAllTimeGoals) {
        maxAllTimeGoals = goals;
        maxAllTimeGoalsPlayer = player;
      }
    });
    const maxAllTimeGoalsText = maxAllTimeGoals > 0 ? `${maxAllTimeGoalsPlayer} (${maxAllTimeGoals} goals)` : "—";

    container.innerHTML = `
      <div class="record-card">
        <div class="record-icon">🏆</div>
        <div class="record-label">Most Championships</div>
        <div class="record-holder">${titlesText}</div>
        <div class="record-meta">Championship trophies won</div>
      </div>
      <div class="record-card">
        <div class="record-icon">💥</div>
        <div class="record-label">Biggest Win (All-Time)</div>
        <div class="record-holder">${biggestWinText}</div>
        <div class="record-meta">${biggestWinMeta}</div>
      </div>
      <div class="record-card">
        <div class="record-icon">🔥</div>
        <div class="record-label">Longest Win Streak</div>
        <div class="record-holder">${bestWinStreak.streak > 0 ? `${bestWinStreak.player} (${bestWinStreak.streak} wins)` : '—'}</div>
        <div class="record-meta">${bestWinStreak.season}</div>
      </div>
      <div class="record-card">
        <div class="record-icon">🛡️</div>
        <div class="record-label">Longest Unbeaten Run</div>
        <div class="record-holder">${bestUnbeaten.streak > 0 ? `${bestUnbeaten.player} (${bestUnbeaten.streak} games)` : '—'}</div>
        <div class="record-meta">${bestUnbeaten.season}</div>
      </div>
      <div class="record-card">
        <div class="record-icon">🎯</div>
        <div class="record-label">Highest Scoring Game</div>
        <div class="record-holder">${highGameText}</div>
        <div class="record-meta">${highGameMeta}</div>
      </div>
      <div class="record-card">
        <div class="record-icon">📊</div>
        <div class="record-label">Most Goals in a Season</div>
        <div class="record-holder">${maxSeasonGoalsText}</div>
        <div class="record-meta">${maxSeasonGoalsMeta}</div>
      </div>
      <div class="record-card">
        <div class="record-icon">⚽</div>
        <div class="record-label">Most Goals (All-Time)</div>
        <div class="record-holder">${maxAllTimeGoalsText}</div>
        <div class="record-meta">Career goals across all seasons</div>
      </div>
    `;

    // Populate Roll of Honor and H2H Matrix sections
    populateRecordsSubsections(matches, seasons, teams);

  } catch (err) {
    console.error("Records page error, calculating from current season:", err);
    if (leagueData && leagueData.fixtures && leagueData.teams) {
      const matches = [];
      
      // League matches
      leagueData.fixtures.forEach(md => {
        md.matches.forEach(m => {
          if (m.status === 'completed' && m.homeScore !== null) {
            matches.push({
              homeId: m.home.id, awayId: m.away.id,
              homeScore: m.homeScore, awayScore: m.awayScore,
              homePlayer: m.home.player, awayPlayer: m.away.player,
              homeClub: m.home.club, awayClub: m.away.club,
              seasonId: currentSeasonId || 1, matchday: md.matchday,
              stage: 'league'
            });
          }
        });
      });

      // Cup matches fallback
      if (leagueData.cupFixtures) {
        leagueData.cupFixtures.forEach(md => {
          md.matches.forEach(m => {
            if (m.status === 'completed' && m.homeScore !== null) {
              matches.push({
                homeId: m.home.id, awayId: m.away.id,
                homeScore: m.homeScore, awayScore: m.awayScore,
                homePlayer: m.home.player, awayPlayer: m.away.player,
                homeClub: m.home.club, awayClub: m.away.club,
                seasonId: currentSeasonId || 1, matchday: md.matchday,
                stage: m.stage || md.stage
              });
            }
          });
        });
      }

      // Playoff matches fallback
      if (leagueData.playoffFixtures) {
        leagueData.playoffFixtures.forEach(md => {
          md.matches.forEach(m => {
            if (m.status === 'completed' && m.homeScore !== null) {
              matches.push({
                homeId: m.home.id, awayId: m.away.id,
                homeScore: m.homeScore, awayScore: m.awayScore,
                homePlayer: m.home.player, awayPlayer: m.away.player,
                homeClub: m.home.club, awayClub: m.away.club,
                seasonId: currentSeasonId || 1, matchday: md.matchday,
                stage: m.stage || md.stage
              });
            }
          });
        });
      }

      const teams = leagueData.teams;
      
      if (matches.length === 0) {
        container.innerHTML = `<div class="records-loading">No completed matches in this season yet.</div>`;
        return;
      }

      let biggestWin = null;
      matches.forEach(m => {
        const margin = Math.abs(m.homeScore - m.awayScore);
        if (!biggestWin || margin > biggestWin.margin) {
          biggestWin = { ...m, margin };
        }
      });
      const winner = biggestWin.homeScore > biggestWin.awayScore ? biggestWin.homePlayer : biggestWin.awayPlayer;
      const winnerScore = Math.max(biggestWin.homeScore, biggestWin.awayScore);
      const loser = biggestWin.homeScore > biggestWin.awayScore ? biggestWin.awayPlayer : biggestWin.homePlayer;
      const loserScore = Math.min(biggestWin.homeScore, biggestWin.awayScore);
      const biggestWinText = `${winner} ${winnerScore}-${loserScore} ${loser}`;
      const biggestWinMeta = `Season ${biggestWin.seasonId} · Matchday ${biggestWin.matchday}`;

      const playerStreaks = {};
      teams.forEach(t => {
        playerStreaks[t.id] = { player: t.player, currentWin: 0, maxWin: 0, currentUnbeaten: 0, maxUnbeaten: 0 };
      });
      matches.forEach(m => {
        if (m.stage && m.stage !== 'league') return;
        const home = playerStreaks[m.homeId];
        const away = playerStreaks[m.awayId];
        if (!home || !away) return;
        if (m.homeScore > m.awayScore) {
          home.currentWin++; home.maxWin = Math.max(home.maxWin, home.currentWin);
          home.currentUnbeaten++; home.maxUnbeaten = Math.max(home.maxUnbeaten, home.currentUnbeaten);
          away.currentWin = 0; away.currentUnbeaten = 0;
        } else if (m.homeScore < m.awayScore) {
          away.currentWin++; away.maxWin = Math.max(away.maxWin, away.currentWin);
          away.currentUnbeaten++; away.maxUnbeaten = Math.max(away.maxUnbeaten, away.currentUnbeaten);
          home.currentWin = 0; home.currentUnbeaten = 0;
        } else {
          home.currentWin = 0; home.currentUnbeaten++; home.maxUnbeaten = Math.max(home.maxUnbeaten, home.currentUnbeaten);
          away.currentWin = 0; away.currentUnbeaten++; away.maxUnbeaten = Math.max(away.maxUnbeaten, away.currentUnbeaten);
        }
      });
      let bestWinStreak = { player: "None", streak: 0 };
      let bestUnbeaten = { player: "None", streak: 0 };
      Object.values(playerStreaks).forEach(ps => {
        if (ps.maxWin > bestWinStreak.streak) bestWinStreak = { player: ps.player, streak: ps.maxWin };
        if (ps.maxUnbeaten > bestUnbeaten.streak) bestUnbeaten = { player: ps.player, streak: ps.maxUnbeaten };
      });

      let highGame = null;
      matches.forEach(m => {
        const total = m.homeScore + m.awayScore;
        if (!highGame || total > highGame.total) highGame = { ...m, total };
      });
      const highGameText = `${highGame.homePlayer} ${highGame.homeScore}-${highGame.awayScore} ${highGame.awayPlayer}`;
      const highGameMeta = `${highGame.total} goals · Season ${highGame.seasonId} · MD ${highGame.matchday}`;

      const seasonGoals = {};
      matches.forEach(m => {
        if (m.stage && m.stage !== 'league') return;
        seasonGoals[m.homePlayer] = (seasonGoals[m.homePlayer] || 0) + m.homeScore;
        seasonGoals[m.awayPlayer] = (seasonGoals[m.awayPlayer] || 0) + m.awayScore;
      });
      let maxGoals = 0, maxGoalsPlayer = "—";
      Object.entries(seasonGoals).forEach(([p, g]) => {
        if (g > maxGoals) { maxGoals = g; maxGoalsPlayer = p; }
      });

      container.innerHTML = `
        <div class="record-card">
          <div class="record-icon">🏆</div>
          <div class="record-label">Most Championships</div>
          <div class="record-holder">Calculated cross-season</div>
          <div class="record-meta">Run the full server to view cross-season awards</div>
        </div>
        <div class="record-card">
          <div class="record-icon">💥</div>
          <div class="record-label">Biggest Win (Current Season)</div>
          <div class="record-holder">${biggestWinText}</div>
          <div class="record-meta">${biggestWinMeta}</div>
        </div>
        <div class="record-card">
          <div class="record-icon">🔥</div>
          <div class="record-label">Longest Win Streak</div>
          <div class="record-holder">${bestWinStreak.streak > 0 ? `${bestWinStreak.player} (${bestWinStreak.streak} wins)` : '—'}</div>
          <div class="record-meta">Current Season</div>
        </div>
        <div class="record-card">
          <div class="record-icon">🛡️</div>
          <div class="record-label">Longest Unbeaten Run</div>
          <div class="record-holder">${bestUnbeaten.streak > 0 ? `${bestUnbeaten.player} (${bestUnbeaten.streak} games)` : '—'}</div>
          <div class="record-meta">Current Season</div>
        </div>
        <div class="record-card">
          <div class="record-icon">🎯</div>
          <div class="record-label">Highest Scoring Game</div>
          <div class="record-holder">${highGameText}</div>
          <div class="record-meta">${highGameMeta}</div>
        </div>
        <div class="record-card">
          <div class="record-icon">📊</div>
          <div class="record-label">Most Goals (Current Season)</div>
          <div class="record-holder">${maxGoalsPlayer} (${maxGoals} goals)</div>
          <div class="record-meta">Current Season</div>
        </div>
      `;

      const seasonsMock = [{ id: currentSeasonId || 1, name: leagueData.season || 'Season 1', status: 'active' }];
      populateRecordsSubsections(matches, seasonsMock, teams);
    } else {
      container.innerHTML = `<div class="records-loading text-red-500">Could not load records.</div>`;
    }
  }
}

// ── Records Subsections & H2H Matrix calculation helpers ─────
function populateRecordsSubsections(matches, seasons, teams) {
  // Timeline Roll of Honor
  const timelineContainer = document.getElementById("roll-of-honor-container");
  if (timelineContainer) {
    const completedSeasons = seasons.filter(s => s.status === 'completed');
    if (completedSeasons.length === 0) {
      timelineContainer.innerHTML = `<div class="records-loading">No completed seasons yet. Timeline will activate once a season is completed.</div>`;
    } else {
      let timelineHTML = '';
      completedSeasons.forEach(s => {
        const seasonMatches = matches.filter(m => m.seasonId === s.id);
        const standingsMap = {};
        teams.forEach(t => {
          standingsMap[t.id] = { id: t.id, player: t.player, club: t.club, points: 0, goalsFor: 0, goalsAgainst: 0, wins: 0, draws: 0, losses: 0, played: 0 };
        });

        seasonMatches.forEach(m => {
          if (m.stage && m.stage !== 'league') return;
          const home = standingsMap[m.homeId];
          const away = standingsMap[m.awayId];
          if (!home || !away) return;
          home.played++; away.played++;
          home.goalsFor += m.homeScore; home.goalsAgainst += m.awayScore;
          away.goalsFor += m.awayScore; away.goalsAgainst += m.homeScore;
          if (m.homeScore > m.awayScore) {
            home.wins++; home.points += 3; away.losses++;
          } else if (m.homeScore < m.awayScore) {
            away.wins++; away.points += 3; home.losses++;
          } else {
            home.draws++; away.draws++; home.points += 1; away.points += 1;
          }
        });

        const sortedStandings = Object.values(standingsMap).sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          const gdA = a.goalsFor - a.goalsAgainst;
          const gdB = b.goalsFor - b.goalsAgainst;
          if (gdB !== gdA) return gdB - gdA;
          if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
          return a.player.localeCompare(b.player);
        });

        const champion = sortedStandings[0] || { player: 'TBD', club: '—', points: 0 };

        // Cup Winner
        let cupWinnerName = 'N/A';
        let cupWinnerClub = '';
        const cupFinalMatch = seasonMatches.find(m => m.stage === 'cup_final');
        if (cupFinalMatch) {
          const homeWon = cupFinalMatch.homeScore > cupFinalMatch.awayScore || cupFinalMatch.goldenGoalWinnerId === cupFinalMatch.homeId;
          cupWinnerName = homeWon ? cupFinalMatch.homePlayer : cupFinalMatch.awayPlayer;
          cupWinnerClub = homeWon ? cupFinalMatch.homeClub : cupFinalMatch.awayClub;
        }

        // MVP (Playoffs Winner, fallback to Champion)
        let mvpName = champion.player;
        let mvpClub = champion.club;
        const playoffsFinalMatch = seasonMatches.find(m => m.stage === 'champions_final');
        if (playoffsFinalMatch) {
          const homeWon = playoffsFinalMatch.homeScore > playoffsFinalMatch.awayScore || playoffsFinalMatch.goldenGoalWinnerId === playoffsFinalMatch.homeId;
          mvpName = homeWon ? playoffsFinalMatch.homePlayer : playoffsFinalMatch.awayPlayer;
          mvpClub = homeWon ? playoffsFinalMatch.homeClub : playoffsFinalMatch.awayClub;
        }

        // Golden Boot
        let maxGoals = 0;
        let goldenBootWinners = [];
        Object.values(standingsMap).forEach(t => {
          if (t.goalsFor > maxGoals) {
            maxGoals = t.goalsFor;
            goldenBootWinners = [t];
          } else if (t.goalsFor === maxGoals && maxGoals > 0) {
            goldenBootWinners.push(t);
          }
        });
        const goldenBootName = goldenBootWinners.map(t => t.player).join(' & ') || 'N/A';
        const goldenBootClub = goldenBootWinners.map(t => t.club).join('/') || '';

        timelineHTML += `
          <div class="timeline-item">
            <div class="timeline-marker"></div>
            <div class="timeline-card">
              <div class="timeline-title-row">
                <span class="timeline-season-name">${s.name}</span>
                <span class="timeline-season-status completed">Season Complete</span>
              </div>
              <div class="timeline-laurels-grid">
                <div class="laurel-winner-box">
                  <span class="laurel-trophy">🏆</span>
                  <span class="laurel-role">Champion</span>
                  <span class="laurel-name">${champion.player}</span>
                  <span class="laurel-meta">${champion.club} · ${champion.points} pts</span>
                </div>
                <div class="laurel-winner-box">
                  <span class="laurel-trophy">👑</span>
                  <span class="laurel-role">Cup Winner</span>
                  <span class="laurel-name">${cupWinnerName}</span>
                  <span class="laurel-meta">${cupWinnerClub || 'Ballers Cup'}</span>
                </div>
                <div class="laurel-winner-box">
                  <span class="laurel-trophy">🛡️</span>
                  <span class="laurel-role">MVP (Playoffs)</span>
                  <span class="laurel-name">${mvpName}</span>
                  <span class="laurel-meta">${mvpClub}</span>
                </div>
                <div class="laurel-winner-box">
                  <span class="laurel-trophy">⚽</span>
                  <span class="laurel-role">Golden Boot</span>
                  <span class="laurel-name">${goldenBootName}</span>
                  <span class="laurel-meta">${maxGoals} Goals</span>
                </div>
              </div>
            </div>
          </div>
        `;
      });
      timelineContainer.innerHTML = timelineHTML;
    }
  }

  // H2H Matrix Selectors setup
  const matrixContainer = document.getElementById("h2h-matrix-container");
  if (matrixContainer) {
    const sortedTeams = [...teams].sort((a,b) => a.player.localeCompare(b.player));
    let optionsHTML = '<option value="" disabled selected>Select Player...</option>';
    sortedTeams.forEach(t => {
      optionsHTML += `<option value="${t.id}">${t.player} (${t.club})</option>`;
    });

    matrixContainer.innerHTML = `
      <div class="h2h-matrix-selectors">
        <div class="h2h-matrix-select-group">
          <label for="h2h-player-a">Player A</label>
          <select id="h2h-player-a" class="h2h-matrix-select">
            ${optionsHTML}
          </select>
        </div>
        <div class="h2h-matrix-vs-badge">VS</div>
        <div class="h2h-matrix-select-group">
          <label for="h2h-player-b">Player B</label>
          <select id="h2h-player-b" class="h2h-matrix-select">
            ${optionsHTML}
          </select>
        </div>
      </div>
      <div id="h2h-matrix-results">
        <div class="h2h-empty">Select two players to compare their all-time records.</div>
      </div>
    `;

    const selectA = document.getElementById("h2h-player-a");
    const selectB = document.getElementById("h2h-player-b");

    const handleMatrixChange = () => {
      const valA = parseInt(selectA.value, 10);
      const valB = parseInt(selectB.value, 10);
      if (valA && valB) {
        if (valA === valB) {
          document.getElementById("h2h-matrix-results").innerHTML = `<div class="h2h-error">Select two different players to compare.</div>`;
          return;
        }
        renderH2HMatrixResults(valA, valB, matches, teams);
      }
    };

    selectA.addEventListener("change", handleMatrixChange);
    selectB.addEventListener("change", handleMatrixChange);
  }
}

function renderH2HMatrixResults(playerAId, playerBId, matches, teams) {
  const resultsDiv = document.getElementById("h2h-matrix-results");
  if (!resultsDiv) return;

  const teamA = teams.find(t => t.id === playerAId);
  const teamB = teams.find(t => t.id === playerBId);
  if (!teamA || !teamB) return;

  const logoA = clubLogos[teamA.club];
  const logoB = clubLogos[teamB.club];
  const colorsA = clubColors[teamA.club] || { bg: '#333', text: '#fff' };
  const colorsB = clubColors[teamB.club] || { bg: '#333', text: '#fff' };

  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let goalsA = 0;
  let goalsB = 0;
  const historyLog = [];

  matches.forEach(m => {
    const isMatch = (m.homeId === playerAId && m.awayId === playerBId) ||
                    (m.homeId === playerBId && m.awayId === playerAId);
    if (!isMatch) return;

    const selfHome = m.homeId === playerAId;
    const scoreA = selfHome ? m.homeScore : m.awayScore;
    const scoreB = selfHome ? m.awayScore : m.homeScore;

    goalsA += scoreA;
    goalsB += scoreB;

    let outcome = 'D';
    if (scoreA > scoreB) {
      winsA++;
      outcome = 'W';
    } else if (scoreB > scoreA) {
      winsB++;
      outcome = 'L';
    } else {
      draws++;
    }

    historyLog.push({
      seasonId: m.seasonId,
      matchday: m.matchday,
      stage: m.stage || 'league',
      scoreA,
      scoreB,
      outcome
    });
  });

  const totalPlayed = historyLog.length;
  if (totalPlayed === 0) {
    resultsDiv.innerHTML = `<div class="h2h-empty">No matches played between ${teamA.player} and ${teamB.player} yet.</div>`;
    return;
  }

  const pctA = ((winsA / totalPlayed) * 100).toFixed(0);
  const pctB = ((winsB / totalPlayed) * 100).toFixed(0);
  const pctD = ((draws / totalPlayed) * 100).toFixed(0);

  const splitBar = `
    <div class="h2h-bar-container" style="margin-top: 14px;">
      ${winsA > 0 ? `<div class="h2h-bar home" style="width: ${pctA}%; background: ${colorsA.bg};" title="${teamA.player} wins: ${winsA} (${pctA}%)"></div>` : ''}
      ${draws > 0 ? `<div class="h2h-bar draw" style="width: ${pctD}%" title="Draws: ${draws} (${pctD}%)"></div>` : ''}
      ${winsB > 0 ? `<div class="h2h-bar away" style="width: ${pctB}%; background: ${colorsB.bg};" title="${teamB.player} wins: ${winsB} (${pctB}%)"></div>` : ''}
    </div>
  `;

  // Log rows HTML
  const stageLabels = {
    'league': 'League',
    'cup_r16': 'Cup R16',
    'cup_qf': 'Cup QF',
    'cup_sf': 'Cup SF',
    'cup_final': 'Cup Final',
    'champions_semi_1': 'Playoffs SF Leg 1',
    'champions_semi_2': 'Playoffs SF Leg 2',
    'champions_final': 'Playoffs Final'
  };

  const logRowsHTML = historyLog.map(log => {
    const stageText = stageLabels[log.stage] || log.stage.toUpperCase();
    return `
      <div class="h2h-matrix-log-row">
        <div class="h2h-log-meta">
          <span class="h2h-log-season">Season ${log.seasonId}</span>
          <span class="h2h-log-stage">${stageText} (MD ${log.matchday})</span>
        </div>
        <div class="h2h-log-matchup">
          <span>${teamA.player}</span>
          <span class="h2h-log-score">${log.scoreA} - ${log.scoreB}</span>
          <span>${teamB.player}</span>
        </div>
        <div class="h2h-log-outcome">
          <span class="h2h-outcome-badge ${log.outcome}">${log.outcome}</span>
        </div>
      </div>
    `;
  }).join('');

  resultsDiv.innerHTML = `
    <div class="h2h-matrix-panel">
      <div class="h2h-matrix-scorecard">
        <div class="h2h-scorecard-player">
          <div class="h2h-scorecard-logo" style="background: ${colorsA.bg}; color: ${colorsA.text};">
            ${logoA ? `<img src="${logoA}" alt="${teamA.club}">` : teamA.club.substring(0,3).toUpperCase()}
          </div>
          <span class="h2h-scorecard-name">${teamA.player}</span>
          <span class="h2h-scorecard-club">${teamA.club}</span>
          <span class="h2h-scorecard-wins">${winsA}</span>
          <span class="h2h-scorecard-pct">Win Ratio: ${pctA}%</span>
        </div>
        
        <div class="h2h-scorecard-center">
          <span class="h2h-center-vs">VS</span>
          <span class="h2h-center-agg">${goalsA} - ${goalsB}</span>
          <span class="h2h-center-draws">Draws: <span>${draws}</span></span>
          <span style="font-size:0.6rem; color:var(--text-muted); margin-top:4px;">${totalPlayed} match${totalPlayed === 1 ? '' : 'es'}</span>
        </div>

        <div class="h2h-scorecard-player">
          <div class="h2h-scorecard-logo" style="background: ${colorsB.bg}; color: ${colorsB.text};">
            ${logoB ? `<img src="${logoB}" alt="${teamB.club}">` : teamB.club.substring(0,3).toUpperCase()}
          </div>
          <span class="h2h-scorecard-name">${teamB.player}</span>
          <span class="h2h-scorecard-club">${teamB.club}</span>
          <span class="h2h-scorecard-wins">${winsB}</span>
          <span class="h2h-scorecard-pct">Win Ratio: ${pctB}%</span>
        </div>
      </div>

      ${splitBar}

      <div class="h2h-matrix-log-container">
        <div class="h2h-matrix-log-title">Match History</div>
        <div class="h2h-matrix-log-scroll">
          ${logRowsHTML}
        </div>
      </div>
    </div>
  `;
}

// ── BALLERS CUP RENDERING ─────────────────────────────────────
function renderBallersCup() {
  const container = document.getElementById("cup-container");
  if (!container) return;

  if (!leagueData || !leagueData.cupFixtures || leagueData.cupFixtures.length === 0) {
    container.innerHTML = `
      <div class="records-empty">
        <div style="font-size: 2.5rem; margin-bottom: 12px;">🏆</div>
        <h3>No Cup Matches Yet</h3>
        <p>The Ballers Cup draw has not been generated for this season yet. Draw the first round from the Admin Panel.</p>
      </div>
    `;
    return;
  }

  const cupFixtures = leagueData.cupFixtures;
  const r16Data = cupFixtures.find(f => f.stage === 'cup_r16');
  const qfData  = cupFixtures.find(f => f.stage === 'cup_qf');
  const sfData  = cupFixtures.find(f => f.stage === 'cup_sf');
  const finalData = cupFixtures.find(f => f.stage === 'cup_final');

  // Helper: get winner ID from a match
  const getWinnerId = (m) => {
    if (!m || m.status !== 'completed') return null;
    if (m.homeScore > m.awayScore) return m.home.id;
    if (m.awayScore > m.homeScore) return m.away.id;
    if (m.goldenGoalWinnerId) return m.goldenGoalWinnerId;
    return null;
  };

  // Helper: render a bracket match card
  const renderBracketMatch = (m, isFinal) => {
    if (!m) {
      return `
        <div class="bracket-match bracket-match-tbd">
          <div class="bracket-team bracket-team-tbd">
            <div class="bracket-team-logo">?</div>
            <span class="bracket-team-name">TBD</span>
            <span class="bracket-team-score">—</span>
          </div>
          <div class="bracket-team-divider"></div>
          <div class="bracket-team bracket-team-tbd">
            <div class="bracket-team-logo">?</div>
            <span class="bracket-team-name">TBD</span>
            <span class="bracket-team-score">—</span>
          </div>
        </div>
      `;
    }

    const winnerId = getWinnerId(m);
    const homeWon = winnerId === m.home.id;
    const awayWon = winnerId === m.away.id;
    const completed = m.status === 'completed';

    const homeLogoSrc = clubLogos[m.home.club];
    const awayLogoSrc = clubLogos[m.away.club];
    const homeColors = clubColors[m.home.club] || { bg: "#333", text: "#fff" };
    const awayColors = clubColors[m.away.club] || { bg: "#333", text: "#fff" };

    let ggBadge = '';
    if (completed && m.homeScore === m.awayScore && m.goldenGoalWinnerId) {
      const ggName = m.goldenGoalWinnerId === m.home.id ? m.home.player : m.away.player;
      ggBadge = `<div class="bracket-gg-badge">⚡ Golden Goal: <strong>${ggName}</strong></div>`;
    }

    return `
      <div class="bracket-match ${completed ? 'completed' : ''} ${isFinal ? 'bracket-match-final' : ''}">
        <div class="bracket-team ${completed ? (homeWon ? 'winner' : 'loser') : ''}">
          <div class="bracket-team-logo" style="${!homeLogoSrc ? `background: ${homeColors.bg}; color: ${homeColors.text};` : ''}">
            ${homeLogoSrc ? `<img src="${homeLogoSrc}" alt="${m.home.club}">` : m.home.club.substring(0,3).toUpperCase()}
          </div>
          <span class="bracket-team-name">${m.home.player}</span>
          <span class="bracket-team-score">${completed ? m.homeScore : '—'}</span>
        </div>
        <div class="bracket-team-divider"></div>
        <div class="bracket-team ${completed ? (awayWon ? 'winner' : 'loser') : ''}">
          <div class="bracket-team-logo" style="${!awayLogoSrc ? `background: ${awayColors.bg}; color: ${awayColors.text};` : ''}">
            ${awayLogoSrc ? `<img src="${awayLogoSrc}" alt="${m.away.club}">` : m.away.club.substring(0,3).toUpperCase()}
          </div>
          <span class="bracket-team-name">${m.away.player}</span>
          <span class="bracket-team-score">${completed ? m.awayScore : '—'}</span>
        </div>
        ${ggBadge}
      </div>
    `;
  };

  // Split matches into left/right halves for the bracket
  const r16Matches = r16Data ? r16Data.matches : [];
  const qfMatches  = qfData ? qfData.matches : [];
  const sfMatches  = sfData ? sfData.matches : [];
  const finalMatch = finalData && finalData.matches.length > 0 ? finalData.matches[0] : null;

  // Split R16: first half left, second half right
  const r16Left  = r16Matches.slice(0, 2);
  const r16Right = r16Matches.slice(2, 4);

  // Split QF: first half left, second half right
  const qfLeft  = qfMatches.slice(0, 2);
  const qfRight = qfMatches.slice(2, 4);

  // Split SF: one left, one right
  const sfLeft  = sfMatches[0] || null;
  const sfRight = sfMatches[1] || null;

  // Pad with TBD if rounds haven't been drawn yet
  const padMatches = (arr, count) => {
    const result = [...arr];
    while (result.length < count) result.push(null);
    return result;
  };

  const r16LeftPadded  = padMatches(r16Left, 2);
  const r16RightPadded = padMatches(r16Right, 2);
  const qfLeftPadded   = padMatches(qfLeft, 2);
  const qfRightPadded  = padMatches(qfRight, 2);

  // Build bracket HTML
  let html = `
    <div class="bracket-wrapper">
      <div class="bracket-grid">
        <!-- Left side: R16 → QF → SF -->
        <div class="bracket-column bracket-col-r16-left">
          <div class="bracket-col-label">R16</div>
          ${r16LeftPadded.map(m => renderBracketMatch(m, false)).join('')}
        </div>
        <div class="bracket-column bracket-col-qf-left">
          <div class="bracket-col-label">QF</div>
          ${qfLeftPadded.map(m => renderBracketMatch(m, false)).join('')}
        </div>
        <div class="bracket-column bracket-col-sf-left">
          <div class="bracket-col-label">SF</div>
          ${renderBracketMatch(sfLeft, false)}
        </div>

        <!-- Center: Final + Trophy -->
        <div class="bracket-column bracket-col-final">
          <div class="bracket-col-label">FINAL</div>
          <div class="bracket-trophy">🏆</div>
          ${renderBracketMatch(finalMatch, true)}
        </div>

        <!-- Right side: SF → QF → R16 (mirrored) -->
        <div class="bracket-column bracket-col-sf-right">
          <div class="bracket-col-label">SF</div>
          ${renderBracketMatch(sfRight, false)}
        </div>
        <div class="bracket-column bracket-col-qf-right">
          <div class="bracket-col-label">QF</div>
          ${qfRightPadded.map(m => renderBracketMatch(m, false)).join('')}
        </div>
        <div class="bracket-column bracket-col-r16-right">
          <div class="bracket-col-label">R16</div>
          ${r16RightPadded.map(m => renderBracketMatch(m, false)).join('')}
        </div>
      </div>

      <!-- Bye teams info for R16 -->
      ${r16Data && qfData ? (() => {
        const r16PlayerIds = new Set(r16Matches.flatMap(m => [m.home.id, m.away.id]));
        const byeTeams = (leagueData.teams || []).filter(t => !r16PlayerIds.has(t.id));
        if (byeTeams.length > 0) {
          return `
            <div class="bracket-bye-info">
              <span class="bracket-bye-label">R16 Byes (auto-qualified to QF):</span>
              <div class="bracket-bye-teams">
                ${byeTeams.map(t => {
                  const logoSrc = clubLogos[t.club];
                  const colors = clubColors[t.club] || { bg: '#333', text: '#fff' };
                  return `
                    <div class="bracket-bye-team">
                      <div class="bracket-bye-logo" style="${!logoSrc ? `background: ${colors.bg}; color: ${colors.text};` : ''}">
                        ${logoSrc ? `<img src="${logoSrc}" alt="${t.club}">` : t.club.substring(0,3).toUpperCase()}
                      </div>
                      <span>${t.player}</span>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }
        return '';
      })() : ''}
    </div>
  `;

  container.innerHTML = html;
}


// ── CHAMPIONS CUP RENDERING ───────────────────────────────────
function renderChampionsCup() {
  const container = document.getElementById("champions-container");
  if (!container) return;

  const isLeagueComplete = leagueData && leagueData.fixtures && leagueData.fixtures.every(md => md.matches.every(m => m.status === 'completed'));

  if (!leagueData || !leagueData.playoffFixtures || leagueData.playoffFixtures.length === 0) {
    if (isLeagueComplete) {
      container.innerHTML = `
        <div class="records-empty">
          <div style="font-size: 2.5rem; margin-bottom: 12px;">🏆</div>
          <h3>Regular Season Complete!</h3>
          <p>All league matchdays have been played. The host can now draw the Champions Cup Playoffs from the Admin Panel.</p>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="records-empty">
          <div style="font-size: 2.5rem; margin-bottom: 12px;">🛡️</div>
          <h3>Champions Cup Playoffs</h3>
          <p>The top 4 teams will qualify for the Champions Cup at the end of the regular season.</p>
        </div>
      `;
    }
    return;
  }

  const semi1Data = leagueData.playoffFixtures.find(f => f.stage === 'champions_semi_1');
  const semi2Data = leagueData.playoffFixtures.find(f => f.stage === 'champions_semi_2');
  const finalData = leagueData.playoffFixtures.find(f => f.stage === 'champions_final');

  // Build tie data for each semi-final
  const buildTieData = (teamAId, teamBId, title) => {
    if (!semi1Data || !semi2Data) return null;
    const leg1 = semi1Data.matches.find(m => (m.home.id === teamAId && m.away.id === teamBId) || (m.home.id === teamBId && m.away.id === teamAId));
    const leg2 = semi2Data.matches.find(m => (m.home.id === teamAId && m.away.id === teamBId) || (m.home.id === teamBId && m.away.id === teamAId));
    if (!leg1 || !leg2) return null;

    const teamA = leg2.home.id === teamAId ? leg2.home : leg2.away;
    const teamB = leg2.home.id === teamBId ? leg2.home : leg2.away;

    const scoreA1 = leg1.home.id === teamAId ? leg1.homeScore : leg1.awayScore;
    const scoreB1 = leg1.home.id === teamBId ? leg1.homeScore : leg1.awayScore;
    const scoreA2 = leg2.home.id === teamAId ? leg2.homeScore : leg2.awayScore;
    const scoreB2 = leg2.home.id === teamBId ? leg2.homeScore : leg2.awayScore;

    const played1 = leg1.status === 'completed';
    const played2 = leg2.status === 'completed';
    const totalA = (scoreA1 || 0) + (scoreA2 || 0);
    const totalB = (scoreB1 || 0) + (scoreB2 || 0);

    let winnerId = null;
    let ggWinnerName = null;
    if (played1 && played2) {
      if (totalA > totalB) winnerId = teamAId;
      else if (totalB > totalA) winnerId = teamBId;
      else if (leg2.goldenGoalWinnerId) {
        winnerId = leg2.goldenGoalWinnerId;
        ggWinnerName = winnerId === teamAId ? teamA.player : teamB.player;
      }
    }

    return { teamA, teamB, scoreA1, scoreB1, scoreA2, scoreB2, played1, played2, totalA, totalB, winnerId, ggWinnerName, title };
  };

  // Render a champions tie card (semi-final with 2 legs)
  const renderChampionsTie = (tie) => {
    if (!tie) {
      return `
        <div class="bracket-match bracket-match-tbd">
          <div class="bracket-team bracket-team-tbd">
            <div class="bracket-team-logo">?</div>
            <span class="bracket-team-name">TBD</span>
            <span class="bracket-team-score">—</span>
          </div>
          <div class="bracket-team-divider"></div>
          <div class="bracket-team bracket-team-tbd">
            <div class="bracket-team-logo">?</div>
            <span class="bracket-team-name">TBD</span>
            <span class="bracket-team-score">—</span>
          </div>
        </div>
      `;
    }

    const { teamA, teamB, scoreA1, scoreB1, scoreA2, scoreB2, played1, played2, totalA, totalB, winnerId, ggWinnerName, title } = tie;
    const completed = played1 && played2;

    const logoA = clubLogos[teamA.club];
    const logoB = clubLogos[teamB.club];
    const colorsA = clubColors[teamA.club] || { bg: '#333', text: '#fff' };
    const colorsB = clubColors[teamB.club] || { bg: '#333', text: '#fff' };

    const teamAWon = winnerId === teamA.id;
    const teamBWon = winnerId === teamB.id;

    let ggBadge = '';
    if (ggWinnerName) {
      ggBadge = `<div class="bracket-gg-badge">⚡ Golden Goal: <strong>${ggWinnerName}</strong></div>`;
    }

    return `
      <div class="champions-tie-card ${completed ? 'completed' : ''}">
        <div class="champions-tie-header">${title}</div>
        <div class="champions-tie-body">
          <div class="champions-tie-team ${completed ? (teamAWon ? 'winner' : 'loser') : ''}">
            <div class="bracket-team-logo" style="${!logoA ? `background: ${colorsA.bg}; color: ${colorsA.text};` : ''}">
              ${logoA ? `<img src="${logoA}" alt="${teamA.club}">` : teamA.club.substring(0,3).toUpperCase()}
            </div>
            <span class="bracket-team-name">${teamA.player}</span>
            <div class="champions-leg-scores">
              <span class="champions-leg" title="Leg 1">${played1 ? scoreA1 : '—'}</span>
              <span class="champions-leg" title="Leg 2">${played2 ? scoreA2 : '—'}</span>
            </div>
            <span class="champions-agg">${played1 || played2 ? totalA : '—'}</span>
          </div>
          <div class="bracket-team-divider"></div>
          <div class="champions-tie-team ${completed ? (teamBWon ? 'winner' : 'loser') : ''}">
            <div class="bracket-team-logo" style="${!logoB ? `background: ${colorsB.bg}; color: ${colorsB.text};` : ''}">
              ${logoB ? `<img src="${logoB}" alt="${teamB.club}">` : teamB.club.substring(0,3).toUpperCase()}
            </div>
            <span class="bracket-team-name">${teamB.player}</span>
            <div class="champions-leg-scores">
              <span class="champions-leg" title="Leg 1">${played1 ? scoreB1 : '—'}</span>
              <span class="champions-leg" title="Leg 2">${played2 ? scoreB2 : '—'}</span>
            </div>
            <span class="champions-agg">${played1 || played2 ? totalB : '—'}</span>
          </div>
          ${ggBadge}
        </div>
        <div class="champions-tie-footer">
          <span>L1</span><span>L2</span><span>AGG</span>
        </div>
      </div>
    `;
  };

  // Render champions final match (2 legs)
  const renderChampionsFinal = () => {
    if (!finalData || !finalData.matches || finalData.matches.length === 0) {
      return `
        <div class="bracket-match bracket-match-tbd bracket-match-final">
          <div class="bracket-team bracket-team-tbd">
            <div class="bracket-team-logo">?</div>
            <span class="bracket-team-name">TBD</span>
            <span class="bracket-team-score">—</span>
          </div>
          <div class="bracket-team-divider"></div>
          <div class="bracket-team bracket-team-tbd">
            <div class="bracket-team-logo">?</div>
            <span class="bracket-team-name">TBD</span>
            <span class="bracket-team-score">—</span>
          </div>
        </div>
      `;
    }

    // Champions final is also 2-legged
    const finalMatches = finalData.matches;
    if (finalMatches.length >= 2) {
      const leg1 = finalMatches[0];
      const leg2 = finalMatches[1];
      const teamAId = leg2.home.id;
      const teamBId = leg2.away.id;
      const tie = buildTieData(teamAId, teamBId, '🏆 Champions Cup Final');
      if (tie) {
        return renderChampionsTie(tie);
      }
    }

    // Fallback for single-match final
    const fm = finalMatches[0];
    const completed = fm.status === 'completed';
    const homeLogoSrc = clubLogos[fm.home.club];
    const awayLogoSrc = clubLogos[fm.away.club];
    const homeColors = clubColors[fm.home.club] || { bg: '#333', text: '#fff' };
    const awayColors = clubColors[fm.away.club] || { bg: '#333', text: '#fff' };
    const homeWon = completed && fm.homeScore > fm.awayScore;
    const awayWon = completed && fm.awayScore > fm.homeScore;

    let ggBadge = '';
    if (completed && fm.homeScore === fm.awayScore && fm.goldenGoalWinnerId) {
      const ggName = fm.goldenGoalWinnerId === fm.home.id ? fm.home.player : fm.away.player;
      ggBadge = `<div class="bracket-gg-badge">⚡ Golden Goal: <strong>${ggName}</strong></div>`;
    }

    return `
      <div class="bracket-match bracket-match-final ${completed ? 'completed' : ''}">
        <div class="bracket-team ${completed ? (homeWon ? 'winner' : 'loser') : ''}">
          <div class="bracket-team-logo" style="${!homeLogoSrc ? `background: ${homeColors.bg}; color: ${homeColors.text};` : ''}">
            ${homeLogoSrc ? `<img src="${homeLogoSrc}" alt="${fm.home.club}">` : fm.home.club.substring(0,3).toUpperCase()}
          </div>
          <span class="bracket-team-name">${fm.home.player}</span>
          <span class="bracket-team-score">${completed ? fm.homeScore : '—'}</span>
        </div>
        <div class="bracket-team-divider"></div>
        <div class="bracket-team ${completed ? (awayWon ? 'winner' : 'loser') : ''}">
          <div class="bracket-team-logo" style="${!awayLogoSrc ? `background: ${awayColors.bg}; color: ${awayColors.text};` : ''}">
            ${awayLogoSrc ? `<img src="${awayLogoSrc}" alt="${fm.away.club}">` : fm.away.club.substring(0,3).toUpperCase()}
          </div>
          <span class="bracket-team-name">${fm.away.player}</span>
          <span class="bracket-team-score">${completed ? fm.awayScore : '—'}</span>
        </div>
        ${ggBadge}
      </div>
    `;
  };

  // Build semi-final ties
  let tie1 = null, tie2 = null;
  if (semi1Data && semi2Data) {
    const firstId = semi2Data.matches[0].home.id;
    const fourthId = semi2Data.matches[0].away.id;
    const secondId = semi2Data.matches[1].home.id;
    const thirdId = semi2Data.matches[1].away.id;
    tie1 = buildTieData(firstId, fourthId, 'Semi-final 1 · 1st vs 4th');
    tie2 = buildTieData(secondId, thirdId, 'Semi-final 2 · 2nd vs 3rd');
  }

  const html = `
    <div class="bracket-wrapper champions-bracket-wrapper">
      <div class="champions-bracket-grid">
        <!-- Left: Semi-final 1 -->
        <div class="bracket-column champions-col-sf-left">
          <div class="bracket-col-label">SEMI-FINAL</div>
          ${renderChampionsTie(tie1)}
        </div>

        <!-- Center: Final + Trophy -->
        <div class="bracket-column champions-col-final">
          <div class="bracket-col-label">FINAL</div>
          <div class="bracket-trophy">🏆</div>
          ${renderChampionsFinal()}
        </div>

        <!-- Right: Semi-final 2 -->
        <div class="bracket-column champions-col-sf-right">
          <div class="bracket-col-label">SEMI-FINAL</div>
          ${renderChampionsTie(tie2)}
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}


// ── Player Profiles Modal ─────────────────────────────────────
async function openPlayerProfile(playerId) {
  const profileContent = document.getElementById("profile-content");
  if (!profileContent) return;

  profileContent.innerHTML = `<div class="h2h-loading">Loading player profile...</div>`;
  document.getElementById("player-profile-overlay").style.display = "flex";

  // Calculate local/current season data
  const { standings, lastCompletedMatchday } = computeStandings();
  const currentTeam = standings.find(t => t.id === playerId) || (leagueData && leagueData.teams && leagueData.teams.find(t => t.id === playerId));
  if (!currentTeam) {
    profileContent.innerHTML = `<div class="h2h-error">Player details not found</div>`;
    return;
  }

  const currentSeasonRank = standings.findIndex(t => t.id === playerId) + 1;
  const currentSeasonStats = standings.find(t => t.id === playerId);

  // Compute Win %
  const winPct = currentSeasonStats && currentSeasonStats.played > 0 
    ? ((currentSeasonStats.wins / currentSeasonStats.played) * 100).toFixed(0) 
    : 0;

  // Local calculation of last 10 form, home/away record, and streaks
  const playerMatches = [];
  let homeWins = 0, homeDraws = 0, homeLosses = 0;
  let awayWins = 0, awayDraws = 0, awayLosses = 0;
  let homeGoalsFor = 0, homeGoalsAgainst = 0;
  let awayGoalsFor = 0, awayGoalsAgainst = 0;
  let homePlayed = 0, awayPlayed = 0;
  let cleanSheets = 0;

  if (leagueData && leagueData.fixtures) {
    leagueData.fixtures.forEach(md => {
      md.matches.forEach(m => {
        if (m.status !== 'completed' || m.homeScore === null) return;
        
        // Track home vs away records
        if (m.home.id === playerId) {
          homePlayed++;
          homeGoalsFor += m.homeScore;
          homeGoalsAgainst += m.awayScore;
          if (m.awayScore === 0) cleanSheets++;
          if (m.homeScore > m.awayScore) homeWins++;
          else if (m.homeScore < m.awayScore) homeLosses++;
          else homeDraws++;

          playerMatches.push({
            matchday: md.matchday,
            home: m.home,
            away: m.away,
            homeScore: m.homeScore,
            awayScore: m.awayScore,
            outcome: m.homeScore > m.awayScore ? 'W' : (m.homeScore < m.awayScore ? 'L' : 'D')
          });
        } else if (m.away.id === playerId) {
          awayPlayed++;
          awayGoalsFor += m.awayScore;
          awayGoalsAgainst += m.homeScore;
          if (m.homeScore === 0) cleanSheets++;
          if (m.awayScore > m.homeScore) awayWins++;
          else if (m.awayScore < m.homeScore) awayLosses++;
          else awayDraws++;

          playerMatches.push({
            matchday: md.matchday,
            home: m.home,
            away: m.away,
            homeScore: m.homeScore,
            awayScore: m.awayScore,
            outcome: m.awayScore > m.homeScore ? 'W' : (m.awayScore < m.homeScore ? 'L' : 'D')
          });
        }
      });
    });
  }

  playerMatches.sort((a, b) => a.matchday - b.matchday);
  
  // Calculate streaks
  let maxWinStreak = 0;
  let currentWinStreak = 0;
  let maxUnbeatenStreak = 0;
  let currentUnbeatenStreak = 0;
  let currentStreakType = '';
  let currentStreakLen = 0;

  playerMatches.forEach(pm => {
    const outcome = pm.outcome;
    if (outcome === 'W') {
      currentWinStreak++;
      maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
    } else {
      currentWinStreak = 0;
    }

    if (outcome === 'W' || outcome === 'D') {
      currentUnbeatenStreak++;
      maxUnbeatenStreak = Math.max(maxUnbeatenStreak, currentUnbeatenStreak);
    } else {
      currentUnbeatenStreak = 0;
    }

    if (currentStreakType === '') {
      currentStreakType = outcome;
      currentStreakLen = 1;
    } else if (currentStreakType === outcome) {
      currentStreakLen++;
    } else {
      currentStreakType = outcome;
      currentStreakLen = 1;
    }
  });

  const last10Matches = playerMatches.slice(-10);
  const last10Dots = last10Matches.map(m => {
    const res = m.outcome;
    const cls = res === 'W' ? 'win' : (res === 'L' ? 'loss' : 'draw');
    return `<span class="form-dot ${cls}" title="${res}"></span>`;
  }).join("");

  const photoUrl = currentTeam.photoUrl || currentTeam.photo_url;
  const logoSrc = clubLogos[currentTeam.club];
  const logoHTML = photoUrl
    ? `<img src="${photoUrl}" alt="${currentTeam.player}" class="profile-logo-img" style="object-fit: cover; border-radius: 50%;">`
    : (logoSrc
      ? `<img src="${logoSrc}" alt="${currentTeam.club}" class="profile-logo-img">`
      : `<span class="profile-logo-fallback">${clubShort[currentTeam.club] || currentTeam.club.substring(0,3).toUpperCase()}</span>`);

  // Fetch cross-season records data if available
  let recordsData = null;
  try {
    const res = await fetch("/api/records");
    if (res.ok) {
      recordsData = await res.json();
    }
  } catch (e) {
    console.error("Failed to fetch player profile cross-season history", e);
  }

  // 1. Standings Progression Chart SVG
  const ranksList = [];
  const labelsList = [];
  if (lastCompletedMatchday > 0) {
    for (let m = 1; m <= lastCompletedMatchday; m++) {
      const standingsAtM = computeStandingsUpToMatchday(m);
      const rIdx = standingsAtM.findIndex(t => t.id === playerId);
      if (rIdx >= 0) {
        ranksList.push(rIdx + 1);
        labelsList.push(`MD${m}`);
      }
    }
  }

  let chartHTML = '';
  if (ranksList.length > 0) {
    const width = 420;
    const height = 150;
    const paddingLeft = 30;
    const paddingRight = 15;
    const paddingTop = 15;
    const paddingBottom = 20;
    const totalTeams = (leagueData && leagueData.teams && leagueData.teams.length) || 12;

    let drawRanks = [...ranksList];
    let drawLabels = [...labelsList];
    if (drawRanks.length === 1) {
      drawRanks.push(drawRanks[0]);
      drawLabels.push(drawLabels[0]);
    }

    const M = drawRanks.length;
    const points = [];
    for (let i = 0; i < M; i++) {
      const x = paddingLeft + (i / (M - 1)) * (width - paddingLeft - paddingRight);
      const y = paddingTop + ((drawRanks[i] - 1) / (totalTeams - 1)) * (height - paddingTop - paddingBottom);
      points.push({ x, y, rank: drawRanks[i] });
    }

    const midRank = Math.round((totalTeams + 1) / 2);
    const gridRanks = [1, midRank, totalTeams];
    let gridHTML = '';
    gridRanks.forEach(r => {
      const y = paddingTop + ((r - 1) / (totalTeams - 1)) * (height - paddingTop - paddingBottom);
      gridHTML += `
        <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" class="chart-grid-line ${r === 1 ? 'chart-grid-line-highlight' : ''}" />
        <text x="${paddingLeft - 6}" y="${y}" class="chart-axis-text ${r === 1 ? 'chart-axis-text-highlight' : ''}" text-anchor="end" dominant-baseline="central">#${r}</text>
      `;
    });

    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      pathD += ` L ${points[i].x} ${points[i].y}`;
    }

    let dotsHTML = '';
    const pointsToShow = ranksList.length === 1 ? [points[0]] : points;
    pointsToShow.forEach((p, idx) => {
      const isLast = idx === pointsToShow.length - 1;
      dotsHTML += `
        <g class="chart-dot-group" transform="translate(${p.x}, ${p.y})">
          <circle r="${isLast ? 6 : 5}" class="chart-dot-bg ${isLast ? 'chart-dot-bg-active' : ''}" />
          <text class="chart-dot-text ${isLast ? '' : 'chart-dot-text-dark'}" style="font-size: ${isLast ? '7.5px' : '6.5px'}">${p.rank}</text>
          <title>Matchday ${idx + 1}: Rank #${p.rank}</title>
        </g>
      `;
    });

    let xLabelsHTML = '';
    const labelIndices = [0];
    if (ranksList.length > 2) labelIndices.push(Math.floor((ranksList.length - 1) / 2));
    if (ranksList.length > 1) labelIndices.push(ranksList.length - 1);
    const uniqueIndices = [...new Set(labelIndices)];
    uniqueIndices.forEach(idx => {
      if (idx < pointsToShow.length) {
        xLabelsHTML += `<text x="${pointsToShow[idx].x}" y="${height - 4}" class="chart-axis-text" text-anchor="middle">MD ${idx + 1}</text>`;
      }
    });

    chartHTML = `
      <div class="progression-chart-wrapper">
        <div style="font-family: var(--font-display); font-size: 0.65rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Standings Progression</div>
        <svg viewBox="0 0 ${width} ${height}" width="100%" height="auto">
          ${gridHTML}
          <path d="${pathD}" class="chart-line-path" />
          ${dotsHTML}
          ${xLabelsHTML}
        </svg>
      </div>
    `;
  }

  // 2. Trophy Cabinet Shelf
  const trophies = [];
  if (recordsData && recordsData.seasons) {
    recordsData.seasons.forEach(s => {
      if (s.status !== 'completed') return;

      const seasonMatches = recordsData.matches.filter(m => m.seasonId === s.id);
      const standingsMap = {};
      recordsData.teams.forEach(t => {
        standingsMap[t.id] = { id: t.id, player: t.player, club: t.club, points: 0, goalsFor: 0, goalsAgainst: 0, wins: 0, draws: 0, losses: 0, played: 0 };
      });

      seasonMatches.forEach(m => {
        if (m.stage && m.stage !== 'league') return;
        const home = standingsMap[m.homeId];
        const away = standingsMap[m.awayId];
        if (!home || !away) return;
        home.played++; away.played++;
        home.goalsFor += m.homeScore; home.goalsAgainst += m.awayScore;
        away.goalsFor += m.awayScore; away.goalsAgainst += m.homeScore;
        if (m.homeScore > m.awayScore) {
          home.wins++; home.points += 3; away.losses++;
        } else if (m.homeScore < m.awayScore) {
          away.wins++; away.points += 3; home.losses++;
        } else {
          home.draws++; away.draws++; home.points += 1; away.points += 1;
        }
      });

      const sorted = Object.values(standingsMap).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const gdA = a.goalsFor - a.goalsAgainst;
        const gdB = b.goalsFor - b.goalsAgainst;
        if (gdB !== gdA) return gdB - gdA;
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        return a.player.localeCompare(b.player);
      });

      if (sorted.length > 0 && sorted[0].id === playerId) {
        trophies.push({ icon: '🏆', label: 'Champion', season: s.name, details: `Finished 1st (${sorted[0].points} pts)` });
      } else if (sorted.length > 1 && sorted[1].id === playerId) {
        trophies.push({ icon: '🥈', label: 'Silver Medal', season: s.name, details: `Finished 2nd (${sorted[1].points} pts)` });
      }

      const cupFinalMatch = seasonMatches.find(m => m.stage === 'cup_final');
      if (cupFinalMatch) {
        const homeWon = cupFinalMatch.homeScore > cupFinalMatch.awayScore || cupFinalMatch.goldenGoalWinnerId === cupFinalMatch.homeId;
        const awayWon = cupFinalMatch.awayScore > cupFinalMatch.homeScore || cupFinalMatch.goldenGoalWinnerId === cupFinalMatch.awayId;
        const selfHome = cupFinalMatch.homeId === playerId;
        const selfAway = cupFinalMatch.awayId === playerId;
        if ((selfHome && homeWon) || (selfAway && awayWon)) {
          trophies.push({ icon: '👑', label: 'Cup Winner', season: s.name, details: `Won Cup Final vs ${selfHome ? cupFinalMatch.awayPlayer : cupFinalMatch.homePlayer}` });
        } else if (selfHome || selfAway) {
          trophies.push({ icon: '🥈', label: 'Cup Silver', season: s.name, details: `Reached Cup Final` });
        }
      }

      const championsFinalMatch = seasonMatches.find(m => m.stage === 'champions_final');
      if (championsFinalMatch) {
        const homeWon = championsFinalMatch.homeScore > championsFinalMatch.awayScore || championsFinalMatch.goldenGoalWinnerId === championsFinalMatch.homeId;
        const awayWon = championsFinalMatch.awayScore > championsFinalMatch.homeScore || championsFinalMatch.goldenGoalWinnerId === championsFinalMatch.awayId;
        const selfHome = championsFinalMatch.homeId === playerId;
        const selfAway = championsFinalMatch.awayId === playerId;
        if ((selfHome && homeWon) || (selfAway && awayWon)) {
          trophies.push({ icon: '🛡️', label: 'Champions Cup', season: s.name, details: `Won Playoffs Final vs ${selfHome ? championsFinalMatch.awayPlayer : championsFinalMatch.homePlayer}` });
        } else if (selfHome || selfAway) {
          trophies.push({ icon: '🥈', label: 'Playoffs Silver', season: s.name, details: `Reached Playoffs Final` });
        }
      }
    });
  }

  let trophiesHTML = '';
  if (trophies.length > 0) {
    trophiesHTML = trophies.map(t => `
      <div class="trophy-item">
        <span class="trophy-icon-badge">${t.icon}</span>
        <span class="trophy-label">${t.label}</span>
        <div class="trophy-tooltip">
          <strong>${t.label}</strong><br>
          ${t.season} &middot; ${t.details}
        </div>
      </div>
    `).join('');
  } else {
    trophiesHTML = `<div class="trophy-empty-msg">No trophies won yet. Keep playing to earn trophies!</div>`;
  }

  const trophyCabinetSection = `
    <div class="trophy-shelf-wrapper">
      <div style="font-family: var(--font-display); font-size: 0.65rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">🏆 Trophy Cabinet</div>
      <div class="trophy-shelf">
        ${trophiesHTML}
      </div>
    </div>
  `;

  // 3. Home vs Away Records & Clean Sheets
  const totalPlayed = homePlayed + awayPlayed;
  const avgGoalsScored = totalPlayed > 0 ? ((homeGoalsFor + awayGoalsFor) / totalPlayed).toFixed(2) : '0.00';
  const avgGoalsConceded = totalPlayed > 0 ? ((homeGoalsAgainst + awayGoalsAgainst) / totalPlayed).toFixed(2) : '0.00';

  const buildRatioBar = (w, d, l) => {
    const total = w + d + l;
    if (total === 0) {
      return `<div class="record-ratio-bar"><div style="width: 100%; text-align: center; font-size: 0.6rem; color: var(--text-muted); line-height: 6px;">No games played</div></div>`;
    }
    const wp = (w / total) * 100;
    const dp = (d / total) * 100;
    const lp = (l / total) * 100;
    return `
      <div class="record-ratio-bar">
        ${w > 0 ? `<div class="ratio-win" style="width: ${wp}%" title="Wins: ${w}"></div>` : ''}
        ${d > 0 ? `<div class="ratio-draw" style="width: ${dp}%" title="Draws: ${d}"></div>` : ''}
        ${l > 0 ? `<div class="ratio-loss" style="width: ${lp}%" title="Losses: ${l}"></div>` : ''}
      </div>
    `;
  };

  const homeAwaySection = `
    <div class="home-away-records">
      <div style="font-family: var(--font-display); font-size: 0.65rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Home vs Away Record</div>
      <div class="record-split-row">
        <div class="record-split-header">
          <span class="record-split-title">🏠 Home Record</span>
          <span class="record-split-numbers">${homeWins}W - ${homeDraws}D - ${homeLosses}L</span>
        </div>
        ${buildRatioBar(homeWins, homeDraws, homeLosses)}
      </div>
      <div class="record-split-row">
        <div class="record-split-header">
          <span class="record-split-title">✈️ Away Record</span>
          <span class="record-split-numbers">${awayWins}W - ${awayDraws}D - ${awayLosses}L</span>
        </div>
        ${buildRatioBar(awayWins, awayDraws, awayLosses)}
      </div>
    </div>
  `;

  // Streaks grid
  let streakValue = 'None';
  if (currentStreakLen > 0) {
    streakValue = `${currentStreakLen} ${currentStreakType === 'W' ? 'Win' : (currentStreakType === 'L' ? 'Loss' : 'Draw')}${currentStreakLen > 1 ? 's' : ''}`;
  }

  const streaksSection = `
    <div class="form-streaks-grid">
      <div class="streak-card">
        <span class="streak-card-label">🔥 Current Streak</span>
        <span class="streak-card-value">${streakValue}</span>
        <span class="streak-card-sub">Active continuous streak</span>
      </div>
      <div class="streak-card">
        <span class="streak-card-label">🛡️ Clean Sheets</span>
        <span class="streak-card-value">${cleanSheets}</span>
        <span class="streak-card-sub">${totalPlayed > 0 ? ((cleanSheets / totalPlayed) * 100).toFixed(0) : 0}% clean sheet ratio</span>
      </div>
      <div class="streak-card">
        <span class="streak-card-label">⚡ Longest Win Streak</span>
        <span class="streak-card-value">${maxWinStreak} Match${maxWinStreak === 1 ? '' : 'es'}</span>
        <span class="streak-card-sub">All-time consecutive wins</span>
      </div>
      <div class="streak-card">
        <span class="streak-card-label">🏆 Longest Unbeaten</span>
        <span class="streak-card-value">${maxUnbeatenStreak} Match${maxUnbeatenStreak === 1 ? '' : 'es'}</span>
        <span class="streak-card-sub">All-time consecutive W/D</span>
      </div>
    </div>
  `;

  // 4. Season-by-season rows
  let historyRowsHTML = "";
  if (recordsData && recordsData.seasons) {
    recordsData.seasons.forEach(s => {
      const seasonMatches = recordsData.matches.filter(m => m.seasonId === s.id);
      const standingsMap = {};
      recordsData.teams.forEach(t => {
        standingsMap[t.id] = { id: t.id, player: t.player, club: t.club, points: 0, goalsFor: 0, goalsAgainst: 0, wins: 0, draws: 0, losses: 0, played: 0 };
      });
      seasonMatches.forEach(m => {
        if (m.stage && m.stage !== 'league') return;
        const home = standingsMap[m.homeId];
        const away = standingsMap[m.awayId];
        if (!home || !away) return;
        home.played++; away.played++;
        home.goalsFor += m.homeScore; home.goalsAgainst += m.awayScore;
        away.goalsFor += m.awayScore; away.goalsAgainst += m.homeScore;
        if (m.homeScore > m.awayScore) {
          home.wins++; home.points += 3; away.losses++;
        } else if (m.homeScore < m.awayScore) {
          away.wins++; away.points += 3; home.losses++;
        } else {
          home.draws++; away.draws++; home.points += 1; away.points += 1;
        }
      });
      const sorted = Object.values(standingsMap).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const gdA = a.goalsFor - a.goalsAgainst;
        const gdB = b.goalsFor - b.goalsAgainst;
        if (gdB !== gdA) return gdB - gdA;
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        return a.player.localeCompare(b.player);
      });

      const playerIdx = sorted.findIndex(t => t.id === playerId);
      if (playerIdx >= 0) {
        const playerStat = sorted[playerIdx];
        const rank = playerIdx + 1;
        const recordStr = `${playerStat.wins}-${playerStat.draws}-${playerStat.losses}`;
        const isCurrent = s.id === (leagueData && leagueData.seasonId);
        historyRowsHTML += `
          <tr class="${isCurrent ? 'current-season-row' : ''}">
            <td>${s.name} ${isCurrent ? '<span class="current-tag">Active</span>' : ''}</td>
            <td>${playerStat.club}</td>
            <td class="text-center font-bold">${rank}</td>
            <td class="text-center">${playerStat.points}</td>
            <td class="text-center text-muted">${recordStr}</td>
          </tr>
        `;
      }
    });
  }

  const historySection = historyRowsHTML ? `
    <div class="profile-section">
      <div class="profile-section-title">📊 Season History</div>
      <div class="profile-history-table-wrapper">
        <table class="profile-history-table">
          <thead>
            <tr>
              <th>Season</th>
              <th>Club</th>
              <th class="text-center">Rank</th>
              <th class="text-center">Pts</th>
              <th class="text-center">W-D-L</th>
            </tr>
          </thead>
          <tbody>
            ${historyRowsHTML}
          </tbody>
        </table>
      </div>
    </div>
  ` : "";

  // 5. Rivals cross-season
  let rivalsHTML = "";
  if (recordsData && recordsData.matches) {
    const opponentStats = {};
    recordsData.matches.forEach(m => {
      if (m.homeId !== playerId && m.awayId !== playerId) return;
      const isHome = m.homeId === playerId;
      const oppId = isHome ? m.awayId : m.homeId;
      const oppPlayer = isHome ? m.awayPlayer : m.homePlayer;
      const oppClub = isHome ? m.awayClub : m.homeClub;
      
      if (!opponentStats[oppId]) {
        opponentStats[oppId] = { id: oppId, name: oppPlayer, club: oppClub, played: 0, wins: 0, draws: 0, losses: 0 };
      }
      const stat = opponentStats[oppId];
      stat.played++;
      
      const selfScore = isHome ? m.homeScore : m.awayScore;
      const oppScore = isHome ? m.awayScore : m.homeScore;
      if (selfScore > oppScore) stat.wins++;
      else if (selfScore < oppScore) stat.losses++;
      else stat.draws++;
    });

    const rivals = Object.values(opponentStats)
      .sort((a, b) => b.played - a.played || b.wins - a.wins)
      .slice(0, 3);

    rivalsHTML = rivals.map(rival => {
      return `
        <div class="profile-rival-card">
          <div class="rival-info">
            <span class="profile-rival-name">${rival.name}</span>
            <span class="profile-rival-club text-muted font-normal block text-xs" style="font-size:0.65rem;">${rival.club}</span>
          </div>
          <div class="rival-stats text-right" style="display:flex; flex-direction:column; align-items:flex-end;">
            <span class="profile-rival-h2h">${rival.wins}W - ${rival.draws}D - ${rival.losses}L</span>
            <span class="block text-xxs text-muted mt-1" style="font-size:0.6rem; margin-top:2px;">${rival.played} meeting${rival.played === 1 ? '' : 's'}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  const rivalsSection = rivalsHTML ? `
    <div class="profile-section mt-4">
      <div class="profile-section-title">⚔️ Top Rivals</div>
      <div class="profile-rivals" style="display:flex; flex-direction:column; gap:8px;">
        ${rivalsHTML}
      </div>
    </div>
  ` : "";

  // Calculate gaming card ratings
  const ppg = currentSeasonStats && currentSeasonStats.played > 0 ? (currentSeasonStats.points / currentSeasonStats.played) : 0;
  const ovr = currentSeasonStats && currentSeasonStats.played > 0 ? Math.max(60, Math.min(99, Math.round(60 + (ppg / 3.0) * 39))) : 60;
  const gfg = currentSeasonStats && currentSeasonStats.played > 0 ? (currentSeasonStats.goalsFor / currentSeasonStats.played) : 0;
  const att = currentSeasonStats && currentSeasonStats.played > 0 ? Math.max(60, Math.min(99, Math.round(60 + (gfg / 3.5) * 39))) : 60;
  const gag = currentSeasonStats && currentSeasonStats.played > 0 ? (currentSeasonStats.goalsAgainst / currentSeasonStats.played) : 0;
  const def = currentSeasonStats && currentSeasonStats.played > 0 ? Math.max(50, Math.min(99, Math.round(99 - (gag / 3.5) * 39))) : 60;

  const recentFormArray = currentSeasonStats ? currentSeasonStats.form : [];
  let formScore = 0;
  if (recentFormArray.length > 0) {
    let sum = 0;
    recentFormArray.forEach(r => {
      if (r === 'W') sum += 20;
      else if (r === 'D') sum += 10;
      else if (r === 'L') sum += 5;
    });
    formScore = (sum / recentFormArray.length) * 5;
  } else {
    formScore = 25;
  }

  const str = Math.max(60, Math.min(99, Math.round(60 + ((formScore - 25) / 75) * 39)));

  let cardAvatarHTML = photoUrl
    ? `<img src="${photoUrl}" alt="${currentTeam.player}" class="card-avatar-img">`
    : `<svg class="card-avatar-svg" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="7" r="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  let cardClubLogoHTML = logoSrc
    ? `<img src="${logoSrc}" alt="${currentTeam.club}" class="card-club-img">`
    : `<span class="card-club-fallback">${clubShort[currentTeam.club] || currentTeam.club.substring(0,3).toUpperCase()}</span>`;

  profileContent.innerHTML = `
    <div class="manager-card-wrapper">
      <div class="manager-card">
        <div class="holographic-shine"></div>
        <div class="card-top">
          <div class="card-meta">
            <div class="card-ovr">${ovr}</div>
            <div class="card-position">MGR</div>
            <div class="card-club-logo">
              ${cardClubLogoHTML}
            </div>
          </div>
          <div class="card-avatar">
            ${cardAvatarHTML}
          </div>
        </div>
        <div class="card-bottom">
          <div class="card-name">${currentTeam.player}</div>
          <div class="card-divider"></div>
          <div class="card-stats-grid">
            <div class="card-stat">
              <span class="card-stat-val">${att}</span>
              <span class="card-stat-lbl">ATT</span>
            </div>
            <div class="card-stat">
              <span class="card-stat-val">${def}</span>
              <span class="card-stat-lbl">DEF</span>
            </div>
            <div class="card-stat">
              <span class="card-stat-val">${str}</span>
              <span class="card-stat-lbl">STR</span>
            </div>
            <div class="card-stat">
              <span class="card-stat-val">${currentSeasonStats ? currentSeasonStats.points : 0}</span>
              <span class="card-stat-lbl">PTS</span>
            </div>
          </div>
          <div class="card-footer-info">
            <span>PPG: ${ppg.toFixed(2)}</span>
            <span>RANK: #${currentSeasonRank > 0 ? currentSeasonRank : '—'}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Trophy Cabinet shelf -->
    ${trophyCabinetSection}

    <!-- SVG Progression Chart -->
    ${chartHTML}

    <!-- Home/Away Split Records -->
    ${homeAwaySection}

    <!-- Streaks Grid -->
    ${streaksSection}

    <div class="profile-section">
      <div class="profile-section-title">📈 Recent Form (Last 10)</div>
      <div class="profile-form-chart">
        <div class="profile-chart-bar" style="display:flex; gap:6px; align-items:center;">
          ${last10Dots.length > 0 ? last10Dots : '<span class="text-muted text-xs">No matches played yet</span>'}
        </div>
      </div>
    </div>

    ${historySection}
    ${rivalsSection}
  `;
}

function closePlayerProfile(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("player-profile-overlay").style.display = "none";
}

// ── Silent Real-time Refresh & Polling ─────────────────────────
function setupSilentRefresh() {
  // Listen for visibility state change to refresh data immediately when user switches tabs back
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshLeagueDataSilent();
    }
  });

  // Set up repeating interval to refresh data silently every 15 seconds
  setInterval(refreshLeagueDataSilent, 15000);
}

async function refreshLeagueDataSilent() {
  if (!leagueData || !currentSeasonId) return;
  if (document.hidden) return; // Guard: do not poll in background tabs

  try {
    const res = await fetch(`/api/data?season=${currentSeasonId}&_t=${Date.now()}`);
    if (!res.ok) throw new Error("Silent refresh fetch failed");
    const freshData = await res.json();

    // Check if dynamic data (fixtures state or team stats) actually changed before re-rendering
    const fixturesChanged = JSON.stringify(freshData.fixtures) !== JSON.stringify(leagueData.fixtures);
    const teamsChanged = JSON.stringify(freshData.teams) !== JSON.stringify(leagueData.teams);
    const headlineChanged = freshData.headline !== leagueData.headline;

    if (fixturesChanged || teamsChanged || headlineChanged) {
      leagueData = freshData;
      cachedRecordsData = null; // Clear records cache when fixtures/teams change
      
      // Determine which page is currently active and only re-render relevant components to optimize performance
      const activePage = document.querySelector(".page.active");
      const activeId = activePage ? activePage.id : "";

      if (activeId === "page-standings") {
        renderStandings();
      } else if (activeId === "page-fixtures") {
        renderFixtures();
      } else if (activeId === "page-stats") {
        renderStats();
      }

      // Always update ticker and news marquee as they are global header elements
      renderLiveTicker();
      renderNewsMarquee();
    }
  } catch (err) {
    console.error("Silent refresh error:", err);
  }
}

// ── End-of-Season Awards Showcase ──────────────────────────────
async function renderAwards(standings) {
  const container = document.getElementById("standings-awards");
  if (!container) return;

  if (!leagueData || !leagueData.seasons || standings.length === 0) {
    container.style.display = "none";
    return;
  }

  // A season is considered completed if marked "completed" OR if all matches are completed
  const currentSeasonObj = leagueData.seasons.find(s => s.id === currentSeasonId);
  const isSeasonMarkedCompleted = currentSeasonObj && currentSeasonObj.status === 'completed';
  const allMatchesCompleted = leagueData.fixtures.length > 0 && leagueData.fixtures.every(md => md.matches.every(m => m.status === 'completed'));

  if (!isSeasonMarkedCompleted && !allMatchesCompleted) {
    container.style.display = "none";
    return;
  }

  container.style.display = "block";
  container.innerHTML = `<div class="h2h-loading">Calculating season awards...</div>`;

  // 1. Champion
  const champion = standings[0];

  // 2. Golden Boot
  const maxGoals = Math.max(...standings.map(s => s.goalsFor));
  const goldenBootWinners = standings.filter(s => s.goalsFor === maxGoals).map(s => s.player);
  const goldenBootText = goldenBootWinners.join(" & ");

  // 3. Best Defence
  const minConceded = Math.min(...standings.map(s => s.goalsAgainst));
  const bestDefenceWinners = standings.filter(s => s.goalsAgainst === minConceded).map(s => s.player);
  const bestDefenceText = bestDefenceWinners.join(" & ");

  // 4. Streak King (win streak within the current season)
  const playerStreaks = {};
  standings.forEach(t => {
    playerStreaks[t.id] = { current: 0, max: 0, player: t.player };
  });

  const seasonMatches = [];
  leagueData.fixtures.forEach(md => {
    md.matches.forEach(m => {
      if (m.status === 'completed' && m.homeScore !== null) {
        seasonMatches.push(m);
      }
    });
  });

  seasonMatches.forEach(m => {
    const home = playerStreaks[m.home.id];
    const away = playerStreaks[m.away.id];
    if (!home || !away) return;

    if (m.homeScore > m.awayScore) {
      home.current++;
      home.max = Math.max(home.max, home.current);
      away.current = 0;
    } else if (m.homeScore < m.awayScore) {
      away.current++;
      away.max = Math.max(away.max, away.current);
      home.current = 0;
    } else {
      home.current = 0;
      away.current = 0;
    }
  });

  let maxStreak = 0;
  let streakKingWinners = [];
  Object.values(playerStreaks).forEach(ps => {
    if (ps.max > maxStreak) {
      maxStreak = ps.max;
      streakKingWinners = [ps.player];
    } else if (ps.max === maxStreak && maxStreak > 0) {
      streakKingWinners.push(ps.player);
    }
  });
  const streakKingText = maxStreak > 0 ? `${streakKingWinners.join(" & ")} (${maxStreak} wins)` : "—";

  // 5. Most Improved (climb from previous season)
  let mostImprovedText = "N/A (Season 1)";
  if (currentSeasonId > 1) {
    try {
      let recData;
      if (cachedRecordsData) {
        recData = cachedRecordsData;
      } else {
        if (!recordsFetchPromise) {
          recordsFetchPromise = fetch(`/api/records?_t=${Date.now()}`).then(r => {
            if (!r.ok) throw new Error("Records fetch failed");
            return r.json();
          }).then(data => {
            cachedRecordsData = data;
            recordsFetchPromise = null;
            return data;
          }).catch(err => {
            recordsFetchPromise = null;
            throw err;
          });
        }
        recData = await recordsFetchPromise;
      }
      if (recData) {
        const prevStandings = computeSeasonStandingsHelper(recData.matches, recData.teams, currentSeasonId - 1);
        const currStandings = computeSeasonStandingsHelper(recData.matches, recData.teams, currentSeasonId);

        let maxClimb = -99;
        let maxClimbWinners = [];

        currStandings.forEach((currTeam, currIdx) => {
          const prevIdx = prevStandings.findIndex(p => p.id === currTeam.id);
          if (prevIdx >= 0) {
            const climb = prevIdx - currIdx;
            if (climb > maxClimb) {
              maxClimb = climb;
              maxClimbWinners = [currTeam.player];
            } else if (climb === maxClimb && climb > 0) {
              maxClimbWinners.push(currTeam.player);
            }
          }
        });

        if (maxClimb > 0) {
          mostImprovedText = `${maxClimbWinners.join(" & ")} (+${maxClimb} pos)`;
        } else {
          mostImprovedText = "No climbers";
        }
      }
    } catch (e) {
      console.error("Failed to compute Most Improved award:", e);
    }
  }

  container.innerHTML = `
    <div class="awards-title">🏆 Season Awards Showcase</div>
    <div class="awards-grid">
      <div class="award-card champion">
        <div class="award-trophy">🏆</div>
        <div class="award-label">Champion</div>
        <div class="award-winner">${champion.player}</div>
        <div class="award-meta">${champion.club} · ${champion.points} pts</div>
      </div>
      <div class="award-card boot">
        <div class="award-trophy">⚽</div>
        <div class="award-label">Golden Boot</div>
        <div class="award-winner">${goldenBootText}</div>
        <div class="award-meta">${maxGoals} goals</div>
      </div>
      <div class="award-card glove">
        <div class="award-trophy">🧤</div>
        <div class="award-label">Best Defence</div>
        <div class="award-winner">${bestDefenceText}</div>
        <div class="award-meta">${minConceded} conceded</div>
      </div>
      <div class="award-card streak">
        <div class="award-trophy">🔥</div>
        <div class="award-label">Streak King</div>
        <div class="award-winner">${streakKingText}</div>
        <div class="award-meta">Consecutive wins</div>
      </div>
      <div class="award-card improved">
        <div class="award-trophy">📈</div>
        <div class="award-label">Most Improved</div>
        <div class="award-winner">${mostImprovedText}</div>
        <div class="award-meta">Standings climb</div>
      </div>
    </div>
  `;
}

function computeSeasonStandingsHelper(allMatches, teams, seasonId) {
  const seasonMatches = allMatches.filter(m => m.seasonId === seasonId);
  const standings = {};
  teams.forEach(t => {
    standings[t.id] = { id: t.id, player: t.player, club: t.club, points: 0, goalsFor: 0, goalsAgainst: 0, wins: 0, losses: 0, draws: 0, played: 0 };
  });
  seasonMatches.forEach(m => {
    const home = standings[m.homeId];
    const away = standings[m.awayId];
    if (!home || !away) return;
    home.played++; away.played++;
    home.goalsFor += m.homeScore;
    home.goalsAgainst += m.awayScore;
    away.goalsFor += m.awayScore;
    away.goalsAgainst += m.homeScore;
    if (m.homeScore > m.awayScore) {
      home.wins++; home.points += 3; away.losses++;
    } else if (m.homeScore < m.awayScore) {
      away.wins++; away.points += 3; home.losses++;
    } else {
      home.draws++; away.draws++; home.points += 1; away.points += 1;
    }
  });
  return Object.values(standings).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.goalsFor - a.goalsAgainst;
    const gdB = b.goalsFor - b.goalsAgainst;
    if (gdB !== gdA) return gdB - gdA;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.player.localeCompare(b.player);
  });
}
