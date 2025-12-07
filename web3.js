import { CONFIG } from './config.js';
import {
  getScore,
  isGameActive,
  setUserAccount,
  endGame
} from './game.js';

// Web3 state
let web3 = null;
let contract = null;

// DOM elements
const connectWalletBtn = document.getElementById('connect-wallet');
const submitScoreBtn = document.getElementById('submit-score');
const showLeaderboardBtn = document.getElementById('show-leaderboard');

const contractABI = [
  {
    "inputs": [{ "internalType": "uint256", "name": "score", "type": "uint256" }],
    "name": "submitScore",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getLeaderboard",
    "outputs": [
      {
        "components": [
          { "internalType": "address", "name": "player", "type": "address" },
          { "internalType": "uint256", "name": "score", "type": "uint256" },
          { "internalType": "uint256", "name": "timestamp", "type": "uint256" }
        ],
        "internalType": "struct Leaderboard.Entry[100]",
        "name": "",
        "type": "tuple[100]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
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

    ethereum.on('accountsChanged', () => {
      window.location.reload();
    });

    ethereum.on('chainChanged', () => {
      window.location.reload();
    });

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
    const account = accounts[0];

    setUserAccount(account);

    connectWalletBtn.textContent = account.substring(0, 6) + '...';

    contract = new web3.eth.Contract(contractABI, CONFIG.CONTRACT_ADDRESS);

    showLeaderboardBtn.style.display = 'block';

    if (!isGameActive()) {
      submitScoreBtn.style.display = 'block';
    }

  } catch (error) {
    console.error(error);
    alert('Wallet connection failed');
  }
});

submitScoreBtn.addEventListener('click', async () => {
  if (!contract) {
    alert('Connect wallet first');
    return;
  }

  const currentScore = getScore();
  if (currentScore <= 0) {
    alert('Score is zero');
    return;
  }

  try {
    const currentChainId = await window.ethereum.request({
      method: 'eth_chainId'
    });

    if (currentChainId !== CONFIG.SOMNIA_CHAIN_ID) {
      alert('Please stay on Somnia Mainnet.');
      return;
    }

    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    const account = accounts[0];

    await contract.methods.submitScore(currentScore).send({
      from: account
    });

    alert('Score submitted to Somnia Mainnet!');

  } catch (error) {
    console.error(error);
    alert('Submission failed.');
  }
});


showLeaderboardBtn.addEventListener('click', async () => {
  if (!contract) {
    alert('Connect wallet first');
    return;
  }

  const oldModal = document.getElementById('leaderboard-modal');
  if (oldModal) oldModal.remove();

  try {
    const leaderboard = await contract.methods.getLeaderboard().call();

    const top10 = leaderboard
      .filter(e => e.player !== '0x0000000000000000000000000000000000000000' && Number(e.score) > 0)
      .sort((a, b) => Number(b.score) - Number(a.score))
      .slice(0, 10);

    let html = '<h3>🏆 Frost Click Top 10</h3><ol>';

    if (top10.length === 0) {
      html += '<li>No scores yet</li>';
    } else {
      for (let entry of top10) {
        const shortAddr = entry.player.substring(0, 6) + '...';
        html += `<li>${shortAddr}: ${entry.score}</li>`;
      }
    }

    html += `</ol>
      <button id="close-lb" style="margin-top:10px;padding:5px 10px;">Close</button>`;

    const modal = document.createElement('div');
    modal.id = 'leaderboard-modal';
    modal.style.cssText = `
      position: fixed;
      top: 20%;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(10,20,50,0.95);
      color: white;
      padding: 20px;
      border-radius: 10px;
      z-index: 100;
      width: 300px;
      text-align: left;
    `;

    modal.innerHTML = html;
    document.body.appendChild(modal);

    document.getElementById('close-lb').onclick = () => {
      modal.remove();
    };

  } catch (error) {
    console.error('Leaderboard error:', error);
    alert('Failed to load leaderboard.');
  }
});
