# Deployment Testing Guide for overlay.jeldi.app

This comprehensive testing guide ensures your AWS Lambda deployment is working correctly with proper OAuth flows for Gmail and Outlook integration.

## 🧪 Pre-Deployment Testing

### Prerequisites Verification

Before testing the deployed application, verify these prerequisites:

```bash
# Test AWS CLI access
aws sts get-caller-identity
# Should return your AWS account ID, user ARN, and user ID

# Test AWS CLI SSM access
aws ssm describe-parameters --max-items 5
# Should list some parameters without errors

# Test Serverless Framework
serverless --version
# Should show version 3.x or higher

# Verify domain resolution
nslookup overlay.jeldi.app
# Should resolve to an IP address

# Test HTTPS connectivity to domain
curl -I https://overlay.jeldi.app
# Should return headers (even if 404, HTTPS should work)
```

## 🚀 Post-Deployment Testing

### Step 1: Basic Deployment Verification

#### Test Lambda Function Deployment

```bash
# Check if Lambda function exists
aws lambda get-function --function-name jeldi-backend-production-api

# Expected response should include:
# - FunctionName: jeldi-backend-production-api
# - State: Active
# - LastUpdateStatus: Successful
```

#### Test API Gateway Deployment

```bash
# Get API Gateway information
aws apigateway get-rest-apis --query "items[?name=='jeldi-backend-production'].{id:id,name:name}" --output table

# Test API Gateway endpoint (replace with your actual API Gateway URL)
curl -I https://your-api-id.execute-api.us-east-1.amazonaws.com/production/health
# Should return 200 OK
```

### Step 2: Health Check Testing

#### Test Health Endpoint

```bash
# Test health endpoint via custom domain
curl https://overlay.jeldi.app/health

# Expected response:
# {"status":"healthy","timestamp":"2024-XX-XXTXX:XX:XX.XXXZ","environment":"production"}

# Test health endpoint with verbose output
curl -v https://overlay.jeldi.app/health

# Verify response headers include CORS headers:
# Access-Control-Allow-Origin: https://overlay.jeldi.app (or *)
# Access-Control-Allow-Methods: GET,HEAD,POST,PUT,DELETE,OPTIONS,PATCH
```

#### Test Frontend Serving

```bash
# Test that frontend is served correctly
curl https://overlay.jeldi.app/

# Should return HTML content with <!DOCTYPE html>

# Test that API routes are not served as frontend
curl https://overlay.jeldi.app/api/health
# Should return JSON, not HTML
```

### Step 3: OAuth Provider Configuration Testing

#### Test OAuth Providers Endpoint

```bash
# Test OAuth providers discovery
curl https://overlay.jeldi.app/api/auth/providers

# Expected response should include configured providers:
# {"providers":[{"name":"google","displayName":"Google"},{"name":"microsoft","displayName":"Microsoft"}]}

# Test with detailed output
curl -v https://overlay.jeldi.app/api/auth/providers
```

#### Test OAuth Initialization Endpoints

```bash
# Test Google OAuth initialization (should return redirect)
curl -I https://overlay.jeldi.app/api/auth/google

# Expected: 302 redirect to accounts.google.com

# Test Microsoft OAuth initialization (should return redirect)
curl -I https://overlay.jeldi.app/api/auth/microsoft

# Expected: 302 redirect to login.microsoftonline.com
```

### Step 4: OAuth Flow End-to-End Testing

#### Manual Google OAuth Flow Test

1. **Start OAuth flow**:
   - Open browser and navigate to: `https://overlay.jeldi.app/api/auth/google`
   - Should redirect to Google login page

2. **Complete Google login**:
   - Enter your Google credentials
   - Grant permissions to the app
   - Should redirect back to: `https://overlay.jeldi.app/api/auth/google/callback`

3. **Verify callback handling**:
   - Check Lambda logs for successful callback processing
   - Verify JWT token generation
   - Confirm user data extraction

#### Manual Microsoft OAuth Flow Test

1. **Start OAuth flow**:
   - Open browser and navigate to: `https://overlay.jeldi.app/api/auth/microsoft`
   - Should redirect to Microsoft login page

2. **Complete Microsoft login**:
   - Enter your Microsoft credentials
   - Grant permissions to the app
   - Should redirect back to: `https://overlay.jeldi.app/api/auth/microsoft/callback`

3. **Verify callback handling**:
   - Check Lambda logs for successful callback processing
   - Verify JWT token generation
   - Confirm user data extraction

### Step 5: Database Connectivity Testing

#### Test Database Connection

```bash
# Test API endpoints that require database access
curl -X POST https://overlay.jeldi.app/api/users/me \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Should return user data or appropriate authentication error
```

#### Test User Registration/Login

```bash
# Test user registration (if available)
curl -X POST https://overlay.jeldi.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "securepassword"
  }'

# Test user login (if available)
curl -X POST https://overlay.jeldi.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "securepassword"
  }'
```

## 📊 Monitoring and Logging Tests

### Step 6: CloudWatch Logs Verification

#### Monitor Lambda Function Logs

```bash
# View recent Lambda logs
aws logs tail "/aws/lambda/jeldi-backend-production-api" --since 10m

# Filter for OAuth-related logs
aws logs filter-log-events \
  --log-group-name "/aws/lambda/jeldi-backend-production-api" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --filter-pattern "OAuth"

# Filter for error logs
aws logs filter-log-events \
  --log-group-name "/aws/lambda/jeldi-backend-production-api" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --filter-pattern "ERROR"
```

#### Test Real-time Log Monitoring

```bash
# Start log tailing in one terminal
aws logs tail "/aws/lambda/jeldi-backend-production-api" --follow

# In another terminal, trigger some requests
curl https://overlay.jeldi.app/health
curl https://overlay.jeldi.app/api/auth/providers

# Verify logs appear in real-time
```

### Step 7: Performance Testing

#### Test Response Times

```bash
# Test response time for health endpoint
time curl https://overlay.jeldi.app/health

# Test multiple requests to check for cold starts
for i in {1..5}; do
  echo "Request $i:"
  time curl -s https://overlay.jeldi.app/health > /dev/null
  sleep 2
done
```

#### Load Testing (Optional)

```bash
# Simple load test using Apache Bench (if available)
ab -n 100 -c 10 https://overlay.jeldi.app/health

# Or using curl with parallel requests
for i in {1..20}; do
  curl -s https://overlay.jeldi.app/health > /dev/null &
done
wait
```

## 🔧 Troubleshooting Tests

### Step 8: Common Issue Verification

#### Test SSL Certificate

```bash
# Test SSL certificate validity
echo | openssl s_client -servername overlay.jeldi.app -connect overlay.jeldi.app:443 2>/dev/null | openssl x509 -noout -dates

# Check SSL configuration
curl -I https://overlay.jeldi.app/health | grep -i security
```

#### Test CORS Configuration

```bash
# Test CORS preflight request
curl -X OPTIONS https://overlay.jeldi.app/api/auth/google \
  -H "Origin: https://overlay.jeldi.app" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v

# Should return appropriate CORS headers
```

#### Test Error Handling

```bash
# Test 404 handling for API routes
curl https://overlay.jeldi.app/api/nonexistent

# Test 404 handling for frontend routes (should serve index.html)
curl https://overlay.jeldi.app/nonexistent-page
```

## 📋 Automated Testing Script

### Complete Deployment Test Script

```bash
#!/bin/bash

echo "🧪 Starting overlay.jeldi.app deployment testing..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASS=0
FAIL=0

# Function to test endpoint
test_endpoint() {
    local url=$1
    local expected_status=$2
    local test_name=$3
    
    echo -n "Testing $test_name... "
    
    status_code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    
    if [ "$status_code" -eq "$expected_status" ]; then
        echo -e "${GREEN}PASS${NC} ($status_code)"
        ((PASS++))
    else
        echo -e "${RED}FAIL${NC} (got $status_code, expected $expected_status)"
        ((FAIL++))
    fi
}

# Function to test JSON response
test_json_endpoint() {
    local url=$1
    local test_name=$2
    
    echo -n "Testing $test_name... "
    
    response=$(curl -s "$url")
    if echo "$response" | jq . >/dev/null 2>&1; then
        echo -e "${GREEN}PASS${NC} (valid JSON)"
        ((PASS++))
    else
        echo -e "${RED}FAIL${NC} (invalid JSON: $response)"
        ((FAIL++))
    fi
}

echo "=== Basic Connectivity Tests ==="
test_endpoint "https://overlay.jeldi.app/health" 200 "Health endpoint"
test_endpoint "https://overlay.jeldi.app/" 200 "Frontend serving"

echo ""
echo "=== API Endpoint Tests ==="
test_json_endpoint "https://overlay.jeldi.app/api/auth/providers" "OAuth providers"

echo ""
echo "=== OAuth Redirect Tests ==="
test_endpoint "https://overlay.jeldi.app/api/auth/google" 302 "Google OAuth redirect"
test_endpoint "https://overlay.jeldi.app/api/auth/microsoft" 302 "Microsoft OAuth redirect"

echo ""
echo "=== CORS and Security Tests ==="
cors_response=$(curl -s -X OPTIONS https://overlay.jeldi.app/api/auth/google \
  -H "Origin: https://overlay.jeldi.app" \
  -H "Access-Control-Request-Method: GET" \
  -I | grep -i "access-control")

if [ -n "$cors_response" ]; then
    echo -e "CORS configuration: ${GREEN}PASS${NC}"
    ((PASS++))
else
    echo -e "CORS configuration: ${RED}FAIL${NC}"
    ((FAIL++))
fi

echo ""
echo "=== SSL Certificate Test ==="
if echo | openssl s_client -servername overlay.jeldi.app -connect overlay.jeldi.app:443 2>/dev/null | openssl x509 -noout -checkend 86400 >/dev/null; then
    echo -e "SSL certificate validity: ${GREEN}PASS${NC}"
    ((PASS++))
else
    echo -e "SSL certificate validity: ${RED}FAIL${NC}"
    ((FAIL++))
fi

echo ""
echo "=== Lambda Function Status ==="
lambda_status=$(aws lambda get-function --function-name jeldi-backend-production-api --query 'Configuration.State' --output text 2>/dev/null)

if [ "$lambda_status" = "Active" ]; then
    echo -e "Lambda function status: ${GREEN}PASS${NC} ($lambda_status)"
    ((PASS++))
else
    echo -e "Lambda function status: ${RED}FAIL${NC} ($lambda_status)"
    ((FAIL++))
fi

echo ""
echo "=== Test Summary ==="
echo -e "Passed: ${GREEN}$PASS${NC}"
echo -e "Failed: ${RED}$FAIL${NC}"

if [ $FAIL -eq 0 ]; then
    echo -e "\n🎉 ${GREEN}All tests passed! Deployment is healthy.${NC}"
    exit 0
else
    echo -e "\n⚠️  ${YELLOW}Some tests failed. Please review the issues above.${NC}"
    exit 1
fi
```

### Save and Run the Test Script

```bash
# Save the script
cat > deployment_test.sh << 'EOF'
# [Insert the complete script from above]
EOF

# Make it executable
chmod +x deployment_test.sh

# Run the tests
./deployment_test.sh
```

## 🔍 Manual Testing Checklist

### OAuth Flow Testing Checklist

#### Google OAuth ✅
- [ ] Navigate to `https://overlay.jeldi.app/api/auth/google`
- [ ] Redirected to Google login page
- [ ] Successfully log in with Google account
- [ ] Grant permissions to the app
- [ ] Redirected back to `https://overlay.jeldi.app/api/auth/google/callback`
- [ ] No errors in browser console
- [ ] JWT token generated and returned
- [ ] User data extracted correctly

#### Microsoft OAuth ✅
- [ ] Navigate to `https://overlay.jeldi.app/api/auth/microsoft`
- [ ] Redirected to Microsoft login page
- [ ] Successfully log in with Microsoft account
- [ ] Grant permissions to the app
- [ ] Redirected back to `https://overlay.jeldi.app/api/auth/microsoft/callback`
- [ ] No errors in browser console
- [ ] JWT token generated and returned
- [ ] User data extracted correctly

### API Testing Checklist ✅
- [ ] Health endpoint returns 200 OK
- [ ] Frontend serves correctly at root path
- [ ] OAuth providers endpoint returns valid JSON
- [ ] CORS headers present in responses
- [ ] SSL certificate valid and not expired
- [ ] All API routes respond appropriately

### Infrastructure Testing Checklist ✅
- [ ] Lambda function status is "Active"
- [ ] API Gateway custom domain configured
- [ ] CloudWatch logs flowing correctly
- [ ] SSM parameters accessible
- [ ] Database connectivity working
- [ ] No critical errors in logs

## 📞 When Tests Fail

### Debugging Failed Tests

1. **Check CloudWatch Logs**:
   ```bash
   aws logs tail "/aws/lambda/jeldi-backend-production-api" --since 30m
   ```

2. **Verify SSM Parameters**:
   ```bash
   aws ssm get-parameters-by-path --path "/jeldi/production" --recursive --query "Parameters[].Name"
   ```

3. **Test Individual Components**:
   ```bash
   # Test Lambda function directly
   aws lambda invoke --function-name jeldi-backend-production-api response.json
   cat response.json
   ```

4. **Check OAuth Configuration**:
   - Verify callback URLs in Google/Microsoft consoles
   - Confirm client IDs and secrets in SSM
   - Check domain configuration

### Getting Help

If tests fail consistently:
1. Review the deployment logs carefully
2. Check the OAuth configuration in both provider consoles
3. Verify all SSM parameters are set correctly
4. Ensure the domain DNS is pointing to the correct API Gateway
5. Check Lambda function permissions and IAM roles

---

## 🎯 Success Criteria Verification

Your deployment is successful when:
- ✅ All automated tests pass
- ✅ OAuth flows complete end-to-end
- ✅ No critical errors in CloudWatch logs
- ✅ Application responds correctly to all test requests
- ✅ SSL certificate is valid
- ✅ Custom domain resolves correctly

## 📈 Post-Testing Recommendations

1. **Set up monitoring alerts** for failed OAuth attempts
2. **Enable CloudWatch dashboards** for key metrics
3. **Schedule regular testing** to catch issues early
4. **Document any custom configurations** for future reference
5. **Create runbooks** for common troubleshooting scenarios