/**
 * Wallet Context for Popup
 * 
 * Simple context that reads trading session from chrome.storage.
 * Wallet connection is handled by the content-ui (injected on Twitter).
 */

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { TradingSession } from "@extension/shared/lib/polymarket/session-types";

const SESSION_STORAGE_KEY = 'insider_trading_session';

interface WalletContextValue {
    // Session state
    session: TradingSession | null;
    isLoading: boolean;

    // Actions
    refreshSession: () => Promise<void>;
    clearSession: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

interface WalletProviderProps {
    children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
    const [session, setSession] = useState<TradingSession | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Load session from storage
    const refreshSession = useCallback(async () => {
        try {
            const stored = await chrome.storage.local.get(SESSION_STORAGE_KEY);
            if (stored[SESSION_STORAGE_KEY]) {
                setSession(stored[SESSION_STORAGE_KEY] as TradingSession);
            } else {
                setSession(null);
            }
        } catch (err) {
            console.error('[Insider] Failed to load session:', err);
            setSession(null);
        }
    }, []);

    // Clear session
    const clearSession = useCallback(async () => {
        try {
            await chrome.storage.local.remove(SESSION_STORAGE_KEY);
            await chrome.runtime.sendMessage({ type: 'CLEAR_TRADING_SESSION' });
            setSession(null);
        } catch (err) {
            console.error('[Insider] Failed to clear session:', err);
        }
    }, []);

    // Load session on mount
    useEffect(() => {
        const init = async () => {
            setIsLoading(true);
            await refreshSession();
            setIsLoading(false);
        };
        init();
    }, [refreshSession]);

    // Listen for storage changes
    useEffect(() => {
        const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
            if (changes[SESSION_STORAGE_KEY]) {
                setSession(changes[SESSION_STORAGE_KEY].newValue || null);
            }
        };

        chrome.storage.local.onChanged.addListener(handleStorageChange);
        return () => {
            chrome.storage.local.onChanged.removeListener(handleStorageChange);
        };
    }, []);

    const value: WalletContextValue = {
        session,
        isLoading,
        refreshSession,
        clearSession,
    };

    return (
        <WalletContext.Provider value={value}>
            {children}
        </WalletContext.Provider>
    );
}

export function useWalletContext() {
    const context = useContext(WalletContext);
    if (!context) {
        throw new Error("useWalletContext must be used within a WalletProvider");
    }
    return context;
}
