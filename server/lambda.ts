import express from "express";
import serverless from "serverless-http";
import type { APIGatewayProxyHandler, APIGatewayProxyEvent, Context } from "aws-lambda";
import { registerRoutes } from "./routes";
import { enforceEnvironmentValidation } from "./env-validation";

// Enforce environment validation before starting application
enforceEnvironmentValidation();

// Create Express app for Lambda
const app = express();

// Trust proxy for Lambda Function URL / CloudFront
app.set('trust proxy', true);

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Global CORS middleware for proper preflight handling
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

// Request logging middleware (without response body to prevent PII leakage)
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      console.log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

// One-time initialization for Lambda cold starts
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

async function initializeAppOnce() {
  if (isInitialized) {
    return;
  }
  
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      // Register routes but exclude WebSocket functionality
      const httpServer = await registerRoutes(app, { excludeWebSocket: true });

      // Error handling middleware
      app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        const status = err.status || err.statusCode || 500;
        const message = err.message || "Internal Server Error";

        res.status(status).json({ message });
        console.error(err);
      });

      // Health check endpoint
      app.get("/health", (req, res) => {
        res.json({ 
          status: "healthy", 
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV || "development"
        });
      });

      isInitialized = true;
      console.log("Lambda app initialized successfully");
    } catch (error) {
      console.error("Failed to initialize Lambda app:", error);
      initializationPromise = null; // Allow retry on next invocation
      throw error;
    }
  })();

  return initializationPromise;
}

// Create serverless handler
const serverlessHandler = serverless(app, {
  binary: ['image/*', 'application/pdf', 'application/octet-stream'],
  request(request: any, event: APIGatewayProxyEvent, context: Context) {
    // Add AWS Lambda context to request
    request.awsEvent = event;
    request.awsContext = context;
  },
  response(response: any, event: APIGatewayProxyEvent, context: Context) {
    // Set cache control headers for API responses
    response.headers = response.headers || {};
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    response.headers['Pragma'] = 'no-cache';
    response.headers['Expires'] = '0';
  }
}) as unknown as APIGatewayProxyHandler;

// Export wrapper handler that ensures initialization before processing requests
export const handler: APIGatewayProxyHandler = async (event, context, callback) => {
  await initializeAppOnce();
  return (serverlessHandler as any)(event, context, callback);
};