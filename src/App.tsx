import { Suspense, lazy, useEffect, useState } from 'react';
import { GameArena } from './components/GameArena';
import { StartScreen } from './components/StartScreen';
import { mountFrostGame } from './game/frostGame';

const WalletRuntime = lazy(() => import('./wallet/WalletRuntime'));

export default function App() {
  const [started, setStarted] = useState(false);
  const [walletEnabled, setWalletEnabled] = useState(false);
  const [walletOpenRequestId, setWalletOpenRequestId] = useState(0);

  useEffect(() => {
    document.body.classList.toggle('perf-mode', started);
    return () => document.body.classList.remove('perf-mode');
  }, [started]);

  useEffect(() => {
    const cleanup = mountFrostGame({
      onLeaveStartScreen: () => setStarted(true),
      onReturnToStartScreen: () => setStarted(false),
    });
    return cleanup;
  }, []);

  const onConnectRequest = () => {
    setWalletEnabled(true);
    setWalletOpenRequestId((value) => value + 1);
  };

  return (
    <>
      <GameArena />
      <audio id="bg-music" loop>
        <source src="/music.mp3" type="audio/mpeg" />
      </audio>
      <StartScreen started={started} onConnectRequest={onConnectRequest} />
      {walletEnabled ? (
        <Suspense fallback={null}>
          <WalletRuntime openRequestId={walletOpenRequestId} />
        </Suspense>
      ) : null}
    </>
  );
}
