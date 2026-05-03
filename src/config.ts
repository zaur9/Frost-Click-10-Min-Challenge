const env = import.meta.env;

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const CONFIG = {
  CONTRACT_ADDRESS: env.VITE_SOMNIA_CONTRACT_ADDRESS ?? '0xF2379e4c54599096b73D7b45F9e301e627c59fc4',
  APECHAIN_CONTRACT_ADDRESS:
    env.VITE_APECHAIN_CONTRACT_ADDRESS ?? '0x7605015bA2BE06cf4c688dE6199239b866dB0619',

  GAME_DURATION: numberFromEnv(env.VITE_GAME_DURATION_MS, 10 * 60 * 1000),

  SOMNIA_CHAIN_ID: numberFromEnv(env.VITE_SOMNIA_CHAIN_ID, 5031),
  APECHAIN_CHAIN_ID: numberFromEnv(env.VITE_APECHAIN_CHAIN_ID, 33139),

  SOMNIA_RPC_URL: env.VITE_SOMNIA_RPC_URL ?? 'https://api.infra.mainnet.somnia.network/',
  APECHAIN_RPC_URL: env.VITE_APECHAIN_RPC_URL ?? 'https://rpc.apechain.com/http',
} as const;
