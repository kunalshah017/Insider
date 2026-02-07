/**
 * WalletConnect component
 * 
 * Displays wallet/session status in the popup.
 * Wallet connection happens via the injected UI on Twitter.
 */

import React from "react";
import { useWalletContext } from "../providers/WalletContext";

export function WalletConnect() {
    const { session, isLoading, clearSession } = useWalletContext();

    // Truncate address for display
    const truncatedAddress = session?.walletAddress
        ? `${session.walletAddress.slice(0, 6)}...${session.walletAddress.slice(-4)}`
        : "";

    const truncatedSafeAddress = session?.safeAddress
        ? `${session.safeAddress.slice(0, 6)}...${session.safeAddress.slice(-4)}`
        : "";

    // Loading state
    if (isLoading) {
        return (
            <div className="wallet-connect">
                <div className="wallet-status">
                    <span className="status-dot" style={{ background: '#71767b' }} />
                    <span>Loading...</span>
                </div>
            </div>
        );
    }

    // No session - guide user to Twitter
    if (!session) {
        return (
            <div className="wallet-connect">
                <div className="wallet-status">
                    <span className="status-dot disconnected" />
                    <span>Not connected</span>
                </div>

                <div style={{
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '8px',
                    padding: '12px',
                    marginTop: '12px',
                }}>
                    <p style={{
                        fontSize: '12px',
                        color: '#e7e9ea',
                        margin: 0,
                        lineHeight: 1.5,
                    }}>
                        🐦 To start trading, go to <strong>Twitter/X</strong> and find a tweet
                        with a Polymarket link. Click <strong>YES</strong> or <strong>NO</strong> on
                        the trading card to connect your wallet.
                    </p>
                </div>

                <p className="wallet-hint" style={{ marginTop: '12px', fontSize: '11px', color: '#71767b' }}>
                    Your wallet will connect directly through MetaMask on Twitter.
                </p>
            </div>
        );
    }

    // Session active - show status
    return (
        <div className="wallet-connect">
            <div className="wallet-status">
                <span className="status-dot ready" />
                <span>Ready to trade</span>
            </div>

            <div className="wallet-info" style={{ marginTop: '12px' }}>
                <div className="info-row" style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '6px',
                }}>
                    <span className="label" style={{ fontSize: '11px', color: '#71767b' }}>Wallet:</span>
                    <span className="value" style={{ fontSize: '11px', color: '#e7e9ea', fontFamily: 'monospace' }}>
                        {truncatedAddress}
                    </span>
                </div>
                <div className="info-row" style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                }}>
                    <span className="label" style={{ fontSize: '11px', color: '#71767b' }}>Safe:</span>
                    <span className="value" style={{ fontSize: '11px', color: '#e7e9ea', fontFamily: 'monospace' }}>
                        {truncatedSafeAddress}
                    </span>
                </div>
            </div>

            <p className="wallet-hint" style={{
                marginTop: '12px',
                fontSize: '11px',
                color: '#22c55e',
            }}>
                ✓ You can trade directly from Polymarket links on Twitter!
            </p>

            <button
                className="disconnect-button"
                onClick={clearSession}
                style={{
                    marginTop: '12px',
                    width: '100%',
                    padding: '8px',
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: '#71767b',
                    fontSize: '12px',
                    cursor: 'pointer',
                }}
            >
                Disconnect
            </button>
        </div>
    );
}
