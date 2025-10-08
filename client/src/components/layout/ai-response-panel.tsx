import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { X, Minimize2, ExternalLink, Lightbulb, Target, Database } from "lucide-react";
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
      className="fixed bottom-0 left-0 right-0 h-[30vh] sm:h-[25vh] bg-background border-t border-border shadow-2xl z-30 animate-in slide-in-from-bottom duration-300"
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

        {/* Content */}
        <ScrollArea className="flex-1 px-4 py-3">
          <div className="space-y-4 pb-4">
            {/* Main Response */}
            <div>
              <div className="flex items-start gap-2 mb-2">
                <Target className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
                <h4 className="text-sm font-semibold">Answer</h4>
              </div>
              <p className="text-sm text-foreground leading-relaxed ml-6" data-testid="text-ai-response">
                {response.response}
              </p>
            </div>

            {/* Insights */}
            {response.insights && response.insights.length > 0 && (
              <div>
                <div className="flex items-start gap-2 mb-2">
                  <Lightbulb className="w-4 h-4 text-blue-500 mt-1 flex-shrink-0" />
                  <h4 className="text-sm font-semibold text-blue-500">Key Insights</h4>
                </div>
                <ul className="space-y-1 ml-6">
                  {response.insights.map((insight, index) => (
                    <li 
                      key={index} 
                      className="text-sm text-muted-foreground flex items-start gap-2"
                      data-testid={`insight-${index}`}
                    >
                      <span className="text-blue-500 mt-1">•</span>
                      <span>{insight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendations */}
            {response.recommendations && response.recommendations.length > 0 && (
              <div>
                <div className="flex items-start gap-2 mb-2">
                  <Target className="w-4 h-4 text-green-500 mt-1 flex-shrink-0" />
                  <h4 className="text-sm font-semibold text-green-500">Recommendations</h4>
                </div>
                <ul className="space-y-1 ml-6">
                  {response.recommendations.map((recommendation, index) => (
                    <li 
                      key={index} 
                      className="text-sm text-muted-foreground flex items-start gap-2"
                      data-testid={`recommendation-${index}`}
                    >
                      <span className="text-green-500 mt-1">•</span>
                      <span>{recommendation}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Data Sources */}
            {response.dataUsed && response.dataUsed.length > 0 && (
              <div>
                <Separator className="my-3" />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Database className="w-3 h-3" />
                  <span>Data sources:</span>
                  <div className="flex flex-wrap gap-1">
                    {response.dataUsed.map((source, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {source}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
