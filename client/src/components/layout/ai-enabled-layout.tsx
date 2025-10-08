import { useState } from "react";
import { useLocation } from "wouter";
import GlobalAIBar from "./global-ai-bar";
import AIResponsePanel from "./ai-response-panel";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AIResponse {
  response: string;
  insights?: string[];
  recommendations?: string[];
  dataUsed?: string[];
  timestamp?: string;
}

interface AIEnabledLayoutProps {
  children: React.ReactNode;
}

export default function AIEnabledLayout({ children }: AIEnabledLayoutProps) {
  const [location] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [currentResponse, setCurrentResponse] = useState<AIResponse | null>(null);
  const [isResponseVisible, setIsResponseVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Routes where AI bar should NOT appear
  const excludedRoutes = ["/login", "/register", "/settings", "/account"];
  const isExcludedRoute = excludedRoutes.some(route => location.startsWith(route));

  // Routes where response panel should NOT appear (full-screen chat experience)
  const fullScreenChatRoutes = ["/ai-assistant", "/assistant"];
  const isFullScreenChat = fullScreenChatRoutes.some(route => location.startsWith(route));

  const handleSubmit = async (query: string) => {
    setIsLoading(true);
    setIsMinimized(false);
    
    try {
      const response = await apiRequest("POST", "/api/chat/query", { query });
      const data = await response.json();
      
      const aiResponse: AIResponse = {
        response: data.response || "Analysis complete",
        insights: data.insights || [],
        recommendations: data.recommendations || [],
        dataUsed: data.dataUsed || [],
        timestamp: new Date().toISOString()
      };
      
      setCurrentResponse(aiResponse);
      setIsResponseVisible(true);
    } catch (error) {
      toast({
        title: "Query failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setIsResponseVisible(false);
    setCurrentResponse(null);
    setIsMinimized(false);
  };

  const handleMinimize = () => {
    setIsMinimized(true);
    setIsResponseVisible(false);
  };

  const handleMaximize = () => {
    setIsMinimized(false);
    setIsResponseVisible(true);
  };

  // Calculate content height based on panel visibility
  const contentHeight = isResponseVisible && !isFullScreenChat 
    ? "h-[70vh] sm:h-[75vh]" 
    : "h-[calc(100vh-4rem)]";

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Main Content Area */}
      <div 
        className={`${contentHeight} overflow-auto transition-all duration-300`}
        data-testid="ai-layout-content"
      >
        {children}
      </div>

      {/* AI Response Panel - only show if not in full-screen chat mode */}
      {!isFullScreenChat && (
        <AIResponsePanel
          response={currentResponse}
          isVisible={isResponseVisible}
          onClose={handleClose}
          onMinimize={handleMinimize}
        />
      )}

      {/* Global AI Bar - only show if not in excluded routes */}
      {!isExcludedRoute && (
        <GlobalAIBar
          onSubmit={handleSubmit}
          isLoading={isLoading}
          isMinimized={isMinimized}
          hasResponse={!!currentResponse}
          onMaximize={handleMaximize}
        />
      )}

      {/* Bottom padding to account for AI bar */}
      {!isExcludedRoute && <div className="h-20" />}
    </div>
  );
}
