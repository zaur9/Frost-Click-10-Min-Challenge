import { useEffect, useState } from 'react';
import { GameArena } from './components/GameArena';
import { StartScreen } from './components/StartScreen';
import { mountFrostGame } from './game/frostGame';
import { WalletEffects } from './wallet/WalletEffects';

export default function App() {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const MAX_SNOWFLAKES = 40;
    let cancelled = false;
    const activeSnowflakes = new Set<HTMLDivElement>();
    function createSnow() {
      if (cancelled) return;
      if (activeSnowflakes.size >= MAX_SNOWFLAKES) return;
      const snow = document.createElement('div');
      snow.classList.add('snowflake');
      snow.textContent = '•';
      snow.style.left = Math.random() * 100 + 'vw';
      snow.style.fontSize = 8 + Math.random() * 8 + 'px';
      snow.style.animationDuration = 6 + Math.random() * 8 + 's';
      document.body.appendChild(snow);
      activeSnowflakes.add(snow);
      setTimeout(() => {
        snow.remove();
        activeSnowflakes.delete(snow);
      }, 15000);
    }

    if (started) {
      for (const snow of activeSnowflakes) snow.remove();
      activeSnowflakes.clear();
      return () => {
        cancelled = true;
      };
    }

    const id = window.setInterval(createSnow, 420);
    return () => {
      cancelled = true;
      clearInterval(id);
      for (const snow of activeSnowflakes) snow.remove();
      activeSnowflakes.clear();
    };
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
