/**
 * Environment validation module for fail-fast startup behavior
 * Ensures critical environment variables are set before application starts
 * Includes multi-domain OAuth support and environment detection
 */

interface EnvironmentValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

interface RequiredEnvVar {
  name: string;
  description: string;
  example?: string;
}

interface OptionalEnvVar extends RequiredEnvVar {
  impact: string;
}

interface EnvironmentInfo {
  platform: 'replit' | 'aws' | 'local' | 'other';
  isProduction: boolean;
  isDevelopment: boolean;
  domain?: string;
  allowedOrigins: string[];
}

interface DomainValidationResult {
  isSecure: boolean;
  isAllowed: boolean;
  errors: string[];
}

const REQUIRED_ENV_VARS: RequiredEnvVar[] = [
  {
    name: 'JWT_SECRET',
    description: 'Secret key for signing JWT tokens (minimum 32 characters)',
    example: 'openssl rand -base64 64'
  },
  {
    name: 'DATABASE_URL',
    description: 'PostgreSQL connection string (Neon or any Postgres)',
    example: 'postgresql://user:password@host/db?sslmode=require'
  },
  {
    name: 'TOKEN_ENCRYPTION_KEY',
    description: '32-byte encryption key for securing OAuth tokens and sensitive data',
    example: 'openssl rand -hex 32'
  }
];

// Common insecure placeholder patterns that should be rejected
const INSECURE_PLACEHOLDER_PATTERNS = [
  /your-.*-secret/i,
  /your-.*-key/i,
  /change-me/i,
  /replace-this/i,
  /example-secret/i,
  /test-secret/i,
  /demo-key/i,
  /placeholder/i,
  /super-secure.*here/i,
  /put-your.*here/i,
  /^secret$/i,
  /^password$/i,
  /^key$/i,
  /^token$/i
];

const OPTIONAL_ENV_VARS: OptionalEnvVar[] = [
  {
    name: 'OPENAI_API_KEY',
    description: 'OpenAI API key',
    impact: 'AI assistant and insight endpoints will fail'
  },
  {
    name: 'DEMO_MODE',
    description: "Set to 'true' on the demo deployment to seed demo users/data and enable /api/auth/demo-login",
    impact: 'Demo login and demo data are disabled'
  },
  {
    name: 'DEMO_USER_PASSWORD',
    description: 'Password for the seeded demo accounts (random per process if unset)',
    impact: 'Demo accounts cannot be used with the normal login form'
  },
  {
    name: 'GOOGLE_CLIENT_ID',
    description: 'Google OAuth client ID',
    impact: 'Google OAuth login will be unavailable'
  },
  {
    name: 'GOOGLE_CLIENT_SECRET',
    description: 'Google OAuth client secret',
    impact: 'Google OAuth login will be unavailable'
  },
  {
    name: 'MICROSOFT_CLIENT_ID',
    description: 'Microsoft OAuth client ID',
    impact: 'Microsoft OAuth login will be unavailable'
  },
  {
    name: 'MICROSOFT_CLIENT_SECRET',
    description: 'Microsoft OAuth client secret',
    impact: 'Microsoft OAuth login will be unavailable'
  },
  {
    name: 'AWS_DOMAIN',
    description: 'AWS production domain for OAuth callbacks (e.g., https://your-domain.com)',
    impact: 'Production OAuth callbacks will use development URLs'
  },
  {
    name: 'AWS_GOOGLE_CALLBACK_URL',
    description: 'Explicit AWS Google OAuth callback URL override',
    impact: 'Google OAuth will use default AWS domain-based callback URL'
  },
  {
    name: 'ALLOWED_DOMAINS',
    description: 'Comma-separated list of allowed domains for OAuth callbacks and CORS (e.g., https://app1.com,https://app2.com)',
    impact: 'Only default domains will be allowed for OAuth callbacks'
  },
  {
    name: 'FRONTEND_URL',
    description: 'Frontend application URL for development/staging environments',
    impact: 'Development callbacks may not work properly'
  },
  {
    name: 'EMAIL_OAUTH_REDIRECT_URI',
    description: 'Explicit email OAuth redirect URI override',
    impact: 'Email OAuth will use environment-based callback URLs'
  },
  {
    name: 'NODE_ENV',
    description: 'Node environment (development, staging, production)',
    impact: 'Environment detection may be inaccurate'
  }
];

/**
 * Validate that a secret meets security requirements
 */
function validateSecretSecurity(name: string, value: string, isProduction: boolean): string[] {
  const errors: string[] = [];
  
  // Check minimum length (32 characters for production, 16 for development)
  const minLength = isProduction ? 32 : 16;
  if (value.length < minLength) {
    errors.push(`${name} must be at least ${minLength} characters long (current: ${value.length})`);
  }
  
  // Check for insecure placeholder patterns
  for (const pattern of INSECURE_PLACEHOLDER_PATTERNS) {
    if (pattern.test(value)) {
      errors.push(`${name} appears to be a placeholder value and must be changed to a secure secret`);
      break; // Only show one placeholder error per secret
    }
  }
  
  // Additional production-specific checks
  if (isProduction) {
    // Check for repeated characters (like "aaaaaaaaaaaaaaaaa...")
    if (/^(.)\1{15,}$/.test(value)) {
      errors.push(`${name} contains repeated characters and is not secure`);
    }
    
    // Check for simple patterns
    if (/^(123|abc|password|secret|key|token)/i.test(value)) {
      errors.push(`${name} starts with a common insecure pattern`);
    }
  }
  
  return errors;
}

export function validateEnvironment(): EnvironmentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  // Check required environment variables
  for (const envVar of REQUIRED_ENV_VARS) {
    const value = process.env[envVar.name];
    if (!value || value.trim() === '') {
      errors.push(`Missing required environment variable: ${envVar.name}`);
      errors.push(`  Description: ${envVar.description}`);
      if (envVar.example) {
        errors.push(`  Example: ${envVar.example}`);
      }
    } else {
      // Validate secret security for JWT and session secrets
      if (['JWT_SECRET', 'SESSION_SECRET', 'TOKEN_ENCRYPTION_KEY'].includes(envVar.name)) {
        const secretErrors = validateSecretSecurity(envVar.name, value, isProduction);
        errors.push(...secretErrors.map(error => `  Security validation failed: ${error}`));
      }
    }
  }

  // Check optional environment variables and warn about missing ones
  for (const envVar of OPTIONAL_ENV_VARS) {
    const value = process.env[envVar.name];
    if (!value || value.trim() === '') {
      warnings.push(`Optional environment variable not set: ${envVar.name}`);
      warnings.push(`  Impact: ${envVar.impact}`);
    }
  }

  // Production-specific validations
  if (isProduction) {
    // Ensure DATABASE_URL doesn't contain default credentials
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl && (dbUrl.includes('user:password') || dbUrl.includes('username:password'))) {
      errors.push('DATABASE_URL contains placeholder credentials and must be configured with real values');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

export function enforceEnvironmentValidation(): void {
  const result = validateEnvironment();
  
  if (!result.isValid) {
    console.error('\n❌ CRITICAL: Application startup failed due to missing required environment variables:\n');
    result.errors.forEach(error => console.error(`  ${error}`));
    console.error('\nApplication cannot start without these variables. Please set them and restart.\n');
    process.exit(1);
  }

  if (result.warnings.length > 0) {
    console.warn('\n⚠️  WARNING: Some optional environment variables are not set:\n');
    result.warnings.forEach(warning => console.warn(`  ${warning}`));
    console.warn('\n');
  }
}

/**
 * Get JWT secret with guaranteed non-null return
 * This function assumes environment has been validated
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set. This should have been caught during startup validation.');
  }
  return secret;
}

/**
 * Get token encryption key with guaranteed non-null return
 * This function assumes environment has been validated
 */
export function getTokenEncryptionKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('TOKEN_ENCRYPTION_KEY environment variable is not set. This should have been caught during startup validation.');
  }
  return key;
}

/**
 * Detect the current runtime environment and platform
 */
export function detectEnvironment(): EnvironmentInfo {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const isDevelopment = nodeEnv === 'development';
  
  // Detect platform based on environment variables and host
  let platform: 'replit' | 'aws' | 'local' | 'other' = 'other';
  let domain: string | undefined;
  
  // Check for Replit environment
  if (process.env.REPLIT_DB_URL || process.env.REPL_SLUG || process.env.REPL_OWNER) {
    platform = 'replit';
    // Replit domain is typically available in REPL_SLUG and REPL_OWNER
    if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
      domain = `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
    }
  }
  // Check for AWS environment
  else if (process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_REGION || process.env.AWS_DOMAIN) {
    platform = 'aws';
    domain = process.env.AWS_DOMAIN;
  }
  // Check for local development
  else if (isDevelopment || process.env.FRONTEND_URL?.includes('localhost')) {
    platform = 'local';
    domain = process.env.FRONTEND_URL || 'http://localhost:5000';
  }
  
  // Build allowed origins based on environment
  const allowedOrigins = getAllowedOrigins({ platform, isProduction, isDevelopment, domain, allowedOrigins: [] });
  
  console.log(`Environment detected: ${platform} (${nodeEnv}), domain: ${domain || 'none'}`);
  
  return {
    platform,
    isProduction,
    isDevelopment,
    domain,
    allowedOrigins
  };
}

/**
 * Get allowed origins for CORS and OAuth based on environment
 */
export function getAllowedOrigins(envInfo?: EnvironmentInfo): string[] {
  const env = envInfo || detectEnvironment();
  const origins: string[] = [];
  
  // Add explicit allowed domains from environment
  const allowedDomains = process.env.ALLOWED_DOMAINS;
  if (allowedDomains) {
    origins.push(...allowedDomains.split(',').map(d => d.trim()).filter(Boolean));
  }
  
  // Add platform-specific defaults
  switch (env.platform) {
    case 'replit':
      // Add Replit-specific domains
      if (env.domain) origins.push(env.domain);
      origins.push('*.replit.dev', '*.replit.app', '*.repl.co');
      if (env.isDevelopment) {
        origins.push('http://localhost:5000', 'http://127.0.0.1:5000');
      }
      break;
      
    case 'aws':
      // Add AWS-specific domains
      if (env.domain) origins.push(env.domain);
      // Add any CloudFront or API Gateway domains from environment
      const awsDomains = ['https://d2k9wjgsy12ugk.cloudfront.net', 'https://demo.jeldi.app', 'https://overlay.jeldi.app'];
      origins.push(...awsDomains);
      break;
      
    case 'local':
      // Add local development domains
      origins.push('http://localhost:5000', 'http://127.0.0.1:5000', 'http://localhost:3000');
      if (env.domain) origins.push(env.domain);
      break;
      
    default:
      // Generic fallback
      if (env.domain) origins.push(env.domain);
      if (env.isDevelopment) {
        origins.push('http://localhost:5000', 'http://127.0.0.1:5000');
      }
  }
  
  // Add frontend URL if specified
  const frontendUrl = process.env.FRONTEND_URL;
  if (frontendUrl && !origins.includes(frontendUrl)) {
    origins.push(frontendUrl);
  }
  
  // Remove duplicates and empty values
  return [...new Set(origins.filter(Boolean))];
}

/**
 * Validate that a domain is secure (HTTPS) in production and allowed
 */
export function validateDomainSecurity(domain: string, isProduction?: boolean): DomainValidationResult {
  const errors: string[] = [];
  let isSecure = true;
  let isAllowed = false;
  
  // Auto-detect environment if not provided
  const env = isProduction !== undefined ? { isProduction } : detectEnvironment();
  const actualIsProduction = isProduction !== undefined ? isProduction : env.isProduction;
  
  if (actualIsProduction && !domain.startsWith('https://')) {
    errors.push(`Domain '${domain}' must use HTTPS in production environment`);
    isSecure = false;
  }
  
  // Additional validation
  if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
    errors.push(`Domain '${domain}' must include protocol (http:// or https://)`);
    isSecure = false;
  }
  
  // Check against allowed origins
  const allowedOrigins = getAllowedOrigins();
  
  // Check exact match first
  if (allowedOrigins.includes(domain)) {
    isAllowed = true;
  } else {
    // Check wildcard patterns
    for (const allowedOrigin of allowedOrigins) {
      if (allowedOrigin.includes('*')) {
        const pattern = allowedOrigin.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
        const regex = new RegExp(`^${pattern}$`);
        if (regex.test(domain)) {
          isAllowed = true;
          break;
        }
      }
    }
  }
  
  if (!isAllowed) {
    errors.push(`Domain '${domain}' is not in the allowed origins list`);
  }
  
  return {
    isSecure,
    isAllowed,
    errors
  };
}

/**
 * Validate that callback URLs are secure and allowed
 */
export function validateOAuthCallbacks(): EnvironmentValidationResult {
  const env = detectEnvironment();
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check AWS domain security
  const awsDomain = process.env.AWS_DOMAIN;
  if (awsDomain) {
    const domainValidation = validateDomainSecurity(awsDomain, env.isProduction);
    errors.push(...domainValidation.errors);
  }
  
  // Check explicit callback URLs
  const explicitCallbacks = [
    process.env.AWS_GOOGLE_CALLBACK_URL,
    process.env.EMAIL_OAUTH_REDIRECT_URI
  ].filter(Boolean);
  
  for (const callback of explicitCallbacks) {
    if (callback) {
      const domainValidation = validateDomainSecurity(callback, env.isProduction);
      errors.push(...domainValidation.errors);
    }
  }
  
  // Warn about missing domains in production
  if (env.isProduction && !awsDomain && !process.env.ALLOWED_DOMAINS) {
    warnings.push('No production domains configured. OAuth callbacks may not work properly.');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get secure callback URL for OAuth providers with logging
 */
export function getSecureCallbackURL(provider: string, defaultPath: string): string {
  const env = detectEnvironment();
  
  // Priority order with logging:
  // 1. Explicit provider-specific callback URL
  // 2. AWS domain + default path  
  // 3. Environment domain + default path
  // 4. Frontend URL + default path
  // 5. Default relative path
  
  let callbackURL: string;
  let source: string;
  
  // Check for explicit provider-specific callback
  const explicitCallback = process.env[`${provider.toUpperCase()}_CALLBACK_URL`] || 
                          (provider === 'google' ? process.env.AWS_GOOGLE_CALLBACK_URL : undefined);
  
  if (explicitCallback) {
    callbackURL = explicitCallback;
    source = `explicit ${provider.toUpperCase()}_CALLBACK_URL`;
  }
  // Check AWS domain
  else if (process.env.AWS_DOMAIN) {
    callbackURL = `${process.env.AWS_DOMAIN.replace(/\/+$/, '')}${defaultPath}`;
    source = 'AWS_DOMAIN + default path';
  }
  // Check environment domain
  else if (env.domain) {
    callbackURL = `${env.domain.replace(/\/+$/, '')}${defaultPath}`;
    source = 'detected environment domain + default path';
  }
  // Check frontend URL
  else if (process.env.FRONTEND_URL) {
    callbackURL = `${process.env.FRONTEND_URL.replace(/\/+$/, '')}${defaultPath}`;
    source = 'FRONTEND_URL + default path';
  }
  // Fallback to relative path
  else {
    callbackURL = defaultPath;
    source = 'default relative path';
  }
  
  // Validate callback URL security
  const validation = validateDomainSecurity(callbackURL, env.isProduction);
  if (!validation.isSecure) {
    console.warn(`⚠️  OAuth callback URL security warning for ${provider}:`, validation.errors.join(', '));
  }
  
  console.log(`OAuth callback URL for ${provider}: ${callbackURL} (source: ${source})`);
  
  return callbackURL;
}