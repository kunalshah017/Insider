import '@src/Popup.css';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { cn, ErrorDisplay, LoadingSpinner } from '@extension/ui';
import { OrderManagement } from './components';
import { useState, useRef, useEffect } from 'react';
import { useWalletContext } from './providers/WalletContext';

type TabType = 'holdings' | 'orders';

const Popup = () => {
  const [activeTab, setActiveTab] = useState<TabType>('holdings');
  const [showProfile, setShowProfile] = useState(false);
  const { session, isLoading, clearSession } = useWalletContext();
  const profileRef = useRef<HTMLDivElement>(null);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfile(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Truncate address for display
  const truncatedAddress = session?.walletAddress
    ? `${session.walletAddress.slice(0, 6)}...${session.walletAddress.slice(-4)}`
    : '';

  const truncatedSafeAddress = session?.safeAddress
    ? `${session.safeAddress.slice(0, 6)}...${session.safeAddress.slice(-4)}`
    : '';

  // Generate blockie-style gradient from address
  const getAddressGradient = (address: string) => {
    if (!address) return 'linear-gradient(135deg, #6366f1, #8b5cf6)';
    const hash = address.toLowerCase().slice(2, 10);
    const hue1 = parseInt(hash.slice(0, 4), 16) % 360;
    const hue2 = (hue1 + 40) % 360;
    return `linear-gradient(135deg, hsl(${hue1}, 70%, 50%), hsl(${hue2}, 70%, 40%))`;
  };

  return (
    <div className="popup-container">
      {/* Header with logo and profile */}
      <header className="popup-header">
        <div className="header-left">
          <img src="/logo_horizontal_dark.png" alt="Insider" className="header-logo" />
          <span className="header-tag">Beta</span>
        </div>

        <div ref={profileRef} style={{ position: 'relative' }}>
          {isLoading ? (
            <div className="loading-spinner-small" />
          ) : session ? (
            <>
              <button
                className={cn('profile-btn', showProfile && 'active')}
                onClick={() => setShowProfile(!showProfile)}
                style={{ background: getAddressGradient(session.walletAddress || '') }}
              />

              {showProfile && (
                <div className="profile-dropdown">
                  <div className="dropdown-label">EOA Wallet</div>
                  <div className="address-row">
                    <span>{truncatedAddress}</span>
                    <button
                      className="copy-btn"
                      onClick={() => navigator.clipboard.writeText(session.walletAddress || '')}
                      title="Copy"
                    >
                      📋
                    </button>
                  </div>

                  <div className="dropdown-label">Safe (Proxy)</div>
                  <div className="address-row">
                    <span>{truncatedSafeAddress}</span>
                    <button
                      className="copy-btn"
                      onClick={() => navigator.clipboard.writeText(session.safeAddress || '')}
                      title="Copy"
                    >
                      📋
                    </button>
                  </div>

                  <button className="disconnect-btn" onClick={clearSession}>
                    Disconnect Wallet
                  </button>
                </div>
              )}
            </>
          ) : (
            <button
              className="profile-btn"
              style={{ background: 'var(--bg-tertiary)', cursor: 'default' }}
            />
          )}
        </div>
      </header>

      {/* Main Tabs */}
      <nav className="main-tabs">
        <button
          className={cn('main-tab', activeTab === 'holdings' && 'active')}
          onClick={() => setActiveTab('holdings')}
        >
          Holdings
        </button>
        <button
          className={cn('main-tab', activeTab === 'orders' && 'active')}
          onClick={() => setActiveTab('orders')}
        >
          Orders
        </button>
      </nav>

      {/* Content */}
      <main className="main-content">
        {!session ? (
          <div className="not-connected-state">
            <div className="not-connected-icon">🔗</div>
            <h2>Connect Your Wallet</h2>
            <p>
              Go to Twitter/X and find a tweet with a Polymarket link.
              Click YES or NO on the trading card to connect.
            </p>
          </div>
        ) : (
          <OrderManagement activeTab={activeTab} />
        )}
      </main>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);
