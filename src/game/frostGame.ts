import { readContract } from 'wagmi/actions';
import { getAccount } from 'wagmi/actions';
import { CONFIG } from '../config';
import { frostAbi } from '../lib/frostAbi';
import { wagmiConfig } from '../lib/wagmiConfig';

export type MountFrostGameOptions = {
  onLeaveStartScreen: () => void;
  onReturnToStartScreen: () => void;
};

let score = 0;
let gameActive = false;
let isFrozen = false;
let isPaused = false;

let objects: { el: HTMLDivElement; type: string; y: number; speed: number }[] = [];
let gameLoopId: number | null = null;
let startTime = 0;
let timerInterval: ReturnType<typeof setInterval> | null = null;

let lastFrameTime: number | null = null;
let spawnAccumulatorMs = 0;

const HIT_PADDING_BOTTOM = 12;
const HIT_PADDING_SNOW_TOP = 12;
const HIT_PADDING_SNOW_SIDE = 4;

let pauseStart: number | null = null;
let pausedAccum = 0;

const NETWORK_DROP_INTERVAL_FAST_MS = 5_000;
const NETWORK_DROP_INTERVAL_SLOW_MS = 6_000;
let lastSomniaDropFast = 0;
let lastSomniaDropSlow = 0;
let lastApeDropFast = 0;
let lastApeDropSlow = 0;

let lastIceSpawn = 0;
const ICE_INTERVAL = 29 * 1000;

const SPAWN_TICK_MS = 150;
const SPAWN_CHANCE_SNOW = 0.45;
const SPAWN_CHANCE_BOMB = 0.5;
const SPAWN_CHANCE_GIFT = 0.18;
const MAX_ACTIVE_OBJECTS = 60;
const HIGH_LOAD_OBJECT_THRESHOLD = 45;

const PLAYFIELD_TOP_OFFSET = 78;

let userAccount: string | null = null;
let roundTraceSeed = '';
let lastRoundDurationSec = 0;

let gameRoot: HTMLElement | null = null;
let scoreEl: HTMLElement | null = null;
let timerEl: HTMLElement | null = null;
let gameOverEl: HTMLElement | null = null;
let resultTitle: HTMLElement | null = null;
let finalScoreEl: HTMLElement | null = null;
let timeSurvivedEl: HTMLElement | null = null;
let restartBtn: HTMLButtonElement | null = null;
let gameOverSubmitApeBtn: HTMLButtonElement | null = null;
let gameOverSubmitSomniaBtn: HTMLButtonElement | null = null;
let pauseBtn: HTMLButtonElement | null = null;
let backToStartBtn: HTMLButtonElement | null = null;
let startBtn: HTMLButtonElement | null = null;
let pbScoreEl: HTMLElement | null = null;
let playfieldBgEl: HTMLElement | null = null;

let musicEnabled = false;
let bgMusic: HTMLAudioElement | null = null;
let musicToggleGame: HTMLButtonElement | null = null;

export function setUserAccount(addr: string | null) {
  userAccount = addr;
  void updatePersonalBest();
}

export const getScore = () => score;
export const isGameActive = () => gameActive;
export const getRoundDurationSeconds = () => Math.max(0, lastRoundDurationSec);
export const getRoundTraceSeed = () => roundTraceSeed;
export function consumeScoreAfterSubmit() {
  score = 0;
  updateScore();
}

function pushRoundTrace(tag: string, value: number) {
  if (!roundTraceSeed) return;
  const elapsedMs = Math.max(0, Date.now() - startTime - pausedAccum);
  roundTraceSeed += `|${tag}:${elapsedMs}:${value}:${objects.length}`;
  if (roundTraceSeed.length > 3500) {
    roundTraceSeed = roundTraceSeed.slice(roundTraceSeed.length - 3500);
  }
}

function updateScore() {
  if (scoreEl) scoreEl.textContent = `Score: ${score}`;
}

function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function getPlayfieldBounds() {
  if (playfieldBgEl) {
    const rect = playfieldBgEl.getBoundingClientRect();
    if (rect.width > 0) {
      return { left: rect.left, right: rect.right };
    }
  }
  const side = window.innerWidth * 0.28;
  return { left: side, right: window.innerWidth - side };
}

function createObject(emoji: string, type: string, speed: number) {
  if (!gameActive || isPaused || !gameRoot) return;
  if (objects.length >= MAX_ACTIVE_OBJECTS) return;

  const obj = document.createElement('div');
  obj.className = 'object';
  if (type) obj.classList.add(type);
  if (type === 'bomb') obj.classList.add('bomb');

  obj.style.top = `${PLAYFIELD_TOP_OFFSET}px`;

  if (type === 'somnia' || type === 'ape-logo') {
    obj.style.width = '32px';
    obj.style.height = '32px';
    obj.style.display = 'block';
    obj.textContent = ' ';
  } else {
    obj.textContent = emoji;
  }

  const bounds = getPlayfieldBounds();
  const spawnMinX = bounds.left + 24;
  const spawnMaxX = bounds.right - 24;
  obj.style.left = spawnMinX + Math.random() * Math.max(1, spawnMaxX - spawnMinX) + 'px';
  obj.style.transform = `translateX(-50%) translateY(0px)`;

  gameRoot.appendChild(obj);

  objects.push({ el: obj, type, y: 0, speed });
}

function endGame(isWin: boolean) {
  gameActive = false;

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  if (gameLoopId !== null) cancelAnimationFrame(gameLoopId);
  gameLoopId = null;

  const elapsed = Date.now() - startTime - pausedAccum;
  lastRoundDurationSec = Math.max(0, Math.floor(elapsed / 1000));
  pushRoundTrace(isWin ? 'finish_win' : 'finish_lose', score);

  if (resultTitle) resultTitle.textContent = isWin ? '🎉 You Survived 10 Minutes! 🎉' : 'Game Over!';
  if (finalScoreEl) finalScoreEl.textContent = `Final Score: ${score}`;
  if (timeSurvivedEl) timeSurvivedEl.textContent = `Time: ${formatTime(elapsed)}`;

  if (gameOverEl) gameOverEl.style.display = 'block';
  if (gameOverSubmitApeBtn) gameOverSubmitApeBtn.style.display = 'inline-block';
  if (gameOverSubmitSomniaBtn) gameOverSubmitSomniaBtn.style.display = 'inline-block';
}

function activateFreeze() {
  if (isFrozen || !gameRoot) return;

  isFrozen = true;
  const bounds = getPlayfieldBounds();
  const playfieldWidth = Math.max(0, bounds.right - bounds.left);
  const playfieldHeight = Math.max(0, window.innerHeight - PLAYFIELD_TOP_OFFSET);

  const overlay = document.createElement('div');
  overlay.id = 'freeze-overlay';
  Object.assign(overlay.style, {
    position: 'absolute',
    top: `${PLAYFIELD_TOP_OFFSET}px`,
    left: `${bounds.left}px`,
    width: `${playfieldWidth}px`,
    height: `${playfieldHeight}px`,
    background: `
      radial-gradient(120% 95% at 15% 0%, rgba(230,248,255,0.45) 0%, rgba(188,225,255,0.13) 52%, rgba(132,182,236,0.08) 100%),
      radial-gradient(130px 100px at 24% 18%, rgba(225,248,255,0.22) 0%, rgba(225,248,255,0) 75%),
      radial-gradient(160px 120px at 76% 62%, rgba(225,248,255,0.17) 0%, rgba(225,248,255,0) 78%),
      repeating-linear-gradient(132deg, transparent 0 21px, rgba(234,250,255,0.24) 21px 22px, transparent 22px 63px),
      repeating-linear-gradient(47deg, transparent 0 34px, rgba(229,247,255,0.18) 34px 35px, transparent 35px 87px),
      repeating-linear-gradient(16deg, transparent 0 54px, rgba(220,242,255,0.12) 54px 55px, transparent 55px 126px),
      rgba(148,205,248,0.18)
    `,
    pointerEvents: 'none',
    zIndex: '5',
  });
  gameRoot.appendChild(overlay);

  const freezeTimer = document.createElement('div');
  freezeTimer.id = 'freeze-timer';
  Object.assign(freezeTimer.style, {
    position: 'absolute',
    top: `${PLAYFIELD_TOP_OFFSET + 10}px`,
    left: `${bounds.left + playfieldWidth / 2}px`,
    transform: 'translateX(-50%)',
    color: '#a0e0ff',
    fontSize: '20px',
    zIndex: '10',
  });
  freezeTimer.textContent = 'Freeze: 5s';
  gameRoot.appendChild(freezeTimer);

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

function gameLoop(timestamp: number) {
  if (!gameActive || isPaused) return;

  if (lastFrameTime === null) {
    lastFrameTime = timestamp;
    gameLoopId = requestAnimationFrame(gameLoop);
    return;
  }

  const frameMs = timestamp - lastFrameTime;
  const dt = frameMs / 1000;
  lastFrameTime = timestamp;

  if (!isFrozen) {
    spawnAccumulatorMs += frameMs;
    while (spawnAccumulatorMs >= SPAWN_TICK_MS) {
      spawnTick();
      spawnAccumulatorMs -= SPAWN_TICK_MS;
    }
  }

  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];

    if (!isFrozen) {
      obj.y += obj.speed * dt;
      obj.el.style.transform = `translateX(-50%) translateY(${obj.y}px)`;

      if (obj.y > window.innerHeight) {
        obj.el.remove();
        objects.splice(i, 1);
      }
    }
  }

  gameLoopId = requestAnimationFrame(gameLoop);
}

function spawnTick() {
  if (!gameActive || isPaused || isFrozen) return;

  const now = Date.now();
  const activeObjects = objects.length;
  const highLoad = activeObjects >= HIGH_LOAD_OBJECT_THRESHOLD;
  const allowNetworkDrops = activeObjects < MAX_ACTIVE_OBJECTS;

  if (now - lastIceSpawn >= ICE_INTERVAL) {
    createObject('🧊', 'ice', 80);
    lastIceSpawn = now;
    pushRoundTrace('spawn_ice', 1);
  }

  if (allowNetworkDrops && now - lastSomniaDropFast >= NETWORK_DROP_INTERVAL_FAST_MS) {
    createObject('', 'somnia', 70 + Math.random() * 30);
    lastSomniaDropFast = now;
    pushRoundTrace('spawn_somnia_fast', 1);
  }

  if (allowNetworkDrops && now - lastSomniaDropSlow >= NETWORK_DROP_INTERVAL_SLOW_MS) {
    createObject('', 'somnia', 70 + Math.random() * 30);
    lastSomniaDropSlow = now;
    pushRoundTrace('spawn_somnia_slow', 1);
  }

  if (allowNetworkDrops && now - lastApeDropFast >= NETWORK_DROP_INTERVAL_FAST_MS) {
    createObject('', 'ape-logo', 70 + Math.random() * 30);
    lastApeDropFast = now;
    pushRoundTrace('spawn_ape_fast', 1);
  }

  if (allowNetworkDrops && now - lastApeDropSlow >= NETWORK_DROP_INTERVAL_SLOW_MS) {
    createObject('', 'ape-logo', 70 + Math.random() * 30);
    lastApeDropSlow = now;
    pushRoundTrace('spawn_ape_slow', 1);
  }

  const loadFactor = highLoad ? 0.45 : 1;
  if (Math.random() < SPAWN_CHANCE_SNOW * loadFactor)
    createObject('❄️', 'snow', 140 + Math.random() * 70);
  if (Math.random() < SPAWN_CHANCE_BOMB * loadFactor)
    createObject('💣', 'bomb', 160 + Math.random() * 90);
  if (Math.random() < SPAWN_CHANCE_GIFT * loadFactor)
    createObject('🎁', 'gift', 120 + Math.random() * 60);
}

export async function updatePersonalBest() {
  const { address, chainId } = getAccount(wagmiConfig);
  if (!address || !chainId || !userAccount) {
    if (pbScoreEl) pbScoreEl.textContent = 'Best: 0';
    return;
  }
  const contractAddr =
    chainId === CONFIG.SOMNIA_CHAIN_ID
      ? CONFIG.CONTRACT_ADDRESS
      : chainId === CONFIG.APECHAIN_CHAIN_ID
        ? CONFIG.APECHAIN_CONTRACT_ADDRESS
        : null;
  if (!contractAddr) {
    if (pbScoreEl) pbScoreEl.textContent = 'Best: 0';
    return;
  }
  const rkChain = chainId as typeof CONFIG.SOMNIA_CHAIN_ID | typeof CONFIG.APECHAIN_CHAIN_ID;
  try {
    const idxPlusOne = await readContract(wagmiConfig, {
      address: contractAddr as `0x${string}`,
      abi: frostAbi,
      functionName: 'indexPlusOne',
      args: [userAccount as `0x${string}`],
      chainId: rkChain,
    });
    const idxNum = Number(idxPlusOne);
    if (idxNum === 0) {
      if (pbScoreEl) pbScoreEl.textContent = 'Best: 0';
    } else {
      const idx = idxNum - 1;
      const entry = (await readContract(wagmiConfig, {
        address: contractAddr as `0x${string}`,
        abi: frostAbi,
        functionName: 'leaderboard',
        args: [BigInt(idx)],
        chainId: rkChain,
      })) as readonly [`0x${string}`, number, number];
      if (pbScoreEl) pbScoreEl.textContent = 'Best: ' + entry[1];
    }
  } catch {
    if (pbScoreEl) pbScoreEl.textContent = 'Best: ?';
  }
}

function startGame() {
  if (!gameRoot || !scoreEl || !timerEl || !gameOverEl || !pauseBtn || !backToStartBtn) return;

  score = 0;
  gameActive = true;
  isFrozen = false;
  isPaused = false;
  objects = [];

  pauseStart = null;
  pausedAccum = 0;

  scoreEl.textContent = 'Score: 0';
  timerEl.textContent = '10:00';

  gameOverEl.style.display = 'none';
  pauseBtn.textContent = 'Pause';
  backToStartBtn.style.display = 'block';
  pauseBtn.style.display = 'block';

  document.getElementById('freeze-overlay')?.remove();
  document.getElementById('freeze-timer')?.remove();

  const pauseO = document.getElementById('pause-overlay');
  if (pauseO) pauseO.style.display = 'none';

  document.querySelectorAll('.object').forEach((el) => el.remove());

  if (timerInterval) clearInterval(timerInterval);
  if (gameLoopId !== null) cancelAnimationFrame(gameLoopId);
  timerInterval = null;
  gameLoopId = null;

  startTime = Date.now();
  lastRoundDurationSec = 0;
  roundTraceSeed = `v2:${startTime}:${Math.floor(Math.random() * 1_000_000)}`;
  pushRoundTrace('start', 0);

  lastIceSpawn = startTime;

  lastFrameTime = null;
  spawnAccumulatorMs = 0;

  lastSomniaDropFast = startTime;
  lastSomniaDropSlow = startTime;
  lastApeDropFast = startTime;
  lastApeDropSlow = startTime;

  timerInterval = setInterval(() => {
    if (isPaused) return;

    const elapsed = Date.now() - startTime - pausedAccum;
    const remaining = CONFIG.GAME_DURATION - elapsed;

    if (remaining <= 0) {
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = null;
      endGame(true);
    } else if (timerEl) {
      timerEl.textContent = formatTime(remaining);
    }
  }, 1000);

  gameLoopId = requestAnimationFrame(gameLoop);
  void updatePersonalBest();
}

function updateMusicButtons() {
  const label = musicEnabled ? 'Music: ON' : 'Music: OFF';
  if (musicToggleGame) musicToggleGame.textContent = label;
}

function toggleMusic() {
  musicEnabled = !musicEnabled;

  try {
    if (musicEnabled) {
      if (bgMusic) {
        bgMusic.volume = 0.45;
        void bgMusic.play().catch(() => {});
      }
    } else {
      if (bgMusic) bgMusic.pause();
    }
  } catch {
    /* silent */
  }

  updateMusicButtons();
}

function onGameClick(e: MouseEvent) {
  if (!gameActive || isPaused || !gameRoot) return;

  const x = e.clientX;
  const y = e.clientY;

  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    const rect = obj.el.getBoundingClientRect();

    const isBomb = obj.type === 'bomb';
    const isSnow = obj.type === 'snow';

    const paddingBottom = isBomb ? 0 : isSnow ? 0 : HIT_PADDING_BOTTOM;
    const paddingTop = isSnow ? HIT_PADDING_SNOW_TOP : 0;
    const paddingSide = isSnow ? HIT_PADDING_SNOW_SIDE : 0;
    const hit =
      x >= rect.left - paddingSide &&
      x <= rect.right + paddingSide &&
      y >= rect.top - paddingTop &&
      y <= rect.bottom + paddingBottom;

    if (!hit) continue;

    const type = obj.type;

    obj.el.remove();
    objects.splice(i, 1);

    const flash = document.createElement('div');
    flash.className = 'neon-flash';
    flash.style.left = rect.left + rect.width / 2 - 20 + 'px';
    flash.style.top = rect.top + rect.height / 2 - 20 + 'px';
    gameRoot.appendChild(flash);
    setTimeout(() => flash.remove(), 250);

    if (isFrozen) {
      if (type === 'snow') score += 1;
      else if (type === 'bomb') score += 3;
      else if (type === 'gift') score += 5;
      else if (type === 'ice') score += 2;
      else if (type === 'toy-green' || type === 'toy-purple') score += 2;
      else if (type === 'somnia' || type === 'ape-logo') score += 10;
      updateScore();
      pushRoundTrace(`hit_${type}_frozen`, score);
      return;
    }

    if (type === 'bomb') {
      pushRoundTrace('hit_bomb', score);
      endGame(false);
      return;
    }

    if (type === 'ice') {
      activateFreeze();
      score += 2;
    } else if (type === 'toy-green' || type === 'toy-purple') {
      score += 2;
    } else if (type === 'somnia' || type === 'ape-logo') {
      score += 10;
    } else if (type === 'gift') {
      score += 5;
    } else {
      score += 1;
    }
    updateScore();
    pushRoundTrace(`hit_${type}`, score);
    return;
  }
}

function onPauseClick() {
  if (!gameActive || !pauseBtn) return;

  isPaused = !isPaused;

  const pauseOverlay = document.getElementById('pause-overlay');

  if (isPaused) {
    pauseBtn.style.display = 'none';
    if (pauseOverlay) pauseOverlay.style.display = 'flex';
    pauseStart = Date.now();
    if (gameLoopId !== null) cancelAnimationFrame(gameLoopId);
    gameLoopId = null;
  } else {
    pauseBtn.style.display = 'block';
    if (pauseOverlay) pauseOverlay.style.display = 'none';
    if (pauseStart) {
      pausedAccum += Date.now() - pauseStart;
      pauseStart = null;
    }
    lastFrameTime = null;
    gameLoopId = requestAnimationFrame(gameLoop);
  }
}

function onResumeClick() {
  pauseBtn?.click();
}

function onRestartClick() {
  if (gameOverEl) gameOverEl.style.display = 'none';
  startGame();
}

function onBackToStartClick(options: MountFrostGameOptions) {
  if (timerInterval) clearInterval(timerInterval);
  if (gameLoopId !== null) cancelAnimationFrame(gameLoopId);
  timerInterval = null;
  gameLoopId = null;
  gameActive = false;
  isPaused = false;
  isFrozen = false;
  pauseStart = null;
  pausedAccum = 0;
  document.querySelectorAll('.object').forEach((el) => el.remove());
  objects = [];
  document.getElementById('freeze-overlay')?.remove();
  document.getElementById('freeze-timer')?.remove();
  const pauseOverlay = document.getElementById('pause-overlay');
  if (pauseOverlay) pauseOverlay.style.display = 'none';
  if (gameOverEl) gameOverEl.style.display = 'none';
  if (pauseBtn) pauseBtn.style.display = 'none';
  if (backToStartBtn) backToStartBtn.style.display = 'none';
  options.onReturnToStartScreen();
}

function onSubmitApe() {
  window.dispatchEvent(new CustomEvent('submit-score-request', { detail: { network: 'ape' } }));
}

function onSubmitSomnia() {
  window.dispatchEvent(new CustomEvent('submit-score-request', { detail: { network: 'somnia' } }));
}

export function mountFrostGame(options: MountFrostGameOptions): () => void {
  gameRoot = document.getElementById('game');
  scoreEl = document.getElementById('score');
  timerEl = document.getElementById('timer');
  gameOverEl = document.getElementById('game-over');
  resultTitle = document.getElementById('result-title');
  finalScoreEl = document.getElementById('final-score');
  timeSurvivedEl = document.getElementById('time-survived');
  restartBtn = document.getElementById('restart') as HTMLButtonElement | null;
  gameOverSubmitApeBtn = document.getElementById('gameover-submit-ape') as HTMLButtonElement | null;
  gameOverSubmitSomniaBtn = document.getElementById('gameover-submit-somnia') as HTMLButtonElement | null;
  pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement | null;
  backToStartBtn = document.getElementById('back-to-start-btn') as HTMLButtonElement | null;
  startBtn = document.getElementById('start-btn') as HTMLButtonElement | null;
  pbScoreEl = document.getElementById('pb-score');
  playfieldBgEl = document.getElementById('playfield-bg');

  bgMusic = document.getElementById('bg-music') as HTMLAudioElement | null;
  musicToggleGame = document.getElementById('music-toggle-game') as HTMLButtonElement | null;

  if (!gameRoot) {
    throw new Error('mountFrostGame: #game not found');
  }

  gameRoot.addEventListener('click', onGameClick);

  const onStartClick = () => {
    options.onLeaveStartScreen();
    startGame();
  };
  const onBackClick = () => onBackToStartClick(options);
  startBtn?.addEventListener('click', onStartClick);

  pauseBtn?.addEventListener('click', onPauseClick);
  backToStartBtn?.addEventListener('click', onBackClick);
  document.getElementById('resume-btn')?.addEventListener('click', onResumeClick);
  restartBtn?.addEventListener('click', onRestartClick);
  gameOverSubmitApeBtn?.addEventListener('click', onSubmitApe);
  gameOverSubmitSomniaBtn?.addEventListener('click', onSubmitSomnia);

  if (musicToggleGame) musicToggleGame.addEventListener('click', toggleMusic);
  updateMusicButtons();

  void updatePersonalBest();

  return () => {
    gameRoot?.removeEventListener('click', onGameClick);
    startBtn?.removeEventListener('click', onStartClick);
    pauseBtn?.removeEventListener('click', onPauseClick);
    backToStartBtn?.removeEventListener('click', onBackClick);
    document.getElementById('resume-btn')?.removeEventListener('click', onResumeClick);
    restartBtn?.removeEventListener('click', onRestartClick);
    gameOverSubmitApeBtn?.removeEventListener('click', onSubmitApe);
    gameOverSubmitSomniaBtn?.removeEventListener('click', onSubmitSomnia);
    musicToggleGame?.removeEventListener('click', toggleMusic);

    if (timerInterval) clearInterval(timerInterval);
    if (gameLoopId !== null) cancelAnimationFrame(gameLoopId);
    timerInterval = null;
    gameLoopId = null;
    gameActive = false;

    gameRoot = null;
    scoreEl = null;
    timerEl = null;
    gameOverEl = null;
    resultTitle = null;
    finalScoreEl = null;
    timeSurvivedEl = null;
    restartBtn = null;
    gameOverSubmitApeBtn = null;
    gameOverSubmitSomniaBtn = null;
    pauseBtn = null;
    backToStartBtn = null;
    startBtn = null;
    pbScoreEl = null;
    playfieldBgEl = null;
    bgMusic = null;
    musicToggleGame = null;
    objects = [];
  };
}
