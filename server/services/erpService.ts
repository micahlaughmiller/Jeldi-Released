import { storage } from "../storage";
import type { ErpConnection } from "@shared/schema";

export interface ERPSystem {
  name: string;
  displayName: string;
  description: string;
  oauthConfig: {
    authUrl: string;
    tokenUrl: string;
    clientId: string;
    scopes: string[];
  };
  apiBaseUrl: string;
  isConnected?: boolean;
  lastSync?: Date;
}

export const ERP_SYSTEMS: Record<string, ERPSystem> = {
  sap: {
    name: "sap",
    displayName: "SAP S/4HANA",
    description: "AI-driven analytics, in-memory computing",
    oauthConfig: {
      authUrl: "https://api.sap.com/oauth/authorize",
      tokenUrl: "https://api.sap.com/oauth/token",
      clientId: process.env.SAP_CLIENT_ID || "",
      scopes: ["read", "write", "analytics"]
    },
    apiBaseUrl: "https://api.sap.com/v1"
  },
  netsuite: {
    name: "netsuite",
    displayName: "Oracle NetSuite",
    description: "Cloud-native, financial management",
    oauthConfig: {
      authUrl: "https://system.netsuite.com/app/login/oauth2/authorize.nl",
      tokenUrl: "https://system.netsuite.com/app/login/oauth2/token.nl",
      clientId: process.env.NETSUITE_CLIENT_ID || "",
      scopes: ["restlets", "rest_webservices"]
    },
    apiBaseUrl: "https://system.netsuite.com/app/site/hosting/restlet.nl"
  },
  dynamics365: {
    name: "dynamics365",
    displayName: "Microsoft Dynamics 365",
    description: "Office 365 integration, Copilot AI",
    oauthConfig: {
      authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      clientId: process.env.DYNAMICS_CLIENT_ID || "",
      scopes: ["https://service.powerapps.com/user_impersonation"]
    },
    apiBaseUrl: "https://api.businesscentral.dynamics.com/v2.0"
  },
  oracle_fusion: {
    name: "oracle_fusion",
    displayName: "Oracle Fusion Cloud",
    description: "Large enterprise focus, robust functionality",
    oauthConfig: {
      authUrl: "https://idcs-oracle.identity.oraclecloud.com/oauth2/v1/authorize",
      tokenUrl: "https://idcs-oracle.identity.oraclecloud.com/oauth2/v1/token",
      clientId: process.env.ORACLE_FUSION_CLIENT_ID || "",
      scopes: ["urn:opc:idm:__myscopes__"]
    },
    apiBaseUrl: "https://api.oraclecloud.com/20160918"
  },
  workday: {
    name: "workday",
    displayName: "Workday ERP",
    description: "HR-centric, cloud-first design",
    oauthConfig: {
      authUrl: "https://impl-cc.workday.com/ccx/oauth2/authorize",
      tokenUrl: "https://impl-cc.workday.com/ccx/oauth2/token",
      clientId: process.env.WORKDAY_CLIENT_ID || "",
      scopes: ["openid", "profile"]
    },
    apiBaseUrl: "https://wd2-impl-services1.workday.com"
  },
  ifs: {
    name: "ifs",
    displayName: "IFS Cloud",
    description: "Asset management, field service",
    oauthConfig: {
      authUrl: "https://oauth.ifs.com/authorize",
      tokenUrl: "https://oauth.ifs.com/token",
      clientId: process.env.IFS_CLIENT_ID || "",
      scopes: ["read", "write"]
    },
    apiBaseUrl: "https://api.ifs.com/v1"
  },
  epicor: {
    name: "epicor",
    displayName: "Epicor Kinetic",
    description: "Manufacturing focus, modern interface",
    oauthConfig: {
      authUrl: "https://api.epicor.com/oauth/authorize",
      tokenUrl: "https://api.epicor.com/oauth/token",
      clientId: process.env.EPICOR_CLIENT_ID || "",
      scopes: ["erp.read", "erp.write"]
    },
    apiBaseUrl: "https://api.epicor.com/v1"
  },
  infor: {
    name: "infor",
    displayName: "Infor LN/M3",
    description: "Industry-specific solutions",
    oauthConfig: {
      authUrl: "https://mingle-ionapi.inforcloudsuite.com/INFOR_GRID/as/authorization.oauth2",
      tokenUrl: "https://mingle-ionapi.inforcloudsuite.com/INFOR_GRID/as/token.oauth2",
      clientId: process.env.INFOR_CLIENT_ID || "",
      scopes: ["read", "write"]
    },
    apiBaseUrl: "https://mingle-ionapi.inforcloudsuite.com"
  },
  acumatica: {
    name: "acumatica",
    displayName: "Acumatica Cloud",
    description: "Modular pricing, construction/distribution",
    oauthConfig: {
      authUrl: "https://api.acumatica.com/oauth/authorize",
      tokenUrl: "https://api.acumatica.com/oauth/token",
      clientId: process.env.ACUMATICA_CLIENT_ID || "",
      scopes: ["api"]
    },
    apiBaseUrl: "https://api.acumatica.com/entity"
  },
  sage: {
    name: "sage",
    displayName: "Sage Intacct",
    description: "Financial management, accounting-first",
    oauthConfig: {
      authUrl: "https://api.intacct.com/ia/acct/oauth2/authorize",
      tokenUrl: "https://api.intacct.com/ia/acct/oauth2/token",
      clientId: process.env.SAGE_CLIENT_ID || "",
      scopes: ["read", "write"]
    },
    apiBaseUrl: "https://api.intacct.com"
  }
};

export class ERPService {
  async getConnectedSystems(userId: string): Promise<ERPSystem[]> {
    const connections = await storage.getErpConnections(userId);
    
    return Object.values(ERP_SYSTEMS).map(system => ({
      ...system,
      isConnected: connections.some(conn => conn.erpSystem === system.name && conn.isConnected),
      lastSync: connections.find(conn => conn.erpSystem === system.name)?.lastSync || undefined
    }));
  }

  async initiateOAuthFlow(erpSystem: string, userId: string, redirectUri: string): Promise<string> {
    const system = ERP_SYSTEMS[erpSystem];
    if (!system) {
      throw new Error(`ERP system ${erpSystem} not supported`);
    }

    // Store or update connection record
    const existingConnection = await storage.getErpConnection(userId, erpSystem);
    if (!existingConnection) {
      await storage.createErpConnection({
        userId,
        erpSystem,
        isConnected: false,
        config: system.oauthConfig
      });
    }

    // Generate OAuth URL
    const params = new URLSearchParams({
      client_id: system.oauthConfig.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: system.oauthConfig.scopes.join(" "),
      state: `${userId}-${erpSystem}-${Date.now()}`
    });

    return `${system.oauthConfig.authUrl}?${params.toString()}`;
  }

  async handleOAuthCallback(code: string, state: string): Promise<ErpConnection> {
    const [userId, erpSystem] = state.split("-");
    const system = ERP_SYSTEMS[erpSystem];
    
    if (!system) {
      throw new Error(`Invalid ERP system: ${erpSystem}`);
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(system.oauthConfig.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: system.oauthConfig.clientId,
        client_secret: process.env[`${erpSystem.toUpperCase()}_CLIENT_SECRET`] || "",
        code,
        redirect_uri: process.env.OAUTH_REDIRECT_URI || ""
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Failed to exchange code for tokens: ${tokenResponse.statusText}`);
    }

    const tokens = await tokenResponse.json();
    
    // Update connection with tokens
    const connection = await storage.getErpConnection(userId, erpSystem);
    if (!connection) {
      throw new Error("Connection not found");
    }

    const updatedConnection = await storage.updateErpConnection(connection.id, {
      isConnected: true,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: new Date(Date.now() + (tokens.expires_in * 1000)),
      lastSync: new Date()
    });

    if (!updatedConnection) {
      throw new Error("Failed to update connection");
    }

    return updatedConnection;
  }

  async fetchERPData(userId: string, erpSystem: string, endpoint: string): Promise<any> {
    const connection = await storage.getErpConnection(userId, erpSystem);
    if (!connection || !connection.isConnected || !connection.accessToken) {
      throw new Error(`${erpSystem} not connected`);
    }

    const system = ERP_SYSTEMS[erpSystem];
    const response = await fetch(`${system.apiBaseUrl}${endpoint}`, {
      headers: {
        "Authorization": `Bearer ${connection.accessToken}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch data from ${erpSystem}: ${response.statusText}`);
    }

    // Update last sync time
    await storage.updateErpConnection(connection.id, {
      lastSync: new Date()
    });

    return await response.json();
  }

  async aggregateERPData(userId: string): Promise<Record<string, any>> {
    const connections = await storage.getErpConnections(userId);
    const connectedSystems = connections.filter(conn => conn.isConnected);
    
    const aggregatedData: Record<string, any> = {};

    // If user has connected systems, fetch real data
    if (connectedSystems.length > 0) {
      for (const connection of connectedSystems) {
        try {
          // Fetch basic data from each connected ERP
          const data = await this.fetchERPData(userId, connection.erpSystem, "/summary");
          aggregatedData[connection.erpSystem] = data;
        } catch (error) {
          console.error(`Failed to fetch data from ${connection.erpSystem}:`, error);
          aggregatedData[connection.erpSystem] = { error: (error as Error).message };
        }
      }
    } else {
      // Provide demo data for new users to analyze
      aggregatedData.demo = this.getDemoERPData();
    }

    return aggregatedData;
  }

  private getDemoERPData(): Record<string, any> {
    return {
      company: {
        name: "TechCorp Industries",
        size: "Large Enterprise",
        revenue: "$200M annually",
        employees: 2800,
        industry: "Technology Manufacturing"
      },
      financial: {
        monthlyRevenue: {
          current: 16700000, // $16.7M
          change: 12.5,
          currency: "USD",
          period: "Current Month"
        },
        quarterlyRevenue: {
          q1: 48200000,
          q2: 52100000, 
          q3: 49800000,
          q4_projected: 55000000,
          currency: "USD"
        },
        profitMargin: {
          current: 18.3,
          target: 20.0,
          trend: "improving"
        },
        expenses: {
          operational: 13650000,
          salaries: 8900000,
          marketing: 2100000,
          rnd: 4200000
        }
      },
      operations: {
        activeOrders: {
          count: 2847,
          change: 8.2,
          totalValue: 12400000,
          avgOrderValue: 4354
        },
        inventory: {
          fillRate: 94.2,
          change: -2.1,
          totalItems: 15680,
          lowStockItems: 234,
          overstockItems: 89
        },
        production: {
          efficiency: 91.3,
          change: 6.4,
          unitsProduced: 45670,
          defectRate: 0.8,
          onTimeDelivery: 96.5
        }
      },
      systems: {
        performance: {
          uptime: 98.8,
          change: 15.7,
          avgResponseTime: 245,
          errorRate: 0.03
        },
        integrations: [
          {
            system: "SAP S/4HANA",
            status: "active",
            lastSync: new Date(Date.now() - 2 * 60 * 1000),
            dataPoints: 15680
          },
          {
            system: "Oracle NetSuite", 
            status: "active",
            lastSync: new Date(Date.now() - 5 * 60 * 1000),
            dataPoints: 8934
          },
          {
            system: "Microsoft Dynamics 365",
            status: "active", 
            lastSync: new Date(Date.now() - 8 * 60 * 1000),
            dataPoints: 12456
          }
        ]
      },
      trends: {
        salesGrowth: "12.5% month-over-month increase",
        inventoryOptimization: "Slight decrease in fill rate, investigate supply chain",
        systemPerformance: "Significant improvement in uptime and response times",
        operationalEfficiency: "Strong gains in production efficiency"
      }
    };
  }

  async disconnectSystem(userId: string, erpSystem: string): Promise<void> {
    const connection = await storage.getErpConnection(userId, erpSystem);
    if (!connection) {
      throw new Error(`${erpSystem} connection not found`);
    }

    // Update connection to disconnected state
    await storage.updateErpConnection(connection.id, {
      isConnected: false,
      accessToken: null,
      refreshToken: null,
      tokenExpiry: null,
      lastSync: null
    });
  }
}

export const erpService = new ERPService();
