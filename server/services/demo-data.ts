import { db } from "../db";
import { users, erpConnections, kpiConfigurations, dashboardKpiPreferences } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

/**
 * Demo Data Generation Service
 * 
 * This service populates realistic sample data for demo.jeldi.app ONLY.
 * overlay.jeldi.app runs in production mode with NO dummy data.
 * 
 * Environment detection:
 * - demo.jeldi.app: Auto-populate demo users, ERP connections, sample KPIs
 * - overlay.jeldi.app: Production mode, no dummy data
 * - Development/Replit: No automatic dummy data (manual testing)
 */

export const DEMO_USERS = [
  {
    email: "cfo@demo.jeldi.app",
    password: "DemoPassword123!",
    name: "Sarah CFO",
    role: "cfo" as const,
  },
  {
    email: "coo@demo.jeldi.app",
    password: "DemoPassword123!",
    name: "James COO",
    role: "coo" as const,
  },
  {
    email: "admin@demo.jeldi.app",
    password: "DemoPassword123!",
    name: "Admin User",
    role: "admin" as const,
  },
];

export const DEMO_ERP_SYSTEMS = [
  {
    name: "SAP S/4HANA",
    type: "sap" as const,
    status: "active" as const,
    config: {
      apiUrl: "https://demo-sap.jeldi.app/api",
      clientId: "demo-sap-client",
    },
  },
  {
    name: "NetSuite",
    type: "netsuite" as const,
    status: "active" as const,
    config: {
      apiUrl: "https://demo-netsuite.jeldi.app/api",
      accountId: "demo-account-123",
    },
  },
  {
    name: "Dynamics 365",
    type: "dynamics365" as const,
    status: "active" as const,
    config: {
      apiUrl: "https://demo-dynamics.jeldi.app/api",
      tenantId: "demo-tenant-456",
    },
  },
];

/**
 * Check if current environment is demo.jeldi.app
 */
export function isDemoEnvironment(): boolean {
  const hostname = process.env.HOSTNAME || '';
  const domain = process.env.AWS_DOMAIN || '';
  
  return hostname === 'demo.jeldi.app' || domain === 'demo.jeldi.app';
}

/**
 * Initialize demo users with proper authentication
 */
export async function initializeDemoUsers() {
  if (!isDemoEnvironment()) {
    console.log('Skipping demo user initialization - not in demo environment');
    return;
  }

  console.log('Initializing demo users for demo.jeldi.app...');

  for (const demoUser of DEMO_USERS) {
    try {
      // Check if user already exists
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, demoUser.email))
        .limit(1);

      if (existing.length > 0) {
        console.log(`Demo user ${demoUser.email} already exists, skipping`);
        continue;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(demoUser.password, 10);

      // Create demo user
      const nameParts = demoUser.name.split(' ');
      await db.insert(users).values({
        username: demoUser.name.toLowerCase().replace(/ /g, '_'),
        email: demoUser.email,
        password: hashedPassword,
        firstName: nameParts[0],
        lastName: nameParts[nameParts.length - 1],
        role: demoUser.role,
        authProvider: 'local',
      });

      console.log(`Created demo user: ${demoUser.email}`);
    } catch (error) {
      console.error(`Failed to create demo user ${demoUser.email}:`, error);
    }
  }
}

/**
 * Initialize demo ERP connections for demo users
 */
export async function initializeDemoERPConnections() {
  if (!isDemoEnvironment()) {
    console.log('Skipping demo ERP initialization - not in demo environment');
    return;
  }

  console.log('Initializing demo ERP connections for demo.jeldi.app...');

  // Get demo users
  const demoUserRecords = await db
    .select()
    .from(users)
    .where(eq(users.email, DEMO_USERS[0].email));

  if (demoUserRecords.length === 0) {
    console.log('No demo users found, skipping ERP initialization');
    return;
  }

  const demoUserId = demoUserRecords[0].id;

  for (const erpSystem of DEMO_ERP_SYSTEMS) {
    try {
      // Check if ERP connection already exists
      const existing = await db
        .select()
        .from(erpConnections)
        .where(eq(erpConnections.userId, demoUserId));

      const hasExisting = existing.some((e: any) => e.erpSystem === erpSystem.name);

      if (hasExisting) {
        console.log(`Demo ERP ${erpSystem.name} already exists, skipping`);
        continue;
      }

      // Create demo ERP connection
      await db.insert(erpConnections).values({
        userId: demoUserId,
        erpSystem: erpSystem.name,
        isConnected: true,
        config: erpSystem.config as any,
        connectionType: 'custom',
        authMethod: 'api_key',
      });

      console.log(`Created demo ERP connection: ${erpSystem.name}`);
    } catch (error) {
      console.error(`Failed to create demo ERP ${erpSystem.name}:`, error);
    }
  }
}

/**
 * Initialize all demo data
 * Should be called on server startup for demo.jeldi.app only
 */
export async function initializeAllDemoData() {
  if (!isDemoEnvironment()) {
    console.log('Not in demo environment - skipping all demo data initialization');
    return;
  }

  console.log('🎭 Demo Environment Detected: Initializing sample data...');

  try {
    await initializeDemoUsers();
    await initializeDemoERPConnections();
    
    console.log('✅ Demo data initialization complete');
  } catch (error) {
    console.error('❌ Demo data initialization failed:', error);
  }
}
