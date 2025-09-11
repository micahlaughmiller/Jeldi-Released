# Lambda Deployment Notes

## WebSocket Functionality Limitations

### Current Situation
The Express backend includes WebSocket functionality for real-time updates, including:
- ERP status updates via WebSocket
- Real-time KPI updates (sent every 30 seconds)
- Authentication token validation over WebSocket

### Lambda Limitations
AWS Lambda does not support persistent WebSocket connections due to its stateless, event-driven nature. The WebSocket server code in `server/routes.ts` has been conditionally excluded when running in Lambda mode.

### Solutions Implemented
1. **Conditional WebSocket Exclusion**: The `registerRoutes` function now accepts an `excludeWebSocket` option that skips WebSocket setup when running in Lambda.
2. **Lambda Handler**: Created `server/lambda.ts` that wraps the Express app with `serverless-http` and excludes WebSocket functionality.

### Alternative Approaches for Real-time Features

#### Option 1: AWS API Gateway WebSocket API (Recommended)
- Create a separate WebSocket API using AWS API Gateway WebSocket API
- Use DynamoDB to store connection IDs
- Create separate Lambda functions for connect/disconnect/message handling
- Requires significant refactoring of WebSocket logic

#### Option 2: Server-Sent Events (SSE)
- Replace WebSocket with Server-Sent Events for one-way real-time updates
- Easier to implement in Lambda with long polling
- Limited to server-to-client communication only

#### Option 3: Polling
- Replace real-time updates with client-side polling
- Simplest implementation but less efficient
- Good fallback option for immediate deployment

#### Option 4: Hybrid Approach
- Keep REST API on Lambda for all data operations
- Deploy WebSocket functionality separately using traditional server or AWS API Gateway WebSocket

### Current Status
- REST API functionality fully preserved in Lambda
- WebSocket features disabled but code preserved for future implementation
- All authentication, ERP, email, and chat endpoints work via REST API
- Real-time updates will need to be implemented using one of the alternative approaches

### Environment Variables Configured
- JWT_SECRET: Mapped from Replit secrets
- DATABASE_URL: Mapped from Replit secrets  
- OPENAI_API_KEY: Mapped from Replit secrets

### Files Modified
- `server/routes.ts`: Added conditional WebSocket exclusion
- `server/lambda.ts`: New Lambda handler with serverless-http wrapper
- `amplify/backend/`: Added Lambda function and API Gateway configuration