/**
 * Environment validation module for fail-fast startup behavior
 * Ensures critical environment variables are set before application starts
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

const REQUIRED_ENV_VARS: RequiredEnvVar[] = [
  {
    name: 'JWT_SECRET',
    description: 'Secret key for signing JWT tokens',
    example: 'openssl rand -base64 64'
  }
];

const OPTIONAL_ENV_VARS: OptionalEnvVar[] = [
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
  }
];

export function validateEnvironment(): EnvironmentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required environment variables
  for (const envVar of REQUIRED_ENV_VARS) {
    const value = process.env[envVar.name];
    if (!value || value.trim() === '') {
      errors.push(`Missing required environment variable: ${envVar.name}`);
      errors.push(`  Description: ${envVar.description}`);
      if (envVar.example) {
        errors.push(`  Example: ${envVar.example}`);
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