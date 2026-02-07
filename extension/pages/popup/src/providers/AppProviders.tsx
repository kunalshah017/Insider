/**
 * App Providers wrapper
 * 
 * Provides WalletProvider for trading session state.
 * Note: Wallet connection happens in content-ui (on Twitter),
 * popup just reads the session from storage.
 */

import React, { type ReactNode } from "react";
import { WalletProvider } from "./WalletContext";

interface AppProvidersProps {
    children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
    return (
        <WalletProvider>
            {children}
        </WalletProvider>
    );
}
