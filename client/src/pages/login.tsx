import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getApiUrl } from "@/lib/api-config";

export default function Login() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<{name: string; displayName: string}[]>([]);
  const { toast } = useToast();

  // Check for secure OAuth callback parameters and handle login
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const oauthSession = urlParams.get('oauth_session');
    const error = urlParams.get('error');

    if (error === 'oauth_failed') {
      toast({
        title: "OAuth Login Failed",
        description: "Please try again or use email/password login.",
        variant: "destructive",
      });
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (oauthSession) {
      const handleSecureOAuthCallback = async () => {
        try {
          setIsLoading(true);
          
          // Securely retrieve OAuth result from server using session ID
          const response = await fetch(getApiUrl(`/api/auth/oauth-result/${oauthSession}`));
          
          if (!response.ok) {
            throw new Error('Failed to retrieve OAuth result');
          }
          
          const { token, user } = await response.json();
          
          localStorage.setItem("token", token);
          localStorage.setItem("user", JSON.stringify(user));
          
          toast({
            title: "Login successful",
            description: `Welcome ${user.firstName || user.username}!`,
          });
          
          setLocation("/dashboard");
        } catch (error) {
          console.error("Failed to process secure OAuth callback:", error);
          toast({
            title: "Login Error",
            description: "Failed to process login response. Please try again.",
            variant: "destructive",
          });
        } finally {
          setIsLoading(false);
        }
      };
      
      handleSecureOAuthCallback();
      
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [toast, setLocation]);

  // Fetch available OAuth providers
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const response = await fetch(getApiUrl("/api/oauth/providers"));
        if (response.ok) {
          const providers = await response.json();
          setOauthProviders(providers);
        }
      } catch (error) {
        console.error("Failed to fetch OAuth providers:", error);
      }
    };
    fetchProviders();
  }, []);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      const response = await apiRequest("POST", "/api/auth/login", { email, password });
      const data = await response.json();
      
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      
      toast({
        title: "Login successful",
        description: "Welcome to ERP Connect Pro!",
      });
      
      setLocation("/dashboard");
    } catch (error) {
      toast({
        title: "Login failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const username = formData.get("username") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      console.log("Attempting registration with:", { username, email: email.substring(0, 10) + "..." });
      const response = await apiRequest("POST", "/api/auth/register", { username, email, password });
      const data = await response.json();
      
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      
      toast({
        title: "Registration successful",
        description: "Welcome to ERP Connect Pro!",
      });
      
      setLocation("/dashboard");
    } catch (error) {
      console.error("Registration error:", error);
      toast({
        title: "Registration failed", 
        description: `${(error as Error).message}. Please try again or contact support.`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthLogin = (provider: string) => {
    // Redirect to OAuth provider
    window.location.href = getApiUrl(`/api/auth/${provider}`);
  };

  const getOAuthIcon = (provider: string) => {
    switch (provider) {
      case 'google':
        return <i className="fab fa-google mr-2"></i>;
      case 'microsoft':
        return <i className="fab fa-microsoft mr-2"></i>;
      default:
        return <i className="fas fa-sign-in-alt mr-2"></i>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
              <i className="fas fa-network-wired text-primary-foreground text-xl"></i>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Jeldi</h1>
              <p className="text-sm text-muted-foreground">Business Decisions at the Speed of Thought</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2" data-testid="auth-tabs">
            <TabsTrigger value="login" data-testid="tab-login">Login</TabsTrigger>
            <TabsTrigger value="register" data-testid="tab-register">Register</TabsTrigger>
          </TabsList>
          
          <TabsContent value="login">
            <Card>
              <CardHeader>
                <CardTitle>Login</CardTitle>
                <CardDescription>
                  Access your ERP dashboard and connect to enterprise systems
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      name="email"
                      type="email"
                      placeholder="admin@company.com"
                      required
                      data-testid="input-login-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      name="password"
                      type="password"
                      placeholder="••••••••"
                      required
                      data-testid="input-login-password"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                    data-testid="button-login"
                  >
                    {isLoading ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        Signing in...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-sign-in-alt mr-2"></i>
                        Sign In
                      </>
                    )}
                  </Button>
                </form>

                {/* Enterprise OAuth Login */}
                {oauthProviders.length > 0 && (
                  <>
                    <div className="relative my-6">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">
                          Or continue with Enterprise
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {oauthProviders.map((provider) => (
                        <Button
                          key={provider.name}
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => handleOAuthLogin(provider.name)}
                          data-testid={`button-oauth-${provider.name}`}
                        >
                          {getOAuthIcon(provider.name)}
                          Sign in with {provider.displayName}
                        </Button>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="register">
            <Card>
              <CardHeader>
                <CardTitle>Create Account</CardTitle>
                <CardDescription>
                  Join thousands of enterprises managing their ERP systems efficiently
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-username">Username</Label>
                    <Input
                      id="register-username"
                      name="username"
                      type="text"
                      placeholder="johndoe"
                      required
                      data-testid="input-register-username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-email">Email</Label>
                    <Input
                      id="register-email"
                      name="email"
                      type="email"
                      placeholder="john@company.com"
                      required
                      data-testid="input-register-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-password">Password</Label>
                    <Input
                      id="register-password"
                      name="password"
                      type="password"
                      placeholder="••••••••"
                      required
                      data-testid="input-register-password"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                    data-testid="button-register"
                  >
                    {isLoading ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        Creating account...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-user-plus mr-2"></i>
                        Create Account
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Demo Access Section */}
        <div className="mt-8">
          <Card className="bg-gradient-to-br from-primary/5 to-chart-4/5 border-primary/20">
            <CardContent className="p-6 text-center">
              <div className="flex justify-center mb-3">
                <Badge variant="secondary" className="text-xs font-medium">
                  No Registration Required
                </Badge>
              </div>
              <h3 className="text-lg font-semibold mb-2">
                Experience Jeldi Demo
              </h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                Explore our platform with pre-populated KPIs, charts, and realistic enterprise data
              </p>
              <Button
                onClick={() => window.location.href = "https://demo.jeldi.app"}
                variant="outline"
                className="w-full"
                data-testid="button-view-demo"
              >
                <i className="fas fa-chart-line mr-2"></i>
                View Demo
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
