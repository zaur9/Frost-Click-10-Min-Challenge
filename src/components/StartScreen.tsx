type Props = {
  started: boolean;
  onConnectRequest: () => void;
};

export function StartScreen({ started, onConnectRequest }: Props) {
  return (
    <div id="start-screen" style={{ display: started ? 'none' : 'flex' }}>
      <div id="start-header-actions" className="start-header-actions-rk">
        <button type="button" id="start-connect-wallet" onClick={onConnectRequest}>
          Connect Wallet
        </button>
      </div>
      <h1>Mini Games</h1>
      <div id="games-grid">
        <div className="game-card active">
          <h3>вќ„пёЏ Frost Click</h3>
          <p>Network battle mode</p>
          <button type="button" id="start-btn">
            Start Game
          </button>
        </div>
        <div className="game-card soon">
          <h3>рџЋ® Coming Soon</h3>
          <p>Mini game #2</p>
        </div>
        <div className="game-card soon">
          <h3>рџЋ® Coming Soon</h3>
          <p>Mini game #3</p>
        </div>
      </div>
    </div>
  );
}
