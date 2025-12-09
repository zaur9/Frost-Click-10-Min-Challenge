import { CONFIG } from './config.js';

// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let score = 0;
let gameActive = false;
let isFrozen = false;
let isPaused = false;
let objects = [];
let gameLoopId = null;
let startTime = 0;
let timerInterval = null;
let lastSpawnTime = 0;

// === DOM ЭЛЕМЕНТЫ ===
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

// === userAccount ===
let userAccount = null;
export const setUserAccount = addr => { userAccount = addr; };
export const getScore = () => score;
export const isGameActive = () => gameActive;

// === ОБНОВЛЕНИЕ СЧЁТА ===
function updateScore() {
  scoreEl.textContent = `Score: ${score}`;
}

// === ФОРМАТ ВРЕМЕНИ ===
function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

// === СОЗДАНИЕ ОБЪЕКТОВ ===
function createObject(emoji, type, speed) {
  if (!gameActive || isPaused || isFrozen) return;

  const obj = document.createElement('div');
  obj.className = 'object';
  if (type === 'bomb') obj.classList.add('bomb');
  if (type === 'ice') obj.classList.add('ice');
  if (type === 'gift') obj.classList.add('gift');
  obj.textContent = emoji;

  obj.style.left = Math.random() * (window.innerWidth - 60) + 30 + 'px';
  obj.style.top = '-60px';

  game.appendChild(obj);

  objects.push({ el: obj, type, y: -60, speed, clicked: false });
}

// === КЛИК ПО ОБЪЕКТАМ ===
game.addEventListener('click', (e) => {
  if (!gameActive || isPaused || isFrozen) return;

  const x = e.clientX;
  const y = e.clientY;

  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    if (obj.clicked) continue;

    const rect = obj.el.getBoundingClientRect();
    const hit = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    if (!hit) continue;

    obj.clicked = true;
    obj.el.remove();
    objects.splice(i, 1);

    // Flash эффект
    const flash = document.createElement("div");
    flash.className = "neon-flash";
    flash.style.left = (rect.left + rect.width / 2 - 20) + "px";
    flash.style.top = (rect.top + rect.height / 2 - 20) + "px";
    game.appendChild(flash);
    setTimeout(() => flash.remove(), 250);

    // Логика
    if (obj.type === 'bomb') {
      endGame(false);
      return;
    }

    if (obj.type === 'ice') {
      activateFreeze();
      score += 2;
    } else if (obj.type === 'gift') {
      score += 5;
    } else {
      score += (isFrozen ? (obj.type === 'bomb' ? 3 : 1) : 1);
    }

    updateScore();
    return;
  }
});

// === ЗАМОРОЗКА ===
function activateFreeze() {
  if (isFrozen) return;
  isFrozen = true;

  const overlay = document.createElement('div');
  overlay.id = 'freeze-overlay';
  overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(200,240,255,0.3);pointer-events:none;z-index:5;';
  game.appendChild(overlay);

  const timer = document.createElement('div');
  timer.id = 'freeze-timer';
  timer.style.cssText = 'position:absolute;top:50px;right:20px;color:#a0e0ff;font-size:20px;z-index:10;';
  timer.textContent = 'Freeze: 5s';
  game.appendChild(timer);

  let time = 5;
  const id = setInterval(() => {
    time--;
    if (time > 0) {
      timer.textContent = `Freeze: ${time}s`;
    } else {
      clearInterval(id);
      timer.remove();
      overlay.remove();
      isFrozen = false;
    }
  }, 1000);
}

// === КОНЕЦ ИГРЫ ===
function endGame(isWin) {
  gameActive = false;
  if (timerInterval) clearInterval(timerInterval);
  if (gameLoopId) cancelAnimationFrame(gameLoopId);

  const elapsed = Date.now() - startTime;

  resultTitle.textContent = isWin ? 'You Survived 10 Minutes!' : 'Game Over!';
  finalScoreEl.textContent = `Final Score: ${score}`;
  timeSurvivedEl.textContent = `Time: ${formatTime(elapsed)}`;

  gameOverEl.className = isWin ? 'win' : '';
  gameOverEl.style.display = 'block';

  submitScoreBtn.style.display = userAccount ? 'block' : 'none';
  showLeaderboardBtn.style.display = userAccount ? 'block' : 'none';
}

// === GAME LOOP (FPS-independent spawn) ===
function gameLoop(timestamp) {
  if (!gameActive || isPaused) return;

  if (!lastSpawnTime) lastSpawnTime = timestamp;
  const delta = timestamp - lastSpawnTime;

  if (!isFrozen) {
    objects.forEach(obj => {
      obj.y += obj.speed * (delta / 1000) * 60;
      obj.el.style.top = obj.y + 'px';

      if (obj.y > window.innerHeight + 50) {
        obj.el.remove();
        objects = objects.filter(o => o !== obj);
      }
    });
  }

  // Спавн ~30 раз в секунду
  if (delta > 33) {
    if (Math.random() < 0.35) createObject('❄️', 'snow', 100 + Math.random() * 100);
    if (Math.random() < 0.04) createObject('💣', 'bomb', 110 + Math.random() * 90);
    if (Math.random() < 0.008) createObject('🎁', 'gift', 70 + Math.random() * 40);
    if (Math.random() < 0.006) createObject('🧊', 'ice', 60 + Math.random() * 30);
    lastSpawnTime = timestamp;
  }

  gameLoopId = requestAnimationFrame(gameLoop);
}

// === СТАРТ ИГРЫ ===
function startGame() {
  score = 0;
  gameActive = true;
  isFrozen = false;
  isPaused = false;
  objects = [];
  lastSpawnTime = 0;

  updateScore();
  timerEl.textContent = "10:00";

  gameOverEl.style.display = 'none';
  pauseBtn.textContent = "Pause";
  document.querySelectorAll('#freeze-overlay, #freeze-timer, #pause-overlay, .object').forEach(el => el.remove());

  startTime = Date.now();

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (isPaused || isFrozen) return;
    const elapsed = Date.now() - startTime;
    const remaining = CONFIG.GAME_DURATION - elapsed;
    if (remaining <= 0) {
      clearInterval(timerInterval);
      endGame(true);
    } else {
      timerEl.textContent = formatTime(remaining);
    }
  }, 100);

  gameLoopId = requestAnimationFrame(gameLoop);
}

// === СТАРТ / ПАУЗА / РЕСТАРТ ===
startBtn.addEventListener("click", () => {
  startScreen.style.display = "none";
  pauseBtn.style.display = 'block';
  startGame();
});

pauseBtn.addEventListener("click", () => {
  if (!gameActive) return;
  isPaused = !isPaused;
  pauseBtn.textContent = isPaused ? "Resume" : "Pause";
  if (isPaused) {
    cancelAnimationFrame(gameLoopId);
    showPauseOverlay();
  } else {
    hidePauseOverlay();
    gameLoopId = requestAnimationFrame(gameLoop);
  }
});

function showPauseOverlay() {
  let overlay = document.getElementById("pause-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "pause-overlay";
    overlay.textContent = "PAUSED";
    game.appendChild(overlay);
  }
  overlay.style.display = "flex";
}

function hidePauseOverlay() {
  const overlay = document.getElementById("pause-overlay");
  if (overlay) overlay.style.display = "none";
}

restartBtn.addEventListener('click', () => {
  gameOverEl.style.display = 'none';
  startGame();
});
