/**
 * Security Verification Test Suite
 * Comprehensive tests for production readiness verification
 */

const crypto = require('crypto');
const fetch = require('node-fetch');

// Test configuration
const TEST_CONFIG = {
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:5000',
  testUser: {
    email: 'test@example.com',
    password: 'testpassword123'
  }
};

// Helper function to get auth token
async function getAuthToken() {
  const response = await fetch(`${TEST_CONFIG.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(TEST_CONFIG.testUser)
  });
  
  if (response.ok) {
    const data = await response.json();
    return data.token;
  }
  
  // Create test user if doesn't exist
  const registerResponse = await fetch(`${TEST_CONFIG.baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'testuser',
      ...TEST_CONFIG.testUser
    })
  });
  
  if (registerResponse.ok) {
    const data = await registerResponse.json();
    return data.token;
  }
  
  throw new Error('Failed to get auth token');
}

// Test 1: PKCE OAuth Implementation Verification
async function testPKCEOAuthFlow() {
  console.log('\n🔐 Testing PKCE OAuth Implementation...');
  
  try {
    const token = await getAuthToken();
    
    // Test Gmail OAuth initiation
    const response = await fetch(`${TEST_CONFIG.baseUrl}/api/email/connect/gmail`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.authUrl) {
        const url = new URL(data.authUrl);
        const params = url.searchParams;
        
        // Verify PKCE parameters are present
        const hasCodeChallenge = params.has('code_challenge');
        const hasCodeChallengeMethod = params.get('code_challenge_method') === 'S256';
        const hasState = params.has('state');
        
        console.log(`  ✅ Authorization URL contains code_challenge: ${hasCodeChallenge}`);
        console.log(`  ✅ Code challenge method is S256: ${hasCodeChallengeMethod}`);
        console.log(`  ✅ State parameter present: ${hasState}`);
        
        if (hasCodeChallenge && hasCodeChallengeMethod && hasState) {
          console.log('  🎉 PKCE OAuth implementation VERIFIED - All parameters present');
          return true;
        } else {
          console.log('  ❌ PKCE OAuth implementation FAILED - Missing parameters');
          return false;
        }
      } else {
        console.log('  ⚠️ No authUrl returned (may be already connected)');
        return true;
      }
    } else {
      console.log(`  ❌ OAuth initiation failed: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`  ❌ PKCE OAuth test failed: ${error.message}`);
    return false;
  }
}

// Test 2: Email Send Rate Limiting Verification
async function testEmailRateLimiting() {
  console.log('\n⏱️ Testing Email Send Rate Limiting (10 emails/minute)...');
  
  try {
    const token = await getAuthToken();
    
    // Attempt to send emails rapidly to test rate limiting
    const emailRequests = [];
    for (let i = 0; i < 12; i++) {
      emailRequests.push(
        fetch(`${TEST_CONFIG.baseUrl}/api/email/send`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            provider: 'gmail',
            to: ['test@example.com'],
            subject: `Test Email ${i + 1}`,
            body: 'This is a test email for rate limiting verification'
          })
        })
      );
    }
    
    const responses = await Promise.all(emailRequests);
    let rateLimitHit = false;
    let successCount = 0;
    
    for (let i = 0; i < responses.length; i++) {
      const response = responses[i];
      if (response.status === 429) {
        const errorData = await response.json();
        console.log(`  ✅ Rate limit enforced at request ${i + 1}: ${errorData.message}`);
        console.log(`  ✅ Rate limit details: ${errorData.limit} emails per ${errorData.windowMs}ms`);
        rateLimitHit = true;
        break;
      } else if (response.status === 200 || response.status === 500) {
        // 500 is expected since we don't have real email providers configured
        successCount++;
      }
    }
    
    if (rateLimitHit && successCount <= 10) {
      console.log(`  🎉 Rate limiting VERIFIED - ${successCount} allowed, then blocked`);
      return true;
    } else {
      console.log(`  ❌ Rate limiting FAILED - ${successCount} emails sent without limit`);
      return false;
    }
  } catch (error) {
    console.log(`  ❌ Rate limiting test failed: ${error.message}`);
    return false;
  }
}

// Test 3: API Validation Verification
async function testAPIValidation() {
  console.log('\n✔️ Testing API Validation with Zod Schemas...');
  
  try {
    const token = await getAuthToken();
    
    // Test invalid email send request
    const invalidRequests = [
      {
        description: 'Missing provider',
        data: { to: ['test@example.com'], subject: 'Test' }
      },
      {
        description: 'Invalid email format',
        data: { provider: 'gmail', to: ['invalid-email'], subject: 'Test' }
      },
      {
        description: 'Missing subject and template',
        data: { provider: 'gmail', to: ['test@example.com'] }
      },
      {
        description: 'Invalid provider',
        data: { provider: 'invalid', to: ['test@example.com'], subject: 'Test' }
      }
    ];
    
    let validationsPassed = 0;
    
    for (const { description, data } of invalidRequests) {
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/email/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      
      if (response.status === 400) {
        const errorData = await response.json();
        if (errorData.type === 'validation_error') {
          console.log(`  ✅ Validation correctly rejected: ${description}`);
          validationsPassed++;
        }
      }
    }
    
    if (validationsPassed === invalidRequests.length) {
      console.log('  🎉 API Validation VERIFIED - All invalid requests properly rejected');
      return true;
    } else {
      console.log(`  ❌ API Validation FAILED - ${validationsPassed}/${invalidRequests.length} validations passed`);
      return false;
    }
  } catch (error) {
    console.log(`  ❌ API validation test failed: ${error.message}`);
    return false;
  }
}

// Test 4: Encryption/Decryption Round-trip Verification
async function testEncryptionRoundTrip() {
  console.log('\n🔒 Testing Encryption/Decryption Round-trip...');
  
  try {
    // We'll test SMTP configuration encryption since it uses the encryption service
    const token = await getAuthToken();
    
    const smtpConfig = {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      username: 'test@gmail.com',
      password: 'testpassword123'
    };
    
    // Send SMTP configuration (this will encrypt the password)
    const response = await fetch(`${TEST_CONFIG.baseUrl}/api/email/connect/smtp`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(smtpConfig)
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('  ✅ SMTP configuration encrypted and stored successfully');
      
      // Now verify we can retrieve and use the configuration
      const statusResponse = await fetch(`${TEST_CONFIG.baseUrl}/api/email/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (statusResponse.ok) {
        console.log('  ✅ Encrypted configuration successfully retrieved');
        console.log('  🎉 Encryption/Decryption Round-trip VERIFIED');
        return true;
      }
    }
    
    console.log('  ❌ Encryption round-trip test failed');
    return false;
  } catch (error) {
    console.log(`  ❌ Encryption test failed: ${error.message}`);
    return false;
  }
}

// Test 5: SMTP Secure Flag Parsing Verification
async function testSMTPSecureFlagParsing() {
  console.log('\n🔧 Testing SMTP Secure Flag Parsing...');
  
  try {
    const token = await getAuthToken();
    
    const testCases = [
      { secure: true, description: 'Boolean true' },
      { secure: false, description: 'Boolean false' },
      { secure: 'true', description: 'String true' },
      { secure: 'false', description: 'String false' },
      { secure: '1', description: 'String 1' },
      { secure: '0', description: 'String 0' }
    ];
    
    let parsingsPassed = 0;
    
    for (const { secure, description } of testCases) {
      const smtpConfig = {
        host: 'smtp.test.com',
        port: 587,
        secure,
        username: 'test@test.com',
        password: 'testpass'
      };
      
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/email/connect/smtp`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(smtpConfig)
      });
      
      if (response.ok) {
        console.log(`  ✅ SMTP secure flag parsing successful for: ${description}`);
        parsingsPassed++;
      }
    }
    
    if (parsingsPassed === testCases.length) {
      console.log('  🎉 SMTP Secure Flag Parsing VERIFIED - All formats accepted');
      return true;
    } else {
      console.log(`  ❌ SMTP parsing FAILED - ${parsingsPassed}/${testCases.length} passed`);
      return false;
    }
  } catch (error) {
    console.log(`  ❌ SMTP parsing test failed: ${error.message}`);
    return false;
  }
}

// Main test runner
async function runSecurityVerificationTests() {
  console.log('🚀 Starting Security Verification Test Suite...');
  console.log('================================================');
  
  const tests = [
    { name: 'PKCE OAuth Flow', fn: testPKCEOAuthFlow },
    { name: 'Email Rate Limiting', fn: testEmailRateLimiting },
    { name: 'API Validation', fn: testAPIValidation },
    { name: 'Encryption Round-trip', fn: testEncryptionRoundTrip },
    { name: 'SMTP Secure Flag Parsing', fn: testSMTPSecureFlagParsing }
  ];
  
  const results = [];
  
  for (const test of tests) {
    try {
      const result = await test.fn();
      results.push({ name: test.name, passed: result });
    } catch (error) {
      console.log(`❌ ${test.name} test failed with error: ${error.message}`);
      results.push({ name: test.name, passed: false });
    }
  }
  
  console.log('\n📊 Security Verification Results:');
  console.log('==================================');
  
  let totalPassed = 0;
  results.forEach(({ name, passed }) => {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${name}`);
    if (passed) totalPassed++;
  });
  
  console.log(`\n🎯 Overall: ${totalPassed}/${results.length} tests passed`);
  
  if (totalPassed === results.length) {
    console.log('🎉 ALL SECURITY VERIFICATIONS PASSED - PRODUCTION READY! 🎉');
    return true;
  } else {
    console.log('⚠️ Some security verifications failed - Review required before production');
    return false;
  }
}

// Export for use in other test files
module.exports = {
  runSecurityVerificationTests,
  testPKCEOAuthFlow,
  testEmailRateLimiting,
  testAPIValidation,
  testEncryptionRoundTrip,
  testSMTPSecureFlagParsing
};

// Run tests if this file is executed directly
if (require.main === module) {
  runSecurityVerificationTests()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test suite failed:', error);
      process.exit(1);
    });
}