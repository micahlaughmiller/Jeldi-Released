import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { enforceEnvironmentValidation } from "./env-validation";
import { initializeAllDemoData } from "./services/demo-data";
import { startSyncScheduler } from "./services/syncService";

// Enforce environment validation before starting application
enforceEnvironmentValidation();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Global CORS middleware for proper preflight handling (same as Lambda)
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://d2k9wjgsy12ugk.cloudfront.net',  // Original CloudFront domain
    'https://demo.jeldi.app',                 // Custom domain for main app
    'https://overlay.jeldi.app'               // Custom domain for AI overlay
  ];
  
  const origin = req.headers.origin;
  
  // Set Vary: Origin header for proper CloudFront caching
  res.setHeader('Vary', 'Origin');
  
  // Only set Access-Control-Allow-Origin if origin is explicitly allowed
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  // Set other CORS headers
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,Accept,Origin,X-Requested-With');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,DELETE,OPTIONS,PATCH');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  
  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  // Log method/path/status/duration only. Response bodies contain tokens and PII.
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Initialize demo data if in demo.jeldi.app environment
  await initializeAllDemoData();

  // Pull ERP data on a schedule (long-running server only; Lambda uses sync-lambda.ts)
  startSyncScheduler();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error(err);
    if (res.headersSent) {
      return;
    }
    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    // SO_REUSEPORT is not available on Windows sockets (listen ENOTSUP)
    ...(process.platform !== "win32" ? { reusePort: true } : {}),
  }, () => {
    log(`serving on port ${port}`);
  });
})();
