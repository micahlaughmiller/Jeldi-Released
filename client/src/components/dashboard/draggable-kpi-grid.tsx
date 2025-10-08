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
import KPIWidget from "./kpi-widget";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface KPIPreference {
  id: string;
  position: number;
  kpiConfig: {
    id: string;
    name: string;
    type: string;
    position: number;
  };
  latestData?: {
    value: string;
    change: number;
    timestamp: Date;
  };
}

interface DraggableKPIGridProps {
  preferences: KPIPreference[];
  onCustomize: () => void;
}

interface SortableKPIProps {
  preference: KPIPreference;
  index: number;
}

function SortableKPI({ preference, index }: SortableKPIProps) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-move"
      data-testid={`sortable-kpi-${preference.kpiConfig.type}`}
    >
      <KPIWidget
        kpi={preference.kpiConfig}
        data={preference.latestData}
        position={index}
      />
    </div>
  );
}

function EmptyKPISlot({ index }: { index: number }) {
  return (
    <div
      className="bg-card rounded-xl border-2 border-dashed border-muted-foreground/20 p-6 flex items-center justify-center min-h-[180px]"
      data-testid={`empty-kpi-slot-${index}`}
    >
      <div className="text-center text-muted-foreground">
        <i className="fas fa-plus-circle text-3xl mb-2 block opacity-50"></i>
        <p className="text-sm">Empty Slot</p>
      </div>
    </div>
  );
}

export default function DraggableKPIGrid({ preferences, onCustomize }: DraggableKPIGridProps) {
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
      return await apiRequest("PUT", "/api/dashboard/kpi-preferences/reorder", { positions });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/kpi-preferences"] });
      toast({
        title: "KPIs Reordered",
        description: "Your dashboard KPI order has been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save KPI order",
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
        
        // Update positions and save
        const positions = reordered.map((item, index) => ({
          id: item.id,
          position: index + 1,
        }));

        reorderMutation.mutate(positions);

        return reordered;
      });
    }
  }

  // Fill empty slots up to 5
  const emptySlots = Math.max(0, 5 - items.length);
  const displayItems = [...items];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Your KPIs</h2>
          <p className="text-sm text-muted-foreground">
            Drag to reorder, or{" "}
            <button
              onClick={onCustomize}
              className="text-primary hover:underline"
              data-testid="link-customize"
            >
              customize your selection
            </button>
          </p>
        </div>
        <button
          onClick={onCustomize}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          data-testid="button-customize-kpis"
        >
          <i className="fas fa-sliders-h"></i>
          <span>Customize KPIs</span>
          <span className="ml-1 text-xs opacity-75" data-testid="kpi-selected-count">
            ({items.length}/5)
          </span>
        </button>
      </div>

      {items.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map(item => item.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
              {displayItems.map((preference, index) => (
                <SortableKPI
                  key={preference.id}
                  preference={preference}
                  index={index}
                />
              ))}
              {Array.from({ length: emptySlots }, (_, i) => (
                <EmptyKPISlot key={`empty-${i}`} index={items.length + i} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <i className="fas fa-chart-bar text-5xl text-muted-foreground/30 mb-4 block"></i>
          <h3 className="text-lg font-semibold mb-2">No KPIs Selected</h3>
          <p className="text-muted-foreground mb-4">
            Customize your dashboard by selecting KPIs to track
          </p>
          <button
            onClick={onCustomize}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            data-testid="button-get-started"
          >
            <i className="fas fa-plus-circle mr-2"></i>
            Get Started
          </button>
        </div>
      )}
    </div>
  );
}
