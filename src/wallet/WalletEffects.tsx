import { useEffect, useRef } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { setUserAccount, updatePersonalBest } from '../game/frostGame';
import { refreshBattleTotalsDOM } from './leaderboard';
import {
  applyPendingNicknameAfterConnect,
  handleSubmitScoreRequest,
  syncNicknameKnownFromChain,
} from './walletWrites';
import { CONFIG } from '../config';

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
    const key = `${address}:${chainId}`;
    if (autoNickKeyRef.current === key) return;
    autoNickKeyRef.current = key;

    void (async () => {
      await syncNicknameKnownFromChain();
      await applyPendingNicknameAfterConnect();
    })();
  }, [isConnected, address, chainId]);

  useEffect(() => {
    const el = document.getElementById('start-wallet-status');
    if (!el) return;
    if (!isConnected || !address) {
      el.textContent = 'Wallet: not connected';
      return;
    }
    el.textContent = `Wallet: ${address.slice(0, 6)}...${address.slice(-4)} (${networkLabel(chainId)})`;
  }, [isConnected, address, chainId]);

  return null;
}
