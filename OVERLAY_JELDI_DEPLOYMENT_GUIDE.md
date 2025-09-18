# AWS Lambda Deployment Guide for overlay.jeldi.app

This guide provides step-by-step instructions to deploy the Node.js/React application to AWS Lambda with proper OAuth configuration for the `overlay.jeldi.app` domain.

## 📋 Prerequisites Checklist

Before starting the deployment, ensure you have:

- ✅ **AWS Account** with appropriate permissions (Lambda, API Gateway, SSM, IAM)
- ✅ **AWS CLI** installed and configured (`aws configure`)
- ✅ **Serverless Framework CLI** installed globally (`npm install -g serverless`)
- ✅ **Node.js 18.x** installed locally
- ✅ **overlay.jeldi.app domain** configured and accessible
- ✅ **Google OAuth App** created with client credentials
- ✅ **Microsoft OAuth App** created with client credentials
- ✅ **PostgreSQL database** accessible from AWS

### Verify AWS CLI Configuration

```bash
# Test AWS CLI access
aws sts get-caller-identity

# Verify you can access SSM
aws ssm describe-parameters --max-items 5
```

### Verify Serverless Framework

```bash
# Check serverless framework installation
serverless --version

# Should show version 3.x or higher
```

## 🔐 Step 1: Configure AWS SSM Parameters

Set up all required secrets in AWS Systems Manager Parameter Store. These parameters will be automatically loaded by the Lambda function.

### Core Application Parameters

```bash
# Database Configuration
aws ssm put-parameter \
  --name "/jeldi/production/database-url" \
  --value "postgresql://username:password@host:5432/database" \
  --type "SecureString" \
  --description "PostgreSQL database connection URL"

# Authentication & Security
aws ssm put-parameter \
  --name "/jeldi/production/jwt-secret" \
  --value "$(openssl rand -base64 64)" \
  --type "SecureString" \
  --description "JWT signing secret (64 chars minimum)"

aws ssm put-parameter \
  --name "/jeldi/production/session-secret" \
  --value "$(openssl rand -base64 64)" \
  --type "SecureString" \
  --description "Session encryption secret (64 chars minimum)"

aws ssm put-parameter \
  --name "/jeldi/production/token-encryption-key" \
  --value "$(openssl rand -hex 32)" \
  --type "SecureString" \
  --description "Token encryption key (32 bytes)"
```

### OAuth Configuration Parameters

```bash
# Google OAuth (Gmail)
aws ssm put-parameter \
  --name "/jeldi/production/google-client-id" \
  --value "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com" \
  --type "SecureString" \
  --description "Google OAuth Client ID for Gmail integration"

aws ssm put-parameter \
  --name "/jeldi/production/google-client-secret" \
  --value "YOUR_GOOGLE_CLIENT_SECRET" \
  --type "SecureString" \
  --description "Google OAuth Client Secret for Gmail integration"

# Microsoft OAuth (Outlook)
aws ssm put-parameter \
  --name "/jeldi/production/microsoft-client-id" \
  --value "YOUR_MICROSOFT_CLIENT_ID" \
  --type "SecureString" \
  --description "Microsoft OAuth Client ID for Outlook integration"

aws ssm put-parameter \
  --name "/jeldi/production/microsoft-client-secret" \
  --value "YOUR_MICROSOFT_CLIENT_SECRET" \
  --type "SecureString" \
  --description "Microsoft OAuth Client Secret for Outlook integration"
```

### Domain and URL Configuration

```bash
# Primary Domain Configuration
aws ssm put-parameter \
  --name "/jeldi/production/frontend-url" \
  --value "https://overlay.jeldi.app" \
  --type "String" \
  --description "Frontend application URL"

aws ssm put-parameter \
  --name "/jeldi/production/api-domain" \
  --value "overlay.jeldi.app" \
  --type "String" \
  --description "Custom API domain name"

# AWS Domain Override
aws ssm put-parameter \
  --name "/jeldi/production/aws-domain" \
  --value "https://overlay.jeldi.app" \
  --type "String" \
  --description "AWS production domain for OAuth callbacks"
```

### External API Configuration

```bash
# OpenAI API Key
aws ssm put-parameter \
  --name "/jeldi/production/openai-api-key" \
  --value "sk-YOUR_OPENAI_API_KEY" \
  --type "SecureString" \
  --description "OpenAI API key for AI features"

# CloudFront Domain (if using CDN)
aws ssm put-parameter \
  --name "/jeldi/production/cloudfront-domain" \
  --value "https://your-cloudfront-domain.cloudfront.net" \
  --type "String" \
  --description "CloudFront distribution domain"
```

### Verify Parameters

```bash
# List all configured parameters
aws ssm get-parameters-by-path \
  --path "/jeldi/production" \
  --recursive \
  --query "Parameters[].Name" \
  --output table
```

## 🚀 Step 2: Deploy to AWS Lambda

### Build the Application

```bash
# Install dependencies
npm install

# Build the application for Lambda deployment
npm run build

# Verify build output
ls -la dist/
```

### Deploy Using Serverless Framework

```bash
# Deploy to AWS Lambda (from project root directory)
serverless deploy \
  --config deployment/serverless/serverless.yml \
  --stage production \
  --region us-east-1 \
  --verbose

# Alternative: If you prefer shorter command
sls deploy \
  --config deployment/serverless/serverless.yml \
  --stage production \
  --region us-east-1
```

### Verify Deployment

```bash
# Get deployment information
serverless info \
  --config deployment/serverless/serverless.yml \
  --stage production

# Test the health endpoint
curl https://your-api-gateway-url.execute-api.us-east-1.amazonaws.com/production/health

# Check Lambda function logs
serverless logs -f api \
  --config deployment/serverless/serverless.yml \
  --stage production \
  --tail
```

## 🌐 Step 3: Configure Custom Domain (overlay.jeldi.app)

### Option A: Using Serverless Domain Manager (Recommended)

```bash
# Install domain manager plugin
npm install --save-dev serverless-domain-manager

# Create the custom domain
serverless create_domain \
  --config deployment/serverless/serverless.yml \
  --stage production
```

### Option B: Manual API Gateway Custom Domain Setup

```bash
# Request SSL certificate (if not already done)
aws acm request-certificate \
  --domain-name overlay.jeldi.app \
  --validation-method DNS \
  --region us-east-1

# Note the certificate ARN from the output
export CERT_ARN="arn:aws:acm:us-east-1:ACCOUNT:certificate/CERT-ID"

# Create custom domain mapping (after certificate validation)
aws apigateway create-domain-name \
  --domain-name overlay.jeldi.app \
  --certificate-arn $CERT_ARN \
  --security-policy TLS_1_2

# Create base path mapping
aws apigateway create-base-path-mapping \
  --domain-name overlay.jeldi.app \
  --rest-api-id YOUR_API_GATEWAY_ID \
  --stage production
```

### Update DNS Records

Update your DNS provider to point `overlay.jeldi.app` to the API Gateway domain:

```bash
# Get the API Gateway domain name
aws apigateway get-domain-name --domain-name overlay.jeldi.app

# Create CNAME record:
# overlay.jeldi.app -> d-xxxxxxxxxx.execute-api.us-east-1.amazonaws.com
```

## 🔑 Step 4: Configure OAuth Applications

### Google OAuth Configuration (Gmail)

1. **Go to Google Cloud Console**: https://console.cloud.google.com/
2. **Select your project** or create a new one
3. **Enable Gmail API**: APIs & Services → Library → Gmail API → Enable
4. **Configure OAuth consent screen**: APIs & Services → OAuth consent screen
   - User Type: External
   - App name: Jeldi Email Overlay
   - User support email: your-email@domain.com
   - Authorized domains: `jeldi.app`
   - Developer contact: your-email@domain.com
5. **Create OAuth 2.0 Credentials**: APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
   - Application type: Web application
   - Name: Jeldi Gmail Integration
   - Authorized redirect URIs:
     ```
     https://overlay.jeldi.app/api/auth/google/callback
     ```

### Microsoft OAuth Configuration (Outlook)

1. **Go to Azure Portal**: https://portal.azure.com/
2. **Navigate to App registrations** → New registration
3. **Configure application**:
   - Name: Jeldi Email Overlay
   - Supported account types: Accounts in any organizational directory and personal Microsoft accounts
   - Redirect URI: Web → `https://overlay.jeldi.app/api/auth/microsoft/callback`
4. **Note the Application (client) ID**
5. **Create client secret**: Certificates & secrets → New client secret
   - Description: Jeldi Production Secret
   - Expires: 24 months (recommended)
6. **Configure API permissions**: API permissions → Add a permission
   - Microsoft Graph → Delegated permissions → Add:
     - `openid`
     - `profile`
     - `email`
     - `offline_access`
     - `User.Read`
     - `Mail.Read`
     - `Mail.Send` (if needed)

### Update SSM Parameters with OAuth Credentials

```bash
# Update Google OAuth credentials (use actual values from Google Console)
aws ssm put-parameter \
  --name "/jeldi/production/google-client-id" \
  --value "123456789-abcdefg.apps.googleusercontent.com" \
  --type "SecureString" \
  --overwrite

aws ssm put-parameter \
  --name "/jeldi/production/google-client-secret" \
  --value "GOCSPX-your-actual-secret-here" \
  --type "SecureString" \
  --overwrite

# Update Microsoft OAuth credentials (use actual values from Azure Portal)
aws ssm put-parameter \
  --name "/jeldi/production/microsoft-client-id" \
  --value "12345678-1234-1234-1234-123456789abc" \
  --type "SecureString" \
  --overwrite

aws ssm put-parameter \
  --name "/jeldi/production/microsoft-client-secret" \
  --value "your-actual-microsoft-secret-here" \
  --type "SecureString" \
  --overwrite
```

## 🧪 Step 5: Test the Deployment

### Test Basic Functionality

```bash
# Test health endpoint
curl https://overlay.jeldi.app/health

# Expected response:
# {"status":"healthy","timestamp":"2024-XX-XXTXX:XX:XX.XXXZ","environment":"production"}

# Test API endpoints
curl https://overlay.jeldi.app/api/auth/providers

# Expected response: List of configured OAuth providers
```

### Test OAuth Flows

#### Gmail OAuth Test

1. **Open browser**: https://overlay.jeldi.app/api/auth/google
2. **Follow OAuth flow**: Should redirect to Google login
3. **After authorization**: Should redirect back to your app
4. **Check logs**: 
   ```bash
   serverless logs -f api \
     --config deployment/serverless/serverless.yml \
     --stage production \
     --startTime 5m
   ```

#### Outlook OAuth Test

1. **Open browser**: https://overlay.jeldi.app/api/auth/microsoft
2. **Follow OAuth flow**: Should redirect to Microsoft login
3. **After authorization**: Should redirect back to your app
4. **Check logs** for any errors

### Test Frontend Application

```bash
# Test frontend is served correctly
curl https://overlay.jeldi.app/

# Should return the React app's index.html
```

## 🔧 Step 6: Troubleshooting

### Common Issues and Solutions

#### 1. OAuth Callback Errors

**Problem**: "redirect_uri_mismatch" error

**Solution**: 
- Verify OAuth app redirect URIs exactly match:
  - Google: `https://overlay.jeldi.app/api/auth/google/callback`
  - Microsoft: `https://overlay.jeldi.app/api/auth/microsoft/callback`
- Check for trailing slashes or typos

#### 2. Lambda Function Not Starting

**Problem**: Lambda function returns 500 errors

**Solution**:
```bash
# Check Lambda logs
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/jeldi-backend"

# View detailed logs
aws logs tail "/aws/lambda/jeldi-backend-production-api" --follow
```

#### 3. SSM Parameter Access Issues

**Problem**: Lambda can't access SSM parameters

**Solution**:
- Verify IAM role has SSM permissions
- Check parameter paths are correct (`/jeldi/production/parameter-name`)
- Ensure parameters exist:
  ```bash
  aws ssm get-parameter --name "/jeldi/production/jwt-secret"
  ```

#### 4. Domain Not Resolving

**Problem**: overlay.jeldi.app not accessible

**Solution**:
- Check DNS records: `dig overlay.jeldi.app`
- Verify API Gateway custom domain setup
- Check SSL certificate status

#### 5. CORS Issues

**Problem**: Frontend can't access API

**Solution**: The Lambda function already includes CORS headers for overlay.jeldi.app, but verify:
```bash
curl -H "Origin: https://overlay.jeldi.app" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: X-Requested-With" \
     -X OPTIONS \
     https://overlay.jeldi.app/api/auth/google
```

## 📊 Step 7: Monitoring and Maintenance

### CloudWatch Monitoring

```bash
# Set up CloudWatch alarms for key metrics
aws cloudwatch put-metric-alarm \
  --alarm-name "jeldi-api-errors" \
  --alarm-description "High error rate in Jeldi API" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=FunctionName,Value=jeldi-backend-production-api \
  --evaluation-periods 2
```

### Regular Maintenance Tasks

```bash
# Update dependencies (monthly)
npm audit fix
npm update

# Redeploy after updates
serverless deploy --config deployment/serverless/serverless.yml --stage production

# Rotate secrets (quarterly)
aws ssm put-parameter --name "/jeldi/production/jwt-secret" --value "$(openssl rand -base64 64)" --type "SecureString" --overwrite

# Monitor costs
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-02-01 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE
```

## 🎯 Success Verification Checklist

- ✅ **Lambda deployed**: Function visible in AWS Console
- ✅ **Custom domain active**: overlay.jeldi.app resolves to API Gateway
- ✅ **Health endpoint**: https://overlay.jeldi.app/health returns 200
- ✅ **Frontend served**: https://overlay.jeldi.app loads React app
- ✅ **Google OAuth**: https://overlay.jeldi.app/api/auth/google redirects correctly
- ✅ **Microsoft OAuth**: https://overlay.jeldi.app/api/auth/microsoft redirects correctly
- ✅ **OAuth callbacks**: Both callbacks return to app successfully
- ✅ **Database connection**: API endpoints interact with database
- ✅ **Logs flowing**: CloudWatch logs show application activity
- ✅ **No errors**: Application starts without critical errors

## 📞 Support Commands

### Quick Status Check

```bash
# Check all key components
echo "=== Lambda Function ==="
aws lambda get-function --function-name jeldi-backend-production-api --query 'Configuration.[FunctionName,State,LastUpdateStatus]' --output table

echo "=== Custom Domain ==="
aws apigateway get-domain-name --domain-name overlay.jeldi.app --query '[DomainName,DistributionDomainName]' --output table

echo "=== SSL Certificate ==="
aws acm list-certificates --query 'CertificateSummaryList[?DomainName==`overlay.jeldi.app`].[CertificateArn,Status]' --output table

echo "=== Recent Logs ==="
aws logs tail "/aws/lambda/jeldi-backend-production-api" --since 10m
```

### Useful Monitoring Queries

```bash
# Find OAuth-related errors
aws logs filter-log-events \
  --log-group-name "/aws/lambda/jeldi-backend-production-api" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --filter-pattern "OAuth"

# Monitor response times
aws logs filter-log-events \
  --log-group-name "/aws/lambda/jeldi-backend-production-api" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --filter-pattern "Duration:"
```

## 🔄 Deployment Updates

To update the deployment after making changes:

```bash
# Build and deploy changes
npm run build && serverless deploy --config deployment/serverless/serverless.yml --stage production

# For urgent fixes, deploy only the function (faster)
serverless deploy function -f api --config deployment/serverless/serverless.yml --stage production
```

---

**🎉 Congratulations!** Your Node.js/React application should now be successfully deployed on AWS Lambda with proper OAuth configuration for the overlay.jeldi.app domain.

For additional support, refer to:
- **AWS Lambda Documentation**: https://docs.aws.amazon.com/lambda/
- **Serverless Framework Docs**: https://www.serverless.com/framework/docs/
- **Google OAuth Documentation**: https://developers.google.com/identity/protocols/oauth2
- **Microsoft OAuth Documentation**: https://docs.microsoft.com/en-us/azure/active-directory/develop/