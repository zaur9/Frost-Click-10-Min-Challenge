import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useState } from 'react';
import { useAccount } from 'wagmi';
import {
  canSkipNicknameBeforeConnect,
  queueNicknameBeforeConnect,
  validateNicknameInput,
} from '../wallet/walletWrites';

type Props = {
  started: boolean;
};

export function StartScreen({ started }: Props) {
  const { openConnectModal } = useConnectModal();
  const { isConnected } = useAccount();
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [nickname, setNickname] = useState('');
  const [nicknameError, setNicknameError] = useState('');

  const onConnectClick = () => {
    if (isConnected) return;
    if (!canSkipNicknameBeforeConnect()) {
      setShowNicknameModal(true);
      return;
    }
    openConnectModal?.();
  };

  const onNicknameConfirm = () => {
    const error = validateNicknameInput(nickname);
    if (error) {
      setNicknameError(error);
      return;
    }
    if (!queueNicknameBeforeConnect(nickname)) {
      setNicknameError('Nickname is invalid');
      return;
    }
    setNickname('');
    setNicknameError('');
    setShowNicknameModal(false);
    openConnectModal?.();
  };

  const onNicknameCancel = () => {
    setNickname('');
    setNicknameError('');
    setShowNicknameModal(false);
  };

  return (
    <div id="start-screen" style={{ display: started ? 'none' : 'flex' }}>
      <div id="start-header-actions" className="start-header-actions-rk">
        <button type="button" id="start-show-leaderboard">
          Leaderboard
        </button>
        <button type="button" onClick={onConnectClick}>
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
      {showNicknameModal && (
        <div className="nickname-modal-backdrop" role="presentation" onClick={onNicknameCancel}>
          <div
            className="nickname-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Set nickname"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Choose your nickname</h3>
            <input
              type="text"
              value={nickname}
              maxLength={16}
              autoFocus
              placeholder="3-16 characters"
              onChange={(e) => {
                setNickname(e.target.value);
                if (nicknameError) setNicknameError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onNicknameConfirm();
                if (e.key === 'Escape') onNicknameCancel();
              }}
            />
            {nicknameError && <div className="nickname-modal-error">{nicknameError}</div>}
            <div className="nickname-modal-actions">
              <button type="button" onClick={onNicknameCancel}>
                Cancel
              </button>
              <button type="button" onClick={onNicknameConfirm}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
