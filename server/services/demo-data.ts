import { db } from "../db";
import { users, erpConnections, kpiConfigurations, kpiData, dashboardKpiPreferences, dashboardChartPreferences } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import crypto from "crypto";

// Demo accounts share one password. Set DEMO_USER_PASSWORD to make it known; otherwise a
// random one is generated per process (the demo-login endpoint does not need it).
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || `Demo-${crypto.randomBytes(12).toString("base64url")}!1a`;

/**
 * Demo Data Generation Service
 * 
 * This service populates realistic sample data for demo.jeldi.app ONLY.
 * overlay.jeldi.app runs in production mode with NO dummy data.
 * 
 * Environment detection:
 * - demo.jeldi.app: Auto-populate demo users, ERP connections, sample KPIs, charts, and data
 * - overlay.jeldi.app: Production mode, no dummy data
 * - Development/Replit: No automatic dummy data (manual testing)
 */

export const DEMO_USERS = [
  {
    email: "cfo@demo.jeldi.app",
    password: DEMO_PASSWORD,
    name: "Sarah CFO",
    role: "cfo" as const,
  },
  {
    email: "coo@demo.jeldi.app",
    password: DEMO_PASSWORD,
    name: "James COO",
    role: "ops_manager" as const,
  },
  {
    email: "admin@demo.jeldi.app",
    password: DEMO_PASSWORD,
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

// Universal KPIs that work across all ERP systems
export const UNIVERSAL_KPIS = [
  {
    name: "Cycle Time",
    type: "cycle_time",
    erpSource: "universal",
    query: "SELECT AVG(cycle_time) FROM orders WHERE created_at >= NOW() - INTERVAL '30 days'",
    position: 1,
    demoValue: "2.3 days",
    demoChange: "-8.5",
  },
  {
    name: "On-Time Delivery",
    type: "on_time_delivery",
    erpSource: "universal",
    query: "SELECT (COUNT(*) FILTER (WHERE delivered_on_time = true) * 100.0 / COUNT(*)) FROM deliveries WHERE created_at >= NOW() - INTERVAL '30 days'",
    position: 2,
    demoValue: "94.2%",
    demoChange: "+3.1",
  },
  {
    name: "Cost Per Unit",
    type: "cost_per_unit",
    erpSource: "universal",
    query: "SELECT AVG(cost_per_unit) FROM production WHERE created_at >= NOW() - INTERVAL '30 days'",
    position: 3,
    demoValue: "$12.45",
    demoChange: "-5.2",
  },
  {
    name: "Working Capital Efficiency",
    type: "working_capital_efficiency",
    erpSource: "universal",
    query: "SELECT (current_assets - current_liabilities) / revenue FROM financial_data WHERE period = 'current'",
    position: 4,
    demoValue: "1.85",
    demoChange: "+12.3",
  },
  {
    name: "Gross Margin",
    type: "gross_margin",
    erpSource: "universal",
    query: "SELECT ((revenue - cogs) / revenue * 100) FROM financial_data WHERE period = 'current'",
    position: 5,
    demoValue: "42.7%",
    demoChange: "+2.8",
  },
];

// Additional KPIs for extended demo data
export const ADDITIONAL_KPIS = [
  {
    name: "Revenue",
    type: "revenue",
    erpSource: "universal",
    query: "SELECT SUM(amount) FROM transactions WHERE type = 'revenue' AND created_at >= NOW() - INTERVAL '30 days'",
    position: 6,
    demoValue: "$2.4M",
    demoChange: "+15.3",
  },
  {
    name: "Orders",
    type: "orders",
    erpSource: "universal",
    query: "SELECT COUNT(*) FROM orders WHERE created_at >= NOW() - INTERVAL '30 days'",
    position: 7,
    demoValue: "1,847",
    demoChange: "+8.2",
  },
  {
    name: "Inventory Turnover",
    type: "inventory",
    erpSource: "universal",
    query: "SELECT (cogs / avg_inventory) FROM financial_data WHERE period = 'current'",
    position: 8,
    demoValue: "6.2x",
    demoChange: "+4.5",
  },
  {
    name: "Efficiency Score",
    type: "efficiency",
    erpSource: "universal",
    query: "SELECT AVG(efficiency_score) FROM operations WHERE created_at >= NOW() - INTERVAL '30 days'",
    position: 9,
    demoValue: "87.3%",
    demoChange: "+2.1",
  },
  {
    name: "Performance Index",
    type: "performance",
    erpSource: "universal",
    query: "SELECT AVG(performance_index) FROM metrics WHERE created_at >= NOW() - INTERVAL '30 days'",
    position: 10,
    demoValue: "92.5",
    demoChange: "+5.7",
  },
];

// Default charts for demo users
export const DEMO_CHARTS = [
  {
    chartType: "cashflow_90d_60d_projected",
    position: 1,
    size: "large",
  },
  {
    chartType: "revenue_90d",
    position: 2,
    size: "large",
  },
  {
    chartType: "unpaid_invoices",
    position: 3,
    size: "medium",
  },
  {
    chartType: "orders_over_time",
    position: 4,
    size: "large",
  },
];

/**
 * Check if current environment is demo.jeldi.app
 */
export function isDemoEnvironment(): boolean {
  // DEMO_MODE=true is the explicit switch. AWS_DOMAIN=demo.jeldi.app is kept for the existing deployment.
  if (process.env.DEMO_MODE === 'true') return true;
  if (process.env.DEMO_MODE === 'false') return false;
  return (process.env.AWS_DOMAIN || '') === 'demo.jeldi.app';
}

/**
 * Initialize demo users with proper authentication
 */
export async function initializeDemoUsers() {
  if (!isDemoEnvironment()) {
    console.log('Skipping demo user initialization - not in demo environment');
    return [];
  }

  console.log('Initializing demo users for demo.jeldi.app...');
  const createdUsers = [];

  for (const demoUser of DEMO_USERS) {
    try {
      // Check if user already exists
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, demoUser.email))
        .limit(1);

      if (existing.length > 0) {
        console.log(`Demo user ${demoUser.email} already exists, using existing`);
        createdUsers.push(existing[0]);
        continue;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(demoUser.password, 10);

      // Create demo user
      const nameParts = demoUser.name.split(' ');
      const [newUser] = await db.insert(users).values({
        username: demoUser.name.toLowerCase().replace(/ /g, '_'),
        email: demoUser.email,
        password: hashedPassword,
        firstName: nameParts[0],
        lastName: nameParts[nameParts.length - 1],
        role: demoUser.role,
        authProvider: 'local',
      }).returning();

      createdUsers.push(newUser);
      console.log(`Created demo user: ${demoUser.email}`);
    } catch (error) {
      console.error(`Failed to create demo user ${demoUser.email}:`, error);
    }
  }

  return createdUsers;
}

/**
 * Initialize demo ERP connections for demo users
 */
export async function initializeDemoERPConnections(demoUsers: any[]) {
  if (!isDemoEnvironment()) {
    console.log('Skipping demo ERP initialization - not in demo environment');
    return;
  }

  console.log('Initializing demo ERP connections for demo.jeldi.app...');

  if (demoUsers.length === 0) {
    console.log('No demo users provided, skipping ERP initialization');
    return;
  }

  for (const user of demoUsers) {
    for (const erpSystem of DEMO_ERP_SYSTEMS) {
      try {
        // Check if ERP connection already exists
        const existing = await db
          .select()
          .from(erpConnections)
          .where(eq(erpConnections.userId, user.id));

        const hasExisting = existing.some((e: any) => e.erpSystem === erpSystem.type);

        if (hasExisting) {
          console.log(`Demo ERP ${erpSystem.name} for ${user.email} already exists, skipping`);
          continue;
        }

        // Create demo ERP connection
        await db.insert(erpConnections).values({
          userId: user.id,
          erpSystem: erpSystem.type, // must match the ERP_SYSTEMS key, not the display name
          isConnected: true,
          config: erpSystem.config as any,
          connectionType: 'custom',
          authMethod: 'api_key',
        });

        console.log(`Created demo ERP connection: ${erpSystem.name} for ${user.email}`);
      } catch (error) {
        console.error(`Failed to create demo ERP ${erpSystem.name} for ${user.email}:`, error);
      }
    }
  }
}

/**
 * Initialize demo KPI configurations and data
 */
export async function initializeDemoKPIs(demoUsers: any[]) {
  if (!isDemoEnvironment()) {
    console.log('Skipping demo KPI initialization - not in demo environment');
    return;
  }

  console.log('Initializing demo KPI configurations and data...');

  for (const user of demoUsers) {
    try {
      // Check if user already has KPI configurations
      const existingConfigs = await db
        .select()
        .from(kpiConfigurations)
        .where(eq(kpiConfigurations.userId, user.id));

      if (existingConfigs.length > 0) {
        console.log(`User ${user.email} already has ${existingConfigs.length} KPI configurations, skipping`);
        continue;
      }

      // Create universal KPI configurations
      const allKpis = [...UNIVERSAL_KPIS, ...ADDITIONAL_KPIS];
      
      for (const kpi of allKpis) {
        // Create KPI configuration
        const [config] = await db.insert(kpiConfigurations).values({
          userId: user.id,
          name: kpi.name,
          type: kpi.type,
          erpSource: kpi.erpSource,
          query: kpi.query,
          position: kpi.position || 0,
          isActive: true,
          refreshInterval: 30,
        }).returning();

        // Create demo KPI data
        await db.insert(kpiData).values({
          kpiId: config.id,
          value: kpi.demoValue,
          change: kpi.demoChange,
        });

        console.log(`Created KPI configuration and data: ${kpi.name} for ${user.email}`);
      }

      // Create dashboard preferences for the first 5 KPIs (universal defaults)
      for (let i = 0; i < UNIVERSAL_KPIS.length; i++) {
        const kpiType = UNIVERSAL_KPIS[i].type;
        const config = await db
          .select()
          .from(kpiConfigurations)
          .where(eq(kpiConfigurations.userId, user.id))
          .then(configs => configs.find(c => c.type === kpiType));

        if (config) {
          await db.insert(dashboardKpiPreferences).values({
            userId: user.id,
            kpiConfigId: config.id,
            position: i + 1,
            isVisible: true,
          });
          console.log(`Created dashboard preference for ${config.name} at position ${i + 1}`);
        }
      }

    } catch (error) {
      console.error(`Failed to create demo KPIs for ${user.email}:`, error);
    }
  }
}

/**
 * Initialize demo chart preferences
 */
export async function initializeDemoCharts(demoUsers: any[]) {
  if (!isDemoEnvironment()) {
    console.log('Skipping demo chart initialization - not in demo environment');
    return;
  }

  console.log('Initializing demo chart preferences...');

  for (const user of demoUsers) {
    try {
      // Check if user already has chart preferences
      const existingCharts = await db
        .select()
        .from(dashboardChartPreferences)
        .where(eq(dashboardChartPreferences.userId, user.id));

      if (existingCharts.length > 0) {
        console.log(`User ${user.email} already has ${existingCharts.length} chart preferences, skipping`);
        continue;
      }

      // Create default chart preferences
      for (const chart of DEMO_CHARTS) {
        await db.insert(dashboardChartPreferences).values({
          userId: user.id,
          chartType: chart.chartType,
          position: chart.position,
          size: chart.size,
          isVisible: true,
        });
        console.log(`Created chart preference: ${chart.chartType} for ${user.email}`);
      }

    } catch (error) {
      console.error(`Failed to create demo charts for ${user.email}:`, error);
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
    const demoUsers = await initializeDemoUsers();
    await initializeDemoERPConnections(demoUsers);
    await initializeDemoKPIs(demoUsers);
    await initializeDemoCharts(demoUsers);
    
    console.log('✅ Demo data initialization complete');
  } catch (error) {
    console.error('❌ Demo data initialization failed:', error);
  }
}
