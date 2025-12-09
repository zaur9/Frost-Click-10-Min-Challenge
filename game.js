import { CONFIG } from './config.js';

// ------------------------------------
// GLOBAL GAME STATE
// ------------------------------------
let score = 0;
let gameActive = false;
let gamePaused = false;
let isFrozen = false;

let objects = [];
let gameLoopId = null;
let startTime = 0;
let timerInterval = null;

// ------------------------------------
// DOM ELEMENTS
// ------------------------------------
const game = document.getElementById('game');
const scoreEl = document.getElementById('score');
const timerEl = document.getElementById('timer');
const gameOverEl = document.getElementById('game-over');
const resultTitle = document.getElementById('result-title');
const finalScoreEl = document.getElementById('final-score');
const timeSurvivedEl = document.getElementById('time-survived');
const restartBtn = document.getElementById('restart');

const connectWalletBtn = document.getElementById('connect-wallet');
const submitScoreBtn = document.getElementById('submit-score');
const showLeaderboardBtn = document.getElementById('show-leaderboard');

const pauseBtn = document.getElementById('pause-btn');
const pauseOverlay = document.getElementById('pause-overlay');
const resumeBtn = document.getElementById('resume-btn');

const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');

// user ETH account (set from web3.js)
let userAccount = null;
export const setUserAccount = addr => { userAccount = addr; };

export const getScore = () => score;
export const isGameActive = () => gameActive;

export { updateScore, endGame };

// ------------------------------------
// HELPERS
// ------------------------------------
function updateScore() {
  scoreEl.textContent = `Score: ${score}`;
}

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

// ------------------------------------
// CREATE OBJECT
// ------------------------------------
function createObject(emoji, type, speed) {
  if (!gameActive || gamePaused) return;

  const obj = document.createElement('div');
  obj.className = 'object ' + type;
  obj.textContent = emoji;

  const x = Math.random() * (window.innerWidth - 50);
  obj.style.left = x + 'px';
  obj.style.transform = `translateY(-50px)`;

  game.appendChild(obj);

  objects.push({
    el: obj,
    type,
    y: -50,
    speed
  });
}

// ------------------------------------
// CLICK HANDLING
// ------------------------------------
game.addEventListener('click', (e) => {
  if (!gameActive || gamePaused) return;

  const x = e.clientX;
  const y = e.clientY;

  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    const rect = obj.el.getBoundingClientRect();

    const hit =
      x >= rect.left && x <= rect.right &&
      y >= rect.top && y <= rect.bottom;

    if (hit) {
      const type = obj.type;

      // Neon flash on hit
      const flash = document.createElement("div");
      flash.className = "neon-flash";
      flash.style.left = (rect.left + rect.width / 2 - 20) + "px";
      flash.style.top = (rect.top + rect.height / 2 - 20) + "px";
      game.appendChild(flash);
      setTimeout(() => flash.remove(), 250);

      obj.el.remove();
      objects.splice(i, 1);

      if (isFrozen) {
        if (type === 'snow') score += 1;
        if (type === 'bomb') score += 3;
        if (type === 'gift') score += 5;
        if (type === 'ice') score += 2;
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
      } else if (type === 'gift') {
        score += 5;
      } else {
        score += 1;
      }

      updateScore();
      return;
    }
  }
});

// ------------------------------------
// FREEZE POWER UP
// ------------------------------------
function activateFreeze() {
  if (isFrozen) return;

  isFrozen = true;

  const overlay = document.createElement('div');
  overlay.id = 'freeze-overlay';
  Object.assign(overlay.style, {
    position: 'absolute',
    top: '0', left: '0',
    width: '100%', height: '100%',
    background: 'rgba(200,240,255,0.3)',
    pointerEvents: 'none',
    zIndex: '5'
  });

  game.appendChild(overlay);

  let timeLeft = 5;

  const freezeTimer = document.createElement('div');
  freezeTimer.id = 'freeze-timer';
  Object.assign(freezeTimer.style, {
    position: 'absolute', top: '50px', right: '20px',
    color: '#a0e0ff', fontSize: '22px', zIndex: '10'
  });
  freezeTimer.textContent = `Freeze: ${timeLeft}s`;
  game.appendChild(freezeTimer);

  const countdown = setInterval(() => {
    timeLeft--;
    freezeTimer.textContent = `Freeze: ${timeLeft}s`;

    if (timeLeft <= 0) {
      clearInterval(countdown);
      overlay.remove();
      freezeTimer.remove();
      isFrozen = false;
    }
  }, 1000);
}

// ------------------------------------
// END GAME
// ------------------------------------
function endGame(isWin) {
  if (!gameActive) return;

  gameActive = false;

  if (timerInterval) clearInterval(timerInterval);
  if (gameLoopId) cancelAnimationFrame(gameLoopId);

  const elapsed = Date.now() - startTime;

  resultTitle.textContent = isWin ? '🎉 You Survived 10 Minutes! 🎉' : 'Game Over!';
  finalScoreEl.textContent = `Final Score: ${score}`;
  timeSurvivedEl.textContent = `Time: ${formatTime(elapsed)}`;

  gameOverEl.style.display = 'block';

  if (userAccount) {
    submitScoreBtn.style.display = 'block';
    showLeaderboardBtn.style.display = 'block';
  }
}

// ------------------------------------
// GAME LOOP
// ------------------------------------
function gameLoop() {
  if (!gameActive || gamePaused) return;

  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];

    if (!isFrozen) {
      obj.y += obj.speed * 0.016;
      obj.el.style.transform = `translateY(${obj.y}px)`;

      if (obj.y > window.innerHeight) {
        obj.el.remove();
        objects.splice(i, 1);
      }
    }
  }

  // spawn objects
  if (Math.random() < 0.05) createObject('❄️', 'snow', 110 + Math.random() * 90);
  if (Math.random() < 0.05) createObject('💣', 'bomb', 110 + Math.random() * 90);
  if (Math.random() < 0.0035) createObject('🎁', 'gift', 70 + Math.random() * 40);
  if (Math.random() < 0.0025) createObject('🧊', 'ice', 60 + Math.random() * 30);

  gameLoopId = requestAnimationFrame(gameLoop);
}

// ------------------------------------
// START GAME
// ------------------------------------
function startGame() {
  score = 0;
  updateScore();

  objects.forEach(o => o.el.remove());
  objects = [];

  gameOverEl.style.display = 'none';

  submitScoreBtn.style.display = 'none';

  timerEl.textContent = '10:00';

  isFrozen = false;
  gamePaused = false;
  gameActive = true;

  startTime = Date.now();

  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    if (gamePaused) return;

    const elapsed = Date.now() - startTime;
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

// ------------------------------------
// PAUSE / RESUME
// ------------------------------------
pauseBtn.addEventListener('click', () => {
  if (!gameActive) return;

  gamePaused = true;
  pauseOverlay.style.display = 'flex';
});

resumeBtn.addEventListener('click', () => {
  gamePaused = false;
  pauseOverlay.style.display = 'none';
  gameLoopId = requestAnimationFrame(gameLoop);
});

// ------------------------------------
// START BUTTON
// ------------------------------------
startBtn.addEventListener('click', () => {
  startScreen.style.display = 'none';
  startGame();
});

// RESTART
restartBtn.addEventListener('click', startGame);

// ------------------------------------
// ON LOAD
// ------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  // Show start screen by default
});
