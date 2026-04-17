import { useEffect, useState } from 'react';
import { GameArena } from './components/GameArena';
import { StartScreen } from './components/StartScreen';
import { mountFrostGame } from './game/frostGame';
import { WalletEffects } from './wallet/WalletEffects';

export default function App() {
  const [started, setStarted] = useState(false);

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

  return (
    <>
      <WalletEffects />
      <GameArena />
      <audio id="bg-music" loop>
        <source src="/music.mp3" type="audio/mpeg" />
      </audio>
      <StartScreen started={started} />
    </>
  );
}
