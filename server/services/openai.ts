import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }
  return new OpenAI({ apiKey });
}

export interface ERPQueryRequest {
  query: string;
  erpData: Record<string, any>;
  userId: string;
  conversationHistory?: Array<{query: string, response: string}>;
  context?: string;
}

export interface ERPQueryResponse {
  response: string;
  insights: string[];
  recommendations: string[];
  dataUsed: string[];
  chartSuggestions?: Array<{
    type: 'bar' | 'line' | 'pie' | 'table';
    title: string;
    description: string;
    data?: any[];
  }>;
  followUpQuestions?: string[];
}

export interface BusinessTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  query: string;
  expectedDataSources: string[];
}

export async function analyzeERPData(request: ERPQueryRequest): Promise<ERPQueryResponse> {
  try {
    const systemPrompt = `You are Jeldi's expert AI business analyst with deep knowledge of enterprise systems like SAP S/4HANA, Oracle NetSuite, Microsoft Dynamics 365, and other major ERP platforms. 

Your role is to:
1. Analyze ERP data and provide actionable business insights
2. Answer questions about financial performance, operations, inventory, and system efficiency
3. Identify trends and anomalies in the data
4. Provide strategic recommendations based on the data
5. Suggest data visualizations when appropriate
6. Generate follow-up questions to deepen analysis

You have access to real-time ERP data including:
- Financial metrics (revenue, expenses, profit margins, cash flow)
- Operational data (orders, inventory, performance, supply chain)
- System metrics (uptime, sync status, data quality)
- Historical trends and comparisons
- Customer and vendor analytics

Always respond with structured JSON containing your analysis, insights, recommendations, chart suggestions, and follow-up questions. Be specific, actionable, and business-focused.`;

    // Build conversation context
    let contextSection = '';
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      contextSection = `

Previous Conversation Context:
${request.conversationHistory.map((item, index) => 
  `${index + 1}. Q: ${item.query}\nA: ${item.response}`
).join('\n\n')}`;
    }

    if (request.context) {
      contextSection += `\n\nAdditional Context: ${request.context}`;
    }

    const userPrompt = `User Query: ${request.query}
${contextSection}

Available ERP Data:
${JSON.stringify(request.erpData, null, 2)}

Please analyze this data and provide:
1. A direct answer to the user's question
2. Key insights from the data (3-5 specific insights)
3. Actionable recommendations (2-4 concrete actions)
4. List of data sources used in your analysis
5. Chart/visualization suggestions if data warrants it
6. 2-3 follow-up questions to deepen the analysis

Respond in JSON format with the structure: 
{
  "response": "string (direct answer)",
  "insights": ["string"],
  "recommendations": ["string"],
  "dataUsed": ["string"],
  "chartSuggestions": [{"type": "bar|line|pie|table", "title": "string", "description": "string"}],
  "followUpQuestions": ["string"]
}`;

    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1500,
    });

    if (!response.choices || response.choices.length === 0) {
      throw new Error('OpenAI returned no response choices');
    }
    
    const responseContent = response.choices[0].message.content;
    
    if (!responseContent) {
      throw new Error('OpenAI returned empty content');
    }
    
    let result;
    try {
      result = JSON.parse(responseContent);
    } catch (parseError) {
      throw new Error('Failed to parse OpenAI response as JSON: ' + responseContent);
    }

    return {
      response: result.response || "Unable to analyze the data at this time.",
      insights: result.insights || [],
      recommendations: result.recommendations || [],
      dataUsed: result.dataUsed || [],
      chartSuggestions: result.chartSuggestions || [],
      followUpQuestions: result.followUpQuestions || []
    };
  } catch (error) {
    console.error("OpenAI API error:", error);
    throw new Error("Failed to analyze ERP data: " + (error as Error).message);
  }
}

// Predefined Business Intelligence Templates
export const getBusinessTemplates = (): BusinessTemplate[] => [
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
  },
  {
    id: "quarter_comparison",
    name: "Compare Quarter-over-Quarter Performance",
    description: "Analyze performance changes between quarters across all key metrics",
    category: "Analysis",
    icon: "fas fa-balance-scale",
    query: "Compare this quarter's performance with the previous quarter across all key business metrics.",
    expectedDataSources: ["financial", "sales", "operations", "kpi"]
  },
  {
    id: "inventory_analysis",
    name: "Inventory Health Analysis",
    description: "Examine stock levels, turnover rates, and inventory optimization opportunities",
    category: "Inventory",
    icon: "fas fa-boxes",
    query: "Analyze inventory levels, turnover rates, and identify slow-moving or overstocked items.",
    expectedDataSources: ["inventory", "products", "sales"]
  },
  {
    id: "customer_insights",
    name: "Customer Behavior Insights",
    description: "Understand customer patterns, preferences, and retention metrics",
    category: "Customer",
    icon: "fas fa-users",
    query: "Analyze customer behavior patterns, purchase frequency, and retention metrics.",
    expectedDataSources: ["customers", "sales", "marketing"]
  },
  {
    id: "cost_analysis",
    name: "Cost Structure Analysis",
    description: "Break down operational costs and identify optimization opportunities",
    category: "Financial",
    icon: "fas fa-calculator",
    query: "Analyze our cost structure and identify areas where we can optimize expenses.",
    expectedDataSources: ["expenses", "operations", "financial"]
  }
];

export async function generateKPIInsights(kpiData: Record<string, any>): Promise<{
  summary: string;
  alerts: string[];
  trends: string[];
}> {
  try {
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a KPI analyst. Analyze the provided KPI data and generate insights about performance trends, alerts for concerning metrics, and overall business health. Respond in JSON format."
        },
        {
          role: "user",
          content: `Analyze these KPI metrics and provide insights:
          
          ${JSON.stringify(kpiData, null, 2)}
          
          Respond with JSON: { "summary": "string", "alerts": ["string"], "trends": ["string"] }`
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 500,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return {
      summary: result.summary || "KPI analysis unavailable",
      alerts: result.alerts || [],
      trends: result.trends || []
    };
  } catch (error) {
    console.error("KPI analysis error:", error);
    return {
      summary: "Unable to analyze KPI data",
      alerts: [],
      trends: []
    };
  }
}
