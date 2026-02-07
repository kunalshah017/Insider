/**
 * Wagmi configuration for Polymarket trading
 *
 * Sets up wagmi with:
 * - Polygon chain
 * - Injected connector (MetaMask, etc.)
 */

import { http, createConfig } from 'wagmi';
import { polygon } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const wagmiConfig = createConfig({
  chains: [polygon],
  connectors: [
    injected({
      shimDisconnect: true,
      // Target MetaMask specifically if available
      target: () => ({
        id: 'metaMask',
        name: 'MetaMask',
        provider: typeof window !== 'undefined' ? (window as any).ethereum : undefined,
      }),
    }),
  ],
  transports: {
    [polygon.id]: http('https://polygon-rpc.com'),
  },
});

// Re-export wagmi types
export type WagmiConfig = typeof wagmiConfig;
