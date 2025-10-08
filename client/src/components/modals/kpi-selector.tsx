import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface KPISelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface KPI {
  id: string;
  name: string;
  type: string;
  erpSource: string;
}

interface GroupedKPIs {
  [category: string]: KPI[];
}

const categoryIcons: Record<string, string> = {
  financial: "fas fa-dollar-sign",
  operational: "fas fa-cogs",
  performance: "fas fa-chart-line",
  project: "fas fa-project-diagram",
  other: "fas fa-chart-bar",
};

const categoryNames: Record<string, string> = {
  financial: "Financial",
  operational: "Operational",
  performance: "Performance",
  project: "Project",
  other: "Other",
};

// Top 10 Suggested KPIs for COO/CFO roles
const suggestedKPITypes = [
  'cycle_time',
  'on_time_delivery',
  'cost_per_unit',
  'working_capital_efficiency',
  'gross_margin',
  'revenue',
  'orders',
  'inventory',
  'efficiency',
  'performance',
];

export default function KPISelector({ open, onOpenChange }: KPISelectorProps) {
  const { toast } = useToast();
  const [selectedKPIs, setSelectedKPIs] = useState<string[]>([]);

  const { data: availableKPIs = {} } = useQuery<GroupedKPIs>({
    queryKey: ["/api/dashboard/available-kpis"],
    enabled: open,
  });

  const { data: currentPreferences } = useQuery<{ preferences: any[]; defaults: string[] }>({
    queryKey: ["/api/dashboard/kpi-preferences"],
    enabled: open,
  });

  useEffect(() => {
    if (currentPreferences?.preferences) {
      setSelectedKPIs(currentPreferences.preferences.map((p: any) => p.kpiConfigId));
    }
  }, [currentPreferences]);

  const saveMutation = useMutation({
    mutationFn: async (kpiConfigIds: string[]) => {
      return await apiRequest("POST", "/api/dashboard/kpi-preferences", { kpiConfigIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/kpi-preferences"] });
      toast({
        title: "KPIs Updated",
        description: "Your dashboard KPIs have been saved successfully.",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save KPI preferences",
        variant: "destructive",
      });
    },
  });

  const toggleKPI = (kpiId: string) => {
    setSelectedKPIs(prev => {
      if (prev.includes(kpiId)) {
        return prev.filter(id => id !== kpiId);
      } else if (prev.length < 5) {
        return [...prev, kpiId];
      } else {
        toast({
          title: "Maximum Reached",
          description: "You can only select up to 5 KPIs",
          variant: "destructive",
        });
        return prev;
      }
    });
  };

  const handleSave = () => {
    if (selectedKPIs.length === 0) {
      toast({
        title: "No KPIs Selected",
        description: "Please select at least one KPI",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate(selectedKPIs);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="kpi-selector-modal">
        <DialogHeader>
          <DialogTitle>Customize Dashboard KPIs</DialogTitle>
          <DialogDescription>
            Select up to 5 KPIs to display on your dashboard. You can reorder them later by dragging.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between py-2">
          <div className="text-sm text-muted-foreground">
            Selected: <span className="font-semibold" data-testid="kpi-count">{selectedKPIs.length}/5</span>
          </div>
          {selectedKPIs.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedKPIs([])}
              data-testid="button-clear-selection"
            >
              Clear Selection
            </Button>
          )}
        </div>

        <ScrollArea className="h-[400px] pr-4">
          {/* Suggested KPIs Section */}
          {Object.keys(availableKPIs).length > 0 && (() => {
            const allKPIs = Object.values(availableKPIs).flat();
            const suggested = allKPIs.filter(kpi => suggestedKPITypes.includes(kpi.type));
            
            if (suggested.length > 0) {
              return (
                <div className="mb-6 p-3 rounded-lg border border-primary/20 bg-primary/5">
                  <div className="flex items-center gap-2 mb-3">
                    <i className="fas fa-star text-amber-500"></i>
                    <h3 className="font-semibold text-sm text-primary">Recommended for COO/CFO</h3>
                    <Badge variant="default" className="text-xs bg-amber-500 hover:bg-amber-600">Top 10</Badge>
                  </div>
                  <div className="space-y-1.5 pl-1">
                    {suggested.map((kpi: KPI) => (
                      <div
                        key={kpi.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-primary/10 cursor-pointer transition-colors border border-transparent hover:border-primary/30"
                        onClick={() => toggleKPI(kpi.id)}
                        data-testid={`suggested-kpi-${kpi.type}`}
                      >
                        <Checkbox
                          checked={selectedKPIs.includes(kpi.id)}
                          onCheckedChange={() => toggleKPI(kpi.id)}
                          data-testid={`checkbox-suggested-${kpi.type}`}
                        />
                        <div className="flex-1">
                          <div className="font-medium text-sm flex items-center gap-2">
                            {kpi.name}
                            <i className="fas fa-sparkles text-amber-500 text-xs"></i>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {kpi.type === 'cycle_time' && 'Average time to complete production/service cycle'}
                            {kpi.type === 'on_time_delivery' && 'Percentage of orders/deliveries completed on time'}
                            {kpi.type === 'cost_per_unit' && 'Average cost to produce/deliver each unit'}
                            {kpi.type === 'working_capital_efficiency' && 'Ratio of working capital to revenue'}
                            {kpi.type === 'gross_margin' && 'Gross profit as percentage of revenue'}
                            {kpi.type === 'revenue' && 'Total revenue for current period'}
                            {kpi.type === 'orders' && 'Number of active orders being processed'}
                            {kpi.type === 'inventory' && 'Percentage of inventory filled/available'}
                            {kpi.type === 'efficiency' && 'Overall operational efficiency'}
                            {kpi.type === 'performance' && 'Overall system performance score'}
                          </div>
                        </div>
                        {selectedKPIs.includes(kpi.id) && (
                          <Badge variant="default" className="text-xs">
                            {selectedKPIs.indexOf(kpi.id) + 1}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {/* All KPIs by Category */}
          {Object.entries(availableKPIs).map(([category, kpis]) => (
            <div key={category} className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <i className={`${categoryIcons[category] || categoryIcons.other} text-primary`}></i>
                <h3 className="font-semibold text-sm">{categoryNames[category] || category}</h3>
                <Badge variant="secondary" className="text-xs">{kpis.length}</Badge>
              </div>
              <div className="space-y-2 pl-6">
                {kpis.map((kpi: KPI) => (
                  <div
                    key={kpi.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => toggleKPI(kpi.id)}
                    data-testid={`kpi-option-${kpi.type}`}
                  >
                    <Checkbox
                      checked={selectedKPIs.includes(kpi.id)}
                      onCheckedChange={() => toggleKPI(kpi.id)}
                      data-testid={`checkbox-${kpi.type}`}
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{kpi.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Source: {kpi.erpSource}
                      </div>
                    </div>
                    {selectedKPIs.includes(kpi.id) && (
                      <Badge variant="default" className="text-xs">
                        {selectedKPIs.indexOf(kpi.id) + 1}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {Object.keys(availableKPIs).length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <i className="fas fa-chart-bar text-4xl mb-4 block"></i>
              <p>No KPIs available. Create KPIs in the settings to get started.</p>
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={selectedKPIs.length === 0 || saveMutation.isPending}
            data-testid="button-save"
          >
            {saveMutation.isPending ? (
              <>
                <i className="fas fa-spinner fa-spin mr-2"></i>
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
