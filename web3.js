import { CONFIG } from './config.js';
import {
  score,
  gameActive,
  setUserAccount as setGameUserAccount, // переименовываем для ясности
  endGame
} from './game.js';

// Локальное состояние
let userAccount = null;
let web3 = null;
let contract = null;

// DOM
const connectWalletBtn = document.getElementById('connect-wallet');
const submitScoreBtn = document.getElementById('submit-score');
const showLeaderboardBtn = document.getElementById('show-leaderboard');

const contractABI = [
  {
    "inputs": [{"name": "score", "type": "uint256"}],
    "name": "submitScore",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getLeaderboard",
    "outputs": [{"name": "", "type": "tuple[100]"}],
    "stateMutability": "view",
    "type": "function",
    "components": [
      {"name": "player", "type": "address"},
      {"name": "score", "type": "uint256"},
      {"name": "timestamp", "type": "uint256"}
    ]
  }
];

async function initWeb3() {
  if (typeof window.ethereum === 'undefined') {
    alert('Please install MetaMask or Somnia Wallet!');
    return false;
  }

  try {
    const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (currentChainId !== CONFIG.SOMNIA_CHAIN_ID) {
      alert('Please switch your wallet to Somnia Mainnet (Chain ID: 5031).');
      return false;
    }
    web3 = new Web3(window.ethereum);
    return true;
  } catch (error) {
    console.error('Web3 init failed:', error);
    alert('Could not connect to wallet.');
    return false;
  }
}

connectWalletBtn.addEventListener('click', async () => {
  const ready = await initWeb3();
  if (!ready) return;
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    userAccount = accounts[0]; // сохраняем локально
    setGameUserAccount(userAccount); // синхронизируем с game.js
    connectWalletBtn.textContent = userAccount.substring(0, 6) + '...';
    contract = new web3.eth.Contract(contractABI, CONFIG.CONTRACT_ADDRESS);
    showLeaderboardBtn.style.display = 'block';
    if (!gameActive) {
      submitScoreBtn.style.display = 'block';
    }
  } catch (error) {
    console.error(error);
    alert('Wallet connection failed');
  }
});

submitScoreBtn.addEventListener('click', async () => {
  if (!contract || !userAccount) {
    alert('Connect wallet first');
    return;
  }
  if (score <= 0) {
    alert('Score is zero');
    return;
  }
  try {
    const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (currentChainId !== CONFIG.SOMNIA_CHAIN_ID) {
      alert('Please stay on Somnia Mainnet (Chain ID: 5031).');
      return;
    }
    await contract.methods.submitScore(score).send({ from: userAccount });
    alert('✅ Score submitted to Somnia Mainnet!');
  } catch (error) {
    console.error(error);
    alert('Submission failed. Check console for details.');
  }
});

showLeaderboardBtn.addEventListener('click', async () => {
  if (!contract) {
    alert('Connect wallet first');
    return;
  }

  // Удаляем старый модал, если есть
  const oldModal = document.getElementById('leaderboard-modal');
  if (oldModal) oldModal.remove();

  try {
    const leaderboard = await contract.methods.getLeaderboard().call();
    let html = '<h3>🏆 Frost Click Top 10</h3><ol>';
    let count = 0;
    for (let entry of leaderboard) {
      if (entry.player !== '0x0000000000000000000000000000000000000000' && entry.score > 0) {
        const shortAddr = entry.player.substring(0, 6) + '...';
        html += `<li>${shortAddr}: ${entry.score}</li>`;
        count++;
        if (count >= 10) break;
      }
    }
    if (count === 0) html += '<li>No scores yet</li>';
    html += '</ol><button id="close-lb" style="margin-top:10px;padding:5px 10px;">Close</button>';

    const modal = document.createElement('div');
    modal.id = 'leaderboard-modal';
    modal.style.cssText = `
      position: fixed; top: 20%; left: 50%; transform: translateX(-50%);
      background: rgba(10, 20, 50, 0.95); color: white; padding: 20px; border-radius: 10px;
      z-index: 100; width: 300px; text-align: left;
    `;
    modal.innerHTML = html;
    document.body.appendChild(modal);

    // Обязательно назначаем обработчик ПОСЛЕ добавления в DOM
    document.getElementById('close-lb').onclick = () => modal.remove();
  } catch (error) {
    console.error(error);
    alert('Failed to load leaderboard. Ensure you are on Somnia Mainnet (Chain ID: 5031).');
  }
});
