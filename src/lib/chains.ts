import { defineChain } from 'viem';
import { CONFIG } from '../config';

export const somnia = defineChain({
  id: CONFIG.SOMNIA_CHAIN_ID,
  name: 'Somnia',
  nativeCurrency: { name: 'SOMI', symbol: 'SOMI', decimals: 18 },
  rpcUrls: {
    default: { http: [CONFIG.SOMNIA_RPC_URL] },
    public: { http: [CONFIG.SOMNIA_RPC_URL] },
  },
});

export const apeChain = defineChain({
  id: CONFIG.APECHAIN_CHAIN_ID,
  name: 'ApeChain',
  nativeCurrency: { name: 'APE', symbol: 'APE', decimals: 18 },
  rpcUrls: {
    default: { http: [CONFIG.APECHAIN_RPC_URL] },
    public: { http: [CONFIG.APECHAIN_RPC_URL] },
  },
});
