import { useEffect, useRef } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { switchChain } from 'wagmi/actions';
import { readContract } from 'wagmi/actions';
import { setUserAccount, updatePersonalBest } from '../game/frostGame';
import { refreshBattleTotalsDOM } from './leaderboard';
import {
  applyPendingNicknameAfterConnect,
  getPreferredNetworkBeforeConnect,
  handleSubmitScoreRequest,
  syncNicknameKnownFromChain,
} from './walletWrites';
import { CONFIG } from '../config';
import { frostAbi } from '../lib/frostAbi';
import { wagmiConfig } from '../lib/wagmiConfig';

function networkLabel(chainId: number | undefined) {
  if (chainId === CONFIG.SOMNIA_CHAIN_ID) return 'Somnia';
  if (chainId === CONFIG.APECHAIN_CHAIN_ID) return 'ApeChain';
  if (chainId === undefined) return 'Unknown network';
  return `Chain ${chainId}`;
}

export function WalletEffects() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const autoNickKeyRef = useRef<string>('');
  const autoSwitchKeyRef = useRef<string>('');

  useEffect(() => {
    setUserAccount(address ?? null);
  }, [address]);

  useEffect(() => {
    void updatePersonalBest();
  }, [address, chainId]);

  useEffect(() => {
    void refreshBattleTotalsDOM();
    const id = window.setInterval(() => void refreshBattleTotalsDOM(), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onSubmit = (e: Event) => {
      const ce = e as CustomEvent<{ network?: string }>;
      void handleSubmitScoreRequest(ce.detail?.network ?? null);
    };
    window.addEventListener('submit-score-request', onSubmit);
    return () => window.removeEventListener('submit-score-request', onSubmit);
  }, []);

  useEffect(() => {
    if (!isConnected || !address || !chainId) return;

    const preferred = getPreferredNetworkBeforeConnect();
    const preferredChainId =
      preferred === 'ape' ? CONFIG.APECHAIN_CHAIN_ID : CONFIG.SOMNIA_CHAIN_ID;

    if (chainId === preferredChainId) return;

    const key = `${address}:${chainId}->${preferredChainId}`;
    if (autoSwitchKeyRef.current === key) return;
    autoSwitchKeyRef.current = key;

    void switchChain(wagmiConfig, { chainId: preferredChainId }).catch(() => {
      // User may reject network switch in wallet.
    });
  }, [isConnected, address, chainId]);

  useEffect(() => {
    if (!isConnected || !address || !chainId) return;
    const key = `${address}:${chainId}`;
    if (autoNickKeyRef.current === key) return;
    autoNickKeyRef.current = key;

    void (async () => {
      await syncNicknameKnownFromChain();
      await applyPendingNicknameAfterConnect();
    })();
  }, [isConnected, address, chainId]);

  useEffect(() => {
    const btn = document.getElementById('start-connect-wallet') as HTMLButtonElement | null;
    if (!btn) return;
    let cancelled = false;

    if (!isConnected || !address || !chainId) {
      btn.textContent = 'Connect Wallet';
      return () => {
        cancelled = true;
      };
    }

    btn.textContent = `Connected (${networkLabel(chainId)})`;

    const contractAddress =
      chainId === CONFIG.SOMNIA_CHAIN_ID
        ? CONFIG.CONTRACT_ADDRESS
        : chainId === CONFIG.APECHAIN_CHAIN_ID
          ? CONFIG.APECHAIN_CONTRACT_ADDRESS
          : null;

    if (!contractAddress) {
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const nickname = (await readContract(wagmiConfig, {
          address: contractAddress as `0x${string}`,
          abi: frostAbi,
          functionName: 'nicknameOf',
          args: [address as `0x${string}`],
          chainId: chainId as typeof CONFIG.SOMNIA_CHAIN_ID | typeof CONFIG.APECHAIN_CHAIN_ID,
        })) as string;
        const normalized = String(nickname || '').trim();
        if (!cancelled && normalized) {
          btn.textContent = `${normalized} (${networkLabel(chainId)})`;
        }
      } catch {
        // keep "Connected (Network)" fallback
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isConnected, address, chainId]);

  return null;
}
