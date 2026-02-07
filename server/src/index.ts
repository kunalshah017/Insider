import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { orderRouter } from "./routes/order.js";
import { geoblockRouter } from "./routes/geoblock.js";
import { healthRouter } from "./routes/health.js";
import { signRouter } from "./routes/sign.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());

// CORS configuration - temporarily allow all origins for development
app.use(
  cors({
    origin: true, // Allow all origins
    credentials: true,
  }),
);

// Body parsing - also preserve raw body for signature verification
app.use(
  express.json({
    verify: (req: express.Request, _res, buf) => {
      // Store raw body for routes that need it (like order submission)
      (req as any).rawBody = buf.toString();
    },
  }),
);

// Routes
app.use("/api/health", healthRouter);
app.use("/api/order", orderRouter);
app.use("/api/geoblock", geoblockRouter);
app.use("/api/sign", signRouter);

// Error handling middleware
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Error:", err.message);
    res.status(500).json({ error: err.message });
  },
);

app.listen(PORT, () => {
  console.log(`🚀 Insider server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || "development"}`);
});

export default app;
