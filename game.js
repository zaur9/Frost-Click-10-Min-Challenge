import { CONFIG } from './config.js';

// === GLOBAL ===
let score = 0;
let gameActive = false;
let isFrozen = false;
let isPaused = false;

let objects = [];
let gameLoopId = null;
let startTime = 0;
let timerInterval = null;

// пауза
let pauseStart = null;
let pausedAccum = 0;

// Somnia schedule
const SOMNIA_INTERVAL_MS = 58_000;
const SOMNIA_TOTAL = 10;
let somniaSchedule = [];
let nextSomniaIndex = 0;

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

// Wallet
let userAccount = null;
export const setUserAccount = addr => userAccount = addr;

export const getScore = () => score;
export const isGameActive = () => gameActive;

export { updateScore, endGame };


// === SCORE ===
function updateScore() {
  scoreEl.textContent = `Score: ${score}`;
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

  obj.textContent = emoji;

  obj.style.left = Math.random() * (window.innerWidth - 50) + 'px';
  obj.style.transform = `translateX(-50%) translateY(-50px)`;

  game.appendChild(obj);

  objects.push({ el: obj, type, y: -50, speed });
}


// === CLICK HANDLING ===
game.addEventListener('click', (e) => {
  if (!gameActive || isPaused) return;

  const x = e.clientX;
  const y = e.clientY;

  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    const rect = obj.el.getBoundingClientRect();

    const hit =
      x >= rect.left && x <= rect.right &&
      y >= rect.top && y <= rect.bottom;

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
function gameLoop() {
  if (!gameActive || isPaused) return;

  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];

    if (!isFrozen) {
      obj.y += obj.speed * 0.016;
      obj.el.style.transform = `translateX(-50%) translateY(${obj.y}px)`;

      if (obj.y > window.innerHeight) {
        obj.el.remove();
        objects.splice(i, 1);
      }
    }
  }

  if (!isPaused && !isFrozen) {
    const elapsed = Date.now() - startTime - pausedAccum;

    // scheduled somnia drops: 10 pieces, every 58s
    if (nextSomniaIndex < somniaSchedule.length && elapsed >= somniaSchedule[nextSomniaIndex]) {
      createObject('', 'somnia', 50 + Math.random() * 20);
      nextSomniaIndex++;
    }

    if (Math.random() < 0.05) createObject('❄️', 'snow', 110 + Math.random() * 90);
    if (Math.random() < 0.05) createObject('💣', 'bomb', 110 + Math.random() * 90);
    if (Math.random() < 0.0035) createObject('🎁', 'gift', 70 + Math.random() * 40);
    if (Math.random() < 0.0025) createObject('🧊', 'ice', 60 + Math.random() * 30);
  }

  gameLoopId = requestAnimationFrame(gameLoop);
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

  startTime = Date.now();

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

  gameLoopId = requestAnimationFrame(gameLoop);
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
