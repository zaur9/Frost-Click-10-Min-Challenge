import { CONFIG } from './config.js';

// === MUSIC: new functionality only ===
// (added without modifying existing functions)
const bgMusic = typeof document !== 'undefined' ? document.getElementById("bg-music") : null;
const musicToggleStart = typeof document !== 'undefined' ? document.getElementById("music-toggle-start") : null;
const musicToggleGame = typeof document !== 'undefined' ? document.getElementById("music-toggle-game") : null;

let musicEnabled = false;

function updateMusicButtons() {
  const label = musicEnabled ? "Music: ON" : "Music: OFF";
  if (musicToggleStart) musicToggleStart.textContent = label;
  if (musicToggleGame) musicToggleGame.textContent = label;
}

function toggleMusic() {
  musicEnabled = !musicEnabled;

  try {
    if (musicEnabled) {
      if (bgMusic) {
        // comfortable default volume
        bgMusic.volume = 0.45;
        // try to play; user gesture required in some browsers — errors are caught silently
        bgMusic.play().catch(() => {});
      }
    } else {
      if (bgMusic) bgMusic.pause();
    }
  } catch (e) {
    // silent
  }

  updateMusicButtons();
}

if (musicToggleStart) musicToggleStart.addEventListener("click", toggleMusic);
if (musicToggleGame) musicToggleGame.addEventListener("click", toggleMusic);
updateMusicButtons();
// === end of MUSIC block ===


// === GLOBAL ===
let score = 0;
let gameActive = false;
let isFrozen = false;
let isPaused = false;

let objects = [];
let gameLoopId = null;
let startTime = 0;
let timerInterval = null;
let spawnIntervalId = null;

// frame timing
let lastFrameTime = null;

// click hitbox padding (only bottom) to make fast objects easier to catch
const HIT_PADDING_BOTTOM = 12;
const HIT_PADDING_SNOW_TOP = 12;
const HIT_PADDING_SNOW_SIDE = 4;

// пауза
let pauseStart = null;
let pausedAccum = 0;

// Somnia schedule
const SOMNIA_INTERVAL_MS = 58_000;
const SOMNIA_TOTAL = 10;
let somniaSchedule = [];
let nextSomniaIndex = 0;

let lastIceSpawn = 0;
const ICE_INTERVAL = 45 * 1000; // ровно 45 секунд

// Time-based spawn settings
const SPAWN_TICK_MS = 150; // run spawner ~6.7 times/sec, independent of FPS
const SPAWN_CHANCE_SNOW = 0.60;  // approx 3/s (0.45 * 6.7)
const SPAWN_CHANCE_BOMB = 0.60;  // approx 3/s
const SPAWN_CHANCE_GIFT = 0.18; // ~1.2/s (0.18 * 6.7)
const SPAWN_CHANCE_ICE = 0.0033;  // ~0.15/s

// DOM
const game = document.getElementById('game');
const scoreEl = document.getElementById('score');
const timerEl = document.getElementById('timer');
const gameOverEl = document.getElementById('game-over');
const resultTitle = document.getElementById('result-title');
const finalScoreEl = document.getElementById('final-score');
const timeSurvivedEl = document.getElementById('time-survived');
const restartBtn = document.getElementById('restart');
const submitScoreBtn = document.getElementById('submit-score');
const showLeaderboardBtn = document.getElementById('show-leaderboard');
const pauseBtn = document.getElementById('pause-btn');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const pbScoreEl = document.getElementById('pb-score');
const PLAYFIELD_TOP_OFFSET = 78;

function getPlayfieldBounds() {
  const side = window.innerWidth * 0.28;
  const left = side;
  const right = window.innerWidth - side;
  return { left, right };
}

// Wallet
let userAccount = null;
export function setUserAccount(addr) {
  userAccount = addr;
  // при смене аккаунта обновляем PB
  updatePersonalBest();
}

export const getScore = () => score;
export const isGameActive = () => gameActive;

export { updateScore, endGame };

// === SCORE ===
function updateScore() {
  if (scoreEl) scoreEl.textContent = `Score: ${score}`;
}

// === TIME ===
function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

// === CREATE OBJECT ===
function createObject(emoji, type, speed) {
  if (!gameActive || isPaused) return;

  const obj = document.createElement('div');
  obj.className = 'object';
  // allow CSS variants (somnia, toys, bombs, etc.)
  if (type) obj.classList.add(type);
  if (type === 'bomb') obj.classList.add('bomb');

  obj.style.top = `${PLAYFIELD_TOP_OFFSET}px`;

  // Ensure somnia has immediate hitbox even if textContent empty / CSS not applied yet
  if (type === 'somnia') {
    obj.style.width = '32px';
    obj.style.height = '32px';
    obj.style.display = 'block';
    // keep empty visual content (background image in CSS will render)
    obj.textContent = ' ';
  } else {
    obj.textContent = emoji;
  }

  // Spawn only inside center playfield (between side battle panels)
  const bounds = getPlayfieldBounds();
  const spawnMinX = bounds.left + 24;
  const spawnMaxX = bounds.right - 24;
  obj.style.left = (spawnMinX + Math.random() * Math.max(1, (spawnMaxX - spawnMinX))) + 'px';
  // Start from the top edge of playfield (below HUD area)
  obj.style.transform = `translateX(-50%) translateY(0px)`;

  game.appendChild(obj);

  // store speed in px per second (existing values are treated as px/sec)
  objects.push({ el: obj, type, y: 0, speed });
}

// === CLICK HANDLING ===
game.addEventListener('click', (e) => {
  if (!gameActive || isPaused) return;

  const x = e.clientX;
  const y = e.clientY;

  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    const rect = obj.el.getBoundingClientRect();

    const isBomb = obj.type === 'bomb';
    const isSnow = obj.type === 'snow';

    const paddingBottom = isBomb
      ? 0
      : isSnow
        ? 0
        : HIT_PADDING_BOTTOM;

    const paddingTop = isSnow ? HIT_PADDING_SNOW_TOP : 0;

    const paddingSide = isSnow ? HIT_PADDING_SNOW_SIDE : 0;
    const hit =
      x >= rect.left - paddingSide && x <= rect.right + paddingSide &&
      y >= rect.top - paddingTop && y <= rect.bottom + paddingBottom;

    if (!hit) continue;

    const type = obj.type;

    obj.el.remove();
    objects.splice(i, 1);

    // FLASH
    const flash = document.createElement("div");
    flash.className = "neon-flash";
    flash.style.left = (rect.left + rect.width / 2 - 20) + "px";
    flash.style.top = (rect.top + rect.height / 2 - 20) + "px";
    game.appendChild(flash);
    setTimeout(() => flash.remove(), 250);

    // FREEZE BONUS
    if (isFrozen) {
      if (type === 'snow') score += 1;
      else if (type === 'bomb') score += 3;
      else if (type === 'gift') score += 5;
      else if (type === 'ice') score += 2;
      else if (type === 'toy-green' || type === 'toy-purple') score += 2;
      else if (type === 'somnia') score += 100;
      updateScore();
      return;
    }

    if (type === 'bomb') {
      endGame(false);
      return;
    }

    if (type === 'ice') {
      activateFreeze();
      score += 2;
    } else if (type === 'toy-green' || type === 'toy-purple') {
      score += 2;
    } else if (type === 'somnia') {
      score += 100;
    } else if (type === 'gift') {
      score += 5;
    } else {
      score += 1;
    }
    updateScore();
    return;
  }
});

// === FREEZE ===
function activateFreeze() {
  if (isFrozen) return;

  isFrozen = true;

  const overlay = document.createElement('div');
  overlay.id = 'freeze-overlay';
  Object.assign(overlay.style, {
    position: 'absolute', top: '0', left: '0',
    width: '100%', height: '100%',
    background: 'rgba(200, 240, 255, 0.3)',
    pointerEvents: 'none',
    zIndex: '5'
  });
  game.appendChild(overlay);

  const freezeTimer = document.createElement('div');
  freezeTimer.id = 'freeze-timer';
  Object.assign(freezeTimer.style, {
    position: 'absolute', top: '50px', right: '20px',
    color: '#a0e0ff', fontSize: '20px', zIndex: '10'
  });
  freezeTimer.textContent = 'Freeze: 5s';
  game.appendChild(freezeTimer);

  let timeLeft = 5;

  const countdown = setInterval(() => {
    timeLeft--;

    if (timeLeft > 0) {
      freezeTimer.textContent = `Freeze: ${timeLeft}s`;
    } else {
      clearInterval(countdown);
      freezeTimer.remove();
      overlay.remove();
      isFrozen = false;
    }
  }, 1000);
}

// === END GAME ===
function endGame(isWin) {
  gameActive = false;

  if (timerInterval) clearInterval(timerInterval);
  if (gameLoopId) cancelAnimationFrame(gameLoopId);

  const elapsed = Date.now() - startTime - pausedAccum;

  resultTitle.textContent = isWin ? '🎉 You Survived 10 Minutes! 🎉' : 'Game Over!';
  finalScoreEl.textContent = `Final Score: ${score}`;
  timeSurvivedEl.textContent = `Time: ${formatTime(elapsed)}`;

  gameOverEl.style.display = 'block';

  submitScoreBtn.style.display = userAccount ? 'block' : 'none';
  showLeaderboardBtn.style.display = userAccount ? 'block' : 'none';
}

// === GAME LOOP ===
function gameLoop(timestamp) {
  if (!gameActive || isPaused) return;

  if (lastFrameTime === null) lastFrameTime = timestamp;
  const dt = (timestamp - lastFrameTime) / 1000; // seconds
  lastFrameTime = timestamp;

  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];

    if (!isFrozen) {
      // speed is px/second, so multiply by dt
      obj.y += obj.speed * dt;
      // preserve translateX(-50%) and update translateY only
      obj.el.style.transform = `translateX(-50%) translateY(${obj.y}px)`;

      if (obj.y > window.innerHeight) {
        obj.el.remove();
        objects.splice(i, 1);
      }
    }
  }

  gameLoopId = requestAnimationFrame(gameLoop);
}

// time-based spawner independent of FPS
function spawnTick() {
  if (!gameActive || isPaused || isFrozen) return;

  const now = Date.now();

if (now - lastIceSpawn >= ICE_INTERVAL) {
  createObject('🧊', 'ice', 80);
  lastIceSpawn = now;
}

  const elapsed = Date.now() - startTime - pausedAccum;
  if (nextSomniaIndex < somniaSchedule.length && elapsed >= somniaSchedule[nextSomniaIndex]) {
    createObject('', 'somnia', 50 + Math.random() * 20);
    nextSomniaIndex++;
  }

  if (Math.random() < SPAWN_CHANCE_SNOW) createObject('❄️', 'snow', 140 + Math.random() * 70); // max 230
  if (Math.random() < SPAWN_CHANCE_BOMB) createObject('💣', 'bomb', 160 + Math.random() * 90); // max 250
  if (Math.random() < SPAWN_CHANCE_GIFT) createObject('🎁', 'gift', 120 + Math.random() * 60); // max 180
}

export async function updatePersonalBest() {
  if (!window.contract || !window.ethereum || !userAccount) {
    if (pbScoreEl) pbScoreEl.textContent = 'Best: 0';
    return;
  }
  try {
    // indexPlusOne should exist in contract ABI (web3.js ensures ABI includes it)
    const idxPlusOne = await window.contract.methods.indexPlusOne(userAccount).call();
    if (idxPlusOne === '0' || idxPlusOne === 0) {
      pbScoreEl.textContent = 'Best: 0';
    } else {
      const idx = Number(idxPlusOne) - 1;
      const entry = await window.contract.methods.leaderboard(idx).call();
      pbScoreEl.textContent = 'Best: ' + entry.score;
    }
  } catch (e) {
    pbScoreEl.textContent = 'Best: ?';
  }
}

// при старте игры или подключении кошелька
if (window.ethereum) {
  window.ethereum.on('accountsChanged', updatePersonalBest);
  window.ethereum.on('chainChanged', updatePersonalBest);
}

if (typeof window.contract !== 'undefined') {
  updatePersonalBest();
}

// === START GAME ===
function startGame() {
  score = 0;
  gameActive = true;
  isFrozen = false;
  isPaused = false;
  objects = [];

  pauseStart = null;
  pausedAccum = 0;

  scoreEl.textContent = "Score: 0";
  timerEl.textContent = "10:00";

  gameOverEl.style.display = 'none';
  pauseBtn.textContent = "Pause";

  const freezeO = document.getElementById('freeze-overlay');
  if (freezeO) freezeO.remove();

  const freezeT = document.getElementById('freeze-timer');
  if (freezeT) freezeT.remove();

  const pauseO = document.getElementById('pause-overlay');
  if (pauseO) pauseO.style.display = 'none';

  document.querySelectorAll('.object').forEach(el => el.remove());

  if (timerInterval) clearInterval(timerInterval);
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  if (spawnIntervalId) clearInterval(spawnIntervalId);

  startTime = Date.now();

  lastIceSpawn = startTime;
  
  lastFrameTime = null;

  // build somnia schedule: first drop at 58s, then every 58s, total 10
  somniaSchedule = Array.from({ length: SOMNIA_TOTAL }, (_, i) => (i + 1) * SOMNIA_INTERVAL_MS);
  nextSomniaIndex = 0;

  timerInterval = setInterval(() => {
    if (isPaused) return;

    const elapsed = Date.now() - startTime - pausedAccum;
    const remaining = CONFIG.GAME_DURATION - elapsed;

    if (remaining <= 0) {
      clearInterval(timerInterval);
      endGame(true);
    } else {
      timerEl.textContent = formatTime(remaining);
    }
  }, 1000);

  spawnIntervalId = setInterval(spawnTick, SPAWN_TICK_MS);
  gameLoopId = requestAnimationFrame(gameLoop);
  updatePersonalBest();
}

// === START SCREEN ===
startBtn.addEventListener("click", () => {
  startScreen.style.display = "none";
  pauseBtn.style.display = 'block';
  startGame();
});

// === PAUSE ===
pauseBtn.addEventListener("click", () => {
  if (!gameActive) return;

  isPaused = !isPaused;

  if (isPaused) {
    pauseBtn.style.display = "none";
    document.getElementById("pause-overlay").style.display = "flex";
    pauseStart = Date.now();
    cancelAnimationFrame(gameLoopId);
  } else {
    pauseBtn.style.display = "block";
    document.getElementById("pause-overlay").style.display = "none";
    if (pauseStart) {
      pausedAccum += Date.now() - pauseStart;
      pauseStart = null;
    }
    // reset lastFrameTime so dt doesn't spike
    lastFrameTime = null;
    gameLoopId = requestAnimationFrame(gameLoop);
  }
});

// дополнительно — клик по кнопке Resume
document.getElementById("resume-btn").addEventListener("click", () => {
  pauseBtn.click(); // просто эмулируем клик по основной кнопке паузы
});

// === RESTART ===
restartBtn.addEventListener('click', () => {
  gameOverEl.style.display = 'none';
  startGame();
});
