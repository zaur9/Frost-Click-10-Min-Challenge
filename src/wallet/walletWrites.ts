import { createPublicClient, encodePacked, http, keccak256, type Address, type Hex } from 'viem';
import { waitForTransactionReceipt } from 'viem/actions';
import { getAccount, getChainId, getWalletClient, readContract, switchChain } from 'wagmi/actions';
import { CONFIG } from '../config';
import { apeChain, somnia } from '../lib/chains';
import { frostAbi } from '../lib/frostAbi';
import { wagmiConfig } from '../lib/wagmiConfig';
import { getScore, setUserAccount } from '../game/frostGame';
import { refreshBattleTotalsDOM } from './leaderboard';

const NICKNAME_KNOWN_KEY = 'frost.nickname.known';
const NICKNAME_PENDING_KEY = 'frost.nickname.pending';
const PREFERRED_NETWORK_KEY = 'frost.preferred.network';

function getNetworkByChainId(chainId: number) {
  if (chainId === CONFIG.SOMNIA_CHAIN_ID) {
    return {
      key: 'somnia' as const,
      name: 'Somnia',
      chainId: CONFIG.SOMNIA_CHAIN_ID,
      contractAddress: CONFIG.CONTRACT_ADDRESS as Address,
      chain: somnia,
    };
  }
  if (chainId === CONFIG.APECHAIN_CHAIN_ID) {
    return {
      key: 'ape' as const,
      name: 'ApeChain',
      chainId: CONFIG.APECHAIN_CHAIN_ID,
      contractAddress: CONFIG.APECHAIN_CONTRACT_ADDRESS as Address,
      chain: apeChain,
    };
  }
  return null;
}

function readableChains() {
  return `Somnia (${CONFIG.SOMNIA_CHAIN_ID}) or ApeChain (${CONFIG.APECHAIN_CHAIN_ID})`;
}

function normalizeNickname(value: string) {
  return String(value || '').trim();
}

function getPendingNickname(): string {
  return normalizeNickname(localStorage.getItem(NICKNAME_PENDING_KEY) ?? '');
}

function setPendingNickname(value: string) {
  localStorage.setItem(NICKNAME_PENDING_KEY, normalizeNickname(value));
}

function clearPendingNickname() {
  localStorage.removeItem(NICKNAME_PENDING_KEY);
}

function setNicknameKnown(value: boolean) {
  if (value) localStorage.setItem(NICKNAME_KNOWN_KEY, '1');
}

export function canSkipNicknameBeforeConnect(): boolean {
  return localStorage.getItem(NICKNAME_KNOWN_KEY) === '1';
}

export function validateNicknameInput(value: string): string | null {
  const nickname = normalizeNickname(value);
  if (!nickname) {
    return 'Enter nickname first';
  }
  if (nickname.length < 3 || nickname.length > 16) {
    return 'Nickname length must be 3..16 characters';
  }
  return null;
}

export function queueNicknameBeforeConnect(value: string): boolean {
  const nickname = normalizeNickname(value);
  const validationError = validateNicknameInput(nickname);
  if (validationError) return false;
  setPendingNickname(nickname);
  return true;
}

export type PreferredNetworkKey = 'somnia' | 'ape';

export function setPreferredNetworkBeforeConnect(network: PreferredNetworkKey) {
  localStorage.setItem(PREFERRED_NETWORK_KEY, network);
}

export function getPreferredNetworkBeforeConnect(): PreferredNetworkKey {
  const value = localStorage.getItem(PREFERRED_NETWORK_KEY);
  return value === 'ape' ? 'ape' : 'somnia';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function displayNameFor(addr: string, nickname: string) {
  const n = normalizeNickname(nickname);
  if (n) return n;
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

export async function saveNicknameFlow(prefilledNickname?: string | null): Promise<boolean> {
  const raw =
    prefilledNickname ??
    window.prompt('Enter your nickname (3-16 characters):', '') ??
    '';
  const nickname = normalizeNickname(raw);
  const validationError = validateNicknameInput(nickname);
  if (validationError) {
    alert(validationError);
    return false;
  }

  const { address, chainId } = getAccount(wagmiConfig);
  if (!address) {
    alert('Connect wallet first');
    return false;
  }

  const currentChainId = chainId ?? getChainId(wagmiConfig);
  const preferredNetwork = getPreferredNetworkBeforeConnect();
  const preferredChainId =
    preferredNetwork === 'ape' ? CONFIG.APECHAIN_CHAIN_ID : CONFIG.SOMNIA_CHAIN_ID;

  if (currentChainId !== preferredChainId) {
    try {
      await switchChain(wagmiConfig, { chainId: preferredChainId });
    } catch {
      alert(`Please switch to ${readableChains()}`);
      return false;
    }
  }

  const net = getNetworkByChainId(preferredChainId);
  if (!net) {
    alert(`Please switch to ${readableChains()}`);
    return false;
  }

  try {
    const walletClient = await getWalletClient(wagmiConfig, { chainId: net.chainId });
    if (!walletClient) {
      alert('Connect wallet first');
      return false;
    }

    const hash = await walletClient.writeContract({
      address: net.contractAddress,
      abi: frostAbi,
      functionName: 'setNickname',
      args: [nickname],
      chain: net.chain,
      account: address,
    });
    const pub = createPublicClient({ chain: net.chain, transport: http() });
    await waitForTransactionReceipt(pub, { hash }).catch(() => {});

    const status = document.getElementById('start-wallet-status');
    if (status) {
      status.textContent = `Wallet: ${displayNameFor(address, nickname)} (${net.name})`;
    }
    setNicknameKnown(true);
    clearPendingNickname();
    alert('Nickname saved!');
    await refreshBattleTotalsDOM();
    return true;
  } catch (e) {
    console.error(e);
    alert('Failed to set nickname');
    return false;
  }
}

export async function applyPendingNicknameAfterConnect(): Promise<void> {
  const pending = getPendingNickname();
  if (!pending) return;
  await saveNicknameFlow(pending);
}

export async function syncNicknameKnownFromChain(): Promise<void> {
  const { address, chainId } = getAccount(wagmiConfig);
  if (!address || !chainId) return;
  const net = getNetworkByChainId(chainId);
  if (!net) return;

  try {
    const nickname = (await readContract(wagmiConfig, {
      address: net.contractAddress,
      abi: frostAbi,
      functionName: 'nicknameOf',
      args: [address],
      chainId: net.chainId,
    })) as string;
    if (normalizeNickname(nickname)) {
      setNicknameKnown(true);
    }
  } catch {
    // ignore: RPC/contract can fail on unsupported networks
  }
}

export async function handleSubmitScoreRequest(
  targetNetworkKey: string | null | undefined
): Promise<void> {
  const currentScore = getScore();
  if (currentScore <= 0) {
    alert('Score must be > 0');
    return;
  }

  const { address } = getAccount(wagmiConfig);
  if (!address) {
    alert('Connect wallet first');
    return;
  }

  const requestedChainId =
    targetNetworkKey === 'ape'
      ? CONFIG.APECHAIN_CHAIN_ID
      : targetNetworkKey === 'somnia'
        ? CONFIG.SOMNIA_CHAIN_ID
        : null;

  try {
    const targetChainId = requestedChainId ?? getChainId(wagmiConfig);

    if (requestedChainId !== null) {
      await switchChain(wagmiConfig, { chainId: targetChainId });
      // Wallets sometimes apply switch asynchronously; wait for chain state sync.
      for (let i = 0; i < 8; i++) {
        if (getChainId(wagmiConfig) === targetChainId) break;
        await sleep(200);
      }
    }

    const net = getNetworkByChainId(targetChainId);
    if (!net) {
      alert(`Wrong chain, switch to ${readableChains()}`);
      return;
    }

    setUserAccount(address);

    let walletClient = await getWalletClient(wagmiConfig, { chainId: net.chainId });
    if (!walletClient) {
      await sleep(250);
      walletClient = await getWalletClient(wagmiConfig, { chainId: net.chainId });
    }
    if (!walletClient) {
      alert('Connect wallet first');
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000);

    const messageHash = keccak256(
      encodePacked(
        ['address', 'uint32', 'uint32', 'address', 'uint256'],
        [
          address,
          currentScore,
          timestamp,
          net.contractAddress,
          BigInt(net.chainId),
        ]
      )
    );

    const signature = await walletClient.signMessage({
      account: address,
      message: { raw: messageHash },
    });

    const sig = signature.startsWith('0x') ? signature.slice(2) : signature;
    const r = ('0x' + sig.slice(0, 64)) as Hex;
    const s = ('0x' + sig.slice(64, 128)) as Hex;
    let v = parseInt(sig.slice(128, 130), 16);
    if (v < 27) v += 27;

    const hash = await walletClient.writeContract({
      address: net.contractAddress,
      abi: frostAbi,
      functionName: 'submitScoreSigned',
      args: [currentScore, timestamp, v, r, s],
      chain: net.chain,
      account: address,
    });
    const pub = createPublicClient({ chain: net.chain, transport: http() });
    await waitForTransactionReceipt(pub, { hash }).catch(() => {});

    alert('Score submitted!');
    await refreshBattleTotalsDOM();
  } catch (err) {
    console.error(err);
    alert('Error');
  }
}
