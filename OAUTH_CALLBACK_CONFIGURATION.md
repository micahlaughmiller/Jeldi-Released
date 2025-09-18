# OAuth Callback Configuration Guide for overlay.jeldi.app

This guide provides detailed instructions for configuring OAuth applications in Google and Microsoft developer consoles with the correct callback URLs for the overlay.jeldi.app domain.

## 🎯 Required Callback URLs

For the overlay.jeldi.app domain, the following callback URLs must be configured:

- **Gmail (Google OAuth)**: `https://overlay.jeldi.app/api/auth/google/callback`
- **Outlook (Microsoft OAuth)**: `https://overlay.jeldi.app/api/auth/microsoft/callback`

## 🔧 Google OAuth Configuration (Gmail Integration)

### Step 1: Access Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Select your existing project or create a new one

### Step 2: Enable Required APIs

```bash
# Enable Gmail API via CLI (optional)
gcloud services enable gmail.googleapis.com

# Enable Google+ API (for profile information)
gcloud services enable plus.googleapis.com
```

Or via Console:
1. Navigate to **APIs & Services** → **Library**
2. Search for and enable:
   - Gmail API
   - Google+ API (for user profile data)

### Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** user type (unless using Google Workspace)
3. Fill in the required information:

```
App name: Jeldi Email Overlay
User support email: your-support-email@domain.com
App logo: (optional, upload your app logo)

Authorized domains:
- jeldi.app

Application home page: https://overlay.jeldi.app
Application privacy policy link: https://overlay.jeldi.app/privacy
Application terms of service link: https://overlay.jeldi.app/terms

Developer contact information:
- your-dev-email@domain.com
```

4. **Scopes Configuration**:
   - Add the following scopes:
     - `../auth/userinfo.email`
     - `../auth/userinfo.profile`
     - `../auth/gmail.readonly` (for reading emails)
     - `../auth/gmail.send` (for sending emails, if needed)

5. **Test users** (if app is not published):
   - Add test user email addresses

### Step 4: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth 2.0 Client ID**
3. Configure the OAuth client:

```
Application type: Web application
Name: Jeldi Gmail Integration - Production

Authorized JavaScript origins:
- https://overlay.jeldi.app

Authorized redirect URIs:
- https://overlay.jeldi.app/api/auth/google/callback
```

### Step 5: Note the Credentials

After creation, you'll receive:
- **Client ID**: Format like `123456789-abcdefghijklmnop.apps.googleusercontent.com`
- **Client Secret**: Format like `GOCSPX-your-secret-here`

### Step 6: Update AWS SSM Parameters

```bash
# Update Google OAuth credentials in AWS SSM
aws ssm put-parameter \
  --name "/jeldi/production/google-client-id" \
  --value "123456789-abcdefghijklmnop.apps.googleusercontent.com" \
  --type "SecureString" \
  --overwrite

aws ssm put-parameter \
  --name "/jeldi/production/google-client-secret" \
  --value "GOCSPX-your-actual-secret-here" \
  --type "SecureString" \
  --overwrite
```

## 🔧 Microsoft OAuth Configuration (Outlook Integration)

### Step 1: Access Azure Portal

1. Go to [Azure Portal](https://portal.azure.com/)
2. Sign in with your Microsoft account
3. Navigate to **Azure Active Directory**

### Step 2: Register Application

1. Go to **App registrations** → **New registration**
2. Fill in the application details:

```
Name: Jeldi Email Overlay - Production
Supported account types: Accounts in any organizational directory (Any Azure AD directory - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)

Redirect URI:
Platform: Web
URI: https://overlay.jeldi.app/api/auth/microsoft/callback
```

### Step 3: Configure Application

After registration, you'll be taken to the app overview page:

1. **Note the Application (client) ID**: Format like `12345678-1234-1234-1234-123456789abc`

### Step 4: Create Client Secret

1. Go to **Certificates & secrets** → **Client secrets**
2. Click **New client secret**
3. Configure the secret:

```
Description: Jeldi Production Secret
Expires: 24 months (recommended for production)
```

4. **Important**: Copy the secret value immediately (it won't be shown again)

### Step 5: Configure API Permissions

1. Go to **API permissions** → **Add a permission**
2. Select **Microsoft Graph** → **Delegated permissions**
3. Add the following permissions:

```
Identity permissions:
☑ openid
☑ profile  
☑ email
☑ offline_access

User permissions:
☑ User.Read

Mail permissions (select based on your needs):
☑ Mail.Read (for reading emails)
☑ Mail.ReadWrite (for full email access)
☑ Mail.Send (for sending emails)
☑ Mail.ReadBasic (for basic email metadata)
```

4. Click **Add permissions**
5. **Important**: Click **Grant admin consent** (if you have admin privileges)

### Step 6: Configure Authentication

1. Go to **Authentication**
2. Verify the redirect URI is correctly set:
   ```
   https://overlay.jeldi.app/api/auth/microsoft/callback
   ```

3. **Advanced settings**:
   ```
   ☑ Access tokens (used for implicit flows)
   ☑ ID tokens (used for implicit and hybrid flows)
   ```

4. **Supported account types**: Ensure it's set to multitenant + personal accounts

### Step 7: Update AWS SSM Parameters

```bash
# Update Microsoft OAuth credentials in AWS SSM
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

## 🧪 Testing OAuth Configuration

### Test Google OAuth Flow

1. **Start OAuth flow**:
   ```bash
   curl -I https://overlay.jeldi.app/api/auth/google
   ```

2. **Test in browser**:
   - Navigate to `https://overlay.jeldi.app/api/auth/google`
   - Should redirect to Google login
   - After login, should redirect to `https://overlay.jeldi.app/api/auth/google/callback`

3. **Check logs**:
   ```bash
   # Monitor Lambda logs for OAuth flow
   aws logs tail "/aws/lambda/jeldi-backend-production-api" --follow
   ```

### Test Microsoft OAuth Flow

1. **Start OAuth flow**:
   ```bash
   curl -I https://overlay.jeldi.app/api/auth/microsoft
   ```

2. **Test in browser**:
   - Navigate to `https://overlay.jeldi.app/api/auth/microsoft`
   - Should redirect to Microsoft login
   - After login, should redirect to `https://overlay.jeldi.app/api/auth/microsoft/callback`

## 🔍 Troubleshooting OAuth Issues

### Common Google OAuth Errors

#### `redirect_uri_mismatch`

**Error**: "The redirect URI in the request does not match the ones authorized for the OAuth client."

**Solution**:
1. Verify the redirect URI in Google Console exactly matches:
   ```
   https://overlay.jeldi.app/api/auth/google/callback
   ```
2. Check for:
   - Trailing slashes
   - HTTP vs HTTPS
   - Subdomain differences
   - Typos

#### `access_denied`

**Error**: User denied access or app not approved

**Solution**:
1. Check OAuth consent screen configuration
2. Ensure app is published or user is added to test users
3. Review requested scopes (don't request unnecessary permissions)

#### `invalid_client`

**Error**: "The OAuth client was not found."

**Solution**:
1. Verify Google Client ID is correct in SSM parameters
2. Check that the OAuth client exists in Google Console
3. Ensure the client ID matches exactly

### Common Microsoft OAuth Errors

#### `invalid_request`

**Error**: "The request is missing a required parameter."

**Solution**:
1. Verify callback URL is correctly configured:
   ```
   https://overlay.jeldi.app/api/auth/microsoft/callback
   ```
2. Check that required scopes are properly configured

#### `unauthorized_client`

**Error**: "The client is not authorized to request an access token."

**Solution**:
1. Verify Microsoft Client ID and secret in SSM parameters
2. Check that API permissions are granted
3. Ensure "Grant admin consent" was clicked

#### `interaction_required`

**Error**: User interaction is required

**Solution**:
1. This is normal behavior - user needs to complete login
2. Ensure the consent screen is properly configured
3. Check that the app is not requesting admin-only permissions without proper consent

### Debug OAuth Flow

#### Enable Debug Logging

```bash
# Add debug logging to your OAuth service (temporary for debugging)
# In server/services/oauthService.ts, add console.log statements

# Monitor detailed Lambda logs
aws logs filter-log-events \
  --log-group-name "/aws/lambda/jeldi-backend-production-api" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --filter-pattern "OAuth"
```

#### Verify OAuth Provider Configuration

```bash
# Test OAuth providers endpoint
curl https://overlay.jeldi.app/api/auth/providers

# Should return JSON with configured providers:
# {"providers": [{"name": "google", "displayName": "Google"}, {"name": "microsoft", "displayName": "Microsoft"}]}
```

#### Check Parameter Loading

```bash
# Verify parameters are loaded correctly (check Lambda logs)
# Look for OAuth initialization messages in logs

aws logs filter-log-events \
  --log-group-name "/aws/lambda/jeldi-backend-production-api" \
  --start-time $(date -d '10 minutes ago' +%s)000 \
  --filter-pattern "OAuth.*callback"
```

## 📋 OAuth Configuration Checklist

### Google OAuth Setup ✅

- [ ] Google Cloud project created/selected
- [ ] Gmail API enabled
- [ ] OAuth consent screen configured
- [ ] OAuth 2.0 credentials created
- [ ] Authorized redirect URI set to `https://overlay.jeldi.app/api/auth/google/callback`
- [ ] Client ID and secret added to AWS SSM
- [ ] Required scopes configured (email, profile, gmail.readonly)
- [ ] Test users added (if app not published)

### Microsoft OAuth Setup ✅

- [ ] Azure AD app registration created
- [ ] Client secret created and noted
- [ ] Redirect URI set to `https://overlay.jeldi.app/api/auth/microsoft/callback`
- [ ] API permissions configured (User.Read, Mail.Read, etc.)
- [ ] Admin consent granted
- [ ] Client ID and secret added to AWS SSM
- [ ] Multitenant + personal accounts enabled

### Testing ✅

- [ ] Google OAuth flow completes successfully
- [ ] Microsoft OAuth flow completes successfully
- [ ] No errors in Lambda logs
- [ ] Users can authenticate and receive tokens
- [ ] Email permissions work correctly

## 🔒 Security Considerations

### OAuth Security Best Practices

1. **Use HTTPS only**
   - All OAuth URLs must use HTTPS
   - Never configure HTTP callbacks in production

2. **Principle of least privilege**
   - Only request necessary OAuth scopes
   - Gmail: Start with `gmail.readonly` unless you need write access
   - Microsoft: Start with basic `User.Read` and `Mail.Read`

3. **Secure credential storage**
   - Client secrets stored as SecureString in AWS SSM
   - No secrets in code or logs
   - Regular credential rotation

4. **Validate redirect URIs**
   - Exact match required for OAuth callback URLs
   - No wildcards in production redirect URIs

5. **Monitor OAuth usage**
   - Log OAuth flows for security monitoring
   - Set up alerts for failed OAuth attempts
   - Regular audit of OAuth app permissions

### Production Readiness

1. **Google OAuth**:
   - Submit app for verification if using sensitive scopes
   - Configure proper branding and privacy policy
   - Set up domain verification for jeldi.app

2. **Microsoft OAuth**:
   - Consider app certification for broader usage
   - Configure proper app metadata
   - Set up publisher domain verification

---

## 📞 Support Resources

- **Google OAuth Documentation**: https://developers.google.com/identity/protocols/oauth2
- **Microsoft OAuth Documentation**: https://docs.microsoft.com/en-us/azure/active-directory/develop/
- **OAuth 2.0 RFC**: https://tools.ietf.org/html/rfc6749
- **OpenID Connect**: https://openid.net/connect/