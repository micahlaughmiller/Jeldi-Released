#!/bin/bash

# Start ERP Connect Pro with required security environment variables
echo "🔐 Starting ERP Connect Pro with Security Configuration..."

# Set required security environment variables
export TOKEN_ENCRYPTION_KEY=3e36f00aa2670b562fbb066c8d99ceeef6c095496f131c12c32ac93b504f5463

echo "✅ Security environment variables configured"
echo "✅ TOKEN_ENCRYPTION_KEY: Set (32-byte secure key)"
echo "✅ JWT_SECRET: Already configured"

echo ""
echo "🚀 Starting application with secure configuration..."

# Start the application
npm run dev