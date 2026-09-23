import type { ErpConnection } from "@shared/schema";
import type { ErpConnector, FetchLike } from "./types";
import { EpicorConnector, type EpicorCredentials } from "./epicor";
import { SyteLineConnector, type SyteLineCredentials } from "./syteline";
import { DemoConnector, type DemoCredentials } from "./demo";

export * from "./types";
export { EpicorConnector, SyteLineConnector, DemoConnector };

/** ERP systems that have a real connector behind them */
export const CONNECTOR_SYSTEMS = ["epicor", "syteline", "demo"] as const;
export type ConnectorSystem = (typeof CONNECTOR_SYSTEMS)[number];

export function hasConnector(system: string): system is ConnectorSystem {
  return (CONNECTOR_SYSTEMS as readonly string[]).includes(system);
}

/**
 * Credentials are stored on the erp_connections row as:
 *   apiSecret -> encrypted JSON of every secret field
 *   config    -> non-secret settings (urls, company, config name, auth mode, field overrides)
 * This helper merges them back into the shape each connector expects.
 */
export function credentialsFromConnection(connection: ErpConnection): Record<string, any> {
  let secrets: Record<string, any> = {};
  if (connection.apiSecret) {
    try {
      secrets = JSON.parse(connection.apiSecret);
    } catch {
      secrets = { apiSecret: connection.apiSecret };
    }
  }
  const config = (connection.config ?? {}) as Record<string, any>;
  return { ...config, ...secrets, ...(connection.apiKey && !secrets.apiKey ? { apiKey: connection.apiKey } : {}), instanceUrl: config.instanceUrl ?? connection.instanceUrl ?? undefined };
}

/** Which fields of a credential object are secrets and must never be stored in plain config */
export const SECRET_FIELDS: Record<ConnectorSystem, string[]> = {
  epicor: ["apiKey", "password", "bearerToken"],
  syteline: ["clientSecret", "serviceAccountSecret", "password"],
  demo: [],
};

export function buildConnector(system: string, credentials: Record<string, any>, fetchImpl?: FetchLike): ErpConnector {
  switch (system) {
    case "epicor":
      return new EpicorConnector(credentials as EpicorCredentials, { fetchImpl, overrides: credentials.overrides });
    case "syteline":
      return new SyteLineConnector(credentials as SyteLineCredentials, { fetchImpl, overrides: credentials.overrides });
    case "demo":
      return new DemoConnector(credentials as DemoCredentials);
    default:
      throw new Error(`No connector implemented for ERP system "${system}"`);
  }
}

export function connectorForConnection(connection: ErpConnection, fetchImpl?: FetchLike): ErpConnector {
  return buildConnector(connection.erpSystem, credentialsFromConnection(connection), fetchImpl);
}

/** Split a flat credential object into what goes in encrypted storage and what goes in config */
export function splitCredentials(system: ConnectorSystem, credentials: Record<string, any>): { secrets: Record<string, any>; config: Record<string, any> } {
  const secrets: Record<string, any> = {};
  const config: Record<string, any> = {};
  for (const [k, v] of Object.entries(credentials)) {
    if (v === undefined || v === null || v === "") continue;
    (SECRET_FIELDS[system].includes(k) ? secrets : config)[k] = v;
  }
  return { secrets, config };
}
