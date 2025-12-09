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

// submitScoreBtn handler — заменяем текущий
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
    // ensure account
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    const account = accounts[0];
    if (!account) {
      alert('Connect wallet first');
      return;
    }

    // chain check
    const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (currentChainId !== CONFIG.SOMNIA_CHAIN_ID) {
      alert('Please stay on Somnia Mainnet.');
      return;
    }

    // timestamp (seconds)
    const timestamp = Math.floor(Date.now() / 1000);

    // Build message hash: keccak256(abi.encodePacked(player, score, timestamp, contractAddress, chainId))
    // Note: soliditySha3 will produce the same as keccak256(abi.encodePacked(...))
    const chainIdNum = parseInt(CONFIG.SOMNIA_CHAIN_ID, 16);

    const messageHash = web3.utils.soliditySha3(
      { t: 'address', v: account },
      { t: 'uint32', v: currentScore },
      { t: 'uint32', v: timestamp },
      { t: 'address', v: CONFIG.CONTRACT_ADDRESS },
      { t: 'uint256', v: chainIdNum }
    );

    // Request personal_sign. Some wallets expect params order [msg, account], some [account, msg].
    // web3.eth.personal.sign handles it; using ethereum.request with 'personal_sign' is OK too.
    // We'll use ethereum.request for broad compatibility:
    const signature = await window.ethereum.request({
      method: 'personal_sign',
      params: [messageHash, account]
    });

    // signature is 65 bytes hex: r(32) + s(32) + v(1)
    if (!signature || signature.length < 130) {
      throw new Error('Invalid signature format');
    }
    
    const sig = signature.startsWith('0x') ? signature.slice(2) : signature;
    if (sig.length < 130) {
      throw new Error('Signature too short');
    }
    
    const r = '0x' + sig.slice(0, 64);
    const s = '0x' + sig.slice(64, 128);
    let v = parseInt(sig.slice(128, 130), 16);
    
    // EIP-155 style v fix: if v is 0/1 add 27
    if (v < 27) v += 27;

    // Send transaction
    await contract.methods.submitScoreSigned(currentScore, timestamp, v, r, s)
      .send({ from: account });

    alert('✅ Score submitted (signed)!');
  } catch (error) {
    console.error('Signed submission failed:', error);
    alert('Submission failed. Check console for details.');
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
