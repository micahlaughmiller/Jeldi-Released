import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp,
  FileText,
  ArrowLeft,
  XCircle,
  ShoppingCart,
  DollarSign,
  Percent,
  Clock,
  Package,
  Truck,
  Star,
  Calendar,
  BarChart,
  Users,
  Search,
} from "lucide-react";

interface ChartSelectorProps {
  isOpen: boolean;
  onClose: () => void;
}

const iconMap: Record<string, any> = {
  "trending-up": TrendingUp,
  "file-text": FileText,
  "arrow-left": ArrowLeft,
  "x-circle": XCircle,
  "shopping-cart": ShoppingCart,
  "dollar-sign": DollarSign,
  "percent": Percent,
  "clock": Clock,
  "package": Package,
  "truck": Truck,
  "star": Star,
  "calendar": Calendar,
  "bar-chart": BarChart,
  "users": Users,
};

// Top 10 Suggested Charts for COO/CFO roles
const suggestedChartIds = [
  'revenue-trend',
  'cost-analysis',
  'profit-margin',
  'cash-flow',
  'orders-volume',
  'operational-efficiency',
  'inventory-turnover',
  'delivery-performance',
  'budget-variance',
  'financial-kpis',
];

export default function ChartSelector({ isOpen, onClose }: ChartSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const { toast } = useToast();

  const { data: availableCharts, isLoading } = useQuery({
    queryKey: ["/api/dashboard/available-charts"],
    enabled: isOpen,
  });

  const addChartMutation = useMutation({
    mutationFn: async (chartData: { chartType: string; size: string }) => {
      return await apiRequest("POST", "/api/dashboard/chart-preferences", chartData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/chart-preferences"] });
      toast({
        title: "Chart Added",
        description: "The chart has been added to your dashboard.",
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add chart",
        variant: "destructive",
      });
    },
  });

  const handleAddChart = (chartId: string, defaultSize: string) => {
    addChartMutation.mutate({
      chartType: chartId,
      size: defaultSize,
    });
  };

  const charts = (availableCharts as any[]) || [];
  const categories = ["all", ...Array.from(new Set(charts.map((c) => c.category)))];

  const filteredCharts = charts.filter((chart) => {
    const matchesSearch =
      chart.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chart.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" || chart.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]" data-testid="dialog-chart-selector">
        <DialogHeader>
          <DialogTitle data-testid="title-chart-selector">Add Chart to Dashboard</DialogTitle>
          <DialogDescription>
            Choose from available charts to add to your dashboard. Charts are filtered based on your role.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search charts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-charts"
            />
          </div>

          <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
            <TabsList className="w-full justify-start overflow-x-auto" data-testid="tabs-categories">
              {categories.map((category) => (
                <TabsTrigger
                  key={category}
                  value={category}
                  className="capitalize"
                  data-testid={`tab-${category}`}
                >
                  {category}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={selectedCategory} className="mt-4">
              <ScrollArea className="h-[400px] pr-4">
                {isLoading ? (
                  <div className="flex items-center justify-center h-40">
                    <i className="fas fa-spinner fa-spin text-2xl text-muted-foreground"></i>
                  </div>
                ) : filteredCharts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-center">
                    <i className="fas fa-chart-bar text-4xl text-muted-foreground/30 mb-4"></i>
                    <p className="text-muted-foreground">No charts found</p>
                  </div>
                ) : (
                  <>
                    {/* Suggested Charts Section - only show on "all" category with no search */}
                    {selectedCategory === "all" && !searchQuery && (() => {
                      const suggested = charts.filter(chart => suggestedChartIds.includes(chart.id));
                      if (suggested.length > 0) {
                        return (
                          <div className="mb-6 p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
                            <div className="flex items-center gap-2 mb-4">
                              <i className="fas fa-star text-amber-500"></i>
                              <h3 className="font-semibold text-primary">Recommended for COO/CFO</h3>
                              <Badge variant="default" className="text-xs bg-amber-500 hover:bg-amber-600">Top 10</Badge>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {suggested.map((chart) => {
                                const IconComponent = iconMap[chart.icon] || TrendingUp;
                                return (
                                  <div
                                    key={chart.id}
                                    className="border border-amber-500/30 rounded-lg p-4 hover:bg-amber-500/10 transition-colors"
                                    data-testid={`suggested-chart-${chart.id}`}
                                  >
                                    <div className="flex items-start justify-between mb-3">
                                      <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-amber-500/20">
                                          <IconComponent className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                                        </div>
                                        <div>
                                          <h4 className="font-semibold flex items-center gap-2">
                                            {chart.name}
                                            <i className="fas fa-sparkles text-amber-500 text-xs"></i>
                                          </h4>
                                          <Badge variant="outline" className="mt-1 capitalize text-xs border-amber-500/30 text-amber-600 dark:text-amber-400">
                                            {chart.category}
                                          </Badge>
                                        </div>
                                      </div>
                                    </div>
                                    <p className="text-sm text-muted-foreground mb-4">
                                      {chart.description}
                                    </p>
                                    <Button
                                      onClick={() => handleAddChart(chart.id, chart.defaultSize)}
                                      disabled={addChartMutation.isPending}
                                      size="sm"
                                      className="w-full bg-amber-500 hover:bg-amber-600 text-white"
                                      data-testid={`button-add-suggested-${chart.id}`}
                                    >
                                      <i className="fas fa-plus mr-2"></i>
                                      Add to Dashboard
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* All Charts */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredCharts.map((chart) => {
                        const IconComponent = iconMap[chart.icon] || TrendingUp;
                        return (
                          <div
                            key={chart.id}
                            className="border rounded-lg p-4 hover:bg-accent transition-colors"
                            data-testid={`chart-option-${chart.id}`}
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10">
                                  <IconComponent className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                  <h4 className="font-semibold">{chart.name}</h4>
                                  <Badge variant="outline" className="mt-1 capitalize text-xs">
                                    {chart.category}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground mb-4">
                              {chart.description}
                            </p>
                            <Button
                              onClick={() => handleAddChart(chart.id, chart.defaultSize)}
                              disabled={addChartMutation.isPending}
                              size="sm"
                              className="w-full"
                              data-testid={`button-add-${chart.id}`}
                            >
                              <i className="fas fa-plus mr-2"></i>
                              Add to Dashboard
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
