import { CONFIG } from './config.js';
import {
  getScore,
  isGameActive,
  setUserAccount,
  endGame
} from './game.js';

let web3 = null;
let contract = null;

const connectWalletBtn = document.getElementById('connect-wallet');
const submitScoreBtn = document.getElementById('submit-score');
const showLeaderboardBtn = document.getElementById('show-leaderboard');
const startConnectWalletBtn = document.getElementById('start-connect-wallet');
const startShowLeaderboardBtn = document.getElementById('start-show-leaderboard');

const contractABI = [
  {
    "inputs": [
      { "internalType": "uint32", "name": "score_", "type": "uint32" },
      { "internalType": "uint32", "name": "timestamp_", "type": "uint32" },
      { "internalType": "uint8", "name": "v", "type": "uint8" },
      { "internalType": "bytes32", "name": "r", "type": "bytes32" },
      { "internalType": "bytes32", "name": "s", "type": "bytes32" }
    ],
    "name": "submitScoreSigned",
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
          { "internalType": "uint32", "name": "score", "type": "uint32" },
          { "internalType": "uint32", "name": "timestamp", "type": "uint32" }
        ],
        "internalType": "struct FrostClickLeaderboard.ScoreEntry[100]",
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
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });

    if (parseInt(chainId, 16) !== CONFIG.SOMNIA_CHAIN_ID) {
      alert('Please switch to Somnia Mainnet (5031)');
      return false;
    }

    web3 = new Web3(window.ethereum);

    ethereum.on('accountsChanged', () => {
      connectWalletBtn.textContent = "Connect Wallet";
      if (startConnectWalletBtn) startConnectWalletBtn.textContent = "Connect Wallet";
      submitScoreBtn.style.display = "none";
      showLeaderboardBtn.style.display = "none";
      contract = null;
      setUserAccount(null);
    });

    ethereum.on('chainChanged', () => {
      connectWalletBtn.textContent = "Connect Wallet";
      if (startConnectWalletBtn) startConnectWalletBtn.textContent = "Connect Wallet";
      submitScoreBtn.style.display = "none";
      showLeaderboardBtn.style.display = "none";
      contract = null;
      setUserAccount(null);
    });

    return true;

  } catch (err) {
    console.error(err);
    return false;
  }
}


async function handleConnectWallet() {
  const ready = await initWeb3();
  if (!ready) return;

  try {
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts'
    });

    const account = accounts[0];
    setUserAccount(account);

    connectWalletBtn.textContent = account.slice(0, 6) + '...' + account.slice(-4);
    if (startConnectWalletBtn) {
      startConnectWalletBtn.textContent = account.slice(0, 6) + '...' + account.slice(-4);
    }

    contract = new web3.eth.Contract(contractABI, CONFIG.CONTRACT_ADDRESS);

    showLeaderboardBtn.style.display = 'block';
    if (startShowLeaderboardBtn) startShowLeaderboardBtn.style.display = 'block';

    if (!isGameActive()) {
      submitScoreBtn.style.display = 'block';
    }

  } catch (error) {
    console.error(error);
  }
}

// Connect Wallet buttons (game HUD + start screen)
connectWalletBtn.addEventListener('click', handleConnectWallet);
if (startConnectWalletBtn) startConnectWalletBtn.addEventListener('click', handleConnectWallet);


// Submit Score Signed
submitScoreBtn.addEventListener('click', async () => {
  if (!contract) {
    alert('Connect wallet first');
    return;
  }

  const currentScore = getScore();
  if (currentScore <= 0) {
    alert('Score must be > 0');
    return;
  }

  const accounts = await window.ethereum.request({ method: 'eth_accounts' });
  const account = accounts[0];

  const chainId = await window.ethereum.request({ method: 'eth_chainId' });
  if (parseInt(chainId, 16) !== CONFIG.SOMNIA_CHAIN_ID) {
    alert('Wrong chain, switch to Somnia Mainnet');
    return;
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);

    const messageHash = web3.utils.soliditySha3(
      { t: 'address', v: account },
      { t: 'uint32', v: currentScore },
      { t: 'uint32', v: timestamp },
      { t: 'address', v: CONFIG.CONTRACT_ADDRESS },
      { t: 'uint256', v: CONFIG.SOMNIA_CHAIN_ID }
    );

    const signature = await window.ethereum.request({
      method: 'personal_sign',
      params: [messageHash, account]
    });

    const sig = signature.startsWith("0x") ? signature.slice(2) : signature;

    const r = "0x" + sig.slice(0, 64);
    const s = "0x" + sig.slice(64, 128);
    let v = parseInt(sig.slice(128, 130), 16);
    if (v < 27) v += 27;

    await contract.methods.submitScoreSigned(currentScore, timestamp, v, r, s)
      .send({ from: account });

    alert("Score submitted!");

  } catch (err) {
    console.error(err);
    alert("Error");
  }
});


// Leaderboard
async function handleShowLeaderboard() {
  if (!contract) return;

  const prevModal = document.getElementById('leaderboard-modal');
  if (prevModal) prevModal.remove();

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
      for (let e of top10) {
        const addr = e.player.slice(0, 6) + '...' + e.player.slice(-4);
        html += `<li>${addr}: ${e.score}</li>`;
      }
    }

    html += `</ol><button id="close-lb">Close</button>`;

    const modal = document.createElement('div');
    modal.id = 'leaderboard-modal';
    modal.innerHTML = html;
    document.body.appendChild(modal);

    document.getElementById('close-lb').onclick = () => modal.remove();

  } catch (err) {
    console.error(err);
  }
}

showLeaderboardBtn.addEventListener('click', handleShowLeaderboard);
if (startShowLeaderboardBtn) startShowLeaderboardBtn.addEventListener('click', handleShowLeaderboard);
