import { CONFIG } from './config.js';
import { setUserAccount, getScore } from './game.js';

let web3 = null;
let contract = null;
let walletListenersAttached = false;
let activeNetworkCfg = null;
let currentDisplayName = null;

const connectWalletBtn = document.getElementById('connect-wallet');
const apeConnectWalletBtn = document.getElementById('ape-connect-wallet');
const startConnectWalletBtn = document.getElementById('start-connect-wallet');
const startShowLeaderboardBtn = document.getElementById('start-show-leaderboard');
const apeTotalEl = document.getElementById('ape-total');
const somniaTotalEl = document.getElementById('somnia-total');
const apeTopListEl = document.getElementById('ape-top-list');
const somniaTopListEl = document.getElementById('somnia-top-list');

// ABI расширен: добавлены indexPlusOne и leaderboard для совместимости с game.js
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
  },

  {
    "inputs": [
      { "internalType": "address", "name": "", "type": "address" }
    ],
    "name": "indexPlusOne",
    "outputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },

  {
    "inputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "name": "leaderboard",
    "outputs": [
      { "internalType": "address", "name": "player", "type": "address" },
      { "internalType": "uint32", "name": "score", "type": "uint32" },
      { "internalType": "uint32", "name": "timestamp", "type": "uint32" }
    ],
    "stateMutability": "view",
    "type": "function"
  },

  {
    "inputs": [],
    "name": "entriesCount",
    "outputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },

  {
    "inputs": [],
    "name": "MAX_SCORE",
    "outputs": [
      { "internalType": "uint32", "name": "", "type": "uint32" }
    ],
    "stateMutability": "view",
    "type": "function"
  },

  {
    "inputs": [
      { "internalType": "bytes32", "name": "", "type": "bytes32" }
    ],
    "name": "usedMessages",
    "outputs": [
      { "internalType": "bool", "name": "", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  },

  {
    "inputs": [],
    "name": "globalTotalScore",
    "outputs": [
      { "internalType": "uint128", "name": "", "type": "uint128" }
    ],
    "stateMutability": "view",
    "type": "function"
  },

  {
    "inputs": [
      { "internalType": "address", "name": "", "type": "address" }
    ],
    "name": "totalScoreOf",
    "outputs": [
      { "internalType": "uint64", "name": "", "type": "uint64" }
    ],
    "stateMutability": "view",
    "type": "function"
  },

  {
    "inputs": [
      { "internalType": "address", "name": "", "type": "address" }
    ],
    "name": "nicknameOf",
    "outputs": [
      { "internalType": "string", "name": "", "type": "string" }
    ],
    "stateMutability": "view",
    "type": "function"
  },

  {
    "inputs": [
      { "internalType": "string", "name": "nickname_", "type": "string" }
    ],
    "name": "setNickname",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
]

function getNetworkConfigByChainId(chainIdNum) {
  if (chainIdNum === CONFIG.SOMNIA_CHAIN_ID) {
    return {
      key: 'somnia',
      name: 'Somnia',
      chainId: CONFIG.SOMNIA_CHAIN_ID,
      contractAddress: CONFIG.CONTRACT_ADDRESS
    };
  }

  if (chainIdNum === CONFIG.APECHAIN_CHAIN_ID) {
    return {
      key: 'ape',
      name: 'ApeChain',
      chainId: CONFIG.APECHAIN_CHAIN_ID,
      contractAddress: CONFIG.APECHAIN_CONTRACT_ADDRESS
    };
  }

  return null;
}

function getReadableChainNames() {
  return `Somnia (${CONFIG.SOMNIA_CHAIN_ID}) or ApeChain (${CONFIG.APECHAIN_CHAIN_ID})`;
}

function shortenAddress(addr) {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function normalizeNickname(value) {
  if (!value) return '';
  return String(value).trim();
}

function displayNameFor(addr, nickname) {
  const n = normalizeNickname(nickname);
  return n || shortenAddress(addr);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function tryReadNickname(addr, readContract = contract) {
  if (!addr || !readContract || !readContract.methods || !readContract.methods.nicknameOf) return '';
  try {
    const nick = await readContract.methods.nicknameOf(addr).call();
    return normalizeNickname(nick);
  } catch (_) {
    return '';
  }
}

function resetWalletButtonLabels() {
  if (connectWalletBtn) connectWalletBtn.textContent = 'Connect Wallet';
  if (apeConnectWalletBtn) apeConnectWalletBtn.textContent = 'Connect Wallet';
}

function updateWalletButtonLabelsForActiveNetwork(addr) {
  if (!addr || !activeNetworkCfg) {
    resetWalletButtonLabels();
    return;
  }

  const label = currentDisplayName || shortenAddress(addr);

  if (activeNetworkCfg.key === 'ape') {
    if (apeConnectWalletBtn) apeConnectWalletBtn.textContent = label;
    if (connectWalletBtn) connectWalletBtn.textContent = 'Connect Wallet';
  } else if (activeNetworkCfg.key === 'somnia') {
    if (connectWalletBtn) connectWalletBtn.textContent = label;
    if (apeConnectWalletBtn) apeConnectWalletBtn.textContent = 'Connect Wallet';
  } else {
    resetWalletButtonLabels();
  }
}

function getValidEntries(entries) {
  return entries
    .filter(e => e.player !== '0x0000000000000000000000000000000000000000' && Number(e.score) > 0)
    .sort((a, b) => Number(b.score) - Number(a.score));
}

function setTeamTotal(el, title, value, isError = false) {
  if (!el) return;
  if (isError) {
    el.textContent = `${title}: N/A`;
    return;
  }
  el.textContent = `${title}: ${value}`;
}

function setSideTopList(el, entries, hasError = false) {
  if (!el) return;
  if (hasError) {
    el.textContent = '';
    const li = document.createElement('li');
    li.textContent = 'N/A';
    el.appendChild(li);
    return;
  }
  if (!entries || !entries.length) {
    el.textContent = '';
    const li = document.createElement('li');
    li.textContent = 'No scores yet';
    el.appendChild(li);
    return;
  }
  el.textContent = '';
  entries.slice(0, 10).forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = `${displayNameFor(entry.player, entry.nickname)}: ${entry.score}`;
    el.appendChild(li);
  });
}

async function fetchLeaderboardViaRpc(rpcUrl, contractAddress) {
  if (!rpcUrl || !contractAddress || /^0x0{40}$/i.test(contractAddress)) {
    throw new Error('Missing RPC URL or contract address');
  }

  const readWeb3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));
  const readContract = new readWeb3.eth.Contract(contractABI, contractAddress);
  let leaderboard = [];
  try {
    leaderboard = await readContract.methods.getLeaderboard().call();
  } catch (_) {
    // Backward-compatible fallback for contracts without getLeaderboard()
    const countRaw = await readContract.methods.entriesCount().call();
    const count = Math.min(Number(countRaw) || 0, 100);
    if (count > 0) {
      const calls = [];
      for (let i = 0; i < count; i++) {
        calls.push(readContract.methods.leaderboard(i).call());
      }
      leaderboard = await Promise.all(calls);
    }
  }
  const sorted = getValidEntries(leaderboard);

  const top10Raw = sorted.slice(0, 10);
  const top10 = await Promise.all(
    top10Raw.map(async (entry) => {
      const nickname = await tryReadNickname(entry.player, readContract);
      return { ...entry, nickname };
    })
  );

  let total = 0;
  try {
    total = Number(await readContract.methods.globalTotalScore().call());
  } catch (_) {
    // Backward-compatible fallback for old contracts without globalTotalScore
    total = sorted.reduce((sum, item) => sum + Number(item.score), 0);
  }
  return {
    top10,
    total
  };
}

async function maybeSetupNickname(account) {
  if (!account || !contract) return '';

  const existing = await tryReadNickname(account, contract);
  if (existing) return existing;

  const askKey = `nick_prompted:${activeNetworkCfg?.chainId || 'unknown'}:${account.toLowerCase()}`;
  if (localStorage.getItem(askKey) === '1') return '';

  const raw = window.prompt('Enter your nickname (3-16 chars):', '');
  const nickname = normalizeNickname(raw);

  if (!nickname) {
    localStorage.setItem(askKey, '1');
    return '';
  }
  if (nickname.length < 3 || nickname.length > 16) {
    alert('Nickname length must be 3..16 characters');
    localStorage.setItem(askKey, '1');
    return '';
  }

  try {
    await contract.methods.setNickname(nickname).send({ from: account });
    return nickname;
  } catch (e) {
    console.error(e);
    alert('Failed to set nickname');
    return '';
  }
}

async function refreshBattleTotals() {
  try {
    const [apeData, somniaData] = await Promise.allSettled([
      fetchLeaderboardViaRpc(CONFIG.APECHAIN_RPC_URL, CONFIG.APECHAIN_CONTRACT_ADDRESS),
      fetchLeaderboardViaRpc(CONFIG.SOMNIA_RPC_URL, CONFIG.CONTRACT_ADDRESS)
    ]);

    if (apeData.status === 'fulfilled') {
      setTeamTotal(apeTotalEl, 'Total', apeData.value.total, false);
      setSideTopList(apeTopListEl, apeData.value.top10, false);
    } else {
      setTeamTotal(apeTotalEl, 'Total', 0, true);
      setSideTopList(apeTopListEl, [], true);
    }

    if (somniaData.status === 'fulfilled') {
      setTeamTotal(somniaTotalEl, 'Total', somniaData.value.total, false);
      setSideTopList(somniaTopListEl, somniaData.value.top10, false);
    } else {
      setTeamTotal(somniaTotalEl, 'Total', 0, true);
      setSideTopList(somniaTopListEl, [], true);
    }
  } catch (err) {
    setTeamTotal(apeTotalEl, 'Total', 0, true);
    setTeamTotal(somniaTotalEl, 'Total', 0, true);
    setSideTopList(apeTopListEl, [], true);
    setSideTopList(somniaTopListEl, [], true);
  }
}

async function initWeb3(targetChainId = null) {
  if (typeof window.ethereum === 'undefined') {
    alert('Please install MetaMask or Somnia Wallet!');
    return false;
  }

  try {
    if (targetChainId !== null) {
      const hexChainId = `0x${Number(targetChainId).toString(16)}`;
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: hexChainId }]
        });
      } catch (switchErr) {
        alert(`Please switch wallet network to ${targetChainId}`);
        return false;
      }
    }

    const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
    const chainIdNum = parseInt(chainIdHex, 16);
    const networkCfg = getNetworkConfigByChainId(chainIdNum);
    if (!networkCfg) {
      alert(`Please switch to ${getReadableChainNames()}`);
      return false;
    }
    activeNetworkCfg = networkCfg;

    web3 = new Web3(window.ethereum);

    // create contract instance once web3 is ready
    try {
      contract = new web3.eth.Contract(contractABI, networkCfg.contractAddress);
      window.contract = contract;
    } catch (e) {
      console.error('Contract init failed', e);
      contract = null;
      window.contract = null;
    }

    if (!walletListenersAttached) {
      ethereum.on('accountsChanged', (accounts) => {
        (async () => {
        const addr = (accounts && accounts.length) ? accounts[0] : null;
        currentDisplayName = addr ? displayNameFor(addr, await tryReadNickname(addr, contract)) : null;
        updateWalletButtonLabelsForActiveNetwork(addr);
        if (startConnectWalletBtn) startConnectWalletBtn.textContent = addr ? (currentDisplayName || shortenAddress(addr)) : 'Connect Wallet';
        setUserAccount(addr);
        })();
      });

      ethereum.on('chainChanged', () => {
        resetWalletButtonLabels();
        if (startConnectWalletBtn) startConnectWalletBtn.textContent = "Connect Wallet";
        contract = null;
        window.contract = null;
        activeNetworkCfg = null;
        currentDisplayName = null;
        setUserAccount(null);
      });

      walletListenersAttached = true;
    }

    return true;

  } catch (err) {
    console.error(err);
    return false;
  }
}


async function handleConnectWallet(targetChainId) {
  const ready = await initWeb3(targetChainId);
  if (!ready) return;

  try {
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts'
    });

    const account = accounts[0];
    setUserAccount(account);

    currentDisplayName = displayNameFor(account, await tryReadNickname(account, contract));

    updateWalletButtonLabelsForActiveNetwork(account);
    if (startConnectWalletBtn) {
      startConnectWalletBtn.textContent = currentDisplayName || shortenAddress(account);
    }

    // ensure contract instance exists
    if (!contract) {
      try {
        if (!activeNetworkCfg) return;
        contract = new web3.eth.Contract(contractABI, activeNetworkCfg.contractAddress);
        window.contract = contract;
      } catch (e) {
        console.error('Contract init failed', e);
        contract = null;
        window.contract = null;
      }
    }

    const maybeNick = await maybeSetupNickname(account);
    if (maybeNick) {
      currentDisplayName = displayNameFor(account, maybeNick);
      updateWalletButtonLabelsForActiveNetwork(account);
      if (startConnectWalletBtn) {
        startConnectWalletBtn.textContent = currentDisplayName;
      }
    }
    await refreshBattleTotals();

  } catch (error) {
    console.error(error);
  }
}

async function submitCurrentScore() {
  if (!contract || !web3) {
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
  if (!account) {
    alert('Connect wallet first');
    return;
  }

  const chainId = await window.ethereum.request({ method: 'eth_chainId' });
  const chainIdNum = parseInt(chainId, 16);
  const networkCfg = getNetworkConfigByChainId(chainIdNum);
  if (!networkCfg) {
    alert(`Wrong chain, switch to ${getReadableChainNames()}`);
    return;
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);

    const messageHash = web3.utils.soliditySha3(
      { t: 'address', v: account },
      { t: 'uint32', v: currentScore },
      { t: 'uint32', v: timestamp },
      { t: 'address', v: networkCfg.contractAddress },
      { t: 'uint256', v: networkCfg.chainId }
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

    await contract.methods.submitScoreSigned(currentScore, timestamp, v, r, s).send({ from: account });
    alert("Score submitted!");
    await refreshBattleTotals();
  } catch (err) {
    console.error(err);
    alert("Error");
  }
}

// Connect Wallet buttons by side: left=Ape, right=Somnia
if (connectWalletBtn) {
  connectWalletBtn.addEventListener('click', () => handleConnectWallet(CONFIG.SOMNIA_CHAIN_ID));
}
if (apeConnectWalletBtn) {
  apeConnectWalletBtn.addEventListener('click', () => handleConnectWallet(CONFIG.APECHAIN_CHAIN_ID));
}
if (startConnectWalletBtn) {
  startConnectWalletBtn.addEventListener('click', () => handleConnectWallet(CONFIG.SOMNIA_CHAIN_ID));
}
window.addEventListener('submit-score-request', submitCurrentScore);


// Leaderboard
async function handleShowLeaderboard() {
  const prevModal = document.getElementById('leaderboard-modal');
  if (prevModal) prevModal.remove();

  try {
    const [apeData, somniaData] = await Promise.allSettled([
      fetchLeaderboardViaRpc(CONFIG.APECHAIN_RPC_URL, CONFIG.APECHAIN_CONTRACT_ADDRESS),
      fetchLeaderboardViaRpc(CONFIG.SOMNIA_RPC_URL, CONFIG.CONTRACT_ADDRESS)
    ]);

    const renderList = (dataResult) => {
      if (dataResult.status !== 'fulfilled') {
        return '<p>Data unavailable. Set RPC + contract in config.js.</p>';
      }
      if (!dataResult.value.top10.length) {
        return '<p>No scores yet</p>';
      }
      const listItems = dataResult.value.top10
        .map((e) => `<li>${escapeHtml(displayNameFor(e.player, e.nickname))}: ${Number(e.score)}</li>`)
        .join('');
      return `<ol>${listItems}</ol>`;
    };

    let html = `<h3>Frost Click Network Battle</h3>
      <div class="battle-modal-grid">
        <div class="battle-modal-col">
          <h4>ApeChain Top 10</h4>
          <p><strong>Total:</strong> ${apeData.status === 'fulfilled' ? apeData.value.total : 'N/A'}</p>
          ${renderList(apeData)}
        </div>
        <div class="battle-modal-col">
          <h4>Somnia Top 10</h4>
          <p><strong>Total:</strong> ${somniaData.status === 'fulfilled' ? somniaData.value.total : 'N/A'}</p>
          ${renderList(somniaData)}
        </div>
      </div>
      <button id="close-lb">Close</button>`;

    const modal = document.createElement('div');
    modal.id = 'leaderboard-modal';
    modal.className = 'battle-modal';
    modal.innerHTML = html;
    document.body.appendChild(modal);

    document.getElementById('close-lb').onclick = () => modal.remove();
    await refreshBattleTotals();

  } catch (err) {
    console.error(err);
    alert('Error fetching battle leaderboard');
  }
}

if (startShowLeaderboardBtn) startShowLeaderboardBtn.addEventListener('click', handleShowLeaderboard);

refreshBattleTotals();
setInterval(refreshBattleTotals, 30000);
