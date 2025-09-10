interface HeaderProps {
  connectedCount: number;
  connectionStatus: "connected" | "connecting" | "disconnected";
  onEmailClick: () => void;
}

export default function Header({ connectedCount, connectionStatus, onEmailClick }: HeaderProps) {
  return (
    <header className="bg-card border-b border-border px-6 py-4" data-testid="header">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Real-Time Dashboard</h2>
          <p className="text-sm text-muted-foreground">Monitor your enterprise performance across all ERP systems</p>
        </div>
        <div className="flex items-center space-x-4">
          {/* Connection Status */}
          <div className="flex items-center space-x-2" data-testid="connection-status">
            <div className={`w-2 h-2 rounded-full ${
              connectionStatus === "connected" ? "bg-chart-2 animate-pulse-dot" :
              connectionStatus === "connecting" ? "bg-yellow-500 animate-pulse" :
              "bg-red-500"
            }`}></div>
            <span className="text-sm text-muted-foreground">
              {connectedCount} ERPs Connected
            </span>
          </div>
          
          {/* Notification Bell */}
          <button 
            className="relative p-2 text-muted-foreground hover:text-foreground"
            data-testid="button-notifications"
          >
            <i className="fas fa-bell"></i>
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-destructive rounded-full text-xs flex items-center justify-center text-destructive-foreground">
              3
            </span>
          </button>
          
          {/* Email Button */}
          <button 
            className="flex items-center space-x-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
            onClick={onEmailClick}
            data-testid="button-compose-email"
          >
            <i className="fas fa-envelope text-sm"></i>
            <span>Compose</span>
          </button>
        </div>
      </div>
    </header>
  );
}
