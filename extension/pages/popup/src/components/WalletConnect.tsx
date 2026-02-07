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
                    <span className="status-dot" />
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

                <div className="wallet-guide-card">
                    <p>
                        <span className="emoji">🐦</span>
                        To start trading, go to <strong>Twitter/X</strong> and find a tweet
                        with a Polymarket link. Click <strong>YES</strong> or <strong>NO</strong> on
                        the trading card to connect your wallet.
                    </p>
                </div>

                <p className="wallet-hint">
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

            <div className="wallet-info">
                <div className="info-row">
                    <span className="label">Wallet</span>
                    <span className="value">{truncatedAddress}</span>
                </div>
                <div className="info-row">
                    <span className="label">Safe</span>
                    <span className="value">{truncatedSafeAddress}</span>
                </div>
            </div>

            <p className="wallet-hint success">
                ✓ You can trade directly from Polymarket links on Twitter!
            </p>

            <button className="disconnect-button" onClick={clearSession}>
                Disconnect
            </button>
        </div>
    );
}
