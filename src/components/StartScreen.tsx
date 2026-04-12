type Props = {
  started: boolean;
};

export function StartScreen({ started }: Props) {
  return (
    <div id="start-screen" style={{ display: started ? 'none' : 'flex' }}>
      <div id="start-header-actions">
        <button type="button" id="start-set-nickname">
          Set Nickname
        </button>
        <button type="button" id="start-connect-wallet">
          Connect Wallet
        </button>
      </div>
      <h1>Mini Games</h1>
      <div id="games-grid">
        <div className="game-card active">
          <h3>❄️ Frost Click</h3>
          <p>Network battle mode</p>
          <button type="button" id="start-btn">
            Start Game
          </button>
          <div id="start-wallet-status">Wallet: not connected</div>
        </div>
        <div className="game-card soon">
          <h3>🎮 Coming Soon</h3>
          <p>Mini game #2</p>
        </div>
        <div className="game-card soon">
          <h3>🎮 Coming Soon</h3>
          <p>Mini game #3</p>
        </div>
      </div>
    </div>
  );
}
