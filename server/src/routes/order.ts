import { Router, Request, Response } from "express";
import { signBuilderHeaders } from "../lib/builder-signer.js";

export const orderRouter = Router();

const CLOB_API_URL = process.env.CLOB_API_URL || "https://clob.polymarket.com";

interface OrderRequest {
  order: {
    tokenID: string;
    price: string;
    size: string;
    side: "BUY" | "SELL";
    feeRateBps: string;
    nonce: string;
    expiration: string;
    taker: string;
    maker: string;
    signatureType: number;
    signature: string;
  };
}

/**
 * POST /api/order
 * Proxies order to Polymarket CLOB with Builder headers
 */
orderRouter.post("/", async (req: Request, res: Response) => {
  try {
    const orderData: OrderRequest = req.body;

    if (!orderData.order) {
      res.status(400).json({ error: "Missing order data" });
      return;
    }

    // Generate Builder authentication headers
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = "POST";
    const path = "/order";
    const body = JSON.stringify(orderData);

    const builderHeaders = signBuilderHeaders({
      timestamp,
      method,
      path,
      body,
    });

    // Forward request to Polymarket CLOB
    const response = await fetch(`${CLOB_API_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...builderHeaders,
      },
      body,
    });

    const data = await response.json();

    if (!response.ok) {
      res.status(response.status).json(data);
      return;
    }

    res.json(data);
  } catch (error) {
    console.error("Order proxy error:", error);
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
