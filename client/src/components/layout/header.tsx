import { useLocation } from "wouter";

interface HeaderProps {
  connectedCount: number;
  connectionStatus: "connected" | "connecting" | "disconnected";
  onERPClick?: () => void;
  onAccountClick?: () => void;
}

export default function Header({ connectedCount, connectionStatus, onERPClick, onAccountClick }: HeaderProps) {
  const [, setLocation] = useLocation();
  // Pages that don't manage ERP connections send the user to the dashboard; account goes to settings
  const handleERPClick = onERPClick ?? (() => setLocation("/dashboard"));
  const handleAccountClick = onAccountClick ?? (() => setLocation("/settings"));
  return (
    <header className="bg-card border-b border-border px-6 py-4" data-testid="header">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Real-Time Dashboard</h2>
          <p className="text-sm text-muted-foreground">Monitor your enterprise performance across all ERP systems</p>
        </div>
        <div className="flex items-center space-x-4">
          {/* ERP Connection Status - Moved to top-right */}
          <button
            onClick={handleERPClick}
            className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            data-testid="button-erp-status"
          >
            <div className={`w-2 h-2 rounded-full ${
              connectionStatus === "connected" ? "bg-chart-2 animate-pulse-dot" :
              connectionStatus === "connecting" ? "bg-yellow-500 animate-pulse" :
              "bg-red-500"
            }`}></div>
            <span className="text-sm font-medium">
              {connectedCount} ERP{connectedCount !== 1 ? 's' : ''}
            </span>
            <i className="fas fa-chevron-down text-xs text-muted-foreground"></i>
          </button>
          
          {/* Account Icon */}
          <button
            onClick={handleAccountClick}
            className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors"
            data-testid="button-account"
          >
            <i className="fas fa-user"></i>
          </button>
        </div>
      </div>
    </header>
  );
}
