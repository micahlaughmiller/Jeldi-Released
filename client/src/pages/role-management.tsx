import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AdminInterface } from "@/components/rbac/admin-interface";
import { performLogout } from "@/lib/logout";
import Header from "@/components/layout/header";
import Sidebar from "@/components/layout/sidebar";

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
}

export default function RoleManagement() {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");
    
    if (!token || !userData) {
      setLocation("/login");
      return;
    }

    try {
      setUser(JSON.parse(userData));
    } catch (error) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setLocation("/login");
    }
  }, [setLocation]);

  const handleLogout = async () => {
    await performLogout(setLocation, { showToast: true });
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-4xl text-primary mb-4"></i>
          <p className="text-muted-foreground">Loading role management...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar 
        user={user} 
        onLogout={handleLogout}
        onERPClick={() => {}} // Not needed on this page
        connectedCount={0} // Not needed on this page
      />
      
      <div className="flex-1 flex flex-col">
        <Header 
          connectedCount={0}
          connectionStatus="disconnected"
        />
        
        <main className="flex-1 overflow-y-auto">
          <AdminInterface />
        </main>
      </div>
    </div>
  );
}