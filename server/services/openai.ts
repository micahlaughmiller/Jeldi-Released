import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

export interface ERPQueryRequest {
  query: string;
  erpData: Record<string, any>;
  userId: string;
}

export interface ERPQueryResponse {
  response: string;
  insights: string[];
  recommendations: string[];
  dataUsed: string[];
}

export async function analyzeERPData(request: ERPQueryRequest): Promise<ERPQueryResponse> {
  try {
    const systemPrompt = `You are an expert ERP data analyst with deep knowledge of enterprise systems like SAP S/4HANA, Oracle NetSuite, Microsoft Dynamics 365, and other major ERP platforms. 

Your role is to:
1. Analyze ERP data and provide actionable business insights
2. Answer questions about financial performance, operations, inventory, and system efficiency
3. Identify trends and anomalies in the data
4. Provide strategic recommendations based on the data

You have access to real-time ERP data including:
- Financial metrics (revenue, expenses, profit margins)
- Operational data (orders, inventory, performance)
- System metrics (uptime, sync status, data quality)
- Historical trends and comparisons

Always respond with structured JSON containing your analysis, insights, and recommendations. Be specific and actionable.`;

    const userPrompt = `User Query: ${request.query}

Available ERP Data:
${JSON.stringify(request.erpData, null, 2)}

Please analyze this data and provide:
1. A direct answer to the user's question
2. Key insights from the data
3. Actionable recommendations
4. List of data sources used in your analysis

Respond in JSON format with the structure: { "response": "string", "insights": ["string"], "recommendations": ["string"], "dataUsed": ["string"] }`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1000,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");

    return {
      response: result.response || "Unable to analyze the data at this time.",
      insights: result.insights || [],
      recommendations: result.recommendations || [],
      dataUsed: result.dataUsed || []
    };
  } catch (error) {
    console.error("OpenAI API error:", error);
    throw new Error("Failed to analyze ERP data: " + (error as Error).message);
  }
}

export async function generateKPIInsights(kpiData: Record<string, any>): Promise<{
  summary: string;
  alerts: string[];
  trends: string[];
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
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
