import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import KPIWidget from "@/components/dashboard/kpi-widget";
import RevenueChart from "@/components/dashboard/revenue-chart";
import ERPStatus from "@/components/dashboard/erp-status";
import ChatInterface from "@/components/dashboard/chat-interface";
import { useToast } from "@/hooks/use-toast";

// Realistic $200MM AAR Company Demo Data (90 days)
const demoKPIs = [
  {
    id: "revenue",
    name: "Monthly Revenue",
    type: "revenue" as const,
    position: 0,
    refreshInterval: 5000,
    isActive: true
  },
  {
    id: "orders", 
    name: "Active Orders",
    type: "orders" as const,
    position: 1,
    refreshInterval: 5000,
    isActive: true
  },
  {
    id: "inventory",
    name: "Inventory Fill Rate", 
    type: "inventory" as const,
    position: 2,
    refreshInterval: 5000,
    isActive: true
  },
  {
    id: "performance",
    name: "System Performance",
    type: "performance" as const,
    position: 3,
    refreshInterval: 5000,
    isActive: true
  },
  {
    id: "efficiency",
    name: "Operational Efficiency",
    type: "efficiency" as const,
    position: 4,
    refreshInterval: 5000,
    isActive: true
  }
];

const demoKPIData = {
  revenue: {
    id: "revenue",
    name: "Monthly Revenue",
    type: "revenue" as const,
    value: "$16.7M",
    change: 12.5,
    timestamp: new Date()
  },
  orders: {
    id: "orders", 
    name: "Active Orders",
    type: "orders" as const,
    value: "2,847",
    change: 8.2,
    timestamp: new Date()
  },
  inventory: {
    id: "inventory",
    name: "Inventory Fill Rate",
    type: "inventory" as const, 
    value: "94.2%",
    change: -2.1,
    timestamp: new Date()
  },
  performance: {
    id: "performance",
    name: "System Performance", 
    type: "performance" as const,
    value: "98.8%",
    change: 15.7,
    timestamp: new Date()
  },
  efficiency: {
    id: "efficiency",
    name: "Operational Efficiency",
    type: "efficiency" as const,
    value: "91.3%", 
    change: 6.4,
    timestamp: new Date()
  }
};

const demoERPSystems = [
  {
    name: "sap",
    displayName: "SAP S/4HANA",
    description: "Core ERP system managing finance and operations",
    isConnected: true,
    lastSync: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
    status: "active" as const
  },
  {
    name: "netsuite", 
    displayName: "Oracle NetSuite",
    description: "CRM and e-commerce platform integration",
    isConnected: true,
    lastSync: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
    status: "active" as const
  },
  {
    name: "dynamics365",
    displayName: "Microsoft Dynamics 365",
    description: "Sales and customer service management", 
    isConnected: true,
    lastSync: new Date(Date.now() - 1 * 60 * 1000), // 1 minute ago
    status: "active" as const
  },
  {
    name: "workday",
    displayName: "Workday HCM",
    description: "Human resources and payroll system",
    isConnected: false,
    lastSync: undefined,
    status: "inactive" as const
  }
];

const demoUser = {
  id: "demo-user",
  username: "Demo User",
  email: "demo@enterprise.com"
};

// Sample AI chat scenarios for $200MM company
const sampleQueries = [
  "What is our revenue trend over the last 90 days?",
  "Show me inventory levels across all warehouses",
  "Analyze customer acquisition cost vs lifetime value",
  "What are our top performing product categories?",
  "Compare Q3 performance against Q2 targets"
];

export default function DemoPage() {
  const [selectedQuery, setSelectedQuery] = useState("");
  const { toast } = useToast();

  const handleSampleQuery = (query: string) => {
    setSelectedQuery(query);
    toast({
      title: "Demo Query Selected",
      description: `Try asking: "${query}"`,
    });
  };

  const handleStartTrial = () => {
    toast({
      title: "Trial Started",
      description: "Redirecting to full application registration...",
    });
    // In production, redirect to registration
    setTimeout(() => {
      window.location.href = "/login";
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Demo Header */}
      <div className="bg-gradient-to-r from-primary to-chart-4 text-primary-foreground">
        <div className="container mx-auto px-6 py-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold mb-2">ERP Connect Pro Demo</h1>
              <p className="text-xl opacity-90">
                Experience enterprise-grade ERP integration for a $200MM company
              </p>
              <p className="text-sm opacity-75 mt-2">
                🏢 TechCorp Industries • $200MM ARR • 90-Day Performance Overview
              </p>
            </div>
            <div className="text-right">
              <Button
                onClick={handleStartTrial}
                variant="secondary"
                size="lg"
                data-testid="button-start-trial"
              >
                Start Free Trial
              </Button>
              <p className="text-sm opacity-75 mt-2">
                No credit card required
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Demo Dashboard Content */}
      <div className="container mx-auto px-6 py-8">
        {/* Key Metrics Overview */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-6">Real-Time Business Intelligence</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {demoKPIs.map((kpi, index) => (
              <KPIWidget
                key={kpi.id}
                kpi={kpi}
                data={demoKPIData[kpi.type]}
                position={index}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Revenue Trend Chart */}
          <RevenueChart data={[]} />
          
          {/* ERP Systems Status */}
          <ERPStatus systems={demoERPSystems} />
        </div>

        {/* AI-Powered Analysis Section */}
        <div className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <i className="fas fa-robot text-chart-1"></i>
                <span>AI-Powered ERP Analysis</span>
                <Badge variant="outline">GPT-5 Powered</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <p className="text-muted-foreground mb-4">
                  Experience natural language queries across all your ERP systems. 
                  Try these sample questions based on TechCorp's $200MM operations:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {sampleQueries.map((query, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      className="justify-start text-left h-auto py-3 px-4"
                      onClick={() => handleSampleQuery(query)}
                      data-testid={`sample-query-${index}`}
                    >
                      <i className="fas fa-lightbulb mr-2 text-chart-2"></i>
                      {query}
                    </Button>
                  ))}
                </div>
              </div>
              
              {/* Chat Interface */}
              <div className="border-t pt-6">
                <ChatInterface userId={demoUser.id} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Enterprise Integration Showcase */}
        <div className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Enterprise System Integrations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="text-center p-4">
                  <div className="w-16 h-16 bg-blue-600 rounded-lg mx-auto mb-3 flex items-center justify-center">
                    <i className="fas fa-database text-white text-2xl"></i>
                  </div>
                  <h3 className="font-semibold">SAP S/4HANA</h3>
                  <p className="text-sm text-muted-foreground">Core Finance & Operations</p>
                  <Badge variant="default" className="mt-2">Connected</Badge>
                </div>
                
                <div className="text-center p-4">
                  <div className="w-16 h-16 bg-red-600 rounded-lg mx-auto mb-3 flex items-center justify-center">
                    <i className="fas fa-cloud text-white text-2xl"></i>
                  </div>
                  <h3 className="font-semibold">Oracle NetSuite</h3>
                  <p className="text-sm text-muted-foreground">CRM & E-commerce</p>
                  <Badge variant="default" className="mt-2">Connected</Badge>
                </div>
                
                <div className="text-center p-4">
                  <div className="w-16 h-16 bg-blue-500 rounded-lg mx-auto mb-3 flex items-center justify-center">
                    <i className="fas fa-windows text-white text-2xl"></i>
                  </div>
                  <h3 className="font-semibold">Dynamics 365</h3>
                  <p className="text-sm text-muted-foreground">Sales & Service</p>
                  <Badge variant="default" className="mt-2">Connected</Badge>
                </div>
                
                <div className="text-center p-4">
                  <div className="w-16 h-16 bg-yellow-600 rounded-lg mx-auto mb-3 flex items-center justify-center">
                    <i className="fas fa-users text-white text-2xl"></i>
                  </div>
                  <h3 className="font-semibold">Workday HCM</h3>
                  <p className="text-sm text-muted-foreground">HR & Payroll</p>
                  <Badge variant="secondary" className="mt-2">Available</Badge>
                </div>
              </div>
              
              <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold">Ready to integrate with 10+ ERP systems</h4>
                    <p className="text-sm text-muted-foreground">
                      Connect SAP, NetSuite, Dynamics, Workday, IFS, Epicor, Infor, Acumatica, and more
                    </p>
                  </div>
                  <Button variant="outline">View All Systems</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Call to Action */}
        <div className="text-center">
          <Card className="bg-gradient-to-br from-primary/5 to-chart-4/5 border-primary/20">
            <CardContent className="p-8">
              <h2 className="text-3xl font-bold mb-4">Ready to Transform Your Enterprise?</h2>
              <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
                Join 500+ enterprises using ERP Connect Pro to unify their business systems, 
                gain real-time insights, and accelerate decision-making with AI-powered analytics.
              </p>
              <div className="flex justify-center space-x-4">
                <Button onClick={handleStartTrial} size="lg" data-testid="button-main-cta">
                  Start Your Free Trial
                </Button>
                <Button variant="outline" size="lg">
                  Schedule Demo Call
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                Free 30-day trial • No setup fees • Cancel anytime
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}