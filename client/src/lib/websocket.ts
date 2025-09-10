export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private messageHandlers: Map<string, (data: any) => void> = new Map();

  constructor(url: string) {
    this.url = url;
  }

  connect(token?: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    this.token = token || null;

    return new Promise<void>((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log("WebSocket connected");
          this.reconnectAttempts = 0;
          
          // Authenticate if token is provided
          if (this.token) {
            this.send("auth", { token: this.token });
          }
          
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            const handler = this.messageHandlers.get(message.type);
            
            if (handler) {
              handler(message.data);
            }
            
            // Emit to all handlers
            this.messageHandlers.forEach((handler, type) => {
              if (type === "all" || type === message.type) {
                handler(message);
              }
            });
          } catch (error) {
            console.error("Failed to parse WebSocket message:", error);
          }
        };

        this.ws.onclose = (event) => {
          console.log("WebSocket disconnected", event);
          
          if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = Math.pow(2, this.reconnectAttempts) * 1000;
    
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect(this.token || undefined);
    }, delay);
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }
  }

  send(type: string, data?: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    } else {
      console.warn("Cannot send message: WebSocket not connected");
    }
  }

  on(messageType: string, handler: (data: any) => void) {
    this.messageHandlers.set(messageType, handler);
  }

  off(messageType: string) {
    this.messageHandlers.delete(messageType);
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getReadyState(): number | null {
    return this.ws?.readyState || null;
  }
}

// Singleton instance
let wsClient: WebSocketClient | null = null;

export function getWebSocketClient(): WebSocketClient {
  if (!wsClient) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // Handle Replit environment properly
    let host = window.location.host;
    if (host.includes(':undefined') || !host.includes(':')) {
      // Use hostname without port for WebSocket connection
      host = window.location.hostname + (window.location.port ? ':' + window.location.port : '');
      // If still no port, use current page port or default
      if (!window.location.port && window.location.hostname === 'localhost') {
        host = window.location.hostname + ':5000';
      }
    }
    const wsUrl = `${protocol}//${host}/ws`;
    wsClient = new WebSocketClient(wsUrl);
  }
  
  return wsClient;
}

export function connectWebSocket(token?: string): Promise<void> {
  const client = getWebSocketClient();
  return client.connect(token);
}

export function disconnectWebSocket(): void {
  const client = getWebSocketClient();
  client.disconnect();
}
