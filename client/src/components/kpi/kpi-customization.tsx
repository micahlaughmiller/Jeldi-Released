import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Edit, Trash2, Settings, BarChart3, TrendingUp, DollarSign, Package, Cog } from "lucide-react";

// KPI Configuration Schema
const kpiConfigurationSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["revenue", "orders", "inventory", "performance", "efficiency"], {
    errorMap: () => ({ message: "Please select a valid KPI type" }),
  }),
  erpSource: z.string().min(1, "ERP source is required"),
  query: z.string().min(1, "Query is required"),
  position: z.number().min(1).max(5, "Position must be between 1 and 5"),
  refreshInterval: z.number().min(10).max(3600, "Refresh interval must be between 10 and 3600 seconds"),
  isActive: z.boolean().default(true),
});

type KpiConfigurationFormData = z.infer<typeof kpiConfigurationSchema>;

interface KpiConfiguration {
  id: string;
  userId: string;
  name: string;
  type: string;
  erpSource: string;
  query: string;
  position: number;
  isActive: boolean;
  refreshInterval: number;
  createdAt: string;
  latestData?: {
    value: string;
    change: number;
    timestamp: Date;
  };
}

interface KpiCustomizationProps {
  onClose?: () => void;
}

export default function KpiCustomization({ onClose }: KpiCustomizationProps) {
  const [selectedKpi, setSelectedKpi] = useState<KpiConfiguration | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check user permissions
  const { data: user } = useQuery({
    queryKey: ["/api/auth/me"],
  });
  
  // Check if user has KPI management permissions
  const canManageKpis = user?.roles?.some((role: any) => 
    ["admin", "manager", "analyst"].includes(role.role?.name?.toLowerCase())
  ) ?? false;

  // Form for creating/editing KPIs
  const form = useForm<KpiConfigurationFormData>({
    resolver: zodResolver(kpiConfigurationSchema),
    defaultValues: {
      name: "",
      type: "revenue",
      erpSource: "integrated",
      query: "",
      position: 1,
      refreshInterval: 30,
      isActive: true,
    },
  });

  // Query to get existing KPIs
  const { data: kpis = [], refetch: refetchKpis } = useQuery<KpiConfiguration[]>({
    queryKey: ["/api/kpis"],
  });

  // Create KPI mutation
  const createKpiMutation = useMutation({
    mutationFn: (data: KpiConfigurationFormData) => apiRequest("/api/kpis", "POST", data),
    onSuccess: () => {
      toast({
        title: "KPI Created",
        description: "Your KPI has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/kpis"] });
      setShowCreateDialog(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create KPI",
        variant: "destructive",
      });
    },
  });

  // Update KPI mutation
  const updateKpiMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<KpiConfigurationFormData> }) => 
      apiRequest(`/api/kpis/${id}`, "PUT", data),
    onSuccess: () => {
      toast({
        title: "KPI Updated",
        description: "KPI has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/kpis"] });
      setShowEditDialog(false);
      setSelectedKpi(null);
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update KPI",
        variant: "destructive",
      });
    },
  });

  // Delete KPI mutation
  const deleteKpiMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/kpis/${id}`, "DELETE"),
    onSuccess: () => {
      toast({
        title: "KPI Deleted",
        description: "KPI has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/kpis"] });
    },
    onError: (error: any) => {
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to delete KPI",
        variant: "destructive",
      });
    },
  });

  const getKPIIcon = (type: string) => {
    switch (type) {
      case "revenue": return DollarSign;
      case "orders": return Package;
      case "inventory": return Package;
      case "performance": return TrendingUp;
      case "efficiency": return Cog;
      default: return BarChart3;
    }
  };

  const getKPIColor = (type: string) => {
    switch (type) {
      case "revenue": return "text-green-600 bg-green-100";
      case "orders": return "text-blue-600 bg-blue-100";
      case "inventory": return "text-orange-600 bg-orange-100";
      case "performance": return "text-purple-600 bg-purple-100";
      case "efficiency": return "text-teal-600 bg-teal-100";
      default: return "text-gray-600 bg-gray-100";
    }
  };

  const onSubmit = (data: KpiConfigurationFormData) => {
    if (selectedKpi) {
      updateKpiMutation.mutate({ id: selectedKpi.id, data });
    } else {
      createKpiMutation.mutate(data);
    }
  };

  const handleEditKpi = (kpi: KpiConfiguration) => {
    setSelectedKpi(kpi);
    form.reset({
      name: kpi.name,
      type: kpi.type as any,
      erpSource: kpi.erpSource,
      query: kpi.query,
      position: kpi.position,
      refreshInterval: kpi.refreshInterval,
      isActive: kpi.isActive,
    });
    setShowEditDialog(true);
  };

  const handleDeleteKpi = (kpi: KpiConfiguration) => {
    if (confirm(`Are you sure you want to delete the KPI "${kpi.name}"?`)) {
      deleteKpiMutation.mutate(kpi.id);
    }
  };

  const handleCreateNew = () => {
    setSelectedKpi(null);
    form.reset();
    setShowCreateDialog(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">KPI Configuration</h2>
          <p className="text-muted-foreground">Create and manage your custom KPIs</p>
          {!canManageKpis && (
            <div className="mt-2">
              <Badge variant="secondary" className="text-xs">
                View Only - Contact admin to manage KPIs
              </Badge>
            </div>
          )}
        </div>
        {canManageKpis && (
          <Button onClick={handleCreateNew} data-testid="button-create-kpi">
            <Plus className="h-4 w-4 mr-2" />
            Create KPI
          </Button>
        )}
      </div>

      {/* KPIs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {kpis.map((kpi) => {
          const Icon = getKPIIcon(kpi.type);
          const colorClass = getKPIColor(kpi.type);
          
          return (
            <Card key={kpi.id} className="hover:shadow-md transition-shadow" data-testid={`kpi-card-${kpi.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClass}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{kpi.name}</CardTitle>
                      <div className="flex items-center space-x-2">
                        <Badge variant="secondary">{kpi.type}</Badge>
                        <Badge variant={kpi.isActive ? "default" : "secondary"}>
                          {kpi.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Position: {kpi.position}</p>
                    <p className="text-sm text-muted-foreground">Refresh: {kpi.refreshInterval}s</p>
                    <p className="text-sm text-muted-foreground">Source: {kpi.erpSource}</p>
                  </div>
                  
                  {kpi.latestData && (
                    <div className="border-t pt-3">
                      <p className="font-semibold">{kpi.latestData.value}</p>
                      <p className={`text-sm ${kpi.latestData.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {kpi.latestData.change >= 0 ? '+' : ''}{kpi.latestData.change.toFixed(1)}%
                      </p>
                    </div>
                  )}
                  
                  {canManageKpis && (
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditKpi(kpi)}
                        data-testid={`button-edit-kpi-${kpi.id}`}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteKpi(kpi)}
                        data-testid={`button-delete-kpi-${kpi.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        
        {kpis.length === 0 && (
          <div className="col-span-full text-center py-12">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">No KPIs configured</h3>
            <p className="text-muted-foreground mb-4">
              {canManageKpis 
                ? "Create your first KPI to start tracking your business metrics."
                : "No custom KPIs have been configured by your organization administrators."
              }
            </p>
            {canManageKpis && (
              <Button onClick={handleCreateNew}>
                <Plus className="h-4 w-4 mr-2" />
                Create First KPI
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog || showEditDialog} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false);
          setShowEditDialog(false);
          setSelectedKpi(null);
        }
      }}>
        <DialogContent className="sm:max-w-[500px]" data-testid="dialog-kpi-form">
          <DialogHeader>
            <DialogTitle>{selectedKpi ? 'Edit KPI' : 'Create New KPI'}</DialogTitle>
            <DialogDescription>
              {selectedKpi ? 'Update the KPI configuration.' : 'Configure a new KPI to track your business metrics.'}
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>KPI Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Monthly Revenue" {...field} data-testid="input-kpi-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>KPI Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-kpi-type">
                          <SelectValue placeholder="Select KPI type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="revenue">Revenue</SelectItem>
                        <SelectItem value="orders">Orders</SelectItem>
                        <SelectItem value="inventory">Inventory</SelectItem>
                        <SelectItem value="performance">Performance</SelectItem>
                        <SelectItem value="efficiency">Efficiency</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="position"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dashboard Position</FormLabel>
                      <Select onValueChange={(value) => field.onChange(Number(value))} value={field.value.toString()}>
                        <FormControl>
                          <SelectTrigger data-testid="select-kpi-position">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">Position 1</SelectItem>
                          <SelectItem value="2">Position 2</SelectItem>
                          <SelectItem value="3">Position 3</SelectItem>
                          <SelectItem value="4">Position 4</SelectItem>
                          <SelectItem value="5">Position 5</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="refreshInterval"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Refresh Interval (seconds)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min={10} 
                          max={3600}
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                          data-testid="input-kpi-refresh-interval"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="erpSource"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ERP Source</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-kpi-erp-source">
                          <SelectValue placeholder="Select ERP source" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="integrated">Integrated ERP</SelectItem>
                        <SelectItem value="sap">SAP</SelectItem>
                        <SelectItem value="netsuite">NetSuite</SelectItem>
                        <SelectItem value="dynamics365">Dynamics 365</SelectItem>
                        <SelectItem value="custom">Custom API</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Select the ERP system to pull data from
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="query"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Query</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Enter SQL query or API endpoint to fetch KPI data..."
                        className="min-h-[80px]"
                        {...field}
                        data-testid="textarea-kpi-query"
                      />
                    </FormControl>
                    <FormDescription>
                      SQL query or API endpoint to retrieve the KPI data
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Active</FormLabel>
                      <FormDescription>
                        Enable this KPI to display on the dashboard
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-kpi-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateDialog(false);
                    setShowEditDialog(false);
                    setSelectedKpi(null);
                  }}
                  data-testid="button-cancel-kpi-form"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createKpiMutation.isPending || updateKpiMutation.isPending}
                  data-testid="button-submit-kpi-form"
                >
                  {createKpiMutation.isPending || updateKpiMutation.isPending
                    ? "Saving..."
                    : selectedKpi
                    ? "Update KPI"
                    : "Create KPI"
                  }
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}