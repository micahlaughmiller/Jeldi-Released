import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle } from "lucide-react";

/** ERP systems with a real data connector on the server (server/connectors) */
export const CONNECTOR_SYSTEMS = ["epicor", "syteline", "demo"];

interface Field {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  required?: boolean;
  help?: string;
  /** Only show when values[showWhen.key] === showWhen.value */
  showWhen?: { key: string; value: string };
  options?: Array<{ value: string; label: string }>;
}

const FIELDS: Record<string, Field[]> = {
  demo: [
    { key: "company", label: "Company name", placeholder: "Morton Industries", help: "Fictional dataset generated on every sync. Nothing is contacted." },
  ],
  epicor: [
    { key: "instanceUrl", label: "Kinetic server URL", placeholder: "https://kinetic.example.com/EpicorERP", required: true, help: "The application server URL, without /api. For Kinetic cloud this looks like https://centralusdtapp01.epicorsaas.com/SaaS123" },
    { key: "company", label: "Company ID", placeholder: "EPIC06", required: true },
    { key: "apiKey", label: "API key", secret: true, required: true, help: "Created in Kinetic under System Setup > Security Maintenance > API Key Maintenance" },
    { key: "username", label: "Service account username", required: true, help: "A Kinetic user with read access to Sales Orders, Customer Shipments, AR Invoices, Jobs and Parts" },
    { key: "password", label: "Service account password", secret: true, required: true },
  ],
  syteline: [
    { key: "authMode", label: "Deployment", required: true, options: [{ value: "ionapi", label: "CloudSuite Industrial (Infor ION API)" }, { value: "onprem", label: "On-premises SyteLine" }] },
    { key: "idoBaseUrl", label: "IDORequestService URL", placeholder: "https://mingle-ionapi.inforcloudsuite.com/TENANT/CSI/IDORequestService", required: true, help: "On-prem: https://your-server/IDORequestService" },
    { key: "configName", label: "Mongoose configuration name", placeholder: "SL_Prod", required: true },
    { key: "tokenUrl", label: "OAuth token URL (pu + ot from the .ionapi file)", placeholder: "https://mingle-sso.inforcloudsuite.com/TENANT/as/token.oauth2", required: true, showWhen: { key: "authMode", value: "ionapi" } },
    { key: "clientId", label: "Client ID (ci)", required: true, showWhen: { key: "authMode", value: "ionapi" } },
    { key: "clientSecret", label: "Client secret (cs)", secret: true, required: true, showWhen: { key: "authMode", value: "ionapi" } },
    { key: "serviceAccountKey", label: "Service account access key (saak)", required: true, showWhen: { key: "authMode", value: "ionapi" } },
    { key: "serviceAccountSecret", label: "Service account secret key (sask)", secret: true, required: true, showWhen: { key: "authMode", value: "ionapi" } },
    { key: "username", label: "SyteLine username", required: true, showWhen: { key: "authMode", value: "onprem" } },
    { key: "password", label: "SyteLine password", secret: true, required: true, showWhen: { key: "authMode", value: "onprem" } },
  ],
};

export function defaultCredentials(system: string): Record<string, string> {
  if (system === "syteline") return { authMode: "ionapi" };
  if (system === "demo") return { company: "Morton Industries" };
  return {};
}

function visibleFields(system: string, values: Record<string, string>): Field[] {
  return (FIELDS[system] ?? []).filter(f => !f.showWhen || values[f.showWhen.key] === f.showWhen.value);
}

export function isCredentialsComplete(system: string, values: Record<string, string>): boolean {
  return visibleFields(system, values).every(f => !f.required || Boolean(values[f.key]?.trim()));
}

interface Props {
  system: string;
  displayName: string;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  testResult: { success: boolean; message: string } | null;
}

export default function ConnectorCredentialsForm({ system, displayName, values, onChange, testResult }: Props) {
  const fields = visibleFields(system, values);
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">{displayName} credentials</h3>
        <p className="text-sm text-muted-foreground">
          Jeldi reads sales orders, shipments, invoices, jobs and inventory on a schedule. Use a read-only service account.
        </p>
      </div>

      <div className="space-y-4">
        {fields.map(f => (
          <div key={f.key}>
            <Label htmlFor={`cred-${f.key}`}>{f.label}{f.required ? " *" : ""}</Label>
            {f.options ? (
              <Select value={values[f.key] ?? ""} onValueChange={v => onChange({ ...values, [f.key]: v })}>
                <SelectTrigger id={`cred-${f.key}`} data-testid={`select-${f.key}`}>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {f.options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={`cred-${f.key}`}
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                value={values[f.key] ?? ""}
                onChange={e => onChange({ ...values, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                data-testid={`input-${f.key}`}
              />
            )}
            {f.help && <p className="text-xs text-muted-foreground mt-1">{f.help}</p>}
          </div>
        ))}
      </div>

      {testResult && (
        <Alert variant={testResult.success ? "default" : "destructive"}>
          <div className="flex items-center gap-2">
            {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <AlertDescription>{testResult.message}</AlertDescription>
          </div>
        </Alert>
      )}
    </div>
  );
}
