import '@rainbow-me/rainbowkit/styles.css';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useEffect, useRef, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { switchChain } from 'wagmi/actions';
import { CONFIG } from '../config';
import { wagmiConfig } from '../lib/wagmiConfig';
import { AppProviders } from '../providers/AppProviders';
import { WalletEffects } from './WalletEffects';
import {
  clearPendingNicknameBeforeConnect,
  hasKnownNicknameForNetwork,
  type PreferredNetworkKey,
  queueNicknameBeforeConnect,
  setPreferredNetworkBeforeConnect,
  validateNicknameInput,
} from './walletWrites';

type WalletRuntimeProps = {
  openRequestId: number;
};

type WalletFlowProps = {
  openRequestId: number;
};

function WalletFlow({ openRequestId }: WalletFlowProps) {
  const { openConnectModal } = useConnectModal();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [nickname, setNickname] = useState('');
  const [nicknameError, setNicknameError] = useState('');
  const [selectedNetwork, setSelectedNetwork] = useState<PreferredNetworkKey>('somnia');
  const [needsNickname, setNeedsNickname] = useState(false);
  const lastOpenRequestIdRef = useRef(0);

  useEffect(() => {
    if (!openRequestId || openRequestId === lastOpenRequestIdRef.current) return;
    lastOpenRequestIdRef.current = openRequestId;

    setShowNicknameModal(true);
    setNicknameError('');
    if (isConnected) {
      if (chainId === CONFIG.APECHAIN_CHAIN_ID) setSelectedNetwork('ape');
      else if (chainId === CONFIG.SOMNIA_CHAIN_ID) setSelectedNetwork('somnia');
    }
  }, [openRequestId, isConnected, chainId]);

  useEffect(() => {
    if (!showNicknameModal) return;

    const networkForKnown: PreferredNetworkKey = isConnected
      ? chainId === CONFIG.APECHAIN_CHAIN_ID
        ? 'ape'
        : 'somnia'
      : selectedNetwork;

    const knownForSelected = hasKnownNicknameForNetwork(networkForKnown);
    const requireNickname = !isConnected && !knownForSelected;

    if (!requireNickname) {
      clearPendingNicknameBeforeConnect();
    }

    setNeedsNickname(requireNickname);
    setNicknameError('');
  }, [showNicknameModal, isConnected, chainId, selectedNetwork]);

  const onNicknameConfirm = async () => {
    const knownForSelected = hasKnownNicknameForNetwork(selectedNetwork);
    const requireNickname = !knownForSelected;

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

    if (!isConnected) {
      openConnectModal?.();
      return;
    }

    const targetChainId =
      selectedNetwork === 'ape' ? CONFIG.APECHAIN_CHAIN_ID : CONFIG.SOMNIA_CHAIN_ID;

    if (chainId !== targetChainId) {
      try {
        await switchChain(wagmiConfig, { chainId: targetChainId });
      } catch {
        // User may reject switch in wallet.
      }
    }
  };

  const onNicknameCancel = () => {
    setNickname('');
    setNicknameError('');
    setShowNicknameModal(false);
  };

  if (!showNicknameModal) return <WalletEffects />;

  return (
    <>
      <WalletEffects />
      <div className="nickname-modal-backdrop" role="presentation" onClick={onNicknameCancel}>
        <div
          className="nickname-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Set nickname"
          onClick={(event) => event.stopPropagation()}
        >
          <h3>{needsNickname ? 'Choose nickname and network' : 'Choose network'}</h3>
          {needsNickname ? (
            <>
              <input
                type="text"
                value={nickname}
                maxLength={16}
                autoFocus
                placeholder="3-16 characters"
                onChange={(event) => {
                  setNickname(event.target.value);
                  if (nicknameError) setNicknameError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void onNicknameConfirm();
                  if (event.key === 'Escape') onNicknameCancel();
                }}
              />
              {nicknameError ? <div className="nickname-modal-error">{nicknameError}</div> : null}
            </>
          ) : null}
          <div className="network-select">
            <button
              type="button"
              className={selectedNetwork === 'somnia' ? 'active' : ''}
              onClick={() => {
                setSelectedNetwork('somnia');
                setNeedsNickname(!hasKnownNicknameForNetwork('somnia'));
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
                setNeedsNickname(!hasKnownNicknameForNetwork('ape'));
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
            <button type="button" onClick={() => void onNicknameConfirm()}>
              Continue
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function WalletRuntime({ openRequestId }: WalletRuntimeProps) {
  return (
    <AppProviders>
      <WalletFlow openRequestId={openRequestId} />
    </AppProviders>
  );
}
