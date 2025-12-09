import { CONFIG } from './config.js';

// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let score = 0;
let gameActive = false;     // теперь игра НЕ активна с самого старта
let isFrozen = false;
let isPaused = false;
let objects = [];
let gameLoopId = null;
let startTime = 0;
let timerInterval = null;

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

// === userAccount привязан к игре ===
let userAccount = null;
export const setUserAccount = addr => { userAccount = addr; };

export const getScore = () => score;
export const isGameActive = () => gameActive;

// Экспортируем функции
export { updateScore, endGame };


// === ОБНОВЛЕНИЕ СЧЁТА ===
function updateScore() {
  scoreEl.textContent = `Score: ${score}`;
}


// === ВРЕМЯ ===
function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}


// === СОЗДАНИЕ ОБЪЕКТОВ ===
function createObject(emoji, type, speed) {
  if (!gameActive || isPaused) return;

  const obj = document.createElement('div');
  obj.className = 'object';
  if (type === 'bomb') obj.classList.add('bomb');
  obj.textContent = emoji;

  obj.style.left = Math.random() * (window.innerWidth - 50) + 'px';
  obj.style.transform = `translateX(-50%) translateY(-50px)`;

  game.appendChild(obj);

  objects.push({ el: obj, type, y: -50, speed });
}


// === КЛИК ПО ОБЪЕКТАМ ===
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

    // FLASH эффект
    const flash = document.createElement("div");
    flash.className = "neon-flash";
    flash.style.left = (rect.left + rect.width / 2 - 20) + "px";
    flash.style.top = (rect.top + rect.height / 2 - 20) + "px";
    game.appendChild(flash);
    setTimeout(() => flash.remove(), 250);

    // ЛОГИКА НАЖАТИЯ
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
});


// === ЗАМОРОЗКА ===
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


// === КОНЕЦ ИГРЫ ===
function endGame(isWin) {
  gameActive = false;

  if (timerInterval) clearInterval(timerInterval);
  if (gameLoopId) cancelAnimationFrame(gameLoopId);

  const elapsed = Date.now() - startTime;

  resultTitle.textContent = isWin ? '🎉 You Survived 10 Minutes! 🎉' : 'Game Over!';
  finalScoreEl.textContent = `Final Score: ${score}`;
  timeSurvivedEl.textContent = `Time: ${formatTime(elapsed)}`;

  gameOverEl.className = isWin ? 'win' : '';
  gameOverEl.style.display = 'block';

  submitScoreBtn.style.display = userAccount ? 'block' : 'none';
  showLeaderboardBtn.style.display = userAccount ? 'block' : 'none';
}


// === ГЛАВНЫЙ GAME LOOP ===
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

  // Спавн — только если нет паузы и нет заморозки
  if (!isPaused && !isFrozen) {
    if (Math.random() < 0.05) createObject('❄️', 'snow', 110 + Math.random() * 90);
    if (Math.random() < 0.05) createObject('💣', 'bomb', 110 + Math.random() * 90);
    if (Math.random() < 0.0035) createObject('🎁', 'gift', 70 + Math.random() * 40);
    if (Math.random() < 0.0025) createObject('🧊', 'ice', 60 + Math.random() * 30);
  }

  gameLoopId = requestAnimationFrame(gameLoop);
}


// === СТАРТ ИГРЫ ===
function startGame() {
  // Полный reset
  score = 0;
  gameActive = true;
  isFrozen = false;
  isPaused = false;
  objects = [];

  scoreEl.textContent = "Score: 0";
  timerEl.textContent = "10:00";

  gameOverEl.style.display = 'none';
  pauseBtn.textContent = "Pause";

  document.getElementById('freeze-overlay')?.remove();
  document.getElementById('freeze-timer')?.remove();
  document.getElementById('pause-overlay')?.remove();
  document.querySelectorAll('.object').forEach(el => el.remove());

  startTime = Date.now();

  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    if (isPaused) return;
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


// === СТАРТОВЫЙ ЭКРАН ===
startBtn.addEventListener("click", () => {
  startScreen.style.display = "none";
  pauseBtn.style.display = 'block';
  startGame();
});


// === ПАУЗА ===
pauseBtn.addEventListener("click", () => {
  if (!gameActive) return;

  isPaused = !isPaused;

  if (isPaused) {
    pauseBtn.textContent = "Resume";
    showPauseOverlay();
  } else {
    pauseBtn.textContent = "Pause";
    hidePauseOverlay();
    gameLoopId = requestAnimationFrame(gameLoop);
  }
});


function showPauseOverlay() {
  let overlay = document.getElementById("pause-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "pause-overlay";
    game.appendChild(overlay);
  }
  overlay.style.display = "block";
}

function hidePauseOverlay() {
  const overlay = document.getElementById("pause-overlay");
  if (overlay) overlay.style.display = "none";
}


// === ПЕРЕЗАПУСК ===
restartBtn.addEventListener('click', () => {
  gameOverEl.style.display = 'none';
  startGame();
});
