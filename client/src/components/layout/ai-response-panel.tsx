import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Minimize2, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";

interface AIResponse {
  response: string;
  insights?: string[];
  recommendations?: string[];
  dataUsed?: string[];
  timestamp?: string;
}

interface AIResponsePanelProps {
  response: AIResponse | null;
  isVisible: boolean;
  onClose: () => void;
  onMinimize: () => void;
}

export default function AIResponsePanel({ 
  response, 
  isVisible, 
  onClose, 
  onMinimize 
}: AIResponsePanelProps) {
  const [, navigate] = useLocation();

  if (!isVisible || !response) return null;

  const handleViewFullConversation = () => {
    navigate("/ai-assistant");
  };

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 h-[22vh] bg-background border-t border-border shadow-2xl z-30 animate-in slide-in-from-bottom duration-300"
      data-testid="ai-response-panel"
    >
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
              <span className="text-white text-xs">AI</span>
            </div>
            <h3 className="text-sm font-semibold">AI Response</h3>
            {response.timestamp && (
              <Badge variant="secondary" className="text-xs">
                {new Date(response.timestamp).toLocaleTimeString()}
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={handleViewFullConversation}
              data-testid="button-view-full-conversation"
            >
              <ExternalLink className="w-4 h-4 mr-1" />
              Full Chat
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={onMinimize}
              data-testid="button-minimize-panel"
            >
              <Minimize2 className="w-4 h-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={onClose}
              data-testid="button-close-panel"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content - Mini version with only answer and scroll */}
        <ScrollArea className="flex-1 px-4 py-3">
          <div className="pb-4">
            <p className="text-sm text-foreground leading-relaxed" data-testid="text-ai-response">
              {response.response}
            </p>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
