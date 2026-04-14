import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { apeChain, somnia } from './chains';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '';

if (!projectId && import.meta.env.DEV) {
  console.warn(
    '[Frost] Set VITE_WALLETCONNECT_PROJECT_ID in .env (https://cloud.reown.com) for WalletConnect / mobile wallets.'
  );
}

export const wagmiConfig = getDefaultConfig({
  appName: 'Frost Mini Games',
  projectId: projectId || '00000000000000000000000000000000',
  chains: [somnia, apeChain],
  ssr: false,
});
