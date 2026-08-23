/* ═══════════════════════════════════════════════════════════════
   BALLERS LEAGUE — KNOCKOUT TOURNAMENT ENGINE
   8-Team Knockout • 2-Legged Ties • No Away Goals • Golden Goal Decider
   ═══════════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────────
let leagueData = null;
let currentMatchday = 0; // 0-indexed (0 = MD1, 5 = MD6)
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
    renderTournamentBracket();
    renderFixtures();
    renderStats();
    renderLiveTicker();
    renderNewsMarquee();
    setupSwipeGestures();
    setupSilentRefresh();
  } catch (err) {
    console.error("Init error:", err);
  }
});

// ── Season Loading ─────────────────────────────────────────────
async function loadSeason(seasonId) {
  try {
    currentSeasonId = seasonId;
    const res = await fetch(`/api/data?season=${seasonId}&_t=${Date.now()}`);
    if (!res.ok) throw new Error("Failed to load season data");
    leagueData = await res.json();
    initializeClubs(leagueData);

    renderSeasonSelector();
    renderTournamentBracket();
    renderFixtures();
    renderStats();
    renderLiveTicker();
    renderNewsMarquee();
  } catch (err) {
    console.error("Error loading season:", err);
  }
}

function renderSeasonSelector() {
  const container = document.getElementById("season-selector-container");
  const badge = document.getElementById("header-season-badge");
  if (!container || !leagueData) return;

  if (badge && leagueData.season) {
    badge.textContent = `${leagueData.season} — Knockout`;
  }

  if (!leagueData.seasons || leagueData.seasons.length <= 1) {
    container.innerHTML = "";
    return;
  }

  let html = `<select class="season-select" onchange="loadSeason(parseInt(this.value, 10))">`;
  leagueData.seasons.forEach(s => {
    const isSelected = s.id === currentSeasonId ? "selected" : "";
    html += `<option value="${s.id}" ${isSelected}>${s.name} ${s.status === 'active' ? '(Active)' : ''}</option>`;
  });
  html += `</select>`;
  container.innerHTML = html;
}

// ── Page Switching ─────────────────────────────────────────────
function switchPage(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));

  const targetPage = document.getElementById(`page-${page}`);
  const targetNav = document.getElementById(`nav-${page}`);

  if (targetPage) targetPage.classList.add("active");
  if (targetNav) targetNav.classList.add("active");

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (page === "records") {
    renderRecords();
  } else if (page === "bracket") {
    renderTournamentBracket();
  } else if (page === "fixtures") {
    renderFixtures();
  } else if (page === "stats") {
    renderStats();
  }
}

// ═══════════════════════════════════════════════════════════════
// TIE RESULT COMPUTATION (2 LEGS + GOLDEN GOAL)
// ═══════════════════════════════════════════════════════════════
function getTieResult(leg1Match, leg2Match) {
  if (!leg1Match || !leg2Match) {
    return { isComplete: false, winner: null, loser: null, aggregateA: 0, aggregateB: 0, isTied: false, teamA: null, teamB: null };
  }

  const teamA = leg1Match.home;
  const teamB = leg1Match.away;

  if (!teamA || !teamB || teamA.id === null || teamB.id === null) {
    return { isComplete: false, winner: null, loser: null, aggregateA: 0, aggregateB: 0, isTied: false, teamA, teamB };
  }

  const leg1Played = leg1Match.status === "completed" && leg1Match.homeScore !== null && leg1Match.awayScore !== null;
  const leg2Played = leg2Match.status === "completed" && leg2Match.homeScore !== null && leg2Match.awayScore !== null;

  const leg1Home = leg1Match.homeScore || 0; // Team A
  const leg1Away = leg1Match.awayScore || 0; // Team B

  const leg2Home = leg2Match.homeScore || 0; // Team B
  const leg2Away = leg2Match.awayScore || 0; // Team A

  const aggregateA = (leg1Played ? leg1Home : 0) + (leg2Played ? leg2Away : 0);
  const aggregateB = (leg1Played ? leg1Away : 0) + (leg2Played ? leg2Home : 0);

  if (!leg1Played || !leg2Played) {
    return {
      isComplete: false,
      winner: null,
      loser: null,
      aggregateA,
      aggregateB,
      isTied: false,
      leg1Played,
      leg2Played,
      leg1Match,
      leg2Match,
      teamA,
      teamB,
    };
  }

  if (aggregateA > aggregateB) {
    return { isComplete: true, winner: teamA, loser: teamB, aggregateA, aggregateB, isTied: false, method: "aggregate", leg1Played, leg2Played, leg1Match, leg2Match, teamA, teamB };
  } else if (aggregateB > aggregateA) {
    return { isComplete: true, winner: teamB, loser: teamA, aggregateA, aggregateB, isTied: false, method: "aggregate", leg1Played, leg2Played, leg1Match, leg2Match, teamA, teamB };
  } else {
    // Tied on aggregate! Golden Goal Winner
    const ggWinnerId = leg2Match.goldenGoalWinnerId || leg1Match.goldenGoalWinnerId;
    if (ggWinnerId === teamA.id) {
      return { isComplete: true, winner: teamA, loser: teamB, aggregateA, aggregateB, isTied: true, method: "golden_goal", goldenGoalWinnerId: ggWinnerId, leg1Played, leg2Played, leg1Match, leg2Match, teamA, teamB };
    } else if (ggWinnerId === teamB.id) {
      return { isComplete: true, winner: teamB, loser: teamA, aggregateA, aggregateB, isTied: true, method: "golden_goal", goldenGoalWinnerId: ggWinnerId, leg1Played, leg2Played, leg1Match, leg2Match, teamA, teamB };
    } else {
      return { isComplete: false, winner: null, loser: null, aggregateA, aggregateB, isTied: true, method: "needs_golden_goal", leg1Played, leg2Played, leg1Match, leg2Match, teamA, teamB };
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// TOURNAMENT BRACKET RENDERING
// ═══════════════════════════════════════════════════════════════
function renderTournamentBracket() {
  const container = document.getElementById("tournament-bracket-container");
  const thirdContainer = document.getElementById("third-place-container");
  if (!container || !leagueData || !leagueData.fixtures) return;

  const fixtures = leagueData.fixtures;
  const qfLeg1Matches = fixtures[0]?.matches || [];
  const qfLeg2Matches = fixtures[1]?.matches || [];
  const sfLeg1Matches = fixtures[2]?.matches || [];
  const sfLeg2Matches = fixtures[3]?.matches || [];
  const finalsLeg1Matches = fixtures[4]?.matches || [];
  const finalsLeg2Matches = fixtures[5]?.matches || [];

  // Build Quarterfinal Ties (1..4)
  const qfTies = [];
  for (let tie = 1; tie <= 4; tie++) {
    const leg1 = qfLeg1Matches.find(m => m.tieId === tie);
    const leg2 = qfLeg2Matches.find(m => m.tieId === tie);
    qfTies.push(getTieResult(leg1, leg2));
  }

  // Build Semifinal Ties (1..2)
  const sfTies = [];
  for (let tie = 1; tie <= 2; tie++) {
    const leg1 = sfLeg1Matches.find(m => m.tieId === tie);
    const leg2 = sfLeg2Matches.find(m => m.tieId === tie);
    sfTies.push(getTieResult(leg1, leg2));
  }

  // Build Finals Tie
  const finalLeg1 = finalsLeg1Matches.find(m => m.stage === "final");
  const finalLeg2 = finalsLeg2Matches.find(m => m.stage === "final");
  const finalTie = getTieResult(finalLeg1, finalLeg2);

  // Build 3rd Place Tie
  const thirdLeg1 = finalsLeg1Matches.find(m => m.stage === "third_place");
  const thirdLeg2 = finalsLeg2Matches.find(m => m.stage === "third_place");
  const thirdTie = getTieResult(thirdLeg1, thirdLeg2);

  let html = "";

  // 1. Column: Quarter-finals
  html += `<div class="bracket-round-column">
    <div class="bracket-round-header">
      <h3>Quarter-finals</h3>
      <span class="round-subtag">4 Ties • 2 Legs</span>
    </div>`;
  qfTies.forEach((tie, idx) => {
    html += buildTieCardHTML(tie, `Quarter-final ${idx + 1}`, false);
  });
  html += `</div>`;

  // 2. Column: Semi-finals
  html += `<div class="bracket-round-column">
    <div class="bracket-round-header">
      <h3>Semi-finals</h3>
      <span class="round-subtag">2 Ties • 2 Legs</span>
    </div>`;
  sfTies.forEach((tie, idx) => {
    html += buildTieCardHTML(tie, `Semi-final ${idx + 1}`, false);
  });
  html += `</div>`;

  // 3. Column: Championship Final
  html += `<div class="bracket-round-column">
    <div class="bracket-round-header">
      <h3 style="color: var(--accent-gold);">🏆 Championship Final</h3>
      <span class="round-subtag">Grand Final</span>
    </div>`;
  html += buildTieCardHTML(finalTie, `Grand Final`, true);
  html += `</div>`;

  container.innerHTML = html;

  // Render 3rd Place section
  if (thirdContainer) {
    thirdContainer.innerHTML = buildTieCardHTML(thirdTie, `3rd Place Playoff`, false, true);
  }

  // Render Tournament Champion / Golden Boot banner if final is complete
  renderTournamentAwards(finalTie, thirdTie);
}

function buildTieCardHTML(tie, title, isFinal = false, isThird = false) {
  const teamA = tie.teamA || { id: null, player: "TBD", club: "TBD" };
  const teamB = tie.teamB || { id: null, player: "TBD", club: "TBD" };

  const isACompleted = tie.isComplete && tie.winner && tie.winner.id === teamA.id;
  const isBCompleted = tie.isComplete && tie.winner && tie.winner.id === teamB.id;

  const isALoser = tie.isComplete && tie.loser && tie.loser.id === teamA.id;
  const isBLoser = tie.isComplete && tie.loser && tie.loser.id === teamB.id;

  const logoA = getClubLogo(teamA.club);
  const logoB = getClubLogo(teamB.club);

  const leg1A = tie.leg1Match && tie.leg1Match.homeScore !== null ? tie.leg1Match.homeScore : "-";
  const leg1B = tie.leg1Match && tie.leg1Match.awayScore !== null ? tie.leg1Match.awayScore : "-";

  const leg2A = tie.leg2Match && tie.leg2Match.awayScore !== null ? tie.leg2Match.awayScore : "-";
  const leg2B = tie.leg2Match && tie.leg2Match.homeScore !== null ? tie.leg2Match.homeScore : "-";

  const aggClass = tie.isComplete ? "decided" : "";
  const aggText = (tie.leg1Played || tie.leg2Played) ? `AGG: ${tie.aggregateA} - ${tie.aggregateB}` : "2 LEGS";

  let cardClasses = "tie-card";
  if (isFinal) cardClasses += " final-tie-card";
  if (isThird) cardClasses += " third-place-card";

  let ggHtml = "";
  if (tie.method === "golden_goal") {
    const ggWinner = tie.winner?.player || "Golden Goal";
    ggHtml = `<span class="tie-golden-goal-badge">⚽ Golden Goal: ${ggWinner}</span>`;
  } else if (tie.method === "needs_golden_goal") {
    ggHtml = `<span class="tie-golden-goal-badge" style="color:#e63946; border-color: rgba(230,57,70,0.4); background: rgba(230,57,70,0.1);">⚠️ Golden Goal Needed</span>`;
  }

  return `
    <div class="${cardClasses}">
      <div class="tie-card-top">
        <span class="tie-card-title">${title}</span>
        <span class="tie-aggregate-badge ${aggClass}">${aggText}</span>
      </div>

      <!-- Team A Row -->
      <div class="tie-team-row ${isACompleted ? 'winner' : ''} ${isALoser ? 'loser' : ''}">
        <div class="tie-team-info" onclick="${teamA.id ? `openPlayerProfile(${teamA.id})` : ''}" style="${teamA.id ? 'cursor:pointer;' : ''}">
          <div class="tie-team-logo">${logoA ? `<img src="${logoA}" alt="${teamA.club}">` : ''}</div>
          <div class="tie-team-names">
            <span class="tie-player-name">${teamA.player} ${isACompleted && isFinal ? '👑' : (isACompleted ? '✓' : '')}</span>
            <span class="tie-club-name">${teamA.club}</span>
          </div>
        </div>
        <div class="tie-team-scores">
          <span class="tie-leg-score" title="Leg 1 (Home) & Leg 2 (Away)">${leg1A} | ${leg2A}</span>
          <span class="tie-total-score">${(tie.leg1Played || tie.leg2Played) ? tie.aggregateA : '-'}</span>
        </div>
      </div>

      <!-- Team B Row -->
      <div class="tie-team-row ${isBCompleted ? 'winner' : ''} ${isBLoser ? 'loser' : ''}">
        <div class="tie-team-info" onclick="${teamB.id ? `openPlayerProfile(${teamB.id})` : ''}" style="${teamB.id ? 'cursor:pointer;' : ''}">
          <div class="tie-team-logo">${logoB ? `<img src="${logoB}" alt="${teamB.club}">` : ''}</div>
          <div class="tie-team-names">
            <span class="tie-player-name">${teamB.player} ${isBCompleted && isFinal ? '👑' : (isBCompleted ? '✓' : '')}</span>
            <span class="tie-club-name">${teamB.club}</span>
          </div>
        </div>
        <div class="tie-team-scores">
          <span class="tie-leg-score" title="Leg 1 (Away) & Leg 2 (Home)">${leg1B} | ${leg2B}</span>
          <span class="tie-total-score">${(tie.leg1Played || tie.leg2Played) ? tie.aggregateB : '-'}</span>
        </div>
      </div>

      <div class="tie-footer-details">
        <span>Leg 1 & Leg 2 Breakdown</span>
        ${ggHtml || `<span>${tie.isComplete ? 'Tie Decided' : 'In Progress'}</span>`}
      </div>
    </div>
  `;
}

function renderTournamentAwards(finalTie, thirdTie) {
  const awardsContainer = document.getElementById("standings-awards");
  if (!awardsContainer) return;

  if (finalTie && finalTie.isComplete && finalTie.winner) {
    const champion = finalTie.winner;
    const runnerUp = finalTie.loser;
    const thirdPlace = thirdTie && thirdTie.isComplete ? thirdTie.winner : null;

    awardsContainer.style.display = "block";
    awardsContainer.innerHTML = `
      <div class="awards-banner">
        <div class="awards-title">🏆 TOURNAMENT HONORS</div>
        <div class="awards-grid">
          <div class="award-card gold">
            <span class="award-medal">🥇</span>
            <div class="award-name">CHAMPION</div>
            <div class="award-player">${champion.player}</div>
            <div class="award-club">${champion.club}</div>
          </div>
          <div class="award-card silver">
            <span class="award-medal">🥈</span>
            <div class="award-name">RUNNER-UP</div>
            <div class="award-player">${runnerUp ? runnerUp.player : '-'}</div>
            <div class="award-club">${runnerUp ? runnerUp.club : '-'}</div>
          </div>
          ${thirdPlace ? `
          <div class="award-card bronze">
            <span class="award-medal">🥉</span>
            <div class="award-name">3RD PLACE</div>
            <div class="award-player">${thirdPlace.player}</div>
            <div class="award-club">${thirdPlace.club}</div>
          </div>` : ''}
        </div>
      </div>
    `;
  } else {
    awardsContainer.style.display = "none";
  }
}

// ═══════════════════════════════════════════════════════════════
// FIXTURES & MATCHES RENDERING
// ═══════════════════════════════════════════════════════════════
function renderFixtures(direction = null) {
  const container = document.getElementById("fixtures-container");
  const label = document.getElementById("fixture-matchday-label");
  const counter = document.getElementById("fixture-matchday-counter");
  const prevBtn = document.getElementById("btn-prev-md");
  const nextBtn = document.getElementById("btn-next-md");

  if (!container || !leagueData || !leagueData.fixtures || leagueData.fixtures.length === 0) {
    if (container) container.innerHTML = '<div class="no-fixtures">No tournament fixtures available.</div>';
    return;
  }

  const fixtures = leagueData.fixtures;
  const totalRounds = fixtures.length;

  if (currentMatchday < 0) currentMatchday = 0;
  if (currentMatchday >= totalRounds) currentMatchday = totalRounds - 1;

  const currentRound = fixtures[currentMatchday];
  if (!currentRound) return;

  if (label) label.textContent = currentRound.name || `Matchday ${currentMatchday + 1}`;
  if (counter) counter.textContent = `${currentMatchday + 1} / ${totalRounds}`;

  if (prevBtn) prevBtn.disabled = currentMatchday === 0;
  if (nextBtn) nextBtn.disabled = currentMatchday === totalRounds - 1;

  let animClass = "";
  if (direction === "next") animClass = "slide-in-right";
  if (direction === "prev") animClass = "slide-in-left";

  let html = `<div class="fixtures-list ${animClass}">`;

  currentRound.matches.forEach((match, index) => {
    const isCompleted = match.status === "completed";
    const isLive = match.status === "live";
    const homeClub = match.home ? match.home.club : "TBD";
    const awayClub = match.away ? match.away.club : "TBD";
    const homePlayer = match.home ? match.home.player : "TBD";
    const awayPlayer = match.away ? match.away.player : "TBD";
    const homeId = match.home ? match.home.id : null;
    const awayId = match.away ? match.away.id : null;

    const logoHome = getClubLogo(homeClub);
    const logoAway = getClubLogo(awayClub);

    let statusBadge = "";
    if (isLive) {
      statusBadge = `<span class="match-badge live"><span class="live-dot"></span> LIVE</span>`;
    } else if (isCompleted) {
      statusBadge = `<span class="match-badge completed">FT</span>`;
    } else {
      statusBadge = `<span class="match-badge upcoming">UPCOMING</span>`;
    }

    const motwBadge = match.isMotw ? `<span class="match-badge motw">★ MOTW</span>` : "";
    const ggBadge = match.goldenGoalWinnerId ? `<span class="match-badge gg">⚽ GG</span>` : "";

    const homeScoreText = match.homeScore !== null ? match.homeScore : "-";
    const awayScoreText = match.awayScore !== null ? match.awayScore : "-";

    html += `
      <div class="fixture-card ${isLive ? 'live-card' : ''} ${match.isMotw ? 'motw-card' : ''}" id="match-card-${match.id || index}">
        <div class="fixture-card-header">
          <span class="fixture-stage-label">${getStageLabel(match.stage, match.leg)}</span>
          <div class="fixture-badges">
            ${motwBadge}
            ${ggBadge}
            ${statusBadge}
          </div>
        </div>

        <div class="fixture-matchup">
          <!-- Home Team -->
          <div class="fixture-team home" onclick="${homeId ? `openPlayerProfile(${homeId})` : ''}" style="${homeId ? 'cursor:pointer;' : ''}">
            <div class="team-logo-wrapper">
              ${logoHome ? `<img src="${logoHome}" alt="${homeClub}">` : `<div class="team-logo-fallback">${homeClub.substring(0,2)}</div>`}
            </div>
            <div class="team-meta">
              <span class="player-name">${homePlayer}</span>
              <span class="club-name">${homeClub}</span>
            </div>
          </div>

          <!-- Score -->
          <div class="fixture-score-wrapper">
            <span class="score home-score ${isCompleted && match.homeScore > match.awayScore ? 'winner-score' : ''}">${homeScoreText}</span>
            <span class="score-divider">:</span>
            <span class="score away-score ${isCompleted && match.awayScore > match.homeScore ? 'winner-score' : ''}">${awayScoreText}</span>
          </div>

          <!-- Away Team -->
          <div class="fixture-team away" onclick="${awayId ? `openPlayerProfile(${awayId})` : ''}" style="${awayId ? 'cursor:pointer;' : ''}">
            <div class="team-meta">
              <span class="player-name">${awayPlayer}</span>
              <span class="club-name">${awayClub}</span>
            </div>
            <div class="team-logo-wrapper">
              ${logoAway ? `<img src="${logoAway}" alt="${awayClub}">` : `<div class="team-logo-fallback">${awayClub.substring(0,2)}</div>`}
            </div>
          </div>
        </div>

        <!-- Match Actions / Details -->
        <div class="fixture-actions">
          <button class="action-tab-btn" onclick="togglePredictionWidget(this, ${match.matchday || currentMatchday + 1}, ${homeId}, ${awayId}, ${match.id})">
            🗳️ Predictions (${getVoteCount(match.predictions)})
          </button>
          ${(match.homeStreamUrl || match.awayStreamUrl) ? `
          <button class="action-tab-btn stream-btn" onclick="toggleStreamWidget(this, '${encodeURIComponent(match.homeStreamUrl || '')}', '${encodeURIComponent(match.awayStreamUrl || '')}', '${homePlayer}', '${awayPlayer}')">
            📺 Live Stream
          </button>` : ''}
          ${homeId && awayId ? `
          <button class="action-tab-btn" onclick="toggleH2HWidget(this, ${homeId}, ${awayId}, '${homePlayer}', '${awayPlayer}')">
            ⚔️ H2H
          </button>` : ''}
        </div>

        <!-- Hidden Expandable Panels -->
        <div class="fixture-expand-panel" style="display:none;"></div>
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
}

function changeMatchday(delta) {
  const newMd = currentMatchday + delta;
  if (!leagueData || !leagueData.fixtures) return;
  if (newMd >= 0 && newMd < leagueData.fixtures.length) {
    currentMatchday = newMd;
    renderFixtures(delta > 0 ? "next" : "prev");
  }
}

function getStageLabel(stage, leg) {
  const legStr = leg ? ` (Leg ${leg})` : '';
  switch (stage) {
    case 'quarterfinals': return `Quarter-finals${legStr}`;
    case 'semifinals': return `Semi-finals${legStr}`;
    case 'third_place': return `3rd Place Playoff${legStr}`;
    case 'final': return `Championship Final${legStr}`;
    default: return `Knockout${legStr}`;
  }
}

// ═══════════════════════════════════════════════════════════════
// PREDICTION & WIDGET HELPERS
// ═══════════════════════════════════════════════════════════════
function getVoteCount(predictions) {
  if (!predictions) return 0;
  return (predictions.home || 0) + (predictions.draw || 0) + (predictions.away || 0);
}

function togglePredictionWidget(btn, matchday, homeId, awayId, matchId) {
  const card = btn.closest(".fixture-card");
  const panel = card.querySelector(".fixture-expand-panel");
  if (!panel) return;

  if (panel.style.display !== "none" && panel.dataset.type === "predictions") {
    panel.style.display = "none";
    return;
  }

  panel.dataset.type = "predictions";
  panel.style.display = "block";

  // Find match
  const round = leagueData.fixtures[currentMatchday];
  const match = round ? round.matches.find(m => m.id === matchId || (m.home?.id === homeId && m.away?.id === awayId)) : null;
  const p = match?.predictions || { home: 0, draw: 0, away: 0 };
  const total = (p.home || 0) + (p.draw || 0) + (p.away || 0);

  const homePct = total > 0 ? Math.round((p.home / total) * 100) : 33;
  const drawPct = total > 0 ? Math.round((p.draw / total) * 100) : 34;
  const awayPct = total > 0 ? Math.round((p.away / total) * 100) : 33;

  panel.innerHTML = `
    <div class="prediction-box">
      <div class="prediction-title">Who wins this tie leg?</div>
      <div class="prediction-buttons">
        <button class="pred-btn" onclick="castVote(this, ${matchday}, ${homeId}, ${awayId}, ${matchId}, 'home')">
          <span>${match?.home?.player || 'Home'}</span>
          <span class="pred-pct">${homePct}% (${p.home || 0})</span>
        </button>
        <button class="pred-btn" onclick="castVote(this, ${matchday}, ${homeId}, ${awayId}, ${matchId}, 'draw')">
          <span>Draw</span>
          <span class="pred-pct">${drawPct}% (${p.draw || 0})</span>
        </button>
        <button class="pred-btn" onclick="castVote(this, ${matchday}, ${homeId}, ${awayId}, ${matchId}, 'away')">
          <span>${match?.away?.player || 'Away'}</span>
          <span class="pred-pct">${awayPct}% (${p.away || 0})</span>
        </button>
      </div>
      <div class="prediction-bar">
        <div class="pred-fill home" style="width: ${homePct}%"></div>
        <div class="pred-fill draw" style="width: ${drawPct}%"></div>
        <div class="pred-fill away" style="width: ${awayPct}%"></div>
      </div>
    </div>
  `;
}

async function castVote(btn, matchday, homeId, awayId, matchId, option) {
  try {
    const voterName = prompt("Enter your username / pundit name:", "Fan") || "Fan";
    const res = await fetch("/api/prediction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchday,
        homeId,
        awayId,
        matchId,
        option,
        voterName,
        seasonId: currentSeasonId,
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to vote");

    // Update locally
    const round = leagueData.fixtures[currentMatchday];
    const match = round?.matches.find(m => m.id === matchId || (m.home?.id === homeId && m.away?.id === awayId));
    if (match && data.predictions) {
      match.predictions = data.predictions;
    }

    togglePredictionWidget(btn, matchday, homeId, awayId, matchId);
  } catch (err) {
    alert("Voting failed: " + err.message);
  }
}

function toggleStreamWidget(btn, homeUrl, awayUrl, homePlayer, awayPlayer) {
  const card = btn.closest(".fixture-card");
  const panel = card.querySelector(".fixture-expand-panel");
  if (!panel) return;

  if (panel.style.display !== "none" && panel.dataset.type === "stream") {
    panel.style.display = "none";
    return;
  }

  panel.dataset.type = "stream";
  panel.style.display = "block";

  const hUrl = decodeURIComponent(homeUrl);
  const aUrl = decodeURIComponent(awayUrl);

  const activeUrl = hUrl || aUrl;
  const embedUrl = getStreamEmbedUrl(activeUrl);

  panel.innerHTML = `
    <div class="stream-box">
      <div class="stream-header">
        <span>🔴 Live Stream Broadcast</span>
        <div class="stream-switcher">
          ${hUrl ? `<button class="stream-feed-btn active" onclick="switchStream('${hUrl}', this)">${homePlayer}'s Feed</button>` : ''}
          ${aUrl ? `<button class="stream-feed-btn ${!hUrl ? 'active' : ''}" onclick="switchStream('${aUrl}', this)">${awayPlayer}'s Feed</button>` : ''}
        </div>
      </div>
      <div class="stream-player-container">
        ${embedUrl ? `<iframe src="${embedUrl}" frameborder="0" allowfullscreen class="stream-iframe"></iframe>` : `<div class="no-stream">Stream unavailable</div>`}
      </div>
    </div>
  `;
}

function switchStream(url, btn) {
  const box = btn.closest(".stream-box");
  box.querySelectorAll(".stream-feed-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  const iframe = box.querySelector(".stream-iframe");
  if (iframe) iframe.src = getStreamEmbedUrl(url);
}

function getStreamEmbedUrl(url) {
  if (!url) return null;
  if (url.includes("twitch.tv")) {
    const channel = url.split("twitch.tv/")[1]?.split(/[/?#]/)[0];
    return `https://player.twitch.tv/?channel=${channel}&parent=${window.location.hostname || 'localhost'}`;
  }
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    let videoId = "";
    if (url.includes("watch?v=")) videoId = url.split("watch?v=")[1]?.split("&")[0];
    else if (url.includes("youtu.be/")) videoId = url.split("youtu.be/")[1]?.split("?")[0];
    return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
  }
  return url;
}

async function toggleH2HWidget(btn, homeId, awayId, homePlayer, awayPlayer) {
  const card = btn.closest(".fixture-card");
  const panel = card.querySelector(".fixture-expand-panel");
  if (!panel) return;

  if (panel.style.display !== "none" && panel.dataset.type === "h2h") {
    panel.style.display = "none";
    return;
  }

  panel.dataset.type = "h2h";
  panel.style.display = "block";
  panel.innerHTML = `<div class="loading-spinner">Loading H2H stats...</div>`;

  try {
    const res = await fetch(`/api/h2h?home=${homeId}&away=${awayId}`);
    const data = await res.json();

    const total = data.totalPlayed || 0;
    const winsA = data.winsA || 0;
    const draws = data.draws || 0;
    const winsB = data.winsB || 0;

    panel.innerHTML = `
      <div class="h2h-box">
        <div class="h2h-summary">
          <span>${homePlayer}: <strong>${winsA}W</strong></span>
          <span>Draws: <strong>${draws}D</strong></span>
          <span>${awayPlayer}: <strong>${winsB}W</strong></span>
        </div>
        <div class="h2h-bar">
          <div class="h2h-fill home" style="width: ${total > 0 ? (winsA/total)*100 : 33}%"></div>
          <div class="h2h-fill draw" style="width: ${total > 0 ? (draws/total)*100 : 34}%"></div>
          <div class="h2h-fill away" style="width: ${total > 0 ? (winsB/total)*100 : 33}%"></div>
        </div>
      </div>
    `;
  } catch (err) {
    panel.innerHTML = `<div class="error-text">Failed to load H2H stats</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// STATS CALCULATIONS & RENDERING
// ═══════════════════════════════════════════════════════════════
function renderStats() {
  const scorersContainer = document.getElementById("stats-top-scorers");
  const defenceContainer = document.getElementById("stats-best-defence");
  const winsContainer = document.getElementById("stats-biggest-wins");
  const punditContainer = document.getElementById("stats-pundit-rankings");

  if (!leagueData || !leagueData.fixtures) return;

  const playerStats = {};
  if (leagueData.teams) {
    leagueData.teams.forEach(t => {
      playerStats[t.id] = {
        id: t.id,
        player: t.player,
        club: t.club,
        goalsScored: 0,
        goalsConceded: 0,
        matchesPlayed: 0,
        cleanSheets: 0,
      };
    });
  }

  const completedMatches = [];
  const punditPicks = {};

  leagueData.fixtures.forEach(round => {
    round.matches.forEach(m => {
      if (m.predictions && m.predictions.voters) {
        m.predictions.voters.forEach(v => {
          if (!punditPicks[v.name]) punditPicks[v.name] = { name: v.name, total: 0, correct: 0 };
          punditPicks[v.name].total++;
          if (m.status === "completed" && m.homeScore !== null && m.awayScore !== null) {
            let actual = "draw";
            if (m.homeScore > m.awayScore) actual = "home";
            if (m.awayScore > m.homeScore) actual = "away";
            if (v.pick === actual) punditPicks[v.name].correct++;
          }
        });
      }

      if (m.status === "completed" && m.homeScore !== null && m.awayScore !== null) {
        completedMatches.push(m);
        const h = playerStats[m.home?.id];
        const a = playerStats[m.away?.id];

        if (h) {
          h.goalsScored += m.homeScore;
          h.goalsConceded += m.awayScore;
          h.matchesPlayed++;
          if (m.awayScore === 0) h.cleanSheets++;
        }
        if (a) {
          a.goalsScored += m.awayScore;
          a.goalsConceded += m.homeScore;
          a.matchesPlayed++;
          if (m.homeScore === 0) a.cleanSheets++;
        }
      }
    });
  });

  // 1. Top Scorers
  if (scorersContainer) {
    const scorers = Object.values(playerStats).sort((a, b) => b.goalsScored - a.goalsScored).slice(0, 5);
    let html = "";
    scorers.forEach((p, idx) => {
      html += `
        <div class="stats-row">
          <span class="stats-rank">#${idx + 1}</span>
          <div class="stats-player-meta">
            <span class="stats-player-name">${p.player}</span>
            <span class="stats-club-name">${p.club}</span>
          </div>
          <span class="stats-value">${p.goalsScored} GLS</span>
        </div>
      `;
    });
    scorersContainer.innerHTML = html || '<div class="stats-empty">No goals scored yet</div>';
  }

  // 2. Best Defence
  if (defenceContainer) {
    const defenders = Object.values(playerStats)
      .filter(p => p.matchesPlayed > 0)
      .sort((a, b) => {
        const avgA = a.goalsConceded / a.matchesPlayed;
        const avgB = b.goalsConceded / b.matchesPlayed;
        return avgA - avgB || b.cleanSheets - a.cleanSheets;
      })
      .slice(0, 5);

    let html = "";
    defenders.forEach((p, idx) => {
      const avg = (p.goalsConceded / p.matchesPlayed).toFixed(2);
      html += `
        <div class="stats-row">
          <span class="stats-rank">#${idx + 1}</span>
          <div class="stats-player-meta">
            <span class="stats-player-name">${p.player}</span>
            <span class="stats-club-name">${p.cleanSheets} Clean Sheets</span>
          </div>
          <span class="stats-value">${avg} GC/m</span>
        </div>
      `;
    });
    defenceContainer.innerHTML = html || '<div class="stats-empty">No matches played yet</div>';
  }

  // 3. Biggest Wins
  if (winsContainer) {
    const biggest = completedMatches
      .map(m => ({
        ...m,
        diff: Math.abs(m.homeScore - m.awayScore),
        winner: m.homeScore > m.awayScore ? m.home : m.away,
        loser: m.homeScore > m.awayScore ? m.away : m.home,
        wScore: Math.max(m.homeScore, m.awayScore),
        lScore: Math.min(m.homeScore, m.awayScore)
      }))
      .filter(m => m.diff > 0)
      .sort((a, b) => b.diff - a.diff || b.wScore - a.wScore)
      .slice(0, 4);

    let html = "";
    biggest.forEach(m => {
      html += `
        <div class="stats-win-card">
          <span class="win-score">${m.wScore} - ${m.lScore}</span>
          <span class="win-matchup"><strong>${m.winner.player}</strong> def. ${m.loser.player}</span>
        </div>
      `;
    });
    winsContainer.innerHTML = html || '<div class="stats-empty">No completed wins yet</div>';
  }

  // 4. Pundit Rankings
  if (punditContainer) {
    const pundits = Object.values(punditPicks)
      .map(p => ({ ...p, pct: p.total > 0 ? Math.round((p.correct / p.total) * 100) : 0 }))
      .sort((a, b) => b.correct - a.correct || b.pct - a.pct)
      .slice(0, 5);

    let html = "";
    pundits.forEach((p, idx) => {
      html += `
        <div class="stats-row">
          <span class="stats-rank">#${idx + 1}</span>
          <div class="stats-player-meta">
            <span class="stats-player-name">${p.name}</span>
            <span class="stats-club-name">${p.correct}/${p.total} correct</span>
          </div>
          <span class="stats-value">${p.pct}%</span>
        </div>
      `;
    });
    punditContainer.innerHTML = html || '<div class="stats-empty">No votes recorded yet</div>';
  }
}

// ═══════════════════════════════════════════════════════════════
// RECORDS & ROLL OF HONOR
// ═══════════════════════════════════════════════════════════════
async function renderRecords() {
  const recordsContainer = document.getElementById("records-container");
  const honorContainer = document.getElementById("roll-of-honor-container");
  const h2hContainer = document.getElementById("h2h-matrix-container");

  if (!recordsContainer) return;

  try {
    const res = await fetch(`/api/records?_t=${Date.now()}`);
    const data = await res.json();
    cachedRecordsData = data;

    const matches = data.matches || [];
    const seasons = data.seasons || [];
    const teams = data.teams || [];

    // 1. Records Overview
    const totalMatches = matches.length;
    const totalGoals = matches.reduce((sum, m) => sum + (m.homeScore || 0) + (m.awayScore || 0), 0);
    const avgGoals = totalMatches > 0 ? (totalGoals / totalMatches).toFixed(2) : "0.00";

    recordsContainer.innerHTML = `
      <div class="records-grid">
        <div class="record-stat-card">
          <span class="record-value">${totalMatches}</span>
          <span class="record-label">Tournament Matches</span>
        </div>
        <div class="record-stat-card">
          <span class="record-value">${totalGoals}</span>
          <span class="record-label">Total Goals</span>
        </div>
        <div class="record-stat-card">
          <span class="record-value">${avgGoals}</span>
          <span class="record-label">Goals Per Match</span>
        </div>
      </div>
    `;

    // 2. Roll of Honor Timeline
    if (honorContainer) {
      let honorHtml = `<div class="timeline-wrapper">`;
      seasons.forEach(s => {
        const seasonMatches = matches.filter(m => m.seasonId === s.id && m.stage === "final");
        const isComplete = s.status === "completed" || seasonMatches.length >= 2;

        honorHtml += `
          <div class="timeline-card">
            <div class="timeline-header">
              <span class="timeline-season">${s.name}</span>
              <span class="timeline-status">${s.status === 'active' ? 'IN PROGRESS' : 'COMPLETED'}</span>
            </div>
            <div class="timeline-body">
              ${s.headline ? `<p class="timeline-headline">${s.headline}</p>` : ''}
              <p class="timeline-desc">8-Team Two-Legged Knockout Championship</p>
            </div>
          </div>
        `;
      });
      honorHtml += `</div>`;
      honorContainer.innerHTML = honorHtml;
    }

    // 3. Head-to-Head Matrix
    if (h2hContainer) {
      renderH2HMatrix(teams, matches);
    }
  } catch (err) {
    console.error("Records error:", err);
    if (recordsContainer) recordsContainer.innerHTML = '<div class="error-text">Failed to load records.</div>';
  }
}

function renderH2HMatrix(teams, matches) {
  const container = document.getElementById("h2h-matrix-container");
  if (!container || !teams || teams.length === 0) return;

  const activeTeams = teams.slice(0, 8);
  let html = `
    <div class="h2h-table-wrapper">
      <table class="h2h-matrix-table">
        <thead>
          <tr>
            <th>Player</th>
            ${activeTeams.map(t => `<th title="${t.player} (${t.club})">${t.player.substring(0, 4)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
  `;

  activeTeams.forEach(t1 => {
    html += `<tr><td class="h2h-player-cell"><strong>${t1.player}</strong></td>`;
    activeTeams.forEach(t2 => {
      if (t1.id === t2.id) {
        html += `<td class="h2h-self-cell">—</td>`;
      } else {
        const h2hMatches = matches.filter(m =>
          (m.homeId === t1.id && m.awayId === t2.id) ||
          (m.homeId === t2.id && m.awayId === t1.id)
        );

        let wins1 = 0;
        let wins2 = 0;
        h2hMatches.forEach(m => {
          const score1 = m.homeId === t1.id ? m.homeScore : m.awayScore;
          const score2 = m.homeId === t1.id ? m.awayScore : m.homeScore;
          if (score1 > score2) wins1++;
          if (score2 > score1) wins2++;
        });

        html += `<td class="h2h-stat-cell">${wins1}-${wins2}</td>`;
      }
    });
    html += `</tr>`;
  });

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════
// MARQUEE, TICKER & LIVE REFRESH
// ═══════════════════════════════════════════════════════════════
function renderLiveTicker() {
  const ticker = document.getElementById("live-ticker");
  const text = document.getElementById("live-ticker-text");
  if (!ticker || !leagueData || !leagueData.fixtures) return;

  const liveMatches = [];
  leagueData.fixtures.forEach(r => {
    r.matches.forEach(m => {
      if (m.status === "live") liveMatches.push(m);
    });
  });

  if (liveMatches.length > 0) {
    ticker.style.display = "block";
    const info = liveMatches.map(m => `${m.home.player} (${m.homeScore || 0}) vs (${m.awayScore || 0}) ${m.away.player}`).join(" • ");
    if (text) text.textContent = `LIVE: ${info}`;
  } else {
    ticker.style.display = "none";
  }
}

function renderNewsMarquee() {
  const container = document.getElementById("news-marquee-container");
  const text = document.getElementById("news-marquee-text");
  if (!container || !leagueData) return;

  if (leagueData.headline) {
    container.style.display = "flex";
    if (text) text.textContent = leagueData.headline;
  } else {
    container.style.display = "none";
  }
}

function setupSilentRefresh() {
  setInterval(async () => {
    try {
      const res = await fetch(`/api/data?season=${currentSeasonId || 1}&_t=${Date.now()}`);
      if (res.ok) {
        leagueData = await res.json();
        renderLiveTicker();
        renderNewsMarquee();
      }
    } catch (e) {}
  }, 10000);
}

// ═══════════════════════════════════════════════════════════════
// SWIPE GESTURES
// ═══════════════════════════════════════════════════════════════
function setupSwipeGestures() {
  const page = document.getElementById("page-fixtures");
  if (!page) return;

  page.addEventListener("touchstart", e => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  page.addEventListener("touchend", e => {
    touchEndX = e.changedTouches[0].screenX;
    const diff = touchEndX - touchStartX;
    if (Math.abs(diff) > SWIPE_THRESHOLD) {
      if (diff < 0) changeMatchday(1); // Swipe left -> Next
      else changeMatchday(-1);          // Swipe right -> Prev
    }
  }, { passive: true });
}

// ═══════════════════════════════════════════════════════════════
// PLAYER PROFILE MODAL
// ═══════════════════════════════════════════════════════════════
function openPlayerProfile(playerId) {
  const overlay = document.getElementById("player-profile-overlay");
  const content = document.getElementById("profile-content");
  if (!overlay || !content || !leagueData) return;

  const team = leagueData.teams?.find(t => t.id === playerId);
  if (!team) return;

  const logo = getClubLogo(team.club);

  // Compute player tournament match history
  let totalGoals = 0;
  let matchesCount = 0;
  const history = [];

  leagueData.fixtures?.forEach(r => {
    r.matches?.forEach(m => {
      if (m.home?.id === playerId || m.away?.id === playerId) {
        history.push(m);
        if (m.status === "completed" && m.homeScore !== null) {
          matchesCount++;
          totalGoals += m.home?.id === playerId ? m.homeScore : m.awayScore;
        }
      }
    });
  });

  content.innerHTML = `
    <div class="profile-header">
      <div class="profile-logo">${logo ? `<img src="${logo}" alt="${team.club}">` : ''}</div>
      <div class="profile-info">
        <h3>${team.player}</h3>
        <span class="profile-club">${team.club}</span>
      </div>
    </div>
    <div class="profile-stats-row">
      <div class="profile-stat-box">
        <span class="val">${matchesCount}</span>
        <span class="lbl">Matches</span>
      </div>
      <div class="profile-stat-box">
        <span class="val">${totalGoals}</span>
        <span class="lbl">Goals</span>
      </div>
    </div>
    <div class="profile-section-title">Tournament Match History</div>
    <div class="profile-matches-list">
      ${history.map(m => `
        <div class="profile-match-item">
          <span class="stage-tag">${getStageLabel(m.stage, m.leg)}</span>
          <span class="matchup">${m.home?.player} ${m.homeScore !== null ? m.homeScore : '-'} : ${m.awayScore !== null ? m.awayScore : '-'} ${m.away?.player}</span>
        </div>
      `).join('')}
    </div>
  `;

  overlay.style.display = "flex";
}

function closePlayerProfile(event) {
  if (event && event.target !== event.currentTarget && !event.target.classList.contains("profile-close")) return;
  const overlay = document.getElementById("player-profile-overlay");
  if (overlay) overlay.style.display = "none";
}

// ═══════════════════════════════════════════════════════════════
// SNAPSHOT GENERATION
// ═══════════════════════════════════════════════════════════════
async function downloadSnapshot(type) {
  try {
    let target = null;
    let filename = `ballers-league-${type}.png`;

    if (type === "bracket") {
      target = document.getElementById("tournament-bracket-container");
      filename = `ballers-league-bracket.png`;
    } else if (type === "fixtures") {
      target = document.getElementById("fixtures-container");
      filename = `ballers-league-round-${currentMatchday + 1}.png`;
    }

    if (!target || typeof html2canvas === "undefined") {
      alert("Snapshot tool is preparing, please try again in a moment.");
      return;
    }

    const canvas = await html2canvas(target, {
      backgroundColor: "#050505",
      scale: 2,
      useCORS: true,
      logging: false,
    });

    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (err) {
    console.error("Snapshot error:", err);
  }
}

// ── Club Logo Helper ───────────────────────────────────────────
function getClubLogo(clubName) {
  if (!clubName) return "";
  return clubLogos[clubName] || "";
}
