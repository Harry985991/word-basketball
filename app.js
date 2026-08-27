import { WORDS } from "./words.js";

const STORAGE_KEY = "word-basketball-state-v1";
const ACCOUNT_STORAGE_PREFIX = "word-basketball-account-v1:";
const TAIPEI_TIMEZONE = "Asia/Taipei";
const app = document.querySelector("#app");
const homeNav = document.querySelector("#homeNav");
const statsNav = document.querySelector("#statsNav");
const lockerNav = document.querySelector("#lockerNav");
const cloudButton = document.querySelector("#cloudButton");
const cloudLabel = document.querySelector("#cloudLabel");
const cloudIdentity = document.querySelector("#cloudIdentity");
const accountModal = document.querySelector("#accountModal");
const toast = document.querySelector("#toast");

let gameState = loadLocalState();
let currentSession = null;
let currentQuestionStartedAt = 0;
let toastTimer = null;
let cloud = null;
let firebaseServicesPromise = null;
let accountChoiceResolve = null;
let cloudConnecting = false;

const LEVELS = [
  { level: 1, name: "新秀訓練營", xp: 0, opponent: "街頭野狼" },
  { level: 2, name: "先發球員", xp: 150, opponent: "城市雷霆" },
  { level: 3, name: "明星賽", xp: 350, opponent: "明星烈焰" },
  { level: 4, name: "季後賽", xp: 600, opponent: "季後賽霸主" },
  { level: 5, name: "總冠軍賽", xp: 900, opponent: "冠軍王朝" },
];

const GEAR = {
  skin: [
    { id: "light", name: "亮棕膚色", level: 1, color: "#d7a27f" },
    { id: "medium", name: "暖棕膚色", level: 1, color: "#b97851" },
    { id: "deep", name: "深棕膚色", level: 1, color: "#75442f" },
  ],
  hair: [
    { id: "short", name: "俐落短髮", level: 1 },
    { id: "curl", name: "捲髮", level: 1 },
    { id: "spike", name: "尖刺髮型", level: 1 },
  ],
  jersey: [
    { id: "orange", name: "新秀橘", level: 1, color: "#ff7a1a" },
    { id: "blue", name: "先發藍", level: 2, color: "#42a5ff" },
    { id: "black", name: "季後賽黑", level: 4, color: "#202734" },
  ],
  shoes: [
    { id: "classic", name: "基本球鞋", level: 1, color: "#f7fbff" },
    { id: "neon", name: "明星螢光", level: 3, color: "#c9ff39" },
    { id: "gold", name: "冠軍金靴", level: 5, color: "#ffc84a" },
  ],
  wristband: [
    { id: "none", name: "不戴護腕", level: 1, color: "transparent" },
    { id: "white", name: "先發白護腕", level: 2, color: "#f7fbff" },
    { id: "lime", name: "明星螢光護腕", level: 4, color: "#c9ff39" },
  ],
  court: [
    { id: "gym", name: "新秀球館", level: 1 },
    { id: "city", name: "城市球場", level: 3 },
    { id: "finals", name: "冠軍球場", level: 5 },
  ],
};

const BADGES = [
  { id: "sniper", icon: "3", name: "三分射手", description: "單場拼字命中 5 題" },
  { id: "defender", icon: "S", name: "防守大師", description: "單場救回 3 個錯字" },
  { id: "comeback", icon: "↗", name: "逆轉王", description: "中場落後但最後獲勝" },
  { id: "buzzer", icon: "0.0", name: "壓哨王", description: "最後一題成功命中" },
  { id: "allrounder", icon: "A", name: "全能球員", description: "兩種題型皆達八成" },
  { id: "seven", icon: "7", name: "每日先發", description: "連續完成七天挑戰" },
];

function emptyState() {
  return {
    version: 2,
    dayPlans: {},
    sessions: [],
    wordStats: {},
    player: {
      name: "ROOKIE",
      number: 23,
      xp: 0,
      wins: 0,
      losses: 0,
      equipped: { skin: "medium", hair: "short", jersey: "orange", shoes: "classic", wristband: "none", court: "gym" },
      badges: {},
      soundEnabled: true,
    },
  };
}

function normalizeState(saved) {
  const base = emptyState();
  if (!saved || typeof saved !== "object") return base;
  return {
    ...base,
    ...saved,
    version: 2,
    dayPlans: saved.dayPlans || {},
    sessions: Array.isArray(saved.sessions) ? saved.sessions : [],
    wordStats: saved.wordStats || {},
    player: {
      ...base.player,
      ...(saved.player || {}),
      equipped: { ...base.player.equipped, ...(saved.player?.equipped || {}) },
      badges: saved.player?.badges || {},
    },
  };
}

function accountStorageKey(uid) {
  return `${ACCOUNT_STORAGE_PREFIX}${uid}`;
}

function loadStateFromKey(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return normalizeState(saved);
  } catch {
    return emptyState();
  }
}

function loadLocalState() {
  return loadStateFromKey(STORAGE_KEY);
}

function hasMeaningfulProgress(state) {
  return Boolean(
    state.sessions?.length
    || Object.values(state.wordStats || {}).some((stat) => stat.attempts > 0)
    || state.player?.xp > 0
    || state.player?.name !== "ROOKIE",
  );
}

function progressFingerprint(state) {
  const stats = Object.fromEntries(
    Object.entries(state.wordStats || {}).sort(([left], [right]) => left.localeCompare(right)),
  );
  return JSON.stringify({
    sessions: (state.sessions || []).map((session) => session.id),
    stats,
    player: {
      name: state.player?.name,
      number: state.player?.number,
      xp: state.player?.xp,
      wins: state.player?.wins,
      losses: state.player?.losses,
    },
  });
}

function persistState() {
  const storageKey = cloud?.user ? accountStorageKey(cloud.user.uid) : STORAGE_KEY;
  localStorage.setItem(storageKey, JSON.stringify(gameState));
  if (cloud?.user && cloud?.save) {
    window.clearTimeout(cloud.saveTimer);
    cloud.saveTimer = window.setTimeout(() => cloud.save(gameState), 350);
  }
}

function getTaipeiDate() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: TAIPEI_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}分${String(seconds).padStart(2, "0")}秒`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function getWord(id) {
  return WORDS.find((word) => word.id === id);
}

function getWordStat(id) {
  return gameState.wordStats[id] || {
    attempts: 0,
    correct: 0,
    wrong: 0,
    choiceAttempts: 0,
    choiceCorrect: 0,
    spellingAttempts: 0,
    spellingCorrect: 0,
    consecutiveCorrect: 0,
    lastAnswer: "",
    lastAnsweredAt: null,
    nextReviewAt: null,
  };
}

function buildReviewCandidates(newIds, excludedIds = []) {
  const date = getTaipeiDate();
  const excluded = new Set(excludedIds);
  return WORDS.filter(
    (word) => !newIds.includes(word.id) && getWordStat(word.id).attempts > 0,
  )
    .map((word) => {
      const stat = getWordStat(word.id);
      const accuracy = stat.attempts ? stat.correct / stat.attempts : 0;
      const due = !stat.nextReviewAt || stat.nextReviewAt <= date ? 4 : 0;
      const notRecentlyUsed = excluded.has(word.id) ? 0 : 8;
      return {
        id: word.id,
        priority: notRecentlyUsed + due + stat.wrong * 3 + (1 - accuracy) * 4 + Math.random() * 2,
      };
    })
    .sort((a, b) => b.priority - a.priority);
}

function selectReviewIds(newIds, excludedIds = []) {
  return buildReviewCandidates(newIds, excludedIds).slice(0, 10).map((item) => item.id);
}

function getDailyPlan() {
  const date = getTaipeiDate();
  const savedPlan = gameState.dayPlans[date];
  if (savedPlan) {
    if (savedPlan.wordBankSize !== WORDS.length) {
      savedPlan.wordBankSize = WORDS.length;
      savedPlan.reviewIds = selectReviewIds(savedPlan.newIds || []);
      persistState();
    }
    return savedPlan;
  }

  const unseen = WORDS.filter((word) => getWordStat(word.id).attempts === 0);
  const newIds = unseen.slice(0, 10).map((word) => word.id);

  const plan = {
    date,
    createdAt: new Date().toISOString(),
    wordBankSize: WORDS.length,
    newIds,
    reviewIds: selectReviewIds(newIds),
  };
  gameState.dayPlans[date] = plan;
  persistState();
  return plan;
}

function getSummary() {
  const stats = Object.values(gameState.wordStats);
  const totalAttempts = stats.reduce((sum, stat) => sum + stat.attempts, 0);
  const totalCorrect = stats.reduce((sum, stat) => sum + stat.correct, 0);
  const todaySessions = gameState.sessions.filter((session) => session.date === getTaipeiDate());
  return {
    learned: stats.filter((stat) => stat.attempts > 0).length,
    accuracy: totalAttempts ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
    gamesToday: todaySessions.length,
    bestScore: gameState.sessions.reduce((best, session) => Math.max(best, session.score), 0),
    streakDays: getDailyStreak(),
  };
}

function getDailyStreak() {
  const dates = [...new Set(
    gameState.sessions.filter((session) => session.kind === "daily").map((session) => session.date),
  )].sort().reverse();
  if (!dates.length) return 0;
  let streak = 1;
  let cursor = new Date(`${dates[0]}T12:00:00`);
  for (let index = 1; index < dates.length; index += 1) {
    cursor.setDate(cursor.getDate() - 1);
    if (dates[index] !== cursor.toISOString().slice(0, 10)) break;
    streak += 1;
  }
  return streak;
}

function getPlayerLevel(xp = gameState.player.xp) {
  return [...LEVELS].reverse().find((item) => xp >= item.xp) || LEVELS[0];
}

function getNextLevel() {
  const current = getPlayerLevel();
  return LEVELS.find((item) => item.level === current.level + 1) || current;
}

function renderAvatar(size = "large") {
  const player = gameState.player;
  const safeName = escapeHtml(player.name);
  const skin = GEAR.skin.find((item) => item.id === player.equipped.skin) || GEAR.skin[1];
  const hair = GEAR.hair.find((item) => item.id === player.equipped.hair) || GEAR.hair[0];
  const jersey = GEAR.jersey.find((item) => item.id === player.equipped.jersey) || GEAR.jersey[0];
  const shoes = GEAR.shoes.find((item) => item.id === player.equipped.shoes) || GEAR.shoes[0];
  const wristband = GEAR.wristband.find((item) => item.id === player.equipped.wristband) || GEAR.wristband[0];
  return `
    <div class="player-avatar is-${size} hair-${hair.id}" style="--skin:${skin.color};--jersey:${jersey.color};--shoes:${shoes.color};--wristband:${wristband.color}" aria-label="${safeName} 的原創籃球新秀角色">
      <span class="avatar-head"><i class="avatar-hair"></i></span>
      <span class="avatar-arm left"><i></i></span><span class="avatar-arm right"><i></i></span>
      <span class="avatar-body"><b>${player.number}</b></span>
      <span class="avatar-shorts"></span>
      <span class="avatar-leg left"></span><span class="avatar-leg right"></span>
      <span class="avatar-shoe left"></span><span class="avatar-shoe right"></span>
      <span class="avatar-ball"></span>
    </div>`;
}

function setActiveNav(name) {
  homeNav.classList.toggle("is-active", name === "home");
  statsNav.classList.toggle("is-active", name === "stats");
  lockerNav.classList.toggle("is-active", name === "locker");
}

function renderHome() {
  setActiveNav("home");
  const plan = getDailyPlan();
  const summary = getSummary();
  const questionCount = plan.newIds.length + plan.reviewIds.length;
  const hasFinishedToday = gameState.sessions.some(
    (session) => session.date === plan.date && session.kind === "daily",
  );
  const dailyLabel = hasFinishedToday ? "再次挑戰" : "開始今日比賽";
  const possibleScore = plan.newIds.reduce(
    (sum, id) => sum + (hasFinishedToday && getWordStat(id).choiceCorrect > 0 ? 3 : 2),
    0,
  ) + plan.reviewIds.reduce(
    (sum, id) => sum + (getWordStat(id).choiceCorrect > 0 ? 3 : 2),
    0,
  );
  const starterTarget = Math.max(1, Math.ceil(possibleScore * 0.7));
  const level = getPlayerLevel();
  const nextLevel = getNextLevel();
  const levelProgress = level.level === LEVELS.length
    ? 100
    : Math.round(((gameState.player.xp - level.xp) / (nextLevel.xp - level.xp)) * 100);

  app.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${level.name} · GAME ${summary.gamesToday + 1}</p>
        <h1>把單字<br />投進腦袋裡。</h1>
        <p>今天用 NBA 球星的籃球情境挑戰 ${plan.newIds.length} 個新字，答對選擇題得兩分，成功拼字就投進三分球。</p>
        <div class="hero-actions">
          <button class="primary-button" data-action="daily">${dailyLabel} · ${questionCount} 題</button>
          <button class="secondary-button" data-action="warmup">查看賽前熱身</button>
        </div>
      </div>
      <div class="hero-player-zone">
        <div class="player-intro">
          ${renderAvatar("large")}
          <div><span>LV.${level.level}</span><strong>${escapeHtml(gameState.player.name)} #${gameState.player.number}</strong><small>${gameState.player.wins} 勝 ${gameState.player.losses} 敗</small></div>
        </div>
        <div class="hero-scoreboard" aria-label="今日記分板">
          <div class="scoreboard-label"><span>HOME</span><span>PERSONAL BEST</span></div>
          <div class="scoreboard-main">
            <div><strong class="score-number">${summary.bestScore}</strong><small>你的最佳</small></div>
            <span class="versus">VS</span>
            <div><strong class="score-number is-blue">${starterTarget}</strong><small>今日門檻</small></div>
          </div>
          <div class="scoreboard-footer"><span>今日第 ${summary.gamesToday + 1} 場</span><span>${plan.date}</span></div>
        </div>
      </div>
    </section>

    <section class="quick-stats" aria-label="學習摘要">
      <article class="quick-card"><span>已上場單字</span><strong>${summary.learned} / ${WORDS.length}</strong></article>
      <article class="quick-card"><span>總命中率</span><strong>${summary.accuracy}%</strong></article>
      <article class="quick-card"><span>今日比賽</span><strong>${summary.gamesToday} 場</strong></article>
      <article class="quick-card"><span>連續出賽</span><strong>${summary.streakDays} 天</strong></article>
    </section>

    <section class="season-hub section-block">
      <div class="season-heading">
        <div><p class="eyebrow">SEASON JOURNEY</p><h2>新秀賽季</h2></div>
        <button class="secondary-button" data-action="locker">進入新秀更衣室</button>
      </div>
      <div class="xp-row"><span>${gameState.player.xp} XP</span><strong>${level.level === LEVELS.length ? "已進入總冠軍" : `距離「${nextLevel.name}」還差 ${nextLevel.xp - gameState.player.xp} XP`}</strong></div>
      <div class="xp-track"><div style="width:${levelProgress}%"></div></div>
      <div class="season-track">
        ${LEVELS.map((item) => `<div class="season-stop ${item.level <= level.level ? "is-cleared" : ""} ${item.level === level.level ? "is-current" : ""}"><span>${item.level <= level.level ? "✓" : item.level}</span><strong>${item.name}</strong></div>`).join("")}
      </div>
      <div class="badge-shelf">
        ${BADGES.map((badge) => `<article class="mini-badge ${gameState.player.badges[badge.id] ? "is-unlocked" : ""}"><span>${badge.icon}</span><div><strong>${badge.name}</strong><small>${gameState.player.badges[badge.id] ? "已解鎖" : badge.description}</small></div></article>`).join("")}
      </div>
    </section>

    <section class="section-block">
      <div class="section-heading">
        <div><p class="eyebrow">PRACTICE COURT</p><h2>自由練習場</h2></div>
        <p>針對同一批單字加強兩種能力。</p>
      </div>
      <div class="mode-grid">
        <article class="mode-card">
          <span class="mode-number">2</span>
          <span class="mode-tag">兩分球</span>
          <h3>NBA 英選中</h3>
          <p>看英文單字與 NBA 籃球例句，從四個相似單字的中文意思中選答案。</p>
          <div class="mode-actions"><button class="secondary-button" data-action="practice-choice">開始投籃</button></div>
        </article>
        <article class="mode-card">
          <span class="mode-number">3</span>
          <span class="mode-tag">三分球</span>
          <h3>中文拼英文</h3>
          <p>根據中文、第一個字母與字數提示，完整拼出英文單字。</p>
          <div class="mode-actions"><button class="secondary-button" data-action="practice-spelling">挑戰三分</button></div>
        </article>
      </div>
    </section>
  `;
}

function renderWarmup() {
  setActiveNav("");
  const plan = getDailyPlan();
  const ids = plan.newIds.length ? plan.newIds : WORDS.map((word) => word.id);
  app.innerHTML = `
    <div class="screen-header">
      <div><p class="eyebrow">PRE-GAME WARM-UP</p><h2>賽前熱身</h2><p>先認識今天的單字與球場情境，再進入比賽。</p></div>
      <button class="secondary-button" data-action="home">返回首頁</button>
    </div>
    <section class="warmup-grid">
      ${ids.map((id) => renderWarmupCard(getWord(id))).join("")}
    </section>
    <div class="sticky-action"><button class="primary-button" data-action="start-daily">熱身完成，開始比賽</button></div>
  `;
}

function renderWarmupCard(word) {
  return `
    <article class="word-card">
      <div class="word-card-top">
        <div><h3>${word.word}</h3><span class="part-of-speech">${word.partOfSpeech}</span></div>
        <button class="speak-button" data-action="speak" data-word="${word.word}" aria-label="播放 ${word.word} 發音">▶</button>
      </div>
      <p class="word-meaning">${word.chinese}</p>
      <p class="word-sentence">${word.sentence}</p>
      <p class="word-translation">${word.sentenceZh}</p>
    </article>
  `;
}

function renderLocker() {
  setActiveNav("locker");
  const level = getPlayerLevel();
  app.innerHTML = `
    <div class="screen-header">
      <div><p class="eyebrow">ROOKIE LOCKER ROOM</p><h2>新秀更衣室</h2><p>完成比賽、累積 XP，解鎖新的球衣、球鞋與球場。</p></div>
      <button class="secondary-button" data-action="home">返回首頁</button>
    </div>
    <section class="locker-layout">
      <div class="locker-player-card court-${gameState.player.equipped.court}">
        <span class="level-chip">LV.${level.level} · ${level.name}</span>
        ${renderAvatar("locker")}
        <strong>${escapeHtml(gameState.player.name)}</strong>
        <small>${gameState.player.xp} XP · ${gameState.player.wins} 勝 ${gameState.player.losses} 敗</small>
      </div>
      <div class="locker-controls">
        <form id="playerForm" class="player-form">
          <label>球員名稱<input name="playerName" maxlength="12" value="${escapeHtml(gameState.player.name)}" aria-label="球員名稱" /></label>
          <label>球衣號碼<input name="playerNumber" type="number" min="0" max="99" value="${gameState.player.number}" aria-label="球衣號碼" /></label>
          <button class="primary-button" type="submit">儲存球員</button>
        </form>
        ${renderGearGroup("skin", "膚色", level.level)}
        ${renderGearGroup("hair", "髮型", level.level)}
        ${renderGearGroup("jersey", "球衣", level.level)}
        ${renderGearGroup("shoes", "球鞋", level.level)}
        ${renderGearGroup("wristband", "護腕", level.level)}
        ${renderGearGroup("court", "主場球館", level.level)}
        <div class="sound-setting">
          <div><strong>球場音效</strong><small>進球、碰框與解鎖音效</small></div>
          <button class="secondary-button" data-action="toggle-sound">${gameState.player.soundEnabled ? "音效開啟" : "音效關閉"}</button>
        </div>
      </div>
    </section>
    <section class="section-block">
      <div class="section-heading"><div><p class="eyebrow">TROPHY WALL</p><h2>榮譽牆</h2></div><p>${Object.keys(gameState.player.badges).length} / ${BADGES.length} 枚徽章</p></div>
      <div class="trophy-grid">${BADGES.map((badge) => `
        <article class="trophy-card ${gameState.player.badges[badge.id] ? "is-unlocked" : ""}">
          <span>${badge.icon}</span><h3>${badge.name}</h3><p>${badge.description}</p>
          <small>${gameState.player.badges[badge.id] ? `解鎖於 ${gameState.player.badges[badge.id].slice(0, 10)}` : "尚未解鎖"}</small>
        </article>`).join("")}</div>
    </section>`;
}

function renderGearGroup(slot, title, currentLevel) {
  return `<section class="gear-group"><h3>${title}</h3><div class="gear-options">${GEAR[slot].map((item) => {
    const locked = currentLevel < item.level;
    const equipped = gameState.player.equipped[slot] === item.id;
    return `<button class="gear-option ${equipped ? "is-equipped" : ""} ${locked ? "is-locked" : ""}" data-action="equip" data-slot="${slot}" data-item="${item.id}" ${locked ? "disabled" : ""}>
      <span ${item.color ? `style="--swatch:${item.color}"` : ""}></span><strong>${item.name}</strong><small>${locked ? `LV.${item.level} 解鎖` : equipped ? "使用中" : "點擊裝備"}</small>
    </button>`;
  }).join("")}</div></section>`;
}

function startGame(kind, fixedMode = null) {
  const plan = getDailyPlan();
  const level = getPlayerLevel();
  const alreadyPlayedDaily = gameState.sessions.some(
    (session) => session.date === plan.date && session.kind === "daily",
  );
  let questions;

  if (kind === "daily") {
    const todayDailySessions = gameState.sessions.filter(
      (session) => session.date === plan.date && session.kind === "daily",
    );
    const lastDailySession = todayDailySessions[0];
    const usedReviewIds = todayDailySessions.flatMap((session) =>
      (session.answers || []).filter((answer) => answer.source === "review").map((answer) => answer.wordId));
    if (alreadyPlayedDaily) {
      const replayLimit = Math.min(
        20,
        WORDS.filter((word) => getWordStat(word.id).attempts > 0).length,
      );
      const replayIds = buildReviewCandidates([], [
        ...(lastDailySession?.answers || []).map((answer) => answer.wordId),
        ...usedReviewIds,
      ]).slice(0, replayLimit).map((item) => item.id);
      questions = replayIds.map((id) => ({
        id,
        mode: getWordStat(id).choiceCorrect > 0 ? "spelling" : "choice",
        source: "review",
      }));
    } else {
      questions = [
        ...plan.newIds.map((id) => ({ id, mode: "choice", source: "new" })),
        ...plan.reviewIds.map((id) => ({
          id,
          mode: getWordStat(id).choiceCorrect > 0 ? "spelling" : "choice",
          source: "review",
        })),
      ];
    }
  } else {
    questions = shuffle(WORDS).map((word) => ({ id: word.id, mode: fixedMode, source: "practice" }));
  }

  if (!questions.length) {
    showToast("目前沒有可挑戰的單字。");
    return;
  }

  currentSession = {
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    kind,
    fixedMode,
    date: getTaipeiDate(),
    startedAt: new Date().toISOString(),
    questions: kind === "daily" ? questions : shuffle(questions),
    index: 0,
    score: 0,
    opponentScore: 0,
    opponentName: level.opponent,
    opponentPace: level.level >= 3 ? 2 : 3,
    correct: 0,
    wrong: 0,
    choiceCorrect: 0,
    choiceAttempts: 0,
    spellingCorrect: 0,
    spellingAttempts: 0,
    streak: 0,
    bestStreak: 0,
    recoveries: 0,
    steals: 0,
    rebounds: 0,
    halftimeShown: false,
    wasBehindAtHalf: false,
    newBadges: [],
    answers: [],
    feedback: null,
  };
  renderQuestion();
}

function renderQuestion() {
  setActiveNav("");
  const question = currentSession.questions[currentSession.index];
  const word = getWord(question.id);
  const isChoice = question.mode === "choice";
  const quarterSize = Math.max(1, Math.ceil(currentSession.questions.length / 4));
  const quarter = Math.min(4, Math.floor(currentSession.index / quarterSize) + 1);
  const progress = (currentSession.index / currentSession.questions.length) * 100;
  const onFire = currentSession.streak >= 3;
  currentQuestionStartedAt = Date.now();

  app.innerHTML = `
    <div class="screen-header">
      <div><p class="eyebrow">QUARTER ${quarter}</p><h2>${isChoice ? "兩分球" : "三分球"}挑戰 ${onFire ? "🔥" : ""}</h2></div>
      <div class="screen-actions"><button class="sound-button" data-action="toggle-sound" aria-label="切換音效">${gameState.player.soundEnabled ? "♪" : "×"}</button><button class="secondary-button" data-action="quit">離開比賽</button></div>
    </div>
    <div class="game-scorebar ${onFire ? "is-on-fire" : ""}">
      <div><span>${escapeHtml(gameState.player.name)}</span><strong>${currentSession.score}</strong></div>
      <div><span>Q${quarter} · 第 ${currentSession.index + 1} 球</span><strong>${onFire ? "ON FIRE" : `${currentSession.index + 1} / ${currentSession.questions.length}`}</strong></div>
      <div><span>${currentSession.opponentName}</span><strong>${currentSession.opponentScore}</strong></div>
    </div>
    <div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div>
    <section class="court-panel court-${gameState.player.equipped.court}">
      <div class="question-meta">
        <span>${question.source === "new" ? "今日新字" : question.source === "review" ? "歷史複習" : "自由練習"} · 連續命中 ${currentSession.streak}</span>
        <span class="shot-badge ${isChoice ? "" : "is-three"}">${isChoice ? "2 POINT SHOT" : "3 POINT SHOT"}</span>
      </div>
      <div class="shot-stage" aria-hidden="true"><span class="game-hoop"></span><span class="game-ball" id="gameBall"></span><span class="shot-call" id="shotCall"></span></div>
      <div class="question-content">
        ${isChoice ? renderChoiceQuestion(word) : renderSpellingQuestion(word)}
      </div>
    </section>
  `;

  if (!isChoice) {
    window.setTimeout(() => document.querySelector("#spellingInput")?.focus(), 0);
  }
}

function renderChoiceQuestion(word) {
  const options = shuffle(word.options);
  return `
    <div class="question-word">${word.word}</div>
    <p class="question-sentence">${word.sentence}</p>
    <div class="options-grid">
      ${options.map((option) => `<button class="option-button" data-action="answer-choice" data-answer="${option}">${option}</button>`).join("")}
    </div>
  `;
}

function renderSpellingQuestion(word) {
  const hideFirstLetter = getPlayerLevel().level >= 4 && getWordStat(word.id).spellingCorrect >= 1;
  let revealedFirstLetter = false;
  const mask = [...word.word].map((character) => {
    if (character === " ") return '<span class="word-gap" aria-hidden="true">/</span>';
    if (!hideFirstLetter && !revealedFirstLetter && /[a-z]/i.test(character)) {
      revealedFirstLetter = true;
      return escapeHtml(character);
    }
    return "_";
  }).join(" ");
  const letterCount = [...word.word].filter((character) => /[a-z]/i.test(character)).length;
  return `
    <div class="question-chinese">${word.chinese}</div>
    <div class="letter-mask" aria-label="${hideFirstLetter ? "季後賽加時挑戰，不提示首字母" : `第一個字母 ${word.word[0]}`}，共 ${letterCount} 個英文字母">${mask}</div>
    ${hideFirstLetter ? `<p class="clutch-note">CLUTCH MODE · 季後賽不提示首字母</p>` : ""}
    <form class="spelling-form" id="spellingForm">
      <input id="spellingInput" class="spelling-input" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="輸入完整英文單字" aria-label="輸入英文答案" />
      <button class="primary-button" type="submit">出手</button>
    </form>
  `;
}

function submitAnswer(answer) {
  if (!currentSession || currentSession.feedback) return;
  const question = currentSession.questions[currentSession.index];
  const word = getWord(question.id);
  const normalized = String(answer).trim().toLowerCase().replace(/\s+/g, " ");
  const correctAnswer = question.mode === "choice" ? word.chinese : word.word;
  const isCorrect = normalized === correctAnswer.toLowerCase().replace(/\s+/g, " ");
  const responseMs = Date.now() - currentQuestionStartedAt;
  const previousStat = getWordStat(word.id);
  const wasWrongBefore = previousStat.wrong > 0;
  const isSteal = isCorrect && wasWrongBefore;
  const points = isCorrect ? (question.mode === "choice" ? 2 : 3) : 0;
  const opponentPoints = isCorrect
    ? ((currentSession.index + 1) % currentSession.opponentPace === 0 ? 2 : 0)
    : 2;

  currentSession.score += points;
  currentSession.opponentScore += opponentPoints;
  currentSession.correct += isCorrect ? 1 : 0;
  currentSession.wrong += isCorrect ? 0 : 1;
  currentSession.streak = isCorrect ? currentSession.streak + 1 : 0;
  currentSession.bestStreak = Math.max(currentSession.bestStreak, currentSession.streak);
  currentSession.recoveries += isSteal ? 1 : 0;
  currentSession.steals += isSteal ? 1 : 0;
  currentSession.rebounds += isCorrect ? 0 : 1;
  currentSession[`${question.mode}Attempts`] += 1;
  currentSession[`${question.mode}Correct`] += isCorrect ? 1 : 0;
  currentSession.answers.push({
    wordId: word.id,
    mode: question.mode,
    source: question.source,
    answer: String(answer).trim(),
    correct: isCorrect,
    points,
    opponentPoints,
    responseMs,
    answeredAt: new Date().toISOString(),
  });

  updateWordStat(word.id, question.mode, String(answer).trim(), isCorrect);
  currentSession.feedback = { isCorrect, isSteal, answer: String(answer).trim(), points, opponentPoints };
  animateShot(isCorrect, points);
  playGameSound(isCorrect ? "make" : "miss");
  renderFeedback(word, question, currentSession.feedback);
}

function animateShot(isCorrect, points) {
  const ball = document.querySelector("#gameBall");
  const call = document.querySelector("#shotCall");
  if (!ball || !call) return;
  ball.classList.add(isCorrect ? "is-make" : "is-miss");
  call.textContent = isCorrect ? `${points} POINTS!` : "RIM OUT";
  call.classList.add(isCorrect ? "is-make" : "is-miss");
}

function playGameSound(type) {
  if (!gameState.player.soundEnabled || !("AudioContext" in window || "webkitAudioContext" in window)) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.type = type === "miss" ? "square" : "sine";
    oscillator.frequency.setValueAtTime(type === "miss" ? 150 : type === "unlock" ? 520 : 420, context.currentTime);
    if (type !== "miss") oscillator.frequency.exponentialRampToValueAtTime(type === "unlock" ? 900 : 680, context.currentTime + 0.18);
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.25);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.26);
  } catch {
    // 音效不支援時不影響作答。
  }
}

function updateWordStat(id, mode, answer, isCorrect) {
  const stat = getWordStat(id);
  stat.attempts += 1;
  stat.correct += isCorrect ? 1 : 0;
  stat.wrong += isCorrect ? 0 : 1;
  stat[`${mode}Attempts`] += 1;
  stat[`${mode}Correct`] += isCorrect ? 1 : 0;
  stat.consecutiveCorrect = isCorrect ? stat.consecutiveCorrect + 1 : 0;
  stat.lastAnswer = answer;
  stat.lastAnsweredAt = new Date().toISOString();
  const intervals = [1, 3, 7, 14, 30];
  const days = isCorrect ? intervals[Math.min(stat.consecutiveCorrect - 1, intervals.length - 1)] : 1;
  const reviewDate = new Date();
  reviewDate.setDate(reviewDate.getDate() + days);
  stat.nextReviewAt = reviewDate.toISOString().slice(0, 10);
  gameState.wordStats[id] = stat;
  persistState();
}

function renderFeedback(word, question, feedback) {
  const isChoice = question.mode === "choice";
  const optionButtons = [...document.querySelectorAll(".option-button")];
  optionButtons.forEach((button) => {
    button.disabled = true;
    if (button.dataset.answer === word.chinese) button.classList.add("is-correct");
    if (!feedback.isCorrect && button.dataset.answer === feedback.answer) button.classList.add("is-wrong");
  });
  document.querySelector("#spellingForm")?.remove();

  const content = document.querySelector(".question-content");
  content.insertAdjacentHTML(
    "beforeend",
    `<div class="feedback-panel ${feedback.isCorrect ? "is-correct" : "is-wrong"}">
      <div class="feedback-title ${feedback.isCorrect ? "is-correct" : "is-wrong"}">
        ${feedback.isCorrect
          ? `${feedback.isSteal ? "成功抄截！" : "命中！"}+${feedback.points} 分`
          : `球碰框了，${currentSession.opponentName} 得 ${feedback.opponentPoints} 分`}
      </div>
      <div><strong>${word.word}</strong>＝${word.chinese}</div>
      <p class="word-translation">${word.sentenceZh}</p>
      ${feedback.isCorrect ? "" : `<p class="rebound-note">🏀 已搶下錯題籃板，這個字會優先排進複習。</p>`}
      ${isChoice ? `<div class="confusion-list">${word.confusions.map((item) => `<span>${item}</span>`).join("")}</div>` : ""}
      <div class="hero-actions">
        <button class="primary-button" data-action="next-question">${currentSession.index + 1 === currentSession.questions.length ? "看比賽結果" : "下一球"}</button>
        <button class="speak-button" data-action="speak" data-word="${word.word}" aria-label="播放發音">▶</button>
      </div>
    </div>`,
  );
}

function nextQuestion() {
  currentSession.feedback = null;
  currentSession.index += 1;
  if (currentSession.index >= currentSession.questions.length) {
    finishSession();
  } else if (!currentSession.halftimeShown && currentSession.index === Math.ceil(currentSession.questions.length / 2)) {
    currentSession.halftimeShown = true;
    currentSession.wasBehindAtHalf = currentSession.score < currentSession.opponentScore;
    renderHalftime();
  } else {
    renderQuestion();
  }
}

function renderHalftime() {
  setActiveNav("");
  const leading = currentSession.score >= currentSession.opponentScore;
  app.innerHTML = `
    <section class="halftime-screen">
      <p class="eyebrow">HALF TIME</p>
      <h2>${leading ? "守住領先，繼續進攻！" : "還有下半場，準備逆轉！"}</h2>
      <div class="halftime-score">
        <div>${renderAvatar("small")}<span>${escapeHtml(gameState.player.name)}</span><strong>${currentSession.score}</strong></div>
        <b>－</b>
        <div><span class="opponent-mark">${currentSession.opponentName.slice(0, 1)}</span><span>${currentSession.opponentName}</span><strong>${currentSession.opponentScore}</strong></div>
      </div>
      <div class="halftime-stats">
        <span>命中 ${currentSession.correct} 球</span><span>抄截 ${currentSession.steals}</span><span>籃板 ${currentSession.rebounds}</span><span>最長連中 ${currentSession.bestStreak}</span>
      </div>
      <button class="primary-button" data-action="continue-game">進入下半場</button>
    </section>`;
}

function finishSession() {
  currentSession.completedAt = new Date().toISOString();
  currentSession.durationSeconds = Math.max(
    1,
    Math.round((new Date(currentSession.completedAt) - new Date(currentSession.startedAt)) / 1000),
  );
  currentSession.playerWon = currentSession.score > currentSession.opponentScore;
  currentSession.isTie = currentSession.score === currentSession.opponentScore;
  gameState.sessions.unshift(currentSession);
  applyPlayerProgress(currentSession);
  gameState.sessions = gameState.sessions.slice(0, 120);
  persistState();
  renderResults(currentSession);
}

function applyPlayerProgress(session) {
  const previousLevel = getPlayerLevel();
  const completionXp = session.kind === "daily" ? 20 : 8;
  session.xpEarned = completionXp + session.correct * 5 + session.steals * 5 + (session.playerWon ? 20 : 0);
  gameState.player.xp += session.xpEarned;
  if (session.kind === "daily") {
    if (session.playerWon) gameState.player.wins += 1;
    else if (!session.isTie) gameState.player.losses += 1;
  }

  const unlock = (id, condition) => {
    if (!condition || gameState.player.badges[id]) return;
    gameState.player.badges[id] = new Date().toISOString();
    session.newBadges.push(id);
  };
  unlock("sniper", session.spellingCorrect >= 5);
  unlock("defender", session.steals >= 3);
  unlock("comeback", session.wasBehindAtHalf && session.playerWon);
  unlock("buzzer", session.answers[session.answers.length - 1]?.correct === true);
  unlock(
    "allrounder",
    session.choiceAttempts > 0
      && session.spellingAttempts > 0
      && session.choiceCorrect / session.choiceAttempts >= 0.8
      && session.spellingCorrect / session.spellingAttempts >= 0.8,
  );
  unlock("seven", getDailyStreak() >= 7);

  const newLevel = getPlayerLevel();
  session.leveledUp = newLevel.level > previousLevel.level ? newLevel : null;
  if (session.newBadges.length || session.leveledUp) playGameSound("unlock");
}

function renderResults(session) {
  setActiveNav("");
  const wrongAnswers = session.answers.filter((answer) => !answer.correct);
  const accuracy = Math.round((session.correct / session.answers.length) * 100);
  const possibleScore = session.answers.reduce(
    (sum, answer) => sum + (answer.mode === "choice" ? 2 : 3),
    0,
  );
  const starterTarget = Math.max(1, Math.ceil(possibleScore * 0.7));
  const outcomeTitle = session.playerWon ? "勝利！" : session.isTie ? "平手，再戰一場！" : "惜敗，準備逆轉！";
  app.innerHTML = `
    <div class="screen-header"><div><p class="eyebrow">FINAL BOX SCORE</p><h2>比賽結束</h2></div></div>
    <section class="result-hero ${session.playerWon ? "is-win" : ""}">
      <p class="eyebrow">${session.score >= starterTarget ? "LEVEL CLEARED" : "GAME COMPLETE"}</p>
      <h2>${outcomeTitle}</h2>
      <div class="final-match-score"><div><span>${escapeHtml(gameState.player.name)}</span><strong>${session.score}</strong></div><b>－</b><div><span>${session.opponentName}</span><strong>${session.opponentScore}</strong></div></div>
      <p>獲得 ${session.xpEarned} XP</p>
      <div class="result-grid">
        <article class="result-panel"><span>兩分球</span><strong>${session.choiceCorrect}/${session.choiceAttempts}</strong></article>
        <article class="result-panel"><span>三分球</span><strong>${session.spellingCorrect}/${session.spellingAttempts}</strong></article>
        <article class="result-panel"><span>命中率</span><strong>${accuracy}%</strong></article>
        <article class="result-panel"><span>出場時間</span><strong>${formatDuration(session.durationSeconds)}</strong></article>
        <article class="result-panel"><span>成功抄截</span><strong>${session.steals}</strong></article>
        <article class="result-panel"><span>搶下籃板</span><strong>${session.rebounds}</strong></article>
        <article class="result-panel"><span>最長連中</span><strong>${session.bestStreak}</strong></article>
        <article class="result-panel"><span>經驗值</span><strong>+${session.xpEarned}</strong></article>
      </div>
      ${session.leveledUp ? `<div class="unlock-banner"><strong>LEVEL UP！${session.leveledUp.name}</strong><span>新的裝備已經放進更衣室。</span></div>` : ""}
      ${session.newBadges.length ? `<div class="new-badges">${session.newBadges.map((id) => {
        const badge = BADGES.find((item) => item.id === id);
        return `<span><b>${badge.icon}</b>${badge.name}</span>`;
      }).join("")}</div>` : ""}
      <div class="result-actions">
        <button class="primary-button" data-action="replay">再次挑戰</button>
        <button class="secondary-button" data-action="locker">查看解鎖裝備</button>
        <button class="secondary-button" data-action="home">回到首頁</button>
      </div>
    </section>
    <section class="section-block">
      <div class="section-heading"><div><p class="eyebrow">FILM ROOM</p><h2>賽後檢討</h2></div><p>成功救回 ${session.recoveries} 個曾經答錯的單字。</p></div>
      ${wrongAnswers.length
        ? `<div class="wrong-list">${wrongAnswers.map((answer) => {
            const word = getWord(answer.wordId);
            return `<div class="wrong-row"><div><strong>${word.word}</strong><span>　${word.chinese}</span></div><span>你的答案：${answer.answer || "未作答"}</span></div>`;
          }).join("")}</div>`
        : `<div class="empty-state">完美命中，這場沒有錯題！</div>`}
    </section>
  `;
  currentSession = session;
}

function renderStats() {
  setActiveNav("stats");
  const summary = getSummary();
  app.innerHTML = `
    <div class="screen-header">
      <div><p class="eyebrow">PLAYER BOX SCORE</p><h2>單字戰績</h2><p>每個單字的作答次數、答對比例與兩種題型表現。</p></div>
      <div class="quick-card"><span>總命中率</span><strong>${summary.accuracy}%</strong></div>
    </div>
    <section class="word-stats-grid">
      ${WORDS.map((word) => renderWordStat(word, getWordStat(word.id))).join("")}
    </section>
  `;
}

function renderWordStat(word, stat) {
  const accuracy = stat.attempts ? Math.round((stat.correct / stat.attempts) * 100) : 0;
  const choiceAccuracy = stat.choiceAttempts ? Math.round((stat.choiceCorrect / stat.choiceAttempts) * 100) : 0;
  const spellingAccuracy = stat.spellingAttempts ? Math.round((stat.spellingCorrect / stat.spellingAttempts) * 100) : 0;
  return `
    <article class="stat-card">
      <div class="word-stat-head">
        <div><h3>${word.word}</h3><span class="part-of-speech">${word.chinese}</span></div>
        <div class="accuracy-ring" style="--progress:${accuracy}%" data-label="${accuracy}%"></div>
      </div>
      <div class="stat-card-meta">
        <div><span>作答</span><strong>${stat.attempts} 次</strong></div>
        <div><span>兩分球</span><strong>${choiceAccuracy}%</strong></div>
        <div><span>三分球</span><strong>${spellingAccuracy}%</strong></div>
      </div>
    </article>
  `;
}

function speakWord(word) {
  if (!("speechSynthesis" in window)) {
    showToast("這個瀏覽器暫不支援發音。");
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = "en-US";
  utterance.rate = 0.82;
  window.speechSynthesis.speak(utterance);
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

function updateCloudIdentity(user = cloud?.user) {
  if (!user) {
    cloudButton.classList.remove("is-connected");
    cloudButton.removeAttribute("aria-busy");
    cloudLabel.textContent = "Google 登入";
    cloudIdentity.textContent = "尚未登入玩家";
    cloudButton.setAttribute("aria-label", "使用 Google 帳號登入");
    return;
  }
  const playerName = user.displayName || gameState.player.name || "PLAYER";
  cloudButton.classList.add("is-connected");
  cloudButton.removeAttribute("aria-busy");
  cloudLabel.textContent = `玩家：${playerName}`;
  cloudIdentity.textContent = user.email || "Google 帳號";
  cloudButton.setAttribute("aria-label", `目前玩家 ${playerName}，開啟帳號選單`);
}

function closeAccountModal() {
  accountModal.hidden = true;
  accountModal.innerHTML = "";
}

function openAccountPanel() {
  if (!cloud?.user) return;
  const displayName = cloud.user.displayName || gameState.player.name || "PLAYER";
  accountModal.innerHTML = `
    <button class="account-scrim" data-action="close-account" aria-label="關閉玩家選單"></button>
    <section class="account-dialog" role="dialog" aria-modal="true" aria-labelledby="accountTitle" tabindex="-1">
      <p class="eyebrow">CURRENT PLAYER</p>
      <h2 id="accountTitle">目前登入玩家</h2>
      <div class="account-player-card">
        <span class="account-initial">${escapeHtml(displayName.slice(0, 1).toUpperCase())}</span>
        <div><strong>${escapeHtml(displayName)}</strong><small>${escapeHtml(cloud.user.email || "Google 帳號")}</small></div>
      </div>
      <p class="account-note">這個帳號的闖關、XP、錯題與正確率會獨立同步。</p>
      <div class="account-actions">
        <button class="primary-button" data-action="switch-account">切換玩家</button>
        <button class="secondary-button" data-action="sign-out">登出</button>
        <button class="text-button" data-action="close-account">返回遊戲</button>
      </div>
    </section>`;
  accountModal.hidden = false;
  accountModal.querySelector(".account-dialog")?.focus();
}

function requestNewPlayerChoice(user, localState) {
  const canImport = hasMeaningfulProgress(localState);
  return new Promise((resolve) => {
    accountChoiceResolve = resolve;
    accountModal.innerHTML = `
      <button class="account-scrim" data-action="cancel-new-account" aria-label="取消登入"></button>
      <section class="account-dialog choice-dialog" role="dialog" aria-modal="true" aria-labelledby="newPlayerTitle" tabindex="-1">
        <p class="eyebrow">NEW GOOGLE PLAYER</p>
        <h2 id="newPlayerTitle">第一次使用這個帳號</h2>
        <p class="account-email">${escapeHtml(user.email || "Google 帳號")}</p>
        <div class="account-choice-grid">
          <button class="account-choice" data-action="create-new-player">
            <span>01</span><strong>建立全新球員</strong><small>從 0 XP 開始，不帶入其他人的紀錄。</small>
          </button>
          <button class="account-choice" data-action="import-local-progress" ${canImport ? "" : "disabled"}>
            <span>02</span><strong>匯入本機紀錄</strong><small>${canImport ? "帶入這台裝置尚未登入時的闖關紀錄。" : "這台裝置目前沒有可匯入的訪客紀錄。"}</small>
          </button>
        </div>
        <button class="text-button" data-action="cancel-new-account">取消登入</button>
      </section>`;
    accountModal.hidden = false;
    accountModal.querySelector(".account-dialog")?.focus();
  });
}

function resolveAccountChoice(choice) {
  const resolve = accountChoiceResolve;
  accountChoiceResolve = null;
  closeAccountModal();
  resolve?.(choice);
}

async function getFirebaseServices() {
  if (firebaseServicesPromise) return firebaseServicesPromise;
  firebaseServicesPromise = (async () => {
    const { firebaseConfig } = await import("./firebase-config.js");
    if (!firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("YOUR_")) {
      throw new Error("Firebase is not configured");
    }
    const [{ initializeApp, getApps, getApp }, authModule, firestoreModule] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js"),
    ]);
    const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const auth = authModule.getAuth(firebaseApp);
    await authModule.setPersistence(auth, authModule.browserLocalPersistence);
    return { auth, authModule, db: firestoreModule.getFirestore(firebaseApp), firestoreModule };
  })();
  return firebaseServicesPromise;
}

function attachCloudUser(user, stateRef, services) {
  cloud = {
    user,
    auth: services.auth,
    authModule: services.authModule,
    saveTimer: null,
    save: (nextState) => services.firestoreModule.setDoc(stateRef, nextState),
  };
  localStorage.setItem(accountStorageKey(user.uid), JSON.stringify(gameState));
  updateCloudIdentity(user);
}

async function loadCloudPlayer(user, localCandidate, services) {
  const stateRef = services.firestoreModule.doc(services.db, "users", user.uid, "game", "main");
  const cloudSnapshot = await services.firestoreModule.getDoc(stateRef);
  if (cloudSnapshot.exists()) {
    gameState = normalizeState(cloudSnapshot.data());
    if (
      hasMeaningfulProgress(localCandidate)
      && progressFingerprint(localCandidate) === progressFingerprint(gameState)
    ) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyState()));
    }
  } else {
    const choice = await requestNewPlayerChoice(user, localCandidate);
    if (choice === "cancel") {
      await services.authModule.signOut(services.auth);
      cloud = null;
      updateCloudIdentity();
      renderHome();
      return false;
    }
    gameState = choice === "import" ? normalizeState(localCandidate) : emptyState();
    await services.firestoreModule.setDoc(stateRef, gameState);
  }
  attachCloudUser(user, stateRef, services);
  currentSession = null;
  renderHome();
  showToast(`已載入 ${user.displayName || user.email || "Google 玩家"} 的獨立紀錄。`);
  return true;
}

async function connectCloud() {
  if (cloud?.user) {
    openAccountPanel();
    return;
  }
  if (cloudConnecting) return;
  cloudConnecting = true;
  cloudLabel.textContent = "連線中…";
  cloudIdentity.textContent = "請選擇 Google 玩家";
  cloudButton.setAttribute("aria-busy", "true");
  try {
    const services = await getFirebaseServices();
    const provider = new services.authModule.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const localCandidate = loadStateFromKey(STORAGE_KEY);
    const result = await services.authModule.signInWithPopup(services.auth, provider);
    await loadCloudPlayer(result.user, localCandidate, services);
  } catch (error) {
    console.error("Cloud connection failed", error);
    updateCloudIdentity();
    showToast("這次沒有完成登入，訪客紀錄仍保留在這台裝置。 ");
  } finally {
    cloudConnecting = false;
    cloudButton.removeAttribute("aria-busy");
  }
}

async function signOutPlayer({ switchAccount = false } = {}) {
  try {
    if (cloud?.save) await cloud.save(gameState);
    const services = await getFirebaseServices();
    await services.authModule.signOut(services.auth);
    cloud = null;
    gameState = loadStateFromKey(STORAGE_KEY);
    currentSession = null;
    closeAccountModal();
    updateCloudIdentity();
    renderHome();
    showToast(switchAccount ? "已登出，請選擇下一位玩家。" : "已登出，現在使用這台裝置的訪客紀錄。");
    if (switchAccount) await connectCloud();
  } catch (error) {
    console.error("Sign out failed", error);
    showToast("登出沒有完成，請稍後再試。");
  }
}

async function restoreCloudSession() {
  try {
    const services = await getFirebaseServices();
    await services.auth.authStateReady();
    if (!services.auth.currentUser) {
      updateCloudIdentity();
      return;
    }
    const cachedState = loadStateFromKey(accountStorageKey(services.auth.currentUser.uid));
    if (hasMeaningfulProgress(cachedState)) {
      gameState = cachedState;
      renderHome();
    }
    await loadCloudPlayer(services.auth.currentUser, loadStateFromKey(STORAGE_KEY), services);
  } catch (error) {
    console.error("Cloud session restore failed", error);
    updateCloudIdentity();
  }
}

app.addEventListener("submit", (event) => {
  if (event.target.id === "spellingForm") {
    event.preventDefault();
    const input = document.querySelector("#spellingInput");
    if (!input.value.trim()) {
      showToast("先輸入答案再出手！");
      input.focus();
      return;
    }
    submitAnswer(input.value);
  }
  if (event.target.id === "playerForm") {
    event.preventDefault();
    const data = new FormData(event.target);
    const cleanName = String(data.get("playerName") || "ROOKIE")
      .replace(/[^\p{L}\p{N} _-]/gu, "")
      .trim()
      .slice(0, 12) || "ROOKIE";
    gameState.player.name = cleanName;
    gameState.player.number = Math.min(99, Math.max(0, Number(data.get("playerNumber")) || 0));
    persistState();
    showToast("球員資料已更新。");
    renderLocker();
  }
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "home") renderHome();
  if (action === "stats") renderStats();
  if (action === "locker") renderLocker();
  if (action === "warmup") renderWarmup();
  if (action === "daily") {
    const plan = getDailyPlan();
    const hasFinishedToday = gameState.sessions.some(
      (session) => session.date === plan.date && session.kind === "daily",
    );
    if (!hasFinishedToday && plan.newIds.length) renderWarmup();
    else startGame("daily");
  }
  if (action === "start-daily") startGame("daily");
  if (action === "practice-choice") startGame("practice", "choice");
  if (action === "practice-spelling") startGame("practice", "spelling");
  if (action === "answer-choice") submitAnswer(button.dataset.answer);
  if (action === "next-question") nextQuestion();
  if (action === "continue-game") renderQuestion();
  if (action === "speak") speakWord(button.dataset.word);
  if (action === "cloud") connectCloud();
  if (action === "close-account") closeAccountModal();
  if (action === "sign-out") signOutPlayer();
  if (action === "switch-account") signOutPlayer({ switchAccount: true });
  if (action === "create-new-player") resolveAccountChoice("new");
  if (action === "import-local-progress") resolveAccountChoice("import");
  if (action === "cancel-new-account") resolveAccountChoice("cancel");
  if (action === "toggle-sound") {
    gameState.player.soundEnabled = !gameState.player.soundEnabled;
    persistState();
    showToast(gameState.player.soundEnabled ? "球場音效已開啟。" : "球場音效已關閉。");
    button.textContent = gameState.player.soundEnabled
      ? (button.classList.contains("sound-button") ? "♪" : "音效開啟")
      : (button.classList.contains("sound-button") ? "×" : "音效關閉");
  }
  if (action === "equip") {
    const slot = button.dataset.slot;
    const item = GEAR[slot]?.find((gear) => gear.id === button.dataset.item);
    if (item && getPlayerLevel().level >= item.level) {
      gameState.player.equipped[slot] = item.id;
      persistState();
      playGameSound("unlock");
      renderLocker();
    }
  }
  if (action === "quit" && window.confirm("要先離開這場比賽嗎？目前這場尚未完成。")) renderHome();
  if (action === "replay") startGame(currentSession.kind, currentSession.fixedMode);
});

renderHome();
updateCloudIdentity();
restoreCloudSession();
