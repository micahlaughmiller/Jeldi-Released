import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface Column { key: string; label: string; kind?: "money" | "number" | "percent" | "date" | "text" | "days" }
interface KpiDetails {
  available: boolean;
  message?: string;
  kpi?: { type: string; value: string; change: number | null; basis: string; raw: number | null };
  trend?: Array<{ date: string; value: number | null }>;
  history?: Array<{ timestamp: string; value: string; change: string | null }>;
  drilldown?: { title: string; note: string; columns: Column[]; rows: Record<string, unknown>[]; total: number };
  dataAsOf?: string | null;
}

interface Props {
  type: string | null;
  name?: string;
  onClose: () => void;
}

function fmt(v: unknown, kind?: Column["kind"]): string {
  if (v === null || v === undefined || v === "") return "—";
  switch (kind) {
    case "money": return Number(v).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
    case "percent": return `${Number(v).toFixed(1)}%`;
    case "number": return Number(v).toLocaleString("en-US");
    case "days": return `${Number(v)}`;
    case "date": return String(v).slice(0, 10);
    default: return String(v);
  }
}

export default function KpiDetailModal({ type, name, onClose }: Props) {
  const { data, isLoading, error } = useQuery<KpiDetails>({
    queryKey: [`/api/kpis/${type}/details`],
    enabled: !!type,
    staleTime: 60_000,
  });

  const change = data?.kpi?.change ?? null;
  const trend = (data?.trend ?? []).map(p => ({ ...p, label: p.date.slice(5) }));
  const numericTrend = trend.filter(p => p.value != null);

  return (
    <Dialog open={!!type} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" data-testid="kpi-detail-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>{name ?? type}</span>
            {data?.kpi && (
              <>
                <span className="text-2xl font-bold">{data.kpi.value}</span>
                {change != null && (
                  <Badge variant={change >= 0 ? "default" : "destructive"} data-testid="kpi-detail-change">
                    {change >= 0 ? "+" : ""}{change.toFixed(1)}% vs prior 30 days
                  </Badge>
                )}
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {data?.kpi?.basis ?? "How this number is calculated and the records behind it."}
            {data?.dataAsOf && <span className="ml-2 text-xs">Data as of {new Date(data.dataAsOf).toLocaleString()}</span>}
          </DialogDescription>
        </DialogHeader>

        {isLoading && <div className="py-12 text-center text-muted-foreground">Loading…</div>}
        {error && <div className="py-6 text-destructive">{(error as Error).message}</div>}
        {data && !data.available && (
          <div className="py-8 text-center text-muted-foreground">{data.message ?? "No ERP data has been synced yet."}</div>
        )}

        {data?.available && (
          <div className="flex-1 overflow-auto space-y-6 pr-1">
            <section>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Last 12 weeks</h4>
              {numericTrend.length >= 2 ? (
                <div className="h-44" data-testid="kpi-detail-trend">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend}>
                      <defs>
                        <linearGradient id="kpiDetailGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.6} />
                          <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={60} domain={["auto", "auto"]} />
                      <Tooltip formatter={(v: number) => [v, name ?? type]} labelFormatter={(l, p) => (p?.[0]?.payload?.date as string) ?? l} />
                      <Area type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" fill="url(#kpiDetailGradient)" connectNulls />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not enough history for a trend yet.</p>
              )}
            </section>

            {data.drilldown && (
              <section>
                <div className="flex items-baseline justify-between mb-2">
                  <h4 className="text-sm font-medium">{data.drilldown.title}</h4>
                  <span className="text-xs text-muted-foreground">
                    {data.drilldown.total > data.drilldown.rows.length ? `showing ${data.drilldown.rows.length} of ${data.drilldown.total}` : `${data.drilldown.total} records`}
                  </span>
                </div>
                {data.drilldown.note && <p className="text-xs text-muted-foreground mb-3">{data.drilldown.note}</p>}
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm" data-testid="kpi-detail-table">
                    <thead className="bg-muted/50">
                      <tr>
                        {data.drilldown.columns.map(c => (
                          <th key={c.key} className={`px-3 py-2 text-left font-medium whitespace-nowrap ${c.kind === "money" || c.kind === "number" || c.kind === "percent" || c.kind === "days" ? "text-right" : ""}`}>{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.drilldown.rows.length === 0 && (
                        <tr><td colSpan={data.drilldown.columns.length} className="px-3 py-6 text-center text-muted-foreground">No records in this period.</td></tr>
                      )}
                      {data.drilldown.rows.map((row, i) => (
                        <tr key={i} className="border-t hover:bg-muted/30">
                          {data.drilldown!.columns.map(c => {
                            const v = row[c.key];
                            const numeric = c.kind === "money" || c.kind === "number" || c.kind === "percent" || c.kind === "days";
                            const flag = c.key === "status" && typeof v === "string" && /late|short|past due/i.test(v);
                            return (
                              <td key={c.key} className={`px-3 py-1.5 whitespace-nowrap ${numeric ? "text-right tabular-nums" : ""} ${flag ? "text-destructive font-medium" : ""}`}>
                                {fmt(v, c.kind)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
