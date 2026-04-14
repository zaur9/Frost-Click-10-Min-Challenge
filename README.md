# Frost Mini Games

Мини-игра на React + Vite с интеграцией кошелька и отправкой результатов в смарт-контракты Somnia/ApeChain.

## Запуск

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Переменные окружения

Создайте `.env` в корне проекта при необходимости:

```env
VITE_WALLETCONNECT_PROJECT_ID=
VITE_SOMNIA_CONTRACT_ADDRESS=0x1B6fCe675a504078a2324E6e84e521C2588dcf6B
VITE_APECHAIN_CONTRACT_ADDRESS=0xd65b585aaE9cCd4547fF7C209949A271E969E8a5
VITE_SOMNIA_CHAIN_ID=5031
VITE_APECHAIN_CHAIN_ID=33139
VITE_SOMNIA_RPC_URL=https://api.infra.mainnet.somnia.network/
VITE_APECHAIN_RPC_URL=https://rpc.apechain.com/http
VITE_GAME_DURATION_MS=600000
```

Если переменные не заданы, используются встроенные значения по умолчанию.
