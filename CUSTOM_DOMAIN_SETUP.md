# Custom Domain Setup for Jeldi Application

## Quick Implementation Summary

✅ **Code Changes Completed**
- Updated Lambda CORS settings in `server/lambda.ts` to support custom domains
- Enhanced API configuration in `client/src/lib/api-config.ts` with domain detection

🔄 **AWS Configuration Required** (Manual Steps)
1. Create SSL certificates in AWS Certificate Manager (us-east-1)
2. Update CloudFront distribution with alternate domain names  
3. Configure Cloudflare DNS with validation and domain CNAME records

## Overview
This guide configures custom domains for the Jeldi application:
- **demo.jeldi.app** → CloudFront application frontend
- **overlay.jeldi.app** → Future AI overlay functionality

## Current Infrastructure
- **Frontend CloudFront**: https://d2k9wjgsy12ugk.cloudfront.net
- **Backend Lambda**: https://kpqqhqz2akdmklu23echtowfvq0bajsz.lambda-url.us-east-2.on.aws
- **Architecture**: Hybrid Amplify + separate Lambda deployment

---

## Phase 1: AWS Certificate Manager SSL Setup

### Prerequisites
- AWS Console access with permissions for Certificate Manager
- Domain ownership verification for jeldi.app
- Cloudflare DNS management access

### Step 1: Request SSL Certificate

1. **Navigate to AWS Certificate Manager**
   - **CRITICAL**: Must use **us-east-1** region (CloudFront requirement)
   - Go to: https://console.aws.amazon.com/acm/home?region=us-east-1

2. **Request Single Certificate with Multiple Domains**
   ```
   Primary domain name: demo.jeldi.app
   Additional domain names: overlay.jeldi.app
   Validation method: DNS validation
   Key algorithm: RSA 2048
   ```
   
   **Alternative Wildcard Option:**
   ```
   Domain name: *.jeldi.app
   Validation method: DNS validation
   Key algorithm: RSA 2048
   ```
   
   **⚠️ Important**: CloudFront distributions can only use ONE certificate. A single certificate with Subject Alternative Names (SANs) covering both domains is required.

### Step 2: DNS Validation Records
After requesting the certificate, AWS will provide CNAME records for validation:

**Example format (actual values will be different):**
```
For multi-domain certificate:
demo.jeldi.app validation:
Name: _abc123def456789.demo.jeldi.app
Value: _xyz789abc123456.acm-validations.aws.

overlay.jeldi.app validation:
Name: _def456ghi789012.overlay.jeldi.app
Value: _uvw345xyz678901.acm-validations.aws.

For wildcard certificate:
*.jeldi.app validation:
Name: _ghi789jkl012345.jeldi.app
Value: _mno678pqr901234.acm-validations.aws.
```

**⚠️ Important**: Copy these exact CNAME records - you'll add them to Cloudflare in Phase 3.

### Step 3: Certificate Status Monitoring
- Certificate will show "Pending validation" status
- After DNS records are added, validation typically completes in 5-30 minutes
- Status will change to "Issued" when ready

---

## Phase 2: CloudFront Distribution Update

### Prerequisites
- SSL certificate from Phase 1 must be "Issued" status
- CloudFront distribution ID: `d2k9wjgsy12ugk.cloudfront.net`

### Step 1: Update CloudFront Distribution

1. **Navigate to CloudFront Console**
   - Go to: https://console.aws.amazon.com/cloudfront/

2. **Edit Distribution Settings**
   - Find distribution ID: `E1MELH0DHF9YVL` (if different, use current ID)
   - Click "Edit"

3. **Configure Alternate Domain Names (CNAMEs)**
   ```
   Alternate domain names (CNAMEs):
   demo.jeldi.app
   overlay.jeldi.app
   ```

4. **SSL Certificate Configuration**
   ```
   SSL Certificate: Custom SSL Certificate
   Certificate: Select the multi-domain certificate (demo.jeldi.app + overlay.jeldi.app)
   Legacy clients support: Not required
   Security policy: TLSv1.2_2021 (recommended)
   ```

5. **Additional Settings**
   ```
   HTTP to HTTPS redirect: Yes
   Supported HTTP versions: HTTP/2
   Price class: Use all edge locations (for best performance)
   ```

### Step 2: Deploy Changes
- Click "Save Changes"
- CloudFront deployment typically takes 5-15 minutes
- Monitor "Status" column - wait for "Deployed" status

---

## Phase 3: Cloudflare DNS Configuration

### Prerequisites
- Access to Cloudflare DNS management for jeldi.app
- SSL certificate from Phase 1 completed validation
- CloudFront distribution updated from Phase 2

### Step 1: Add SSL Validation Records

1. **Login to Cloudflare Dashboard**
   - Navigate to jeldi.app domain DNS settings

2. **Add Validation CNAME Records**
   For each domain validation record from the certificate:
   ```
   Type: CNAME
   Name: [validation record name without domain]
   Target: [validation record value]
   Proxy status: DNS only (not proxied) ⚠️ CRITICAL
   ```

   **Example for multi-domain certificate:**
   ```
   Type: CNAME
   Name: _abc123def456789.demo
   Target: _xyz789abc123456.acm-validations.aws.
   Proxy status: DNS only
   
   Type: CNAME
   Name: _def456ghi789012.overlay
   Target: _uvw345xyz678901.acm-validations.aws.
   Proxy status: DNS only
   ```
   
   **Example for wildcard certificate:**
   ```
   Type: CNAME
   Name: _ghi789jkl012345
   Target: _mno678pqr901234.acm-validations.aws.
   Proxy status: DNS only
   ```

### Step 2: Add Domain CNAME Records

1. **Add demo.jeldi.app CNAME**
   ```
   Type: CNAME
   Name: demo
   Target: d2k9wjgsy12ugk.cloudfront.net
   Proxy status: DNS only (not proxied) ⚠️ CRITICAL
   TTL: Auto
   ```

2. **Add overlay.jeldi.app CNAME**
   ```
   Type: CNAME
   Name: overlay
   Target: d2k9wjgsy12ugk.cloudfront.net
   Proxy status: DNS only (not proxied) ⚠️ CRITICAL
   TTL: Auto
   ```

### Step 3: Verify DNS Propagation
```bash
# Test DNS resolution
nslookup demo.jeldi.app
nslookup overlay.jeldi.app

# Test with dig (more detailed)
dig demo.jeldi.app CNAME
dig overlay.jeldi.app CNAME
```

---

## Phase 4: Backend CORS Configuration

### Current Issue
The Lambda backend currently only allows requests from the CloudFront domain:
```javascript
const allowedOrigin = 'https://d2k9wjgsy12ugk.cloudfront.net';
```

### Required Updates
Update CORS configuration to support custom domains while maintaining security.

---

## Testing & Validation

### Step 1: Basic Connectivity Test
```bash
# Test HTTPS connectivity
curl -I https://demo.jeldi.app
curl -I https://overlay.jeldi.app

# Expected: HTTP 200 with valid SSL
```

### Step 2: Application Functionality Test
1. Navigate to https://demo.jeldi.app
2. Verify application loads correctly
3. Test login functionality
4. Verify API calls work (check browser developer tools)

### Step 3: SSL Certificate Validation
1. Check SSL certificate in browser (click padlock icon)
2. Verify certificate issued by Amazon and covers correct domain
3. Confirm no mixed content warnings

---

## Troubleshooting Guide

### SSL Certificate Issues
- **Certificate pending**: DNS validation records not added correctly to Cloudflare
- **Wrong region**: Certificate must be in us-east-1 for CloudFront
- **Validation timeout**: Check CNAME records are "DNS only" not proxied
- **Multiple certificates error**: CloudFront only supports one certificate - use multi-domain or wildcard certificate

### DNS Issues
- **CNAME not resolving**: Ensure "DNS only" mode in Cloudflare (not proxied)
- **SSL errors**: Wait for DNS propagation (can take up to 24 hours)
- **404 errors**: CloudFront distribution may not be fully deployed

### CORS Issues
- **API calls failing**: Backend CORS needs custom domain support
- **Mixed content**: Ensure all API calls use HTTPS

### CloudFront Issues
- **504 Gateway Timeout**: Origin server (Lambda) may be down
- **403 Forbidden**: Check origin permissions and security groups

---

## Security Considerations

1. **SSL/TLS Configuration**
   - Use TLS 1.2 minimum
   - Disable legacy SSL protocols
   - Enable HSTS headers

2. **CORS Policy**
   - Restrict to specific domains only
   - Avoid wildcard origins in production
   - Validate all allowed origins

3. **CloudFront Security**
   - Enable AWS WAF if needed
   - Configure appropriate caching policies
   - Monitor access logs

---

## Monitoring & Maintenance

### CloudWatch Metrics
- Monitor CloudFront edge cache performance
- Track SSL certificate expiration
- Monitor Lambda function errors

### Regular Tasks
- SSL certificate auto-renews (AWS managed)
- Monitor DNS propagation
- Review CloudFront access patterns
- Update CORS policies as needed
