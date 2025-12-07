// -------------------------
//  Frost Click Game Logic
//  Updated for SVG Objects
// -------------------------

import { CONFIG } from './config.js';

let score = 0;
let timerInterval = null;
let spawnInterval = null;
export let gameActive = false;

let gameElement = null;
let scoreElement = null;
let timerElement = null;
let gameOverElement = null;

let userAccount = null;
export function setUserAccount(acc) {
  userAccount = acc;
}

export function getScore() {
  return score;
}

function updateScoreDisplay() {
  scoreElement.textContent = `Score: ${score}`;
}

function updateTimerDisplay(timeLeft) {
  timerElement.textContent = `Time: ${Math.ceil(timeLeft / 1000)}s`;
}

// -------------------------
// SVG icons (Base64 inline)
// -------------------------

const SNOWMAN_SVG = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8Y2lyY2xlIGN4PSIzMiIgY3k9IjIyIiByPSIxMCIgZmlsbD0iI2ZmZmZmZiIgc3Ryb2tlPSIjNGRmZmNjIiBzdHJva2Utd2lkdGg9IjIiLz4KICA8Y2lyY2xlIGN4PSIzMiIgY3k9IjQ0IiByPSIxNiIgZmlsbD0iI2ZmZmZmZiIgc3Ryb2tlPSIjNGRmZmNjIiBzdHJva2Utd2lkdGg9IjIiLz4KICA8Y2lyY2xlIGN4PSIyOCIgeT0iMjAiIHI9IjIiIGZpbGw9IiMwMDAiLz4KICA8Y2lyY2xlIGN4PSIzNiIgeT0iMjAiIHI9IjIiIGZpbGw9IiMwMDAiLz4KICA8Y2lyY2xlIGN4PSIzMiIgeT0iMjYiIHI9IjMiIGZpbGw9IiNmZjRkNGQiLz4KPC9zdmc+`;

const BOMB_SVG = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8Y2lyY2xlIGN4PSIzMiIgY3k9IjM2IiByPSIxOCIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2U9IiNmZjFhMWEiIGZpbGw9IiNmZjRkNGQiLz4KICA8cmVjdCB4PSIyOCIKICB5PSIxMCIgd2lkdGg9IjgiIGhlaWdodD0iMTIiIHJ4PSIyIiBmaWxsPSIjM2EzYTNkIiBzdHJva2U9IiNmZjFhMWEiIHN0cm9rZS13aWR0aD0iMiIvPgogIDxwYXRoIGQ9Ik0zMiAxMCBDIDI4IDIsIDM4IDIsIDM0IDEwIiBzdHJva2U9IiNmZmNjMDAiIHN0cm9rZS13aWR0aD0iMiIgZmlsbD0ibm9uZSIvPgogIDxjaXJjbGUgY3g9IjMyIiBjeT0iOCIgcj0iMiIgZmlsbD0iI2ZmY2MwMCIvPgo8L3N2Zz4=`;

// -------------------------
// Create falling object
// -------------------------
function createObject() {
  if (!gameActive) return;

  const object = document.createElement('div');
  object.classList.add('object');

  // Random position
  const x = Math.random() * (window.innerWidth - 60);
  object.style.left = `${x}px`;

  // Random selection: snowman (good) or bomb (bad)
  const isBomb = Math.random() < 0.2; // 20% bombs

  if (isBomb) {
    object.classList.add('bomb');
    object.innerHTML = `<img src="${BOMB_SVG}" width="55" height="55">`;
  } else {
    object.innerHTML = `<img src="${SNOWMAN_SVG}" width="55" height="55">`;
  }

  gameElement.appendChild(object);

  // Click handler
  object.addEventListener('click', () => {
    if (!gameActive) return;

    if (isBomb) {
      endGame(false);
    } else {
      score += 1;
      updateScoreDisplay();
    }

    object.remove();
  });

  // Falling animation
  const fallDuration = 4000 + Math.random() * 2000;
  object.animate(
    [
      { top: '-60px' },
      { top: '110vh' }
    ],
    {
      duration: fallDuration,
      easing: 'linear'
    }
  ).onfinish = () => {
    if (gameActive && !isBomb) {
      score -= 1;
      updateScoreDisplay();
    }
    object.remove();
  };
}

// -------------------------
// Start Game
// -------------------------
export function startGame() {
  if (gameActive) return;

  gameActive = true;
  score = 0;

  updateScoreDisplay();

  const endTime = Date.now() + CONFIG.GAME_DURATION;

  timerInterval = setInterval(() => {
    const timeLeft = endTime - Date.now();

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      endGame(true);
    } else {
      updateTimerDisplay(timeLeft);
    }
  }, 1000);

  spawnInterval = setInterval(createObject, 600);
}

// -------------------------
// End Game
// -------------------------
export function endGame(win) {
  if (!gameActive) return;
  gameActive = false;

  clearInterval(timerInterval);
  clearInterval(spawnInterval);

  gameOverElement.style.display = 'block';

  if (win) {
    gameOverElement.classList.add('win');
    gameOverElement.innerHTML = `
      <h2>Congratulations!</h2>
      <p>Your final score: ${score}</p>
      <button onclick="location.reload()">Play Again</button>
    `;
  } else {
    gameOverElement.classList.remove('win');
    gameOverElement.innerHTML = `
      <h2>Oh no!</h2>
      <p>You clicked a bomb.</p>
      <p>Final Score: ${score}</p>
      <button onclick="location.reload()">Try Again</button>
    `;
  }
}

// -------------------------
// Initialize
// -------------------------
window.onload = () => {
  gameElement = document.getElementById('game');
  scoreElement = document.getElementById('score');
  timerElement = document.getElementById('timer');
  gameOverElement = document.getElementById('game-over');
};
