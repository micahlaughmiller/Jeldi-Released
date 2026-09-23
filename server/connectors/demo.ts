/**
 * Demo connector: serves the generated Morton Industries dataset through the same interface as
 * the real ERP connectors, so demo and test environments exercise the full sync pipeline.
 */
import { generateMortonSnapshot, DEMO_COMPANY } from "../services/demoCompany";
import type { ErpConnector, ErpSnapshot, ConnectionTestResult } from "./types";

export interface DemoCredentials {
  company?: string;
  seed?: number | string;
}

export class DemoConnector implements ErpConnector {
  readonly system = DEMO_COMPANY.erpSystem;

  constructor(private readonly creds: DemoCredentials = {}, private readonly now: () => Date = () => new Date()) {}

  async testConnection(): Promise<ConnectionTestResult> {
    return { success: true, message: `Connected to the ${this.creds.company || DEMO_COMPANY.name} demo dataset`, details: { demo: true } };
  }

  async fetchSnapshot(sinceDays = 400): Promise<ErpSnapshot> {
    const seed = this.creds.seed !== undefined && this.creds.seed !== "" ? Number(this.creds.seed) : undefined;
    return generateMortonSnapshot({ now: this.now(), historyDays: sinceDays, seed: Number.isFinite(seed) ? seed : undefined });
  }
}
