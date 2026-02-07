import { Router, Request, Response } from "express";

export const geoblockRouter = Router();

const POLYMARKET_GEOBLOCK_URL = "https://polymarket.com/api/geoblock";

/**
 * GET /api/geoblock
 * Check if user's location is blocked from trading
 * Forwards the client's IP to Polymarket's geoblock API
 */
geoblockRouter.get("/", async (req: Request, res: Response) => {
  try {
    // Get client IP from various headers (for proxied requests)
    const clientIp =
      req.headers["x-forwarded-for"] ||
      req.headers["x-real-ip"] ||
      req.socket.remoteAddress ||
      "";

    const response = await fetch(POLYMARKET_GEOBLOCK_URL, {
      method: "GET",
      headers: {
        "X-Forwarded-For": Array.isArray(clientIp) ? clientIp[0] : clientIp,
      },
    });

    const data = await response.json();

    res.json(data);
  } catch (error) {
    console.error("Geoblock check error:", error);
    // Default to blocked on error for safety
    res.status(500).json({
      blocked: true,
      error: "Failed to check geoblock status",
    });
  }
});
