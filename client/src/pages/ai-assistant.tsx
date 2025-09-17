import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CheckCircle, Circle, Settings } from "lucide-react";
import Header from "@/components/layout/header";
import Sidebar from "@/components/layout/sidebar";

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
}

interface Conversation {
  id: string;
  title: string;
  description?: string;
  isFavorite: boolean;
  lastMessageAt: string;
  messageCount: number;
  createdAt: string;
  messages?: ChatMessage[];
}

interface ChatMessage {
  id: string;
  query: string;
  response: string;
  insights: string[];
  recommendations: string[];
  dataUsed: string[];
  chartSuggestions?: Array<{
    type: 'bar' | 'line' | 'pie' | 'table';
    title: string;
    description: string;
  }>;
  followUpQuestions?: string[];
  responseTime?: number;
  timestamp: string;
}

interface BusinessTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  query: string;
  expectedDataSources: string[];
}

interface QueryTemplate {
  id: string;
  name: string;
  description: string;
  query: string;
  category: string;
  icon: string;
  usageCount: number;
}

interface FavoriteQuery {
  id: string;
  query: string;
  title: string;
  description?: string;
  category: string;
  usageCount: number;
}

const businessTemplates: BusinessTemplate[] = [
  {
    id: "revenue_trends",
    name: "Analyze Monthly Revenue Trends",
    description: "Examine monthly revenue patterns, identify growth trends, and seasonal variations",
    category: "Financial",
    icon: "fas fa-chart-line",
    query: "Show me the monthly revenue trends for the past 12 months. What patterns do you see?",
    expectedDataSources: ["revenue", "sales", "financial"]
  },
  {
    id: "top_products",
    name: "Show Top Performing Products",
    description: "Identify best-selling products by revenue, volume, and profitability",
    category: "Sales",
    icon: "fas fa-trophy",
    query: "What are our top 10 performing products by revenue and sales volume this quarter?",
    expectedDataSources: ["products", "sales", "inventory"]
  },
  {
    id: "operational_inefficiencies",
    name: "Identify Operational Inefficiencies",
    description: "Find bottlenecks, delays, and areas for operational improvement",
    category: "Operations",
    icon: "fas fa-exclamation-triangle",
    query: "Analyze our operational data to identify inefficiencies and bottlenecks in our processes.",
    expectedDataSources: ["operations", "workflow", "performance"]
  },
  {
    id: "financial_summary",
    name: "Generate Financial Summary",
    description: "Comprehensive overview of financial health, key metrics, and performance indicators",
    category: "Financial",
    icon: "fas fa-chart-bar",
    query: "Provide a comprehensive financial summary including revenue, expenses, profit margins, and cash flow.",
    expectedDataSources: ["financial", "revenue", "expenses", "cash_flow"]
  }
];

export default function AIAssistant() {
  const [location, navigate] = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showNewConversationDialog, setShowNewConversationDialog] = useState(false);
  const [newConversationTitle, setNewConversationTitle] = useState("");
  const [newConversationDescription, setNewConversationDescription] = useState("");
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check authentication on mount
  useEffect(() => {
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");
    
    if (!token || !userData) {
      navigate("/login");
      return;
    }

    try {
      const parsedUser = JSON.parse(userData);
      setUser(parsedUser);
      setIsAuthenticated(true);
    } catch (error) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      navigate("/login");
    }
  }, [navigate]);

  // Query for user data with proper error handling
  const { data: userData, error: userError } = useQuery({
    queryKey: ['/api/auth/me'],
    staleTime: 5 * 60 * 1000,
    enabled: isAuthenticated,
    retry: false,
  });

  useEffect(() => {
    if (userError?.message?.includes('401') || userError?.message?.includes('403')) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      navigate("/login");
    }
  }, [userError, navigate]);

  // Query for conversations with authentication check
  const { data: conversations = [], refetch: refetchConversations, error: conversationsError } = useQuery<Conversation[]>({
    queryKey: ['/api/conversations'],
    enabled: isAuthenticated,
    retry: false,
  });

  useEffect(() => {
    if (conversationsError?.message?.includes('401') || conversationsError?.message?.includes('403')) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      navigate("/login");
    }
  }, [conversationsError, navigate]);

  // Query for conversation details with authentication check
  const { data: conversationData, error: conversationError } = useQuery({
    queryKey: ['/api/conversations', currentConversation?.id],
    enabled: !!currentConversation?.id && isAuthenticated,
    retry: false,
  });

  useEffect(() => {
    if (conversationError?.message?.includes('401') || conversationError?.message?.includes('403')) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      navigate("/login");
    }
  }, [conversationError, navigate]);

  // Query for query templates with authentication check
  const { data: templatesData, error: templatesError } = useQuery({
    queryKey: ['/api/query-templates'],
    enabled: isAuthenticated,
    retry: false,
  });

  useEffect(() => {
    if (templatesError?.message?.includes('401') || templatesError?.message?.includes('403')) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      navigate("/login");
    }
  }, [templatesError, navigate]);

  // Query for favorite queries with authentication check
  const { data: favorites = [], error: favoritesError } = useQuery<FavoriteQuery[]>({
    queryKey: ['/api/favorite-queries'],
    enabled: isAuthenticated,
    retry: false,
  });

  useEffect(() => {
    if (favoritesError?.message?.includes('401') || favoritesError?.message?.includes('403')) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      navigate("/login");
    }
  }, [favoritesError, navigate]);

  // Create conversation mutation
  const createConversationMutation = useMutation({
    mutationFn: async ({ title, description }: { title: string; description?: string }) => {
      const response = await apiRequest("POST", "/api/conversations", { title, description });
      return response.json();
    },
    onSuccess: (newConversation) => {
      refetchConversations();
      setCurrentConversation(newConversation);
      setShowNewConversationDialog(false);
      setNewConversationTitle("");
      setNewConversationDescription("");
      toast({
        title: "Conversation Created",
        description: "New conversation started successfully.",
      });
    },
    onError: (error: any) => {
      if (error?.message?.includes('401') || error?.message?.includes('403')) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login");
      } else {
        toast({
          title: "Failed to Create Conversation",
          description: error.message || "An error occurred",
          variant: "destructive",
        });
      }
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ conversationId, query }: { conversationId: string; query: string }) => {
      const response = await apiRequest("POST", `/api/chat/conversations/${conversationId}/message`, { query });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations', currentConversation?.id] });
      refetchConversations();
      setQuery("");
    },
    onError: (error: any) => {
      if (error?.message?.includes('401') || error?.message?.includes('403')) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login");
      } else {
        toast({
          title: "Message Failed",
          description: error.message || "Failed to send message",
          variant: "destructive",
        });
      }
    },
  });

  useEffect(() => {
    if (userData) {
      setUser(userData as User);
    }
  }, [userData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationData]);

  const handleSendMessage = async () => {
    if (!query.trim() || !currentConversation || isLoading || !isAuthenticated) return;

    setIsLoading(true);
    try {
      await sendMessageMutation.mutateAsync({
        conversationId: currentConversation.id,
        query: query.trim()
      });
    } catch (error) {
      // Error handling is now in the mutation's onError callback
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTemplateClick = (template: BusinessTemplate) => {
    if (currentConversation) {
      setQuery(template.query);
    } else {
      // Create new conversation with template
      createConversationMutation.mutate({
        title: template.name,
        description: template.description
      });
      setQuery(template.query);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  const handleERPClick = () => {
    // This would open ERP connections modal
    toast({
      title: "ERP Connections",
      description: "ERP connection management coming soon!",
    });
  };

  if (!user || !isAuthenticated) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  const messages = (conversationData as any)?.messages || [];

  return (
    <div className="h-screen flex bg-background text-foreground">
      <Sidebar 
        user={user}
        onLogout={handleLogout}
        onERPClick={handleERPClick}
        connectedCount={0}
      />
      
      <div className="flex-1 flex flex-col">
        <Header 
          connectedCount={0}
          connectionStatus="disconnected"
          onEmailClick={() => toast({ title: "Email", description: "Email feature coming soon!" })}
        />
        
        <div className="flex-1 flex overflow-hidden">
          {/* Conversations Sidebar */}
          <div className="w-80 bg-card border-r border-border flex flex-col">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">AI Assistant</h2>
                <Dialog open={showNewConversationDialog} onOpenChange={setShowNewConversationDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="whitespace-nowrap" data-testid="button-new-conversation">
                      <i className="fas fa-plus mr-2"></i>
                      New Chat
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Start New Conversation</DialogTitle>
                      <DialogDescription>
                        Create a new conversation to organize your business intelligence queries.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="title">Conversation Title</Label>
                        <Input
                          id="title"
                          value={newConversationTitle}
                          onChange={(e) => setNewConversationTitle(e.target.value)}
                          placeholder="e.g., Q3 Revenue Analysis"
                          data-testid="input-conversation-title"
                        />
                      </div>
                      <div>
                        <Label htmlFor="description">Description (Optional)</Label>
                        <Textarea
                          id="description"
                          value={newConversationDescription}
                          onChange={(e) => setNewConversationDescription(e.target.value)}
                          placeholder="Brief description of what you want to analyze..."
                          data-testid="textarea-conversation-description"
                        />
                      </div>
                      <Button 
                        onClick={() => createConversationMutation.mutate({
                          title: newConversationTitle,
                          description: newConversationDescription
                        })}
                        disabled={!newConversationTitle.trim() || createConversationMutation.isPending}
                        className="w-full whitespace-nowrap"
                        data-testid="button-create-conversation"
                      >
                        {createConversationMutation.isPending ? "Creating..." : "Start Conversation"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              
              {/* Quick Actions */}
              <div className="mb-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Quick Actions</h3>
                <div className="grid grid-cols-1 gap-2">
                  {businessTemplates.slice(0, 4).map((template) => (
                    <Button
                      key={template.id}
                      variant="outline"
                      size="sm"
                      className="justify-start h-auto p-3 text-left min-h-[3.5rem] flex-col w-full"
                      onClick={() => handleTemplateClick(template)}
                      data-testid={`template-${template.id}`}
                    >
                      <div className="flex items-start w-full gap-2">
                        <i className={`${template.icon} text-sm mt-0.5 flex-shrink-0 text-primary`}></i>
                        <div className="text-xs font-medium text-left break-words leading-tight overflow-wrap-anywhere flex-1">{template.name}</div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Conversations List */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-2">
                {conversations.map((conversation) => (
                  <Card
                    key={conversation.id}
                    className={`cursor-pointer transition-colors hover:bg-accent/50 ${
                      currentConversation?.id === conversation.id ? 'bg-accent' : ''
                    }`}
                    onClick={() => setCurrentConversation(conversation)}
                    data-testid={`conversation-${conversation.id}`}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate">{conversation.title}</h4>
                          {conversation.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {conversation.description}
                            </p>
                          )}
                          <div className="flex items-center mt-2 text-xs text-muted-foreground">
                            <span>{conversation.messageCount} messages</span>
                            <Separator orientation="vertical" className="mx-2 h-3" />
                            <span>{new Date(conversation.lastMessageAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        {conversation.isFavorite && (
                          <i className="fas fa-star text-yellow-500 text-xs ml-2"></i>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                {conversations.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <i className="fas fa-comments text-3xl mb-4"></i>
                    <p>No conversations yet.</p>
                    <p className="text-sm">Start your first AI chat!</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Main Chat Area */}
          <div className="flex-1 flex flex-col">
            {currentConversation ? (
              <>
                {/* Chat Header */}
                <div className="p-4 border-b border-border bg-card">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold" data-testid="conversation-title">
                        {currentConversation.title}
                      </h2>
                      {currentConversation.description && (
                        <p className="text-sm text-muted-foreground">
                          {currentConversation.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="secondary">
                        {messages.length} messages
                      </Badge>
                      <Button variant="outline" size="sm" className="whitespace-nowrap">
                        <i className="fas fa-download mr-2"></i>
                        Export
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-6">
                    {messages.map((message: ChatMessage, index: number) => (
                      <div key={message.id} className="space-y-4">
                        {/* User Query */}
                        <div className="flex justify-end">
                          <div className="bg-primary text-primary-foreground rounded-lg px-4 py-3 max-w-2xl">
                            <p className="text-sm">{message.query}</p>
                            <div className="text-xs opacity-75 mt-2">
                              {new Date(message.timestamp).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>

                        {/* AI Response */}
                        <div className="flex justify-start">
                          <div className="bg-card border rounded-lg px-4 py-3 max-w-4xl">
                            <div className="flex items-center mb-2">
                              <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-green-500 rounded-full flex items-center justify-center mr-3">
                                <i className="fas fa-robot text-white text-sm"></i>
                              </div>
                              <div className="flex-1">
                                <span className="font-medium">Jeldi AI Assistant</span>
                                {message.responseTime && (
                                  <span className="text-xs text-muted-foreground ml-2">
                                    ({message.responseTime}ms)
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <div className="prose prose-sm max-w-none mb-4">
                              <p>{message.response}</p>
                            </div>

                            {/* Insights */}
                            {message.insights && message.insights.length > 0 && (
                              <div className="mb-4">
                                <h4 className="font-medium text-sm mb-2 text-blue-600">
                                  <i className="fas fa-lightbulb mr-1"></i>
                                  Key Insights
                                </h4>
                                <ul className="space-y-1">
                                  {message.insights.map((insight: string, i: number) => (
                                    <li key={i} className="text-sm text-muted-foreground flex items-start">
                                      <CheckCircle className="w-3 h-3 mr-2 mt-0.5 text-blue-500" />
                                      {insight}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Recommendations */}
                            {message.recommendations && message.recommendations.length > 0 && (
                              <div className="mb-4">
                                <h4 className="font-medium text-sm mb-2 text-green-600">
                                  <i className="fas fa-check-circle mr-1"></i>
                                  Recommendations
                                </h4>
                                <ul className="space-y-1">
                                  {message.recommendations.map((rec: string, i: number) => (
                                    <li key={i} className="text-sm text-muted-foreground flex items-start">
                                      <Circle className="w-3 h-3 mr-2 mt-0.5 text-green-500" />
                                      {rec}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Chart Suggestions */}
                            {message.chartSuggestions && message.chartSuggestions.length > 0 && (
                              <div className="mb-4">
                                <h4 className="font-medium text-sm mb-2 text-purple-600">
                                  <i className="fas fa-chart-bar mr-1"></i>
                                  Visualization Suggestions
                                </h4>
                                <div className="grid grid-cols-1 gap-2">
                                  {message.chartSuggestions.map((chart: any, i: number) => (
                                    <div key={i} className="bg-muted/50 rounded p-2">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center">
                                          <Badge variant="outline" className="mr-2">
                                            {chart.type}
                                          </Badge>
                                          <span className="text-sm font-medium">{chart.title}</span>
                                        </div>
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-1">{chart.description}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Follow-up Questions */}
                            {message.followUpQuestions && message.followUpQuestions.length > 0 && (
                              <div className="mb-4">
                                <h4 className="font-medium text-sm mb-2 text-orange-600">
                                  <i className="fas fa-question-circle mr-1"></i>
                                  Follow-up Questions
                                </h4>
                                <div className="flex flex-col gap-1">
                                  {message.followUpQuestions.map((question: string, i: number) => (
                                    <Button
                                      key={i}
                                      variant="outline"
                                      size="sm"
                                      className="text-xs h-auto py-2 px-3 text-left break-words overflow-wrap-anywhere w-full justify-start"
                                      onClick={() => setQuery(question)}
                                      data-testid={`followup-${i}`}
                                    >
                                      {question}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Data Sources Used */}
                            {message.dataUsed && message.dataUsed.length > 0 && (
                              <div className="text-xs text-muted-foreground">
                                <span className="font-medium">Data sources: </span>
                                {message.dataUsed.join(", ")}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Input Area */}
                <div className="p-4 border-t border-border bg-card">
                  <div className="flex items-end space-x-2">
                    <div className="flex-1">
                      <Textarea
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyPress}
                        placeholder="Ask anything about your business data..."
                        className="min-h-[80px] resize-none"
                        disabled={isLoading}
                        data-testid="input-chat-query"
                      />
                    </div>
                    <Button 
                      onClick={handleSendMessage}
                      disabled={!query.trim() || isLoading}
                      size="lg"
                      data-testid="button-send-message"
                    >
                      {isLoading ? (
                        <i className="fas fa-spinner fa-spin"></i>
                      ) : (
                        <i className="fas fa-paper-plane"></i>
                      )}
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                    <div className="flex items-center space-x-4">
                      <span className="flex items-center">
                        <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                        AI Assistant Ready
                      </span>
                      <span>Real-time ERP data access</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button variant="ghost" size="sm" className="h-6 px-2 whitespace-nowrap">
                        <i className="fas fa-microphone text-xs mr-1"></i>
                        Voice
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 px-2 whitespace-nowrap">
                        <i className="fas fa-paperclip text-xs mr-1"></i>
                        Attach
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              /* Welcome Screen */
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-2xl px-8">
                  <div className="w-20 h-20 bg-gradient-to-r from-purple-500 to-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                    <i className="fas fa-robot text-white text-2xl"></i>
                  </div>
                  <h1 className="text-3xl font-bold mb-4">Jeldi AI Assistant</h1>
                  <p className="text-muted-foreground mb-8">
                    Get instant insights from your business data with AI-powered analysis.
                    Start a new conversation or choose from our business intelligence templates.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    {businessTemplates.map((template) => (
                      <Card
                        key={template.id}
                        className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => handleTemplateClick(template)}
                        data-testid={`welcome-template-${template.id}`}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-gradient-to-r from-purple-100 to-green-100 rounded-lg flex items-center justify-center">
                              <i className={`${template.icon} text-purple-600`}></i>
                            </div>
                            <div className="flex-1 text-left">
                              <CardTitle className="text-sm">{template.name}</CardTitle>
                              <Badge variant="secondary" className="text-xs">
                                {template.category}
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <CardDescription className="text-xs">
                            {template.description}
                          </CardDescription>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  
                  <Button
                    size="lg"
                    className="whitespace-nowrap"
                    onClick={() => setShowNewConversationDialog(true)}
                    data-testid="button-start-conversation"
                  >
                    <i className="fas fa-plus mr-2"></i>
                    Start New Conversation
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}