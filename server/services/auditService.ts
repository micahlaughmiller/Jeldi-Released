import { db } from "../db";
import { auditLogs, type InsertAuditLogs, type AuditLogs } from "@shared/schema";
import { desc, and, eq, gte, lte, sql } from "drizzle-orm";

interface LogActionParams {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
  status: 'success' | 'failure';
}

interface AuditLogFilters {
  userId?: string;
  action?: string;
  resource?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

class AuditService {
  /**
   * Log a security-relevant action
   */
  async logAction(params: LogActionParams): Promise<void> {
    try {
      const logEntry: InsertAuditLogs = {
        userId: params.userId,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        details: params.details ? JSON.parse(JSON.stringify(params.details)) : null,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        status: params.status,
      };

      await db.insert(auditLogs).values(logEntry);
    } catch (error) {
      console.error('Failed to log audit action:', error);
      // Don't throw - audit logging shouldn't break the main operation
    }
  }

  /**
   * Get audit logs with filters
   */
  async getAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLogs[]> {
    const conditions = [];

    if (filters.userId) {
      conditions.push(eq(auditLogs.userId, filters.userId));
    }

    if (filters.action) {
      conditions.push(eq(auditLogs.action, filters.action));
    }

    if (filters.resource) {
      conditions.push(eq(auditLogs.resource, filters.resource));
    }

    if (filters.startDate) {
      conditions.push(gte(auditLogs.timestamp, filters.startDate));
    }

    if (filters.endDate) {
      conditions.push(lte(auditLogs.timestamp, filters.endDate));
    }

    const limit = filters.limit || 100;

    const query = db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit);

    if (conditions.length > 0) {
      return await query.where(and(...conditions));
    }

    return await query;
  }

  /**
   * Get audit logs for a specific user's activity
   */
  async getUserActivity(userId: string, limit: number = 50): Promise<AuditLogs[]> {
    return this.getAuditLogs({ userId, limit });
  }

  /**
   * Get recent failed login attempts
   */
  async getFailedLoginAttempts(email?: string, limit: number = 20): Promise<AuditLogs[]> {
    const conditions = [
      eq(auditLogs.action, 'login'),
      eq(auditLogs.status, 'failure')
    ];

    if (email) {
      conditions.push(sql`${auditLogs.details}->>'email' = ${email}`);
    }

    return await db
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit);
  }

  /**
   * Get audit logs by resource type
   */
  async getResourceAuditLogs(resource: string, resourceId?: string, limit: number = 50): Promise<AuditLogs[]> {
    const conditions = [eq(auditLogs.resource, resource)];
    
    if (resourceId) {
      conditions.push(eq(auditLogs.resourceId, resourceId));
    }

    return await db
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit);
  }

  /**
   * Export audit logs as JSON
   */
  async exportAuditLogs(filters: AuditLogFilters = {}): Promise<string> {
    const logs = await this.getAuditLogs({ ...filters, limit: 10000 });
    return JSON.stringify(logs, null, 2);
  }

  /**
   * Export audit logs as CSV
   */
  async exportAuditLogsCSV(filters: AuditLogFilters = {}): Promise<string> {
    const logs = await this.getAuditLogs({ ...filters, limit: 10000 });
    
    if (logs.length === 0) {
      return 'No audit logs found';
    }

    const headers = ['Timestamp', 'User ID', 'Action', 'Resource', 'Resource ID', 'Status', 'IP Address', 'Details'];
    const rows = logs.map(log => [
      log.timestamp?.toISOString() || '',
      log.userId || '',
      log.action,
      log.resource,
      log.resourceId || '',
      log.status,
      log.ipAddress || '',
      JSON.stringify(log.details || {})
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  }
}

export const auditService = new AuditService();
