import { useEffect, useState } from 'react';
import { GameArena } from './components/GameArena';
import { StartScreen } from './components/StartScreen';
import { mountFrostGame } from './game/frostGame';
import { initWalletLayer } from './wallet/web3Wallet';

export default function App() {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    initWalletLayer();
  }, []);

  useEffect(() => {
    let cancelled = false;
    function createSnow() {
      if (cancelled) return;
      const snow = document.createElement('div');
      snow.classList.add('snowflake');
      snow.textContent = '•';
      snow.style.left = Math.random() * 100 + 'vw';
      snow.style.fontSize = 8 + Math.random() * 8 + 'px';
      snow.style.animationDuration = 6 + Math.random() * 8 + 's';
      document.body.appendChild(snow);
      setTimeout(() => snow.remove(), 15000);
    }
    const id = window.setInterval(createSnow, 220);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const cleanup = mountFrostGame({
      onLeaveStartScreen: () => setStarted(true),
    });
    return cleanup;
  }, []);

  return (
    <>
      <GameArena />
      <audio id="bg-music" loop>
        <source src="/music.mp3" type="audio/mpeg" />
      </audio>
      <StartScreen started={started} />
    </>
  );
}
