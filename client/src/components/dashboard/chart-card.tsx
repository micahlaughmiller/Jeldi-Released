import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, RefreshCw, Settings, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  isLoading?: boolean;
  error?: string;
  onRefresh?: () => void;
  onConfigure?: () => void;
  onDelete?: () => void;
  size?: "small" | "medium" | "large";
  testId?: string;
}

export default function ChartCard({
  title,
  description,
  children,
  isLoading = false,
  error,
  onRefresh,
  onConfigure,
  onDelete,
  size = "medium",
  testId,
}: ChartCardProps) {
  const sizeClasses = {
    small: "col-span-1",
    medium: "col-span-1 md:col-span-2",
    large: "col-span-1 md:col-span-2 lg:col-span-3",
  };

  return (
    <Card
      className={`p-6 ${sizeClasses[size]}`}
      data-testid={testId || `chart-card-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold" data-testid={`chart-title-${testId}`}>
            {title}
          </h3>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              disabled={isLoading}
              data-testid={`button-refresh-${testId}`}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid={`button-menu-${testId}`}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onConfigure && (
                <DropdownMenuItem
                  onClick={onConfigure}
                  data-testid={`menu-item-configure-${testId}`}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Configure
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive"
                  data-testid={`menu-item-delete-${testId}`}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-[200px] w-full" data-testid={`skeleton-${testId}`} />
          <div className="flex gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      ) : error ? (
        <div
          className="flex flex-col items-center justify-center h-[200px] text-center"
          data-testid={`error-${testId}`}
        >
          <i className="fas fa-exclamation-triangle text-4xl text-destructive mb-4"></i>
          <p className="text-destructive font-medium mb-2">Error loading chart</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              className="mt-4"
              data-testid={`button-retry-${testId}`}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          )}
        </div>
      ) : (
        <div data-testid={`chart-content-${testId}`}>{children}</div>
      )}
    </Card>
  );
}
