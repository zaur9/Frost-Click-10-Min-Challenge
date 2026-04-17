import { createPublicClient, encodePacked, http, keccak256, type Address, type Hex } from 'viem';
import { waitForTransactionReceipt } from 'viem/actions';
import { getAccount, getChainId, getWalletClient, readContract, switchChain } from 'wagmi/actions';
import { CONFIG } from '../config';
import { apeChain, somnia } from '../lib/chains';
import { frostAbi } from '../lib/frostAbi';
import { wagmiConfig } from '../lib/wagmiConfig';
import {
  consumeScoreAfterSubmit,
  getRoundDurationSeconds,
  getRoundTraceSeed,
  getScore,
  setUserAccount,
} from '../game/frostGame';
import { refreshBattleTotalsDOM } from './leaderboard';

const NICKNAME_KNOWN_KEY = 'frost.nickname.known';
const NICKNAME_KNOWN_BY_NETWORK_PREFIX = 'frost.nickname.known.network.';
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

export function clearPendingNicknameBeforeConnect() {
  clearPendingNickname();
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

function getContractAddressForNetwork(network: PreferredNetworkKey): Address {
  return (network === 'ape' ? CONFIG.APECHAIN_CONTRACT_ADDRESS : CONFIG.CONTRACT_ADDRESS) as Address;
}

function getNicknameKnownStorageKey(network: PreferredNetworkKey): string {
  const contractAddress = getContractAddressForNetwork(network).toLowerCase();
  return `${NICKNAME_KNOWN_BY_NETWORK_PREFIX}${network}.${contractAddress}`;
}

function setNicknameKnownForNetwork(network: PreferredNetworkKey, value: boolean) {
  if (value) localStorage.setItem(getNicknameKnownStorageKey(network), '1');
}

export function hasKnownNicknameForNetwork(network: PreferredNetworkKey): boolean {
  return localStorage.getItem(getNicknameKnownStorageKey(network)) === '1';
}

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

async function waitForChainSync(targetChainId: number, attempts = 12, delayMs = 250) {
  for (let i = 0; i < attempts; i++) {
    if (getChainId(wagmiConfig) === targetChainId) return true;
    await sleep(delayMs);
  }
  return getChainId(wagmiConfig) === targetChainId;
}

async function getWalletClientOnChain(targetChainId: number, attempts = 12, delayMs = 250) {
  for (let i = 0; i < attempts; i++) {
    const wc = await getWalletClient(wagmiConfig, { chainId: targetChainId });
    if (wc && wc.chain?.id === targetChainId) return wc;
    await sleep(delayMs);
  }
  return null;
}

function getReadableError(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const rec = err as Record<string, unknown>;
    const shortMessage = rec.shortMessage;
    if (typeof shortMessage === 'string' && shortMessage.trim()) return shortMessage;
    const message = rec.message;
    if (typeof message === 'string' && message.trim()) return message;
    const cause = rec.cause;
    if (cause && typeof cause === 'object') {
      const causeRec = cause as Record<string, unknown>;
      if (typeof causeRec.message === 'string' && causeRec.message.trim()) {
        return causeRec.message;
      }
    }
  }
  return 'Unknown error';
}

function isConnectorChainMismatchError(err: unknown): boolean {
  const msg = getReadableError(err).toLowerCase();
  return msg.includes('does not match the connection') || msg.includes('connector') && msg.includes('chain');
}

function displayNameFor(addr: string, nickname: string) {
  const n = normalizeNickname(nickname);
  if (n) return n;
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

async function readSubmitRules(net: NonNullable<ReturnType<typeof getNetworkByChainId>>) {
  const [minRound, maxRound] = await Promise.all([
    readContract(wagmiConfig, {
      address: net.contractAddress,
      abi: frostAbi,
      functionName: 'MIN_ROUND_DURATION',
      chainId: net.chainId,
    }),
    readContract(wagmiConfig, {
      address: net.contractAddress,
      abi: frostAbi,
      functionName: 'MAX_ROUND_DURATION',
      chainId: net.chainId,
    }),
  ]);
  return {
    minRoundDuration: Number(minRound),
    maxRoundDuration: Number(maxRound),
  };
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

    setNicknameKnown(true);
    setNicknameKnownForNetwork(net.key, true);
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
  const { address, chainId } = getAccount(wagmiConfig);
  if (address && chainId) {
    const net = getNetworkByChainId(chainId);
    if (net) {
      try {
        const onchainNickname = (await readContract(wagmiConfig, {
          address: net.contractAddress,
          abi: frostAbi,
          functionName: 'nicknameOf',
          args: [address],
          chainId: net.chainId,
        })) as string;
        if (normalizeNickname(onchainNickname)) {
          setNicknameKnown(true);
          setNicknameKnownForNetwork(net.key, true);
          clearPendingNickname();
          return;
        }
      } catch {
        // ignore and continue with pending fallback
      }
    }
  }

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
      setNicknameKnownForNetwork(net.key, true);
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

  const runSubmitOnce = async () => {
    const targetChainId = requestedChainId ?? getChainId(wagmiConfig);
    const targetNet = getNetworkByChainId(targetChainId);
    if (!targetNet) {
      throw new Error(`Wrong chain, switch to ${readableChains()}`);
    }

    if (requestedChainId !== null) {
      let switched = false;
      let lastSwitchError: unknown = null;

      for (let i = 0; i < 3; i++) {
        try {
          await switchChain(wagmiConfig, { chainId: targetChainId });
          const synced = await waitForChainSync(targetChainId, 40, 250);
          if (synced) {
            switched = true;
            break;
          }
        } catch (e) {
          lastSwitchError = e;
          await sleep(350);
        }
      }

      if (!switched) {
        const reason = lastSwitchError ? `\n${getReadableError(lastSwitchError)}` : '';
        throw new Error(`Could not switch network. Please switch to ${readableChains()}${reason}`);
      }

      // Give wallet UI a brief moment to settle after network confirmation
      // so signature prompt is shown strictly after switch.
      await sleep(300);
    }

    if (requestedChainId !== null && getChainId(wagmiConfig) !== targetChainId) {
      throw new Error(`Wrong chain active. Expected ${targetChainId}`);
    }

    setUserAccount(address);

    const walletClient = await getWalletClientOnChain(targetNet.chainId, 36, 250);
    if (!walletClient) {
      throw new Error(`Wallet is not ready on ${targetNet.name}. Try again in a moment.`);
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const roundDuration = getRoundDurationSeconds();
    const traceSeed = getRoundTraceSeed();
    const traceHash = keccak256(
      encodePacked(
        ['string'],
        [traceSeed || `fallback:${address}:${currentScore}:${roundDuration}:${timestamp}`]
      )
    );
    const nonce = (await readContract(wagmiConfig, {
      address: targetNet.contractAddress,
      abi: frostAbi,
      functionName: 'nextNonce',
      args: [address],
      chainId: targetNet.chainId,
    })) as bigint;
    const rules = await readSubmitRules(targetNet);
    if (
      !Number.isFinite(roundDuration) ||
      roundDuration < rules.minRoundDuration ||
      roundDuration > rules.maxRoundDuration
    ) {
      throw new Error(
        `Round duration must be ${rules.minRoundDuration}-${rules.maxRoundDuration} sec (now: ${roundDuration})`
      );
    }
    const messageHash = keccak256(
      encodePacked(
        ['address', 'uint32', 'uint32', 'uint64', 'bytes32', 'uint32', 'address', 'uint256'],
        [
          address,
          currentScore,
          roundDuration,
          nonce,
          traceHash,
          timestamp,
          targetNet.contractAddress,
          BigInt(targetNet.chainId),
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
      address: targetNet.contractAddress,
      abi: frostAbi,
      functionName: 'submitScoreV2',
      args: [currentScore, roundDuration, nonce, traceHash, timestamp, v, r, s],
      chain: targetNet.chain,
      account: address,
    });
    const pub = createPublicClient({ chain: targetNet.chain, transport: http() });
    await waitForTransactionReceipt(pub, { hash }).catch(() => {});
  };

  try {
    await runSubmitOnce();
    consumeScoreAfterSubmit();
    alert('Score submitted!');
    await refreshBattleTotalsDOM();
  } catch (err) {
    // Auto-heal one time on connector/network desync without user re-click.
    if (isConnectorChainMismatchError(err) && requestedChainId !== null) {
      try {
        await switchChain(wagmiConfig, { chainId: requestedChainId });
        await waitForChainSync(requestedChainId, 40, 250);
        await sleep(400);
        await runSubmitOnce();
        consumeScoreAfterSubmit();
        alert('Score submitted!');
        await refreshBattleTotalsDOM();
        return;
      } catch (retryErr) {
        console.error(retryErr);
        alert(`Submit failed: ${getReadableError(retryErr)}`);
        return;
      }
    }

    console.error(err);
    alert(`Submit failed: ${getReadableError(err)}`);
  }
}
