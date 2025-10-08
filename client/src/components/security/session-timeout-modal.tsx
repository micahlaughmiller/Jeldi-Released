import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, LogOut } from "lucide-react";

const SESSION_WARNING_TIME = 5 * 60 * 1000; // 5 minutes
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

export function SessionTimeoutModal() {
  const [, setLocation] = useLocation();
  const [showWarning, setShowWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [lastActivity, setLastActivity] = useState(Date.now());

  useEffect(() => {
    const updateActivity = () => {
      setLastActivity(Date.now());
      setShowWarning(false);
    };

    // Track user activity
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach(event => {
      document.addEventListener(event, updateActivity);
    });

    // Check session timeout
    const checkInterval = setInterval(() => {
      const timeSinceLastActivity = Date.now() - lastActivity;
      const remaining = SESSION_TIMEOUT - timeSinceLastActivity;

      if (remaining <= 0) {
        // Session expired - logout
        handleLogout();
      } else if (remaining <= SESSION_WARNING_TIME && !showWarning) {
        // Show warning
        setShowWarning(true);
        setTimeRemaining(Math.floor(remaining / 1000));
      } else if (showWarning) {
        setTimeRemaining(Math.floor(remaining / 1000));
      }
    }, 1000);

    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, updateActivity);
      });
      clearInterval(checkInterval);
    };
  }, [lastActivity, showWarning]);

  const handleExtendSession = () => {
    setLastActivity(Date.now());
    setShowWarning(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setLocation("/login");
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={showWarning} onOpenChange={setShowWarning}>
      <DialogContent className="sm:max-w-md" data-testid="modal-session-timeout">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-orange-500" />
            Session Timeout Warning
          </DialogTitle>
          <DialogDescription>
            Your session will expire in <span className="font-bold text-orange-600" data-testid="text-time-remaining">{formatTime(timeRemaining)}</span> due to inactivity.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            For your security, we automatically log you out after 30 minutes of inactivity.
            Click "Stay Logged In" to extend your session, or "Logout" to end it now.
          </p>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleLogout}
            className="w-full sm:w-auto"
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout Now
          </Button>
          <Button
            onClick={handleExtendSession}
            className="w-full sm:w-auto"
            data-testid="button-extend-session"
          >
            Stay Logged In
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
