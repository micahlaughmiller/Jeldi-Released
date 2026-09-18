import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Monitor, Smartphone, Trash2, LogOut, MapPin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Session {
  id: string;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  isActive: boolean;
  expiresAt: string;
  lastActivity: string;
  createdAt: string;
}

export function ActiveSessions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery<Session[]>({
    queryKey: ["/api/sessions/active"],
  });

  const terminateSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      await apiRequest("DELETE", `/api/sessions/${sessionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions/active"] });
      toast({
        title: "Session terminated",
        description: "The session has been successfully terminated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to terminate session.",
        variant: "destructive",
      });
    },
  });

  const terminateAllMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/sessions/all");
    },
    onSuccess: () => {
      toast({
        title: "All sessions terminated",
        description: "You will need to login again on all devices.",
      });
      // Redirect to login after a brief delay
      setTimeout(() => {
        localStorage.removeItem("token");
        window.location.href = "/login";
      }, 1500);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to terminate all sessions.",
        variant: "destructive",
      });
    },
  });

  const getDeviceIcon = (userAgent: string | null) => {
    if (!userAgent) return <Monitor className="h-5 w-5" />;
    const ua = userAgent.toLowerCase();
    if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) {
      return <Smartphone className="h-5 w-5" />;
    }
    return <Monitor className="h-5 w-5" />;
  };

  const getDeviceInfo = (userAgent: string | null) => {
    if (!userAgent) return "Unknown Device";
    const ua = userAgent;
    
    // Extract browser
    let browser = "Unknown Browser";
    if (ua.includes("Chrome")) browser = "Chrome";
    else if (ua.includes("Firefox")) browser = "Firefox";
    else if (ua.includes("Safari")) browser = "Safari";
    else if (ua.includes("Edge")) browser = "Edge";
    
    // Extract OS
    let os = "Unknown OS";
    if (ua.includes("Windows")) os = "Windows";
    else if (ua.includes("Mac")) os = "macOS";
    else if (ua.includes("Linux")) os = "Linux";
    else if (ua.includes("Android")) os = "Android";
    else if (ua.includes("iOS") || ua.includes("iPhone")) os = "iOS";
    
    return `${browser} on ${os}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Sessions</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card data-testid="card-active-sessions">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Active Sessions</CardTitle>
            <CardDescription>
              Manage your active login sessions across all devices
            </CardDescription>
          </div>
          {sessions.length > 1 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => terminateAllMutation.mutate()}
              disabled={terminateAllMutation.isPending}
              data-testid="button-logout-all"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout All Devices
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-start justify-between p-4 border rounded-lg"
              data-testid={`session-${session.id}`}
            >
              <div className="flex gap-4">
                <div className="text-muted-foreground mt-1">
                  {getDeviceIcon(session.userAgent)}
                </div>
                <div className="space-y-1">
                  <p className="font-medium" data-testid={`text-device-${session.id}`}>
                    {getDeviceInfo(session.userAgent)}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span data-testid={`text-ip-${session.id}`}>
                      {session.ipAddress || "Unknown location"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid={`text-last-active-${session.id}`}>
                    Last active {formatDistanceToNow(new Date(session.lastActivity), { addSuffix: true })}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => terminateSessionMutation.mutate(session.id)}
                disabled={terminateSessionMutation.isPending}
                data-testid={`button-terminate-${session.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {sessions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No active sessions found
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
