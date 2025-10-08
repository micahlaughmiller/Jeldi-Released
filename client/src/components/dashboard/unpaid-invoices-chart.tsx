import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

interface UnpaidInvoicesChartProps {
  configuration?: any;
}

export default function UnpaidInvoicesChart({ configuration }: UnpaidInvoicesChartProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/charts/unpaid-invoices"],
  });

  if (isLoading || !data) {
    return <div className="h-[300px] flex items-center justify-center">Loading...</div>;
  }

  const invoices = data as any[];
  const totalUnpaid = invoices.reduce((sum, inv) => sum + inv.amount, 0);

  return (
    <div className="space-y-4" data-testid="unpaid-invoices-chart-content">
      <div className="flex items-center justify-between pb-4 border-b">
        <div>
          <p className="text-sm text-muted-foreground">Total Unpaid</p>
          <p className="text-2xl font-bold">${totalUnpaid.toLocaleString()}</p>
        </div>
        <Badge variant="destructive">{invoices.length} Invoices</Badge>
      </div>
      
      <div className="space-y-2 max-h-[200px] overflow-y-auto">
        {invoices.map((invoice) => (
          <div
            key={invoice.invoiceId}
            className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent transition-colors"
            data-testid={`invoice-${invoice.invoiceId}`}
          >
            <div className="flex-1">
              <p className="font-medium">{invoice.customer}</p>
              <p className="text-sm text-muted-foreground">{invoice.invoiceId}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold">${invoice.amount.toLocaleString()}</p>
              <p className="text-xs text-destructive">
                {invoice.daysOverdue} days overdue
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
