#!/usr/bin/env node

/**
 * Security Test Runner
 * Easy way to run comprehensive security verification tests
 */

const { runSecurityVerificationTests } = require('./security-verification.test.js');

console.log('🔒 ERP Connect Pro - Security Verification Suite');
console.log('===============================================');

// Check if server is running
const fetch = require('node-fetch');

async function checkServerHealth() {
  try {
    const response = await fetch('http://localhost:5000/api/health');
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function main() {
  console.log('🏥 Checking server health...');
  
  const isServerRunning = await checkServerHealth();
  if (!isServerRunning) {
    console.log('❌ Server is not running on http://localhost:5000');
    console.log('Please start the server with: npm run dev');
    process.exit(1);
  }
  
  console.log('✅ Server is running');
  console.log('\n🚀 Starting security verification tests...\n');
  
  try {
    const allTestsPassed = await runSecurityVerificationTests();
    
    if (allTestsPassed) {
      console.log('\n🎉 SECURITY VERIFICATION COMPLETE - PRODUCTION READY! 🎉');
      console.log('All security controls are properly implemented and verified.');
      process.exit(0);
    } else {
      console.log('\n⚠️ SECURITY VERIFICATION FAILED');
      console.log('Some security controls need attention before production deployment.');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Security verification failed with error:', error.message);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  console.log('\n👋 Security test interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Security test terminated');
  process.exit(0);
});

// Run if this is the main module
if (require.main === module) {
  main();
}

module.exports = { main };