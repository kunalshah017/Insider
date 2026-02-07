import { Router, Request, Response } from "express";
import {
  BuilderApiKeyCreds,
  buildHmacSignature,
} from "@polymarket/builder-signing-sdk";

const router = Router();

/**
 * Builder API credentials from environment
 */
const BUILDER_CREDENTIALS: BuilderApiKeyCreds = {
  key: process.env.POLY_BUILDER_API_KEY || "",
  secret: process.env.POLY_BUILDER_SECRET || "",
  passphrase: process.env.POLY_BUILDER_PASSPHRASE || "",
};

interface SignRequest {
  method: string;
  path: string;
  body?: string;
}

/**
 * POST /api/sign
 *
 * Remote signing endpoint for Builder authentication.
 * Receives request details and returns HMAC signature headers.
 *
 * Used by:
 * - RelayClient for gasless transactions (Safe deployment, approvals, CTF ops)
 * - ClobClient for order attribution
 *
 * Request body:
 * {
 *   method: "POST" | "GET" | etc,
 *   path: "/order" | "/submit" | etc,
 *   body?: string (JSON stringified request body)
 * }
 *
 * Response:
 * {
 *   POLY_BUILDER_SIGNATURE: string,
 *   POLY_BUILDER_TIMESTAMP: string,
 *   POLY_BUILDER_API_KEY: string,
 *   POLY_BUILDER_PASSPHRASE: string
 * }
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { method, path, body: requestBody } = req.body as SignRequest;

    // Validate credentials are configured
    if (
      !BUILDER_CREDENTIALS.key ||
      !BUILDER_CREDENTIALS.secret ||
      !BUILDER_CREDENTIALS.passphrase
    ) {
      console.error("[Sign] Builder credentials not configured");
      return res.status(500).json({
        error: "Builder credentials not configured",
      });
    }

    // Validate required parameters
    if (!method || !path) {
      return res.status(400).json({
        error: "Missing required parameters: method, path",
      });
    }

    // Generate timestamp
    const timestamp = Math.floor(Date.now() / 1000);

    // Generate HMAC signature using Polymarket SDK
    const signature = buildHmacSignature(
      BUILDER_CREDENTIALS.secret,
      timestamp,
      method.toUpperCase(),
      path,
      requestBody,
    );

    console.log(`[Sign] Generated signature for ${method} ${path}`);

    // Return headers in the format expected by BuilderConfig remote signing
    return res.json({
      POLY_BUILDER_SIGNATURE: signature,
      POLY_BUILDER_TIMESTAMP: timestamp.toString(),
      POLY_BUILDER_API_KEY: BUILDER_CREDENTIALS.key,
      POLY_BUILDER_PASSPHRASE: BUILDER_CREDENTIALS.passphrase,
    });
  } catch (error) {
    console.error("[Sign] Error:", error);
    return res.status(500).json({
      error: "Failed to sign request",
    });
  }
});

export const signRouter = router;
