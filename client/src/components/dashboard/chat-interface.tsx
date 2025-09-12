import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ChatInterfaceProps {
  userId: string;
}

export default function ChatInterface({ userId }: ChatInterfaceProps) {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{query: string, response: any, timestamp: Date}>>([]);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/chat/query", { query });
      const data = await response.json();
      
      // Add to chat history
      setChatHistory(prev => [...prev, {
        query,
        response: data,
        timestamp: new Date()
      }]);
      
      toast({
        title: "AI Analysis Complete",
        description: `Revenue: ${data.response || "Analysis complete"}`,
      });
      
      setQuery("");
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  return (
    <div className="bg-card border-t border-border p-4" data-testid="chat-interface">
      <div className="max-w-4xl mx-auto">
        {/* Chat History */}
        {chatHistory.length > 0 && (
          <div className="mb-6 space-y-4 max-h-96 overflow-y-auto">
            {chatHistory.slice(-3).map((item, index) => (
              <div key={index} className="bg-muted/50 rounded-lg p-4">
                <div className="text-sm font-medium text-foreground mb-2">
                  Q: {item.query}
                </div>
                <div className="text-sm text-muted-foreground mb-3">
                  <strong>Answer:</strong> {item.response.response}
                </div>
                {item.response.insights && item.response.insights.length > 0 && (
                  <div className="mb-2">
                    <strong className="text-xs text-chart-1">Key Insights:</strong>
                    <ul className="text-xs text-muted-foreground mt-1 list-disc list-inside">
                      {item.response.insights.slice(0, 3).map((insight: string, i: number) => (
                        <li key={i}>{insight}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {item.response.recommendations && item.response.recommendations.length > 0 && (
                  <div>
                    <strong className="text-xs text-chart-2">Recommendations:</strong>
                    <ul className="text-xs text-muted-foreground mt-1 list-disc list-inside">
                      {item.response.recommendations.slice(0, 2).map((rec: string, i: number) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="flex items-center space-x-4">
          <div className="w-10 h-10 bg-gradient-to-r from-chart-1 to-chart-4 rounded-full flex items-center justify-center">
            <i className="fas fa-robot text-white"></i>
          </div>
          <div className="flex-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your ERP data... (e.g., 'Show me top performing products this quarter')"
              className="w-full px-4 py-3"
              disabled={isLoading}
              data-testid="input-chat-query"
            />
          </div>
          <Button 
            type="submit" 
            disabled={isLoading || !query.trim()}
            data-testid="button-submit-chat"
          >
            {isLoading ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : (
              <i className="fas fa-paper-plane"></i>
            )}
          </Button>
        </form>
        
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
            <span className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-chart-2 rounded-full animate-pulse-dot"></div>
              <span>AI Assistant Ready</span>
            </span>
            <span>Real-time data access</span>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              className="text-muted-foreground hover:text-foreground" 
              title="Voice input"
              data-testid="button-voice-input"
            >
              <i className="fas fa-microphone"></i>
            </button>
            <button 
              className="text-muted-foreground hover:text-foreground" 
              title="Clear conversation"
              onClick={() => {setQuery(""); setChatHistory([]);}}
              data-testid="button-clear-chat"
            >
              <i className="fas fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
