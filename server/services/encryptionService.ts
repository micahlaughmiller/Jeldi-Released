import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;

class EncryptionService {
  private encryptionKey: Buffer;

  constructor() {
    const key = process.env.ENCRYPTION_KEY;
    
    if (!key) {
      // Generate a secure key if not provided (for development)
      const generatedKey = crypto.randomBytes(32).toString('hex');
      console.warn('⚠️  WARNING: ENCRYPTION_KEY not set in environment. Generated temporary key.');
      console.warn('   Please set ENCRYPTION_KEY in production: ' + generatedKey);
      this.encryptionKey = Buffer.from(generatedKey, 'hex');
    } else {
      // Ensure key is 32 bytes for AES-256
      if (key.length === 64) {
        // Hex string
        this.encryptionKey = Buffer.from(key, 'hex');
      } else {
        // Hash the key to ensure it's exactly 32 bytes
        this.encryptionKey = crypto.createHash('sha256').update(key).digest();
      }
    }
  }

  /**
   * Encrypts plaintext using AES-256-GCM
   * Returns base64 encoded string with format: iv:authTag:encryptedData
   */
  encrypt(plaintext: string): string {
    try {
      if (!plaintext) {
        return '';
      }

      // Generate random IV for each encryption
      const iv = crypto.randomBytes(IV_LENGTH);
      
      // Create cipher
      const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);
      
      // Encrypt data
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      
      // Get authentication tag
      const authTag = cipher.getAuthTag();
      
      // Combine iv, authTag, and encrypted data
      const combined = `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
      
      return combined;
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypts ciphertext encrypted with AES-256-GCM
   * Expects base64 encoded string with format: iv:authTag:encryptedData
   */
  decrypt(ciphertext: string): string {
    try {
      if (!ciphertext) {
        return '';
      }

      // Split the combined string
      const parts = ciphertext.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid ciphertext format');
      }

      const [ivBase64, authTagBase64, encryptedData] = parts;
      
      // Convert from base64
      const iv = Buffer.from(ivBase64, 'base64');
      const authTag = Buffer.from(authTagBase64, 'base64');
      
      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);
      
      // Decrypt data
      let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Encrypts an object by encrypting each value
   */
  encryptObject(obj: Record<string, any>): Record<string, string> {
    const encrypted: Record<string, string> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined) {
        encrypted[key] = this.encrypt(String(value));
      }
    }
    return encrypted;
  }

  /**
   * Decrypts an object by decrypting each value
   */
  decryptObject(obj: Record<string, string>): Record<string, string> {
    const decrypted: Record<string, string> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value) {
        try {
          decrypted[key] = this.decrypt(value);
        } catch (error) {
          console.error(`Failed to decrypt field ${key}:`, error);
          decrypted[key] = '';
        }
      }
    }
    return decrypted;
  }
}

export const encryptionService = new EncryptionService();
