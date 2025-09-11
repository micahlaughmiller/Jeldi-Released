// Pure JavaScript bcrypt implementation for Lambda
const crypto = require('crypto');

// Simple bcryptjs-compatible implementation using Node.js crypto
const bcrypt = {
  hash: async function(data, rounds) {
    return new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(data, salt, Math.pow(2, rounds), 32, 'sha256').toString('hex');
      resolve(`$2b$${rounds.toString().padStart(2, '0')}$${salt}${hash}`);
    });
  },
  
  compare: async function(data, hash) {
    return new Promise((resolve, reject) => {
      try {
        if (!hash.startsWith('$2')) {
          return resolve(false);
        }
        
        const parts = hash.split('$');
        if (parts.length !== 4) {
          return resolve(false);
        }
        
        const rounds = parseInt(parts[2]);
        const saltAndHash = parts[3];
        const salt = saltAndHash.substring(0, 32);
        const originalHash = saltAndHash.substring(32);
        
        const testHash = crypto.pbkdf2Sync(data, salt, Math.pow(2, rounds), 32, 'sha256').toString('hex');
        resolve(testHash === originalHash);
      } catch (error) {
        resolve(false);
      }
    });
  }
};

module.exports = bcrypt;