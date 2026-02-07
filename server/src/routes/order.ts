import { Router, Request, Response } from "express";
import { signBuilderHeaders } from "../lib/builder-signer.js";

export const orderRouter = Router();

const CLOB_API_URL = process.env.CLOB_API_URL || "https://clob.polymarket.com";

interface SignedOrderPayload {
  order: {
    salt: string | number; // Can be string or number
    maker: string;
    signer: string;
    taker: string;
    tokenId: string;
    makerAmount: string;
    takerAmount: string;
    expiration: string;
    nonce: string;
    feeRateBps: string;
    side: number; // 0 = BUY, 1 = SELL
    signatureType: number;
    signature: string;
  };
  owner: string; // API key of order owner
  orderType: "GTC" | "GTD" | "FOK";
}

/**
 * POST /api/order
 * Accepts signed orders from the extension, adds Builder headers, and forwards to Polymarket CLOB
 *
 * The extension sends L2 auth headers (POLY_*) which we forward along with Builder headers
 */
orderRouter.post("/", async (req: Request, res: Response) => {
  try {
    const orderData: SignedOrderPayload = req.body;

    if (!orderData.order) {
      res.status(400).json({ error: "Missing order data" });
      return;
    }

    console.log("[Order] Received order submission request");
    console.log("[Order] Token ID:", orderData.order.tokenId);
    console.log("[Order] Side:", orderData.order.side);
    console.log("[Order] Maker:", orderData.order.maker);
    console.log(
      "[Order] Full order payload:",
      JSON.stringify(orderData, null, 2),
    );

    // Extract L2 headers from request (forwarded from extension)
    // HTTP headers are case-insensitive, Express lowercases them
    const l2Headers: Record<string, string> = {};
    const headerMappings: Record<string, string> = {
      poly_address: "POLY_ADDRESS",
      poly_signature: "POLY_SIGNATURE",
      poly_timestamp: "POLY_TIMESTAMP",
      poly_api_key: "POLY_API_KEY",
      poly_passphrase: "POLY_PASSPHRASE",
    };

    for (const [lowercaseHeader, uppercaseHeader] of Object.entries(
      headerMappings,
    )) {
      const value = req.headers[lowercaseHeader];
      if (value && typeof value === "string") {
        l2Headers[uppercaseHeader] = value;
      }
    }

    // Check if we have L2 headers
    const hasL2Auth = Object.keys(l2Headers).length >= 5;
    if (!hasL2Auth) {
      console.log("[Order] Warning: Missing L2 authentication headers");
      console.log("[Order] Found headers:", Object.keys(l2Headers));
    } else {
      console.log("[Order] L2 auth headers present");
    }

    // Generate Builder authentication headers
    // Use the raw body that was sent (preserved by express middleware)
    // This ensures the body matches what was signed by the L2 headers
    const rawBody = (req as any).rawBody || JSON.stringify(orderData);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = "POST";
    const path = "/order";

    const builderHeaders = signBuilderHeaders({
      timestamp,
      method,
      path,
      body: rawBody,
    });

    console.log("[Order] Builder headers generated");

    // Combine all headers
    const allHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...l2Headers,
      ...builderHeaders,
    };

    // Debug: log headers being sent (mask sensitive values)
    console.log("[Order] Headers being sent to CLOB:");
    for (const [key, value] of Object.entries(allHeaders)) {
      if (
        key.includes("SIGNATURE") ||
        key.includes("SECRET") ||
        key.includes("PASSPHRASE")
      ) {
        console.log(`  ${key}: ${value.substring(0, 10)}...`);
      } else if (key.includes("API_KEY") || key.includes("API-KEY")) {
        console.log(`  ${key}: ${value.substring(0, 15)}...`);
      } else {
        console.log(`  ${key}: ${value}`);
      }
    }

    // Forward request to Polymarket CLOB
    // Use the raw body to preserve exact JSON serialization
    console.log("[Order] Forwarding to Polymarket CLOB...");
    const response = await fetch(`${CLOB_API_URL}${path}`, {
      method: "POST",
      headers: allHeaders,
      body: rawBody,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[Order] CLOB API error:", response.status, data);
      res.status(response.status).json(data);
      return;
    }

    console.log("[Order] Order submitted successfully:", data);
    res.json(data);
  } catch (error) {
    console.error("[Order] Proxy error:", error);
    res.status(500).json({ error: "Failed to submit order" });
  }
});

/**
 * GET /api/order/:orderId
 * Get order status with Builder headers
 */
orderRouter.get("/:orderId", async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = "GET";
    const path = `/order/${orderId}`;

    const builderHeaders = signBuilderHeaders({
      timestamp,
      method,
      path,
    });

    const response = await fetch(`${CLOB_API_URL}${path}`, {
      method: "GET",
      headers: {
        ...builderHeaders,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      res.status(response.status).json(data);
      return;
    }

    res.json(data);
  } catch (error) {
    console.error("Order status error:", error);
    res.status(500).json({ error: "Failed to get order status" });
  }
});
