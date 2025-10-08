import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Send, Minimize2 } from "lucide-react";

interface GlobalAIBarProps {
  onSubmit: (query: string) => void;
  isLoading: boolean;
  isMinimized: boolean;
  hasResponse: boolean;
  onMaximize?: () => void;
}

export default function GlobalAIBar({ 
  onSubmit, 
  isLoading, 
  isMinimized, 
  hasResponse,
  onMaximize 
}: GlobalAIBarProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;
    
    onSubmit(query.trim());
    setQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border shadow-lg"
      data-testid="global-ai-bar"
    >
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2 sm:py-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-2 sm:gap-3">
          {/* AI Icon */}
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>

          {/* Input Field */}
          <div className="flex-1 relative">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your business data..."
              className="w-full pr-12 sm:pr-24 text-sm sm:text-base"
              disabled={isLoading}
              data-testid="input-global-ai-query"
            />
            {isMinimized && hasResponse && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-10 sm:right-14 top-1/2 -translate-y-1/2 hidden sm:flex"
                onClick={onMaximize}
                data-testid="button-maximize-response"
              >
                <Minimize2 className="w-4 h-4" />
              </Button>
            )}
          </div>

          {/* Submit Button */}
          <Button 
            type="submit" 
            disabled={isLoading || !query.trim()}
            className="flex-shrink-0"
            size="sm"
            data-testid="button-submit-global-ai"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>

        {/* Status Indicator */}
        <div className="flex items-center justify-between mt-1 sm:mt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
            <span className="hidden sm:inline">{isLoading ? "Processing..." : "AI Assistant Ready"}</span>
            <span className="sm:hidden">{isLoading ? "Processing..." : "Ready"}</span>
          </div>
          <span className="hidden md:inline">Press Enter to submit • Shift + Enter for new line</span>
        </div>
      </div>
    </div>
  );
}
