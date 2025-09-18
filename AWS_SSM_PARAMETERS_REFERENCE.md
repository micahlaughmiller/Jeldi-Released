# AWS SSM Parameters Reference for overlay.jeldi.app

This document provides a comprehensive reference for all AWS Systems Manager (SSM) Parameter Store parameters required for the overlay.jeldi.app deployment.

## 🔐 Complete SSM Parameters List

### Core Application Parameters

| Parameter Name | Type | Description | Required | Example/Notes |
|---|---|---|---|---|
| `/jeldi/production/database-url` | SecureString | PostgreSQL connection URL | ✅ | `postgresql://user:pass@host:5432/db` |
| `/jeldi/production/jwt-secret` | SecureString | JWT token signing secret | ✅ | Min 64 chars, use `openssl rand -base64 64` |
| `/jeldi/production/session-secret` | SecureString | Session encryption secret | ✅ | Min 64 chars, use `openssl rand -base64 64` |
| `/jeldi/production/token-encryption-key` | SecureString | Token encryption key | ✅ | 32 bytes, use `openssl rand -hex 32` |

### OAuth Configuration Parameters

| Parameter Name | Type | Description | Required | Example/Notes |
|---|---|---|---|---|
| `/jeldi/production/google-client-id` | SecureString | Google OAuth Client ID | ✅ | `123456789-abcdef.apps.googleusercontent.com` |
| `/jeldi/production/google-client-secret` | SecureString | Google OAuth Client Secret | ✅ | `GOCSPX-your-secret-here` |
| `/jeldi/production/microsoft-client-id` | SecureString | Microsoft OAuth Client ID | ✅ | `12345678-1234-1234-1234-123456789abc` |
| `/jeldi/production/microsoft-client-secret` | SecureString | Microsoft OAuth Client Secret | ✅ | Azure app client secret |

### Domain and URL Configuration

| Parameter Name | Type | Description | Required | Example/Notes |
|---|---|---|---|---|
| `/jeldi/production/frontend-url` | String | Frontend application URL | ✅ | `https://overlay.jeldi.app` |
| `/jeldi/production/api-domain` | String | Custom API domain name | ✅ | `overlay.jeldi.app` |
| `/jeldi/production/aws-domain` | String | AWS production domain | ✅ | `https://overlay.jeldi.app` |
| `/jeldi/production/ssl-certificate` | String | SSL certificate name/ARN | ⚠️ | For custom domain setup |

### External API Configuration

| Parameter Name | Type | Description | Required | Example/Notes |
|---|---|---|---|---|
| `/jeldi/production/openai-api-key` | SecureString | OpenAI API key | ✅ | `sk-your-openai-api-key-here` |
| `/jeldi/production/cloudfront-domain` | String | CloudFront distribution domain | ❌ | `https://d123456.cloudfront.net` |

### API Gateway Configuration (Auto-generated)

| Parameter Name | Type | Description | Required | Example/Notes |
|---|---|---|---|---|
| `/jeldi/production/api-gateway-id` | String | API Gateway REST API ID | ❌ | Auto-populated by deployment |
| `/jeldi/production/api-gateway-root-resource-id` | String | API Gateway root resource ID | ❌ | Auto-populated by deployment |

### Optional Feature Flags

| Parameter Name | Type | Description | Required | Example/Notes |
|---|---|---|---|---|
| `/jeldi/production/enable-warmup` | String | Enable Lambda warmup | ❌ | `true` or `false` |
| `/jeldi/production/enable-health-check` | String | Enable health check schedule | ❌ | `true` or `false` |

## 🚀 Quick Setup Commands

### Generate Secure Secrets

```bash
# Generate JWT secret
JWT_SECRET=$(openssl rand -base64 64)
echo "JWT_SECRET: $JWT_SECRET"

# Generate session secret
SESSION_SECRET=$(openssl rand -base64 64)
echo "SESSION_SECRET: $SESSION_SECRET"

# Generate token encryption key
TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)
echo "TOKEN_ENCRYPTION_KEY: $TOKEN_ENCRYPTION_KEY"
```

### Batch Parameter Creation Script

```bash
#!/bin/bash

# Core Application Parameters
aws ssm put-parameter --name "/jeldi/production/database-url" --value "YOUR_DATABASE_URL" --type "SecureString" --description "PostgreSQL database connection URL"
aws ssm put-parameter --name "/jeldi/production/jwt-secret" --value "$(openssl rand -base64 64)" --type "SecureString" --description "JWT signing secret"
aws ssm put-parameter --name "/jeldi/production/session-secret" --value "$(openssl rand -base64 64)" --type "SecureString" --description "Session encryption secret"
aws ssm put-parameter --name "/jeldi/production/token-encryption-key" --value "$(openssl rand -hex 32)" --type "SecureString" --description "Token encryption key"

# OAuth Configuration
aws ssm put-parameter --name "/jeldi/production/google-client-id" --value "YOUR_GOOGLE_CLIENT_ID" --type "SecureString" --description "Google OAuth Client ID"
aws ssm put-parameter --name "/jeldi/production/google-client-secret" --value "YOUR_GOOGLE_CLIENT_SECRET" --type "SecureString" --description "Google OAuth Client Secret"
aws ssm put-parameter --name "/jeldi/production/microsoft-client-id" --value "YOUR_MICROSOFT_CLIENT_ID" --type "SecureString" --description "Microsoft OAuth Client ID"
aws ssm put-parameter --name "/jeldi/production/microsoft-client-secret" --value "YOUR_MICROSOFT_CLIENT_SECRET" --type "SecureString" --description "Microsoft OAuth Client Secret"

# Domain Configuration
aws ssm put-parameter --name "/jeldi/production/frontend-url" --value "https://overlay.jeldi.app" --type "String" --description "Frontend application URL"
aws ssm put-parameter --name "/jeldi/production/api-domain" --value "overlay.jeldi.app" --type "String" --description "Custom API domain name"
aws ssm put-parameter --name "/jeldi/production/aws-domain" --value "https://overlay.jeldi.app" --type "String" --description "AWS production domain"

# External APIs
aws ssm put-parameter --name "/jeldi/production/openai-api-key" --value "YOUR_OPENAI_API_KEY" --type "SecureString" --description "OpenAI API key"

echo "✅ All SSM parameters created successfully!"
```

## 🔧 Parameter Management Commands

### List All Parameters

```bash
# List all jeldi production parameters
aws ssm get-parameters-by-path \
  --path "/jeldi/production" \
  --recursive \
  --query "Parameters[].Name" \
  --output table
```

### Verify Parameter Values (Non-Secure Only)

```bash
# Get non-secure parameters
aws ssm get-parameters \
  --names "/jeldi/production/frontend-url" \
         "/jeldi/production/api-domain" \
         "/jeldi/production/aws-domain" \
  --query "Parameters[].[Name,Value]" \
  --output table
```

### Update Existing Parameters

```bash
# Update a parameter (add --overwrite flag)
aws ssm put-parameter \
  --name "/jeldi/production/frontend-url" \
  --value "https://overlay.jeldi.app" \
  --type "String" \
  --overwrite
```

### Delete Parameters (Use with caution!)

```bash
# Delete a specific parameter
aws ssm delete-parameter --name "/jeldi/production/parameter-name"

# Delete all parameters (DANGEROUS!)
# aws ssm delete-parameters --names $(aws ssm get-parameters-by-path --path "/jeldi/production" --recursive --query "Parameters[].Name" --output text)
```

## 🔍 Parameter Validation

### Check Required Parameters Exist

```bash
#!/bin/bash

REQUIRED_PARAMS=(
  "/jeldi/production/database-url"
  "/jeldi/production/jwt-secret"
  "/jeldi/production/session-secret"
  "/jeldi/production/token-encryption-key"
  "/jeldi/production/google-client-id"
  "/jeldi/production/google-client-secret"
  "/jeldi/production/microsoft-client-id"
  "/jeldi/production/microsoft-client-secret"
  "/jeldi/production/frontend-url"
  "/jeldi/production/api-domain"
  "/jeldi/production/aws-domain"
  "/jeldi/production/openai-api-key"
)

echo "🔍 Checking required SSM parameters..."

for param in "${REQUIRED_PARAMS[@]}"; do
  if aws ssm get-parameter --name "$param" >/dev/null 2>&1; then
    echo "✅ $param exists"
  else
    echo "❌ $param MISSING"
  fi
done

echo "✅ Parameter validation complete!"
```

### Validate Parameter Security

```bash
#!/bin/bash

# Check that secrets are marked as SecureString
SECURE_PARAMS=(
  "/jeldi/production/database-url"
  "/jeldi/production/jwt-secret"
  "/jeldi/production/session-secret"
  "/jeldi/production/token-encryption-key"
  "/jeldi/production/google-client-id"
  "/jeldi/production/google-client-secret"
  "/jeldi/production/microsoft-client-id"
  "/jeldi/production/microsoft-client-secret"
  "/jeldi/production/openai-api-key"
)

echo "🔐 Validating parameter security..."

for param in "${SECURE_PARAMS[@]}"; do
  TYPE=$(aws ssm get-parameter --name "$param" --query "Parameter.Type" --output text 2>/dev/null)
  if [[ "$TYPE" == "SecureString" ]]; then
    echo "✅ $param is SecureString"
  else
    echo "⚠️ $param is $TYPE (should be SecureString)"
  fi
done
```

## 🎯 Environment-Specific Notes

### Production Environment (`/jeldi/production/*`)
- All secrets must use `SecureString` type
- Parameters are encrypted at rest using AWS KMS
- Access controlled via IAM policies
- Audit trail available in CloudTrail

### Development Environment (`/jeldi/development/*`)
- Can use same parameter structure with different values
- Useful for testing deployment changes
- Less stringent security requirements

### Parameter Naming Convention
- Format: `/jeldi/{stage}/{parameter-name}`
- Use lowercase with hyphens for parameter names
- Group related parameters logically
- Keep names descriptive but concise

## 🔒 Security Best Practices

1. **Use SecureString for all secrets**
   ```bash
   aws ssm put-parameter --type "SecureString" # Always for sensitive data
   ```

2. **Implement least privilege access**
   ```json
   {
     "Effect": "Allow",
     "Action": ["ssm:GetParameter", "ssm:GetParameters"],
     "Resource": "arn:aws:ssm:region:account:parameter/jeldi/production/*"
   }
   ```

3. **Regular secret rotation**
   ```bash
   # Rotate secrets quarterly
   aws ssm put-parameter --name "/jeldi/production/jwt-secret" --value "$(openssl rand -base64 64)" --type "SecureString" --overwrite
   ```

4. **Monitor parameter access**
   - Enable CloudTrail logging
   - Set up CloudWatch alarms for parameter access
   - Regular audit of parameter usage

## 🚨 Troubleshooting

### Common Issues

**Problem**: Parameter not found during deployment
```bash
# Solution: Verify parameter exists and has correct path
aws ssm get-parameter --name "/jeldi/production/database-url"
```

**Problem**: Access denied when Lambda tries to read parameters
```bash
# Solution: Check Lambda execution role has SSM permissions
aws iam get-role-policy --role-name your-lambda-role --policy-name SSMAccessPolicy
```

**Problem**: Parameter value appears to be empty or invalid
```bash
# Solution: Check parameter value (for non-secure strings)
aws ssm get-parameter --name "/jeldi/production/frontend-url" --query "Parameter.Value" --output text
```

---

## 📖 Additional Resources

- **AWS SSM Parameter Store Documentation**: https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html
- **AWS SSM CLI Reference**: https://docs.aws.amazon.com/cli/latest/reference/ssm/
- **IAM Policies for SSM**: https://docs.aws.amazon.com/systems-manager/latest/userguide/auth-and-access-control-iam-identity-based-access-control.html