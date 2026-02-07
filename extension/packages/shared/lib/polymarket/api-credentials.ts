/**
 * API credentials derivation for Polymarket CLOB
 *
 * This derives L2 credentials by having the user sign an EIP-712 message.
 * These credentials are user-specific and used to authenticate with the CLOB API.
 */

import { CLOB_API_URL, POLYGON_CHAIN_ID } from './constants.js';
import type { UserApiCredentials } from './session-types.js';

// EIP-712 Domain for L2 credentials derivation
const L2_DOMAIN = {
  name: 'ClobAuthDomain',
  version: '1',
  chainId: POLYGON_CHAIN_ID,
} as const;

// EIP-712 Types for key derivation
const L2_TYPES = {
  ClobAuth: [
    { name: 'address', type: 'address' },
    { name: 'timestamp', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'message', type: 'string' },
  ],
} as const;

interface SignTypedDataFn {
  (params: {
    domain: typeof L2_DOMAIN;
    types: typeof L2_TYPES;
    primaryType: 'ClobAuth';
    message: {
      address: string;
      timestamp: string;
      nonce: bigint;
      message: string;
    };
  }): Promise<string>;
}

/**
 * Derive L2 API credentials by having the user sign an EIP-712 message
 *
 * @param signTypedData - Function to sign typed data (from wagmi/viem)
 * @param address - The user's EOA address (owner of Safe)
 * @returns The derived API credentials
 */
export async function deriveApiCredentials(
  signTypedData: SignTypedDataFn,
  address: string,
): Promise<UserApiCredentials> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = BigInt(0);
  const message = 'This signature will be used to derive API keys for Polymarket CLOB trading.';

  // Have user sign the message
  const signature = await signTypedData({
    domain: L2_DOMAIN,
    types: L2_TYPES,
    primaryType: 'ClobAuth',
    message: {
      address,
      timestamp,
      nonce,
      message,
    },
  });

  // Call the CLOB API to derive credentials from the signature
  const response = await fetch(`${CLOB_API_URL}/auth/derive-api-key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      address,
      signature,
      timestamp,
      nonce: '0',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to derive API credentials: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  return {
    key: data.apiKey,
    secret: data.secret,
    passphrase: data.passphrase,
  };
}

/**
 * Check if we already have valid API credentials for an address
 */
export async function checkExistingCredentials(address: string): Promise<UserApiCredentials | null> {
  try {
    // The CLOB API allows checking if credentials exist
    const response = await fetch(`${CLOB_API_URL}/auth/api-keys?address=${address}`);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // If we have stored credentials, return them
    if (data.apiKeys && data.apiKeys.length > 0) {
      const key = data.apiKeys[0];
      return {
        key: key.apiKey,
        secret: key.secret,
        passphrase: key.passphrase,
      };
    }

    return null;
  } catch (error) {
    console.error('Error checking existing credentials:', error);
    return null;
  }
}
