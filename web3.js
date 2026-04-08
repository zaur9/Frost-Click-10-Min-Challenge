import { CONFIG } from './config.js';
import { setUserAccount } from './game.js';

let web3 = null;
let contract = null;
let walletListenersAttached = false;
let activeNetworkCfg = null;

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
    el.innerHTML = '<li>N/A</li>';
    return;
  }
  if (!entries || !entries.length) {
    el.innerHTML = '<li>No scores yet</li>';
    return;
  }
  el.innerHTML = entries
    .slice(0, 10)
    .map((entry) => `<li>${shortenAddress(entry.player)}: ${entry.score}</li>`)
    .join('');
}

async function fetchLeaderboardViaRpc(rpcUrl, contractAddress) {
  if (!rpcUrl || !contractAddress || /^0x0{40}$/i.test(contractAddress)) {
    throw new Error('Missing RPC URL or contract address');
  }

  const readWeb3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));
  const readContract = new readWeb3.eth.Contract(contractABI, contractAddress);
  const leaderboard = await readContract.methods.getLeaderboard().call();
  const sorted = getValidEntries(leaderboard);
  const total = sorted.reduce((sum, item) => sum + Number(item.score), 0);
  return {
    top10: sorted.slice(0, 10),
    total
  };
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
        const addr = (accounts && accounts.length) ? accounts[0] : null;
        if (addr) {
          connectWalletBtn.textContent = shortenAddress(addr);
          if (apeConnectWalletBtn) apeConnectWalletBtn.textContent = shortenAddress(addr);
          if (startConnectWalletBtn) startConnectWalletBtn.textContent = shortenAddress(addr);
        } else {
          connectWalletBtn.textContent = "Connect Wallet";
          if (apeConnectWalletBtn) apeConnectWalletBtn.textContent = "Connect Wallet";
          if (startConnectWalletBtn) startConnectWalletBtn.textContent = "Connect Wallet";
        }
        setUserAccount(addr);
      });

      ethereum.on('chainChanged', () => {
        connectWalletBtn.textContent = "Connect Wallet";
        if (apeConnectWalletBtn) apeConnectWalletBtn.textContent = "Connect Wallet";
        if (startConnectWalletBtn) startConnectWalletBtn.textContent = "Connect Wallet";
        contract = null;
        window.contract = null;
        activeNetworkCfg = null;
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

    connectWalletBtn.textContent = shortenAddress(account);
    if (apeConnectWalletBtn) {
      apeConnectWalletBtn.textContent = shortenAddress(account);
    }
    if (startConnectWalletBtn) {
      startConnectWalletBtn.textContent = shortenAddress(account);
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

  } catch (error) {
    console.error(error);
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
        .map((e) => `<li>${shortenAddress(e.player)}: ${e.score}</li>`)
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
