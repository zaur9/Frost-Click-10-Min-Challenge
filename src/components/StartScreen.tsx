import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useState } from 'react';
import { useAccount } from 'wagmi';
import {
  canSkipNicknameBeforeConnect,
  clearPendingNicknameBeforeConnect,
  hasKnownNicknameForNetwork,
  type PreferredNetworkKey,
  queueNicknameBeforeConnect,
  setPreferredNetworkBeforeConnect,
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
  const [selectedNetwork, setSelectedNetwork] = useState<PreferredNetworkKey>('somnia');
  const [needsNickname, setNeedsNickname] = useState(false);

  const onConnectClick = () => {
    if (isConnected) return;
    // Migration fallback: users who set nickname before per-network flags existed.
    const knownForSelected = hasKnownNicknameForNetwork(selectedNetwork);
    const knownLegacy = canSkipNicknameBeforeConnect();
    const requireNickname = !knownForSelected && !knownLegacy;
    if (!requireNickname) {
      clearPendingNicknameBeforeConnect();
    }
    setNeedsNickname(requireNickname);
    setNicknameError('');
    setShowNicknameModal(true);
  };

  const onNicknameConfirm = () => {
    const knownForSelected = hasKnownNicknameForNetwork(selectedNetwork);
    const knownLegacy = canSkipNicknameBeforeConnect();
    const requireNickname = !knownForSelected && !knownLegacy;
    if (requireNickname) {
      const error = validateNicknameInput(nickname);
      if (error) {
        setNicknameError(error);
        return;
      }
      if (!queueNicknameBeforeConnect(nickname)) {
        setNicknameError('Nickname is invalid');
        return;
      }
    } else {
      clearPendingNicknameBeforeConnect();
    }
    setPreferredNetworkBeforeConnect(selectedNetwork);
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
        <button type="button" id="start-connect-wallet" onClick={onConnectClick}>
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
            <h3>{needsNickname ? 'Choose nickname and network' : 'Choose network'}</h3>
            {needsNickname && (
              <>
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
              </>
            )}
            <div className="network-select">
              <button
                type="button"
                className={selectedNetwork === 'somnia' ? 'active' : ''}
                onClick={() => {
                  setSelectedNetwork('somnia');
                  setNeedsNickname(
                    !hasKnownNicknameForNetwork('somnia') && !canSkipNicknameBeforeConnect()
                  );
                  setNicknameError('');
                }}
              >
                Somnia
              </button>
              <button
                type="button"
                className={selectedNetwork === 'ape' ? 'active' : ''}
                onClick={() => {
                  setSelectedNetwork('ape');
                  setNeedsNickname(
                    !hasKnownNicknameForNetwork('ape') && !canSkipNicknameBeforeConnect()
                  );
                  setNicknameError('');
                }}
              >
                ApeChain
              </button>
            </div>
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
