# Email Security Setup Guide

## Environment Variables Required

Create a `.env` file with the following secure environment variables:

```bash
# JWT Configuration
JWT_SECRET=your_super_secure_jwt_secret_here_minimum_32_chars

# Token Encryption (for storing OAuth tokens securely)
TOKEN_ENCRYPTION_KEY=your_32_byte_encryption_key_here

# OAuth Configuration for Gmail
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
GMAIL_CLIENT_ID=your_gmail_specific_client_id  # Optional fallback

# OAuth Configuration for Outlook/Microsoft
MICROSOFT_CLIENT_ID=your_microsoft_oauth_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_oauth_client_secret
OUTLOOK_CLIENT_ID=your_outlook_specific_client_id  # Optional fallback

# OAuth Redirect URIs
EMAIL_OAUTH_REDIRECT_URI=https://yourdomain.com/api/email/callback
GOOGLE_CALLBACK_URL=/api/auth/google/callback
MICROSOFT_CALLBACK_URL=/api/auth/microsoft/callback

# Frontend URL for redirects
FRONTEND_URL=https://yourdomain.com
```

## OAuth Provider Setup

### Gmail/Google OAuth Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing project
3. Enable Gmail API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs:
   - `https://yourdomain.com/api/email/callback`
   - `http://localhost:5000/api/email/callback` (for development)
6. Set scopes: `gmail.send`, `gmail.readonly`

### Outlook/Microsoft OAuth Setup
1. Go to [Azure App Registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Create a new app registration
3. Add platform configuration for web app
4. Add redirect URIs:
   - `https://yourdomain.com/api/email/callback`
   - `http://localhost:5000/api/email/callback` (for development)
5. Set API permissions: `Mail.Send`, `Mail.Read`
6. Grant admin consent for permissions

## Security Features Implemented

### 1. OAuth Security
- ✅ Cryptographically secure state generation using `crypto.randomBytes(32)`
- ✅ PKCE (Proof Key for Code Exchange) implementation
- ✅ Redirect URI validation with allowlists
- ✅ Session-based OAuth state management with 10-minute expiry

### 2. Token Security
- ✅ AES-256-CBC encryption for all stored tokens
- ✅ Automatic token refresh for expired access tokens
- ✅ Secure token storage in database with encryption at rest
- ✅ Token scope validation and management

### 3. API Security
- ✅ Input validation for all email endpoints
- ✅ Email address format validation using regex
- ✅ Rate limiting: 10 emails per minute per user, 3 OAuth attempts per 5 minutes
- ✅ CSRF protection via secure state parameters
- ✅ Audit logging for OAuth attempts and email operations

### 4. Template Security
- ✅ Variable whitelisting to prevent template injection
- ✅ HTML entity escaping for all template variables
- ✅ Server-side template rendering only

### 5. SMTP Security
- ✅ Encrypted credential storage for SMTP configurations
- ✅ TLS/SSL support for SMTP connections
- ✅ Credential validation before storage

## API Endpoints

### Email Provider Connection
```
POST /api/email/connect/:provider
```
- Supports: `gmail`, `outlook`, `smtp`
- Rate limited: 3 attempts per 5 minutes per provider
- For SMTP: requires `host`, `port`, `username`, `password` in request body

### Email Sending
```
POST /api/email/send
```
- Rate limited: 10 emails per minute per user
- Supports templates with secure variable substitution
- Email address validation for to/cc/bcc fields
- Automatic token refresh for expired OAuth tokens

### Email Status Check
```
GET /api/email/status
```
- Returns connection status for all configured providers
- Shows connected email addresses (OAuth providers only)

## Database Schema Updates

The email_configurations table now includes:
- `scopes`: Array of OAuth scopes granted
- `lastUsed`: Timestamp tracking
- `updatedAt`: Automatic update timestamp
- Encrypted `accessToken` and `refreshToken` fields

## Production Deployment Checklist

- [ ] Generate strong JWT_SECRET (32+ characters)
- [ ] Generate secure TOKEN_ENCRYPTION_KEY (32 bytes)
- [ ] Set up OAuth applications with production redirect URIs
- [ ] Configure environment variables in production
- [ ] Enable HTTPS for all OAuth redirects
- [ ] Set up proper log aggregation for audit logs
- [ ] Configure Redis for distributed rate limiting (optional)
- [ ] Set up monitoring for token refresh failures
- [ ] Test OAuth flows in production environment
- [ ] Verify email sending works for all providers

## Security Considerations

1. **Token Encryption**: All OAuth tokens are encrypted using AES-256-CBC before storage
2. **State Protection**: OAuth state parameters use cryptographically secure random generation
3. **PKCE Implementation**: Code verifiers are generated and validated for enhanced security
4. **Rate Limiting**: Multiple layers of rate limiting prevent abuse
5. **Input Validation**: All user inputs are validated and sanitized
6. **Redirect URI Validation**: Only allowlisted URIs are permitted for OAuth redirects
7. **Template Safety**: Template variables are whitelisted and HTML-escaped

## Troubleshooting

### Common Issues
1. **OAuth redirect URI mismatch**: Ensure redirect URIs in OAuth providers match your environment
2. **Token decryption errors**: Check TOKEN_ENCRYPTION_KEY is set correctly
3. **Rate limiting**: Wait for rate limit windows to reset
4. **SMTP connection failures**: Verify host, port, and credentials are correct

### Debug Mode
Set `NODE_ENV=development` to enable additional OAuth and email debug logging.