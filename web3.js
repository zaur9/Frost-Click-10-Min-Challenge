import { CONFIG } from './config.js';
import {
  getScore,
  isGameActive,
  setUserAccount
} from './game.js';

let web3 = null;
let contract = null;

// DOM buttons
const connectWalletBtn = document.getElementById('connect-wallet');
const submitScoreBtn = document.getElementById('submit-score');
const showLeaderboardBtn = document.getElementById('show-leaderboard');

const startConnectWallet = document.getElementById('start-connect-wallet');
const startLeaderboardBtn = document.getElementById('start-leaderboard');

startConnectWallet.addEventListener("click", () => connectWalletBtn.click());
startLeaderboardBtn.addEventListener("click", () => showLeaderboardBtn.click());

const contractABI = [ ... твой ABI без изменений ... ];

async function initWeb3() {
  if (!window.ethereum) {
    alert("Please install MetaMask or Somnia Wallet!");
    return false;
  }

  try {
    const chainId = await ethereum.request({ method: "eth_chainId" });

    if (parseInt(chainId, 16) !== CONFIG.SOMNIA_CHAIN_ID) {
      alert("Switch to Somnia Mainnet.");
      return false;
    }

    web3 = new Web3(window.ethereum);

    ethereum.on("accountsChanged", () => {
      setUserAccount(null);
      contract = null;
      connectWalletBtn.textContent = "Connect Wallet";
    });

    ethereum.on("chainChanged", () => {
      setUserAccount(null);
      contract = null;
      connectWalletBtn.textContent = "Connect Wallet";
    });

    return true;

  } catch (e) {
    console.error(e);
    alert("Failed to connect wallet.");
    return false;
  }
}

connectWalletBtn.addEventListener("click", async () => {
  const ready = await initWeb3();
  if (!ready) return;

  try {
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    const acc = accounts[0];

    setUserAccount(acc);
    connectWalletBtn.textContent = acc.substring(0, 6) + "...";

    contract = new web3.eth.Contract(contractABI, CONFIG.CONTRACT_ADDRESS);

    showLeaderboardBtn.style.display = "block";
    if (!isGameActive()) submitScoreBtn.style.display = "block";

  } catch (err) {
    console.error(err);
    alert("Wallet connection failed");
  }
});

submitScoreBtn.addEventListener("click", async () => {
  if (!contract) return alert("Connect wallet first");

  const score = getScore();
  if (score <= 0) return alert("Score is zero");

  try {
    const accounts = await ethereum.request({ method: "eth_accounts" });
    const acc = accounts[0];
    if (!acc) return alert("Connect wallet first");

    const currentChain = await ethereum.request({ method: 'eth_chainId' });
    if (parseInt(currentChain, 16) !== CONFIG.SOMNIA_CHAIN_ID) {
      return alert("Switch to Somnia Mainnet.");
    }

    const timestamp = Math.floor(Date.now() / 1000);

    const messageHash = web3.utils.soliditySha3(
      { t: "address", v: acc },
      { t: "uint32", v: score },
      { t: "uint32", v: timestamp },
      { t: "address", v: CONFIG.CONTRACT_ADDRESS },
      { t: "uint256", v: CONFIG.SOMNIA_CHAIN_ID }
    );

    const prefixedHash = web3.utils.soliditySha3(
      "\x19Ethereum Signed Message:\n32",
      messageHash
    );

    const signature = await ethereum.request({
      method: "personal_sign",
      params: [prefixedHash, acc]
    });

    const sig = signature.slice(2);
    const r = "0x" + sig.slice(0, 64);
    const s = "0x" + sig.slice(64, 128);
    let v = parseInt(sig.slice(128, 130), 16);
    if (v < 27) v += 27;

    await contract.methods.submitScoreSigned(score, timestamp, v, r, s)
      .send({ from: acc });

    alert("Score submitted!");

  } catch (e) {
    console.error(e);
    alert("Failed to submit score");
  }
});

showLeaderboardBtn.addEventListener("click", async () => {
  if (!contract) return alert("Connect wallet first");

  const old = document.getElementById("leaderboard-modal");
  if (old) old.remove();

  try {
    const leaders = await contract.methods.getLeaderboard().call();

    const top10 = leaders
      .filter(e => e.player !== "0x0000000000000000000000000000000000000000")
      .filter(e => Number(e.score) > 0)
      .sort((a, b) => Number(b.score) - Number(a.score))
      .slice(0, 10);

    const modal = document.createElement("div");
    modal.id = "leaderboard-modal";

    let html = "<h3>🏆 Frost Click Top 10</h3><ol>";
    if (top10.length === 0) {
      html += "<li>No scores yet</li>";
    } else {
      for (let e of top10) {
        html += `<li>${e.player.substring(0,6)}...: ${e.score}</li>`;
      }
    }
    html += "</ol><button id='close-lb'>Close</button>";

    modal.innerHTML = html;
    document.body.appendChild(modal);

    document.getElementById("close-lb").onclick = () => modal.remove();

  } catch (e) {
    console.error(e);
    alert("Failed to load leaderboard");
  }
});
