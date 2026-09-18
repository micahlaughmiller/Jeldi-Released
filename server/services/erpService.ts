import { storage } from "../storage";
import type { ErpConnection } from "@shared/schema";
import crypto from "crypto";
import { isDemoEnvironment } from "./demo-data";
import { hasConnector } from "../connectors";

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
  supportsApiKey?: boolean;
  supportsManualConfig?: boolean;
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
    description: "Industry-specific ERP, IoT integration",
    oauthConfig: {
      authUrl: "https://api.epicor.com/oauth2/authorize",
      tokenUrl: "https://api.epicor.com/oauth2/token",
      clientId: process.env.EPICOR_CLIENT_ID || "",
      scopes: ["api"]
    },
    apiBaseUrl: "https://api.epicor.com/api/v1",
    supportsApiKey: true,
    supportsManualConfig: true
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
  },
  syteline: {
    name: "syteline",
    displayName: "Infor SyteLine",
    description: "Manufacturing ERP, supply chain optimization",
    oauthConfig: {
      authUrl: "https://mingle.infor.com/authorize",
      tokenUrl: "https://mingle.infor.com/token",
      clientId: process.env.SYTELINE_CLIENT_ID || "",
      scopes: ["api"]
    },
    apiBaseUrl: "https://api.syteline.infor.com/v1",
    supportsApiKey: true,
    supportsManualConfig: true
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

    // Server-issued, single-use state stored in oauth_sessions (10 minute expiry)
    const state = crypto.randomBytes(32).toString("hex");
    await storage.createOAuthSession({
      state,
      provider: `erp_${erpSystem}`,
      isCompleted: false,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      authResult: JSON.stringify({ userId, erpSystem, redirectUri })
    });

    // Generate OAuth URL
    const params = new URLSearchParams({
      client_id: system.oauthConfig.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: system.oauthConfig.scopes.join(" "),
      state
    });

    return `${system.oauthConfig.authUrl}?${params.toString()}`;
  }

  async handleOAuthCallback(code: string, state: string): Promise<ErpConnection> {
    const session = await storage.getOAuthSessionByState(state);
    if (!session || !session.provider.startsWith("erp_") || session.isCompleted || new Date() > session.expiresAt) {
      throw new Error("Invalid or expired ERP OAuth session");
    }
    const { userId, erpSystem, redirectUri } = JSON.parse(session.authResult as string) as { userId: string; erpSystem: string; redirectUri: string };
    await storage.updateOAuthSession(session.id, { isCompleted: true });

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
        redirect_uri: redirectUri
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
    } else if (isDemoEnvironment()) {
      // Sample company data for the demo deployment only
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

  async testConnection(connectionData: {
    erpSystem?: string;
    apiBaseUrl: string;
    authMethod: string;
    apiKey?: string;
    apiSecret?: string;
    accessToken?: string;
    instanceUrl?: string;
  }): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      const { apiBaseUrl, authMethod, apiKey, apiSecret, accessToken } = connectionData;
      
      let headers: Record<string, string> = {
        "Content-Type": "application/json"
      };

      // Set authorization header based on auth method
      switch (authMethod) {
        case "api_key":
          if (!apiKey) {
            return { success: false, message: "API key is required" };
          }
          headers["Authorization"] = `ApiKey ${apiKey}`;
          if (apiSecret) {
            headers["X-API-Secret"] = apiSecret;
          }
          break;
        
        case "bearer_token":
          if (!accessToken) {
            return { success: false, message: "Access token is required" };
          }
          headers["Authorization"] = `Bearer ${accessToken}`;
          break;
        
        case "basic_auth":
          if (!apiKey || !apiSecret) {
            return { success: false, message: "Username and password are required" };
          }
          const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
          headers["Authorization"] = `Basic ${credentials}`;
          break;
        
        case "oauth":
          if (!accessToken) {
            return { success: false, message: "OAuth access token is required" };
          }
          headers["Authorization"] = `Bearer ${accessToken}`;
          break;
        
        default:
          return { success: false, message: `Unsupported authentication method: ${authMethod}` };
      }

      // Test connection with a simple health check or list endpoint
      const testEndpoint = `${apiBaseUrl}/health`;
      const response = await fetch(testEndpoint, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(10000)
      });

      if (response.ok) {
        return {
          success: true,
          message: "Connection successful",
          details: {
            status: response.status,
            statusText: response.statusText
          }
        };
      } else {
        const errorText = await response.text().catch(() => "Unknown error");
        return {
          success: false,
          message: `Connection failed: ${response.statusText}`,
          details: {
            status: response.status,
            error: errorText
          }
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Connection test failed: ${(error as Error).message}`,
        details: {
          error: (error as Error).message
        }
      };
    }
  }

  async connectWithApiKey(
    userId: string,
    erpSystem: string,
    apiKey: string,
    apiSecret?: string,
    instanceUrl?: string
  ): Promise<ErpConnection> {
    const system = ERP_SYSTEMS[erpSystem];
    if (!system) {
      throw new Error(`ERP system ${erpSystem} not supported`);
    }

    if (!system.supportsApiKey) {
      throw new Error(`${system.displayName} does not support API key authentication`);
    }

    // Test connection first
    const testResult = await this.testConnection({
      erpSystem,
      apiBaseUrl: instanceUrl || system.apiBaseUrl,
      authMethod: "api_key",
      apiKey,
      apiSecret
    });

    if (!testResult.success) {
      throw new Error(`Connection test failed: ${testResult.message}`);
    }

    // Check for existing connection
    const existingConnection = await storage.getErpConnection(userId, erpSystem);
    
    if (existingConnection) {
      // Update existing connection
      const updated = await storage.updateErpConnection(existingConnection.id, {
        connectionType: "api_key",
        authMethod: "api_key",
        apiKey,
        apiSecret: apiSecret || null,
        instanceUrl: instanceUrl || null,
        isConnected: true,
        lastSync: new Date()
      });
      
      if (!updated) {
        throw new Error("Failed to update connection");
      }
      return updated;
    } else {
      // Create new connection
      return await storage.createErpConnection({
        userId,
        erpSystem,
        connectionType: "api_key",
        authMethod: "api_key",
        apiKey,
        apiSecret: apiSecret || null,
        instanceUrl: instanceUrl || null,
        isConnected: true,
        config: system.oauthConfig
      });
    }
  }

  async connectCustomERP(
    userId: string,
    customName: string,
    apiBaseUrl: string,
    authMethod: string,
    credentials: {
      apiKey?: string;
      apiSecret?: string;
      accessToken?: string;
    },
    metadata?: any
  ): Promise<ErpConnection> {
    // Test connection first
    const testResult = await this.testConnection({
      apiBaseUrl,
      authMethod,
      ...credentials
    });

    if (!testResult.success) {
      throw new Error(`Connection test failed: ${testResult.message}`);
    }

    // Create custom ERP connection
    return await storage.createErpConnection({
      userId,
      erpSystem: customName.toLowerCase().replace(/\s+/g, '_'),
      connectionType: "custom",
      authMethod,
      apiKey: credentials.apiKey || null,
      apiSecret: credentials.apiSecret || null,
      accessToken: credentials.accessToken || null,
      instanceUrl: apiBaseUrl,
      isConnected: true,
      metadata: {
        displayName: customName,
        isCustom: true,
        ...metadata
      }
    });
  }

  async getConnectionMethods(erpSystem: string): Promise<{
    oauth: boolean;
    apiKey: boolean;
    manual: boolean;
    /** true when a real data connector exists (structured credentials + scheduled sync) */
    connector: boolean;
  }> {
    const system = ERP_SYSTEMS[erpSystem];

    if (!system) {
      return { oauth: false, apiKey: false, manual: false, connector: false };
    }

    return {
      oauth: !!system.oauthConfig?.clientId,
      apiKey: system.supportsApiKey || false,
      manual: system.supportsManualConfig || false,
      connector: hasConnector(erpSystem)
    };
  }
}

export const erpService = new ERPService();
