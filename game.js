import { CONFIG } from './config.js';

// Глобальные переменные
let score = 0;
let gameActive = true;
let isFrozen = false;
let objects = [];
let gameLoopId = null;
let startTime = 0;
let timerInterval = null;

// DOM элементы
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

// Геттеры/сеттеры для экспорта
let userAccount = null;
const setUserAccount = (addr) => { userAccount = addr; };
const setScore = (val) => { score = val; };
const setGameActive = (val) => { gameActive = val; };

// Экспорт только необходимых значений (БЕЗ startGame и НЕ через export function)
export {
  score,
  gameActive,
  setScore,
  setGameActive,
  setUserAccount,
  updateScore,
  endGame
};

function updateScore() {
  scoreEl.textContent = `Score: ${score}`;
}

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function createObject(emoji, type, speed) {
  if (!gameActive) return;
  const obj = document.createElement('div');
  obj.className = 'object';
  if (type === 'bomb') obj.classList.add('bomb');
  obj.textContent = emoji;
  obj.style.left = Math.random() * (window.innerWidth - 50) + 'px';
  game.appendChild(obj);
  objects.push({ el: obj, type, y: -50, speed });
}

game.addEventListener('click', (e) => {
  if (!gameActive && !isFrozen) return;
  const x = e.clientX;
  const y = e.clientY;
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    const rect = obj.el.getBoundingClientRect();
    let hit = false;
    if (obj.type === 'snow') {
      const hitbox = {
        left: rect.left - 25,
        right: rect.right + 25,
        top: rect.top - 25,
        bottom: rect.bottom + 25
      };
      hit = (x >= hitbox.left && x <= hitbox.right && y >= hitbox.top && y <= hitbox.bottom);
    } else {
      hit = (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
    }
    if (hit) {
      const type = obj.type;
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
      } else if (type === 'ice') {
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

function activateFreeze() {
  if (isFrozen) return;
  isFrozen = true;
  const overlay = document.createElement('div');
  overlay.id = 'freeze-overlay';
  Object.assign(overlay.style, {
    position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
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

// ❗ ВАЖНО: НЕТ "export" перед "function"
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
  if (userAccount) {
    submitScoreBtn.style.display = 'block';
    showLeaderboardBtn.style.display = 'block';
  }
}

function gameLoop() {
  if (!gameActive && !isFrozen) return;
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    if (!isFrozen) {
      obj.y += obj.speed * 0.016;
      obj.el.style.top = obj.y + 'px';
      if (obj.y > window.innerHeight) {
        obj.el.remove();
        objects.splice(i, 1);
      }
    }
  }
  if (gameActive) {
    if (Math.random() < 0.05) createObject('❄️', 'snow', 110 + Math.random() * 90);
    if (Math.random() < 0.05) createObject('💣', 'bomb', 110 + Math.random() * 90);
    if (Math.random() < 0.0035) createObject('🎁', 'gift', 70 + Math.random() * 40);
    if (Math.random() < 0.0025) createObject('🧊', 'ice', 60 + Math.random() * 30);
  }
  gameLoopId = requestAnimationFrame(gameLoop);
}

// ❗ НЕ ЭКСПОРТИРУЕТСЯ — используется только внутри
function startGame() {
  score = 0;
  gameActive = true;
  isFrozen = false;
  objects = [];
  startTime = Date.now();
  updateScore();
  timerEl.textContent = '10:00';
  gameOverEl.style.display = 'none';
  submitScoreBtn.style.display = 'none';
  showLeaderboardBtn.style.display = userAccount ? 'block' : 'none';
  document.getElementById('freeze-overlay')?.remove();
  document.getElementById('freeze-timer')?.remove();
  document.querySelectorAll('.object').forEach(el => el.remove());
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
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

// Запуск игры при загрузке модуля
startGame();
restartBtn.addEventListener('click', startGame);
