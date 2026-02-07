import crypto from "crypto";

/**
 * Builder API credentials from environment
 */
const BUILDER_API_KEY = process.env.POLY_BUILDER_API_KEY || "";
const BUILDER_SECRET = process.env.POLY_BUILDER_SECRET || "";
const BUILDER_PASSPHRASE = process.env.POLY_BUILDER_PASSPHRASE || "";

interface SignParams {
  timestamp: string;
  method: string;
  path: string;
  body?: string;
}

/**
 * Generate HMAC-SHA256 signature for Builder API authentication
 *
 * Signature format: HMAC-SHA256(secret, timestamp + method + path + body)
 * The signature is base64 encoded
 */
function generateSignature(params: SignParams): string {
  const { timestamp, method, path, body = "" } = params;

  // Create the message to sign: timestamp + method + path + body
  const message = timestamp + method.toUpperCase() + path + body;

  // Create HMAC-SHA256 signature
  const hmac = crypto.createHmac("sha256", BUILDER_SECRET);
  hmac.update(message);

  // Return base64 encoded signature
  return hmac.digest("base64");
}

/**
 * Generate all required Builder API headers
 *
 * Headers required:
 * - POLY_BUILDER_API_KEY: Your Builder API key
 * - POLY_BUILDER_TIMESTAMP: Unix timestamp in seconds
 * - POLY_BUILDER_PASSPHRASE: Your Builder passphrase
 * - POLY_BUILDER_SIGNATURE: HMAC-SHA256 signature
 */
export function signBuilderHeaders(params: SignParams): Record<string, string> {
  if (!BUILDER_API_KEY || !BUILDER_SECRET || !BUILDER_PASSPHRASE) {
    throw new Error("Builder API credentials not configured");
  }

  const signature = generateSignature(params);

  return {
    "POLY-BUILDER-API-KEY": BUILDER_API_KEY,
    "POLY-BUILDER-TIMESTAMP": params.timestamp,
    "POLY-BUILDER-PASSPHRASE": BUILDER_PASSPHRASE,
    "POLY-BUILDER-SIGNATURE": signature,
  };
}

/**
 * Validate that all Builder credentials are configured
 */
export function validateBuilderCredentials(): boolean {
  return !!(BUILDER_API_KEY && BUILDER_SECRET && BUILDER_PASSPHRASE);
}
