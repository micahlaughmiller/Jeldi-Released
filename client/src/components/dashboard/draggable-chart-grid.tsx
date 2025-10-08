import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ChartCard from "./chart-card";
import Revenue90DChart from "./revenue-90d-chart";
import UnpaidInvoicesChart from "./unpaid-invoices-chart";
import RefundsChart from "./refunds-chart";
import CancellationsChart from "./cancellations-chart";

interface ChartPreference {
  id: string;
  chartType: string;
  position: number;
  size: string;
  isVisible: boolean;
  configuration?: any;
}

interface DraggableChartGridProps {
  preferences: ChartPreference[];
  onAddChart: () => void;
}

interface SortableChartProps {
  preference: ChartPreference;
  onDelete: (id: string) => void;
}

const chartComponents: Record<string, any> = {
  revenue_90d: Revenue90DChart,
  unpaid_invoices: UnpaidInvoicesChart,
  refunds: RefundsChart,
  cancellations: CancellationsChart,
};

const chartTitles: Record<string, string> = {
  revenue_90d: "Revenue (90 Days)",
  unpaid_invoices: "Unpaid Invoices",
  refunds: "Refunds",
  cancellations: "Cancellations",
  orders_over_time: "Orders Over Time",
  cash_flow: "Cash Flow",
  profit_margin: "Profit Margin",
  ar_aging: "AR Aging",
  inventory_levels: "Inventory Levels",
  delivery_performance: "Delivery Performance",
  quality_metrics: "Quality Metrics",
  project_timeline: "Project Timeline",
  budget_vs_actual: "Budget vs Actual",
  resource_utilization: "Resource Utilization",
};

function SortableChart({ preference, onDelete }: SortableChartProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: preference.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const ChartComponent = chartComponents[preference.chartType];
  const title = chartTitles[preference.chartType] || preference.chartType;

  if (!ChartComponent) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className="cursor-move"
        data-testid={`sortable-chart-${preference.chartType}`}
      >
        <ChartCard
          title={title}
          description="Chart component not available"
          onDelete={() => onDelete(preference.id)}
          size={preference.size as any}
          testId={preference.chartType}
        >
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            Chart type: {preference.chartType}
          </div>
        </ChartCard>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-move"
      data-testid={`sortable-chart-${preference.chartType}`}
    >
      <ChartCard
        title={title}
        onDelete={() => onDelete(preference.id)}
        size={preference.size as any}
        testId={preference.chartType}
      >
        <ChartComponent configuration={preference.configuration} />
      </ChartCard>
    </div>
  );
}

export default function DraggableChartGrid({
  preferences,
  onAddChart,
}: DraggableChartGridProps) {
  const { toast } = useToast();
  const [items, setItems] = useState(preferences);

  useEffect(() => {
    setItems(preferences);
  }, [preferences]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const reorderMutation = useMutation({
    mutationFn: async (positions: { id: string; position: number }[]) => {
      return await apiRequest("PUT", "/api/dashboard/chart-preferences/reorder", {
        positions,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/chart-preferences"] });
      toast({
        title: "Charts Reordered",
        description: "Your dashboard chart order has been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save chart order",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/dashboard/chart-preferences/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/chart-preferences"] });
      toast({
        title: "Chart Deleted",
        description: "The chart has been removed from your dashboard.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete chart",
        variant: "destructive",
      });
    },
  });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        const reordered = arrayMove(items, oldIndex, newIndex);

        const positions = reordered.map((item, index) => ({
          id: item.id,
          position: index + 1,
        }));

        reorderMutation.mutate(positions);

        return reordered;
      });
    }
  }

  function handleDelete(id: string) {
    deleteMutation.mutate(id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Your Charts</h2>
          <p className="text-sm text-muted-foreground">
            Drag to reorder, or{" "}
            <button
              onClick={onAddChart}
              className="text-primary hover:underline"
              data-testid="link-add-chart"
            >
              add more charts
            </button>
          </p>
        </div>
        <button
          onClick={onAddChart}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          data-testid="button-add-chart"
        >
          <i className="fas fa-plus"></i>
          <span>Add Chart</span>
        </button>
      </div>

      {items.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={items.map((item) => item.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.map((preference) => (
                <SortableChart
                  key={preference.id}
                  preference={preference}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <i className="fas fa-chart-area text-5xl text-muted-foreground/30 mb-4 block"></i>
          <h3 className="text-lg font-semibold mb-2">No Charts Added</h3>
          <p className="text-muted-foreground mb-4">
            Customize your dashboard by adding charts to track metrics
          </p>
          <button
            onClick={onAddChart}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            data-testid="button-get-started-charts"
          >
            <i className="fas fa-plus-circle mr-2"></i>
            Add Your First Chart
          </button>
        </div>
      )}
    </div>
  );
}
