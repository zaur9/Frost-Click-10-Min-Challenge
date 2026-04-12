export function GameArena() {
  return (
    <div id="game">
      <div id="playfield-bg" aria-hidden="true" />
      <div id="battle-layout" aria-hidden="true">
        <div id="ape-side" className="battle-side">
          <div className="ape-brand">
            <div className="ape-logo-wrap" aria-hidden="true">
              <img className="ape-logo-svg" src="/ape-logo.svg" alt="" />
            </div>
            <div className="ape-wordmark-box">
              <img className="ape-wordmark-svg" src="/ape-wordmark.svg" alt="" />
            </div>
          </div>
          <h2>TOP 10</h2>
          <div id="ape-total" className="team-total">
            Total: 0
          </div>
          <ol id="ape-top-list" className="side-top-list">
            <li>No data</li>
          </ol>
        </div>
        <div id="somnia-side" className="battle-side">
          <div className="somnia-brand">
            <img
              src="/Light.svg?v=2"
              alt=""
              className="somnia-brand-logo"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
          <h2>TOP 10</h2>
          <div id="somnia-total" className="team-total">
            Total: 0
          </div>
          <ol id="somnia-top-list" className="side-top-list">
            <li>No data</li>
          </ol>
        </div>
      </div>

      <div id="score">Score: 0</div>
      <button id="music-toggle-game" type="button" className="music-btn">
        Music: OFF
      </button>
      <div id="timer">10:00</div>

      <button id="pause-btn" type="button">
        Pause
      </button>

      <div id="pause-overlay">
        <span>PAUSED</span>
        <button id="resume-btn" type="button">
          Resume
        </button>
      </div>

      <div id="game-over">
        <h2 id="result-title">Game Over!</h2>
        <p id="final-score">Your score: 0</p>
        <p id="time-survived">Time: 0s</p>
        <div id="game-over-actions">
          <button id="restart" type="button">
            Play Again
          </button>
          <button id="gameover-submit-ape" type="button" style={{ display: 'none' }}>
            Submit to Ape
          </button>
          <button id="gameover-submit-somnia" type="button" style={{ display: 'none' }}>
            Submit to Somnia
          </button>
        </div>
      </div>
    </div>
  );
}
