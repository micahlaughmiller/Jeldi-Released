import { db } from "../db";
import { passwordHistory, loginAttempts, users, type InsertPasswordHistory, type InsertLoginAttempt } from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import bcrypt from "bcrypt";

interface PasswordPolicy {
  minLength: 12;
  requireUppercase: true;
  requireLowercase: true;
  requireNumbers: true;
  requireSpecialChars: true;
  preventReuse: 5; // Last 5 passwords
  maxAge: 90; // Days
  maxFailedAttempts: 5;
  lockoutDuration: 30; // Minutes
}

interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

class PasswordPolicyService {
  readonly policy: PasswordPolicy = {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    preventReuse: 5,
    maxAge: 90,
    maxFailedAttempts: 5,
    lockoutDuration: 30,
  };

  /**
   * Validate password against policy
   */
  validatePassword(password: string): PasswordValidationResult {
    const errors: string[] = [];

    if (password.length < this.policy.minLength) {
      errors.push(`Password must be at least ${this.policy.minLength} characters long`);
    }

    if (this.policy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (this.policy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (this.policy.requireNumbers && !/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (this.policy.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if password has been used recently
   */
  async checkPasswordHistory(userId: string, newPassword: string): Promise<boolean> {
    const history = await db
      .select()
      .from(passwordHistory)
      .where(eq(passwordHistory.userId, userId))
      .orderBy(desc(passwordHistory.createdAt))
      .limit(this.policy.preventReuse);

    for (const entry of history) {
      const isMatch = await bcrypt.compare(newPassword, entry.passwordHash);
      if (isMatch) {
        return false; // Password has been used recently
      }
    }

    return true; // Password is not in recent history
  }

  /**
   * Record password change in history
   */
  async recordPasswordChange(userId: string, passwordHash: string): Promise<void> {
    const entry: InsertPasswordHistory = {
      userId,
      passwordHash,
    };

    await db.insert(passwordHistory).values(entry);

    // Clean up old password history (keep only last N passwords + some extra for safety)
    const allHistory = await db
      .select()
      .from(passwordHistory)
      .where(eq(passwordHistory.userId, userId))
      .orderBy(desc(passwordHistory.createdAt));

    if (allHistory.length > this.policy.preventReuse + 5) {
      const entriesToDelete = allHistory.slice(this.policy.preventReuse + 5);
      for (const entry of entriesToDelete) {
        await db.delete(passwordHistory).where(eq(passwordHistory.id, entry.id));
      }
    }
  }

  /**
   * Record login attempt
   */
  async recordLoginAttempt(email: string, success: boolean, ipAddress?: string, userId?: string): Promise<void> {
    const attempt: InsertLoginAttempt = {
      userId,
      email,
      success,
      ipAddress,
    };

    await db.insert(loginAttempts).values(attempt);
  }

  /**
   * Check if account is locked out due to failed attempts
   */
  async checkAccountLockout(email: string): Promise<boolean> {
    const lockoutThreshold = new Date(Date.now() - this.policy.lockoutDuration * 60 * 1000);

    const recentAttempts = await db
      .select()
      .from(loginAttempts)
      .where(and(
        eq(loginAttempts.email, email),
        gte(loginAttempts.timestamp, lockoutThreshold)
      ))
      .orderBy(desc(loginAttempts.timestamp));

    const failedAttempts = recentAttempts.filter(a => !a.success);

    if (failedAttempts.length >= this.policy.maxFailedAttempts) {
      // Check if there's a successful login after the failed attempts
      const lastSuccessful = recentAttempts.find(a => a.success);
      if (!lastSuccessful || failedAttempts[0].timestamp! > lastSuccessful.timestamp!) {
        return true; // Account is locked
      }
    }

    return false;
  }

  /**
   * Get failed login attempts count for an email
   */
  async getFailedAttemptsCount(email: string): Promise<number> {
    const lockoutThreshold = new Date(Date.now() - this.policy.lockoutDuration * 60 * 1000);

    const recentAttempts = await db
      .select()
      .from(loginAttempts)
      .where(and(
        eq(loginAttempts.email, email),
        eq(loginAttempts.success, false),
        gte(loginAttempts.timestamp, lockoutThreshold)
      ));

    return recentAttempts.length;
  }

  /**
   * Clear login attempts for an email (after successful login)
   */
  async clearLoginAttempts(email: string): Promise<void> {
    // Record successful login attempt
    await this.recordLoginAttempt(email, true);
  }

  /**
   * Get password policy configuration
   */
  getPolicy(): PasswordPolicy {
    return { ...this.policy };
  }

  /**
   * Calculate password strength score
   */
  calculatePasswordStrength(password: string): { score: number; strength: string } {
    let score = 0;

    // Length score
    if (password.length >= 12) score += 2;
    else if (password.length >= 8) score += 1;

    // Character variety
    if (/[a-z]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 1;

    // Extra length bonus
    if (password.length >= 16) score += 1;
    if (password.length >= 20) score += 1;

    // Determine strength
    let strength = 'weak';
    if (score >= 7) strength = 'very strong';
    else if (score >= 5) strength = 'strong';
    else if (score >= 3) strength = 'medium';

    return { score, strength };
  }
}

export const passwordPolicyService = new PasswordPolicyService();
