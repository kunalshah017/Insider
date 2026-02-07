import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { orderRouter } from "./routes/order.js";
import { geoblockRouter } from "./routes/geoblock.js";
import { healthRouter } from "./routes/health.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [];
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);

      // Allow chrome-extension:// origins
      if (origin.startsWith("chrome-extension://")) {
        return callback(null, true);
      }

      // Check against allowed origins
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

// Body parsing
app.use(express.json());

// Routes
app.use("/api/health", healthRouter);
app.use("/api/order", orderRouter);
app.use("/api/geoblock", geoblockRouter);

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
