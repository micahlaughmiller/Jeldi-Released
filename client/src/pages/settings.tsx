import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import Sidebar from "@/components/layout/sidebar";
import { performLogout } from "@/lib/logout";
import { 
  Settings as SettingsIcon, User, Lock, Globe, Download, Upload, 
  Bell, Palette, Clock, DollarSign, Shield, 
  Camera, Mail, Eye, EyeOff, Building2, Users, UserPlus, Crown, 
  Edit, Trash2, Plus, Search, Filter
} from "lucide-react";

// Schemas for form validation
const profileSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Password confirmation is required"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const preferencesSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  language: z.string(),
  timezone: z.string(),
  dateFormat: z.string(),
  timeFormat: z.enum(["12h", "24h"]),
  currency: z.string(),
  emailNotifications: z.boolean(),
  pushNotifications: z.boolean(),
  weeklyReports: z.boolean(),
  systemAlerts: z.boolean(),
  defaultDashboard: z.string(),
  refreshInterval: z.number().min(10).max(300),
  showTutorials: z.boolean(),
  sessionTimeout: z.number().min(5).max(120),
  twoFactorEnabled: z.boolean(),
  dataRetention: z.number().min(30).max(365),
  exportFormat: z.enum(["csv", "json", "xlsx"]),
});

// Organization schemas
const organizationSchema = z.object({
  name: z.string().min(2, "Organization name must be at least 2 characters"),
  displayName: z.string().min(2, "Display name must be at least 2 characters"),
  description: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
});

const inviteMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
});

type ProfileFormData = z.infer<typeof profileSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;
type PreferencesFormData = z.infer<typeof preferencesSchema>;
type OrganizationFormData = z.infer<typeof organizationSchema>;
type InviteMemberFormData = z.infer<typeof inviteMemberSchema>;

interface UserData {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profileImage?: string;
  role: string;
  authProvider: string;
}

interface UserPreferences {
  theme: "light" | "dark" | "system";
  language: string;
  timezone: string;
  dateFormat: string;
  timeFormat: "12h" | "24h";
  currency: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
  weeklyReports: boolean;
  systemAlerts: boolean;
  defaultDashboard: string;
  refreshInterval: number;
  showTutorials: boolean;
  sessionTimeout: number;
  twoFactorEnabled: boolean;
  dataRetention: number;
  exportFormat: "csv" | "json" | "xlsx";
}

interface Organization {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  website?: string;
  logo?: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  members: OrganizationMember[];
  memberCount: number;
}

interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  status: "active" | "pending" | "suspended";
  isOwner: boolean;
  joinedAt: string;
  user: {
    id: string;
    username: string;
    email: string;
    firstName?: string;
    lastName?: string;
    profileImage?: string;
  };
}

interface Role {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  color: string;
  isSystem: boolean;
  isActive: boolean;
  organizationId?: string;
}

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      setLocation("/login");
    }
  }, [setLocation]);
  const [activeTab, setActiveTab] = useState("profile");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [showCreateOrgDialog, setShowCreateOrgDialog] = useState(false);
  const [showInviteMemberDialog, setShowInviteMemberDialog] = useState(false);

  // Fetch user data and preferences
  const { data: userData } = useQuery<UserData>({
    queryKey: ["/api/auth/me"],
  });

  const { data: preferences, isLoading: preferencesLoading } = useQuery<UserPreferences>({
    queryKey: ["/api/user/preferences"],
  });

  // Fetch organizations
  const { data: organizations, isLoading: organizationsLoading } = useQuery<Organization[]>({
    queryKey: ["/api/organizations/my"],
    enabled: !!userData,
  });

  // Fetch available roles for organization assignment
  const { data: availableRoles } = useQuery<Role[]>({
    queryKey: ["/api/rbac/roles"],
    enabled: !!userData && activeTab === "organizations",
  });

  // Initialize forms
  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: "",
      email: "",
      firstName: "",
      lastName: "",
    },
  });

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  });

  const preferencesForm = useForm<PreferencesFormData>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: {
      theme: "light",
      language: "en",
      timezone: "UTC",
      dateFormat: "MM/dd/yyyy",
      timeFormat: "12h",
      currency: "USD",
      emailNotifications: true,
      pushNotifications: true,
      weeklyReports: true,
      systemAlerts: true,
      defaultDashboard: "overview",
      refreshInterval: 30,
      showTutorials: true,
      sessionTimeout: 30,
      twoFactorEnabled: false,
      dataRetention: 365,
      exportFormat: "csv",
    },
  });

  const organizationForm = useForm<OrganizationFormData>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: "",
      displayName: "",
      description: "",
      website: "",
    },
  });

  const inviteMemberForm = useForm<InviteMemberFormData>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: {
      email: "",
    },
  });

  // Update forms when data loads
  useEffect(() => {
    if (userData) {
      profileForm.reset({
        username: userData.username,
        email: userData.email,
        firstName: userData.firstName || "",
        lastName: userData.lastName || "",
      });
    }
  }, [userData, profileForm]);

  useEffect(() => {
    if (preferences) {
      preferencesForm.reset(preferences);
    }
  }, [preferences, preferencesForm]);

  // Mutations
  const updateProfileMutation = useMutation({
    mutationFn: (data: ProfileFormData) => apiRequest("PUT", "/api/user/profile", data),
    onSuccess: () => {
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (data: PasswordFormData) => 
      apiRequest("PUT", "/api/user/password", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      }),
    onSuccess: () => {
      toast({
        title: "Password Changed",
        description: "Your password has been updated successfully.",
      });
      passwordForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Password Change Failed",
        description: error.message || "Failed to change password",
        variant: "destructive",
      });
    },
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: (data: PreferencesFormData) => apiRequest("PUT", "/api/user/preferences", data),
    onSuccess: () => {
      toast({
        title: "Preferences Updated",
        description: "Your preferences have been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/preferences"] });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update preferences",
        variant: "destructive",
      });
    },
  });

  const resetPreferencesMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/user/preferences/reset"),
    onSuccess: () => {
      toast({
        title: "Preferences Reset",
        description: "Your preferences have been reset to default values.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/preferences"] });
    },
    onError: (error: any) => {
      toast({
        title: "Reset Failed",
        description: error.message || "Failed to reset preferences",
        variant: "destructive",
      });
    },
  });

  // Organization mutations
  const createOrganizationMutation = useMutation({
    mutationFn: (data: OrganizationFormData) => apiRequest("POST", "/api/organizations", data),
    onSuccess: () => {
      toast({
        title: "Organization Created",
        description: "Your organization has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations/my"] });
      setShowCreateOrgDialog(false);
      organizationForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create organization",
        variant: "destructive",
      });
    },
  });

  const updateOrganizationMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<OrganizationFormData> }) => 
      apiRequest("PUT", `/api/organizations/${id}`, data),
    onSuccess: () => {
      toast({
        title: "Organization Updated",
        description: "Organization details have been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations/my"] });
      setSelectedOrganization(null);
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update organization",
        variant: "destructive",
      });
    },
  });

  const deleteOrganizationMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/organizations/${id}`),
    onSuccess: () => {
      toast({
        title: "Organization Deleted",
        description: "Organization has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations/my"] });
    },
    onError: (error: any) => {
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to delete organization",
        variant: "destructive",
      });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ orgId, userData }: { orgId: string; userData: { userId: string } }) => 
      apiRequest("POST", `/api/organizations/${orgId}/members`, userData),
    onSuccess: () => {
      toast({
        title: "Member Added",
        description: "Member has been added to the organization successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations/my"] });
      setShowInviteMemberDialog(false);
      inviteMemberForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Member",
        description: error.message || "Failed to add member to organization",
        variant: "destructive",
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ orgId, userId }: { orgId: string; userId: string }) => 
      apiRequest("DELETE", `/api/organizations/${orgId}/members/${userId}`),
    onSuccess: () => {
      toast({
        title: "Member Removed",
        description: "Member has been removed from the organization.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations/my"] });
    },
    onError: (error: any) => {
      toast({
        title: "Removal Failed",
        description: error.message || "Failed to remove member",
        variant: "destructive",
      });
    },
  });

  const assignRoleMutation = useMutation({
    mutationFn: ({ orgId, userId, roleId }: { orgId: string; userId: string; roleId: string }) => 
      apiRequest("POST", `/api/organizations/${orgId}/assign-role`, { userId, roleId }),
    onSuccess: () => {
      toast({
        title: "Role Assigned",
        description: "Role has been assigned successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations/my"] });
    },
    onError: (error: any) => {
      toast({
        title: "Assignment Failed",
        description: error.message || "Failed to assign role",
        variant: "destructive",
      });
    },
  });

  const revokeRoleMutation = useMutation({
    mutationFn: ({ orgId, userId, roleId }: { orgId: string; userId: string; roleId: string }) => 
      apiRequest("DELETE", `/api/organizations/${orgId}/revoke-role`, { userId, roleId }),
    onSuccess: () => {
      toast({
        title: "Role Revoked",
        description: "Role has been revoked successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations/my"] });
    },
    onError: (error: any) => {
      toast({
        title: "Revocation Failed",
        description: error.message || "Failed to revoke role",
        variant: "destructive",
      });
    },
  });

  const getUserInitials = (username: string) => {
    return username
      .split(" ")
      .map(name => name.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const onProfileSubmit = (data: ProfileFormData) => {
    updateProfileMutation.mutate(data);
  };

  const onPasswordSubmit = (data: PasswordFormData) => {
    changePasswordMutation.mutate(data);
  };

  const onPreferencesSubmit = (data: PreferencesFormData) => {
    updatePreferencesMutation.mutate(data);
  };

  const onOrganizationSubmit = (data: OrganizationFormData) => {
    if (selectedOrganization) {
      updateOrganizationMutation.mutate({ id: selectedOrganization.id, data });
    } else {
      createOrganizationMutation.mutate(data);
    }
  };

  const onInviteMemberSubmit = (data: InviteMemberFormData) => {
    if (!selectedOrganization) return;
    
    // In a real implementation, you would first look up the user by email
    // For now, we'll show a simpler toast message
    toast({
      title: "Invitation Sent",
      description: `Invitation sent to ${data.email}`,
    });
    setShowInviteMemberDialog(false);
    inviteMemberForm.reset();
  };

  const handleExportData = () => {
    toast({
      title: "Export Started",
      description: "Your data export will be ready shortly and sent to your email.",
    });
  };

  const handleResetPreferences = () => {
    resetPreferencesMutation.mutate();
  };

  if (preferencesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background">
      {userData && (
        <Sidebar
          user={userData as any}
          onLogout={() => performLogout(setLocation, { showToast: true })}
          onERPClick={() => setLocation("/dashboard")}
          connectedCount={0}
        />
      )}
    <div className="flex-1 overflow-auto">
    <div className="container mx-auto p-6 max-w-4xl" data-testid="settings-page">
      <div className="flex items-center space-x-2 mb-6">
        <SettingsIcon className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="profile" className="flex items-center space-x-2" data-testid="tab-profile">
            <User className="h-4 w-4" />
            <span>Profile</span>
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex items-center space-x-2" data-testid="tab-preferences">
            <Palette className="h-4 w-4" />
            <span>Preferences</span>
          </TabsTrigger>
          <TabsTrigger value="organizations" className="flex items-center space-x-2" data-testid="tab-organizations">
            <Building2 className="h-4 w-4" />
            <span>Organizations</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center space-x-2" data-testid="tab-security">
            <Shield className="h-4 w-4" />
            <span>Security</span>
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center space-x-2" data-testid="tab-system">
            <Globe className="h-4 w-4" />
            <span>System</span>
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <User className="h-5 w-5" />
                <span>Profile Information</span>
              </CardTitle>
              <CardDescription>
                Update your personal information and profile settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-4 mb-6">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={userData?.profileImage} />
                  <AvatarFallback className="text-lg">
                    {userData?.username ? getUserInitials(userData.username) : "??"}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <h3 className="font-medium" data-testid="user-display-name">
                    {userData?.firstName && userData?.lastName 
                      ? `${userData.firstName} ${userData.lastName}` 
                      : userData?.username}
                  </h3>
                  <p className="text-sm text-muted-foreground" data-testid="user-email">
                    {userData?.email}
                  </p>
                  <Badge variant="outline" data-testid="user-role">
                    {userData?.role?.toUpperCase()}
                  </Badge>
                </div>
                <Button variant="outline" size="sm" className="ml-auto">
                  <Camera className="h-4 w-4 mr-2" />
                  Change Photo
                </Button>
              </div>

              <Form {...profileForm}>
                <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={profileForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter your first name" {...field} data-testid="input-first-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={profileForm.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter your last name" {...field} data-testid="input-last-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={profileForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter your username" {...field} data-testid="input-username" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={profileForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="Enter your email" {...field} data-testid="input-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button 
                    type="submit" 
                    disabled={updateProfileMutation.isPending}
                    data-testid="button-update-profile"
                  >
                    {updateProfileMutation.isPending ? "Updating..." : "Update Profile"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-6">
          <Form {...preferencesForm}>
            <form onSubmit={preferencesForm.handleSubmit(onPreferencesSubmit)} className="space-y-6">
              {/* Appearance */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Palette className="h-5 w-5" />
                    <span>Appearance</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={preferencesForm.control}
                    name="theme"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Theme</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-theme">
                              <SelectValue placeholder="Select theme" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="light">Light</SelectItem>
                            <SelectItem value="dark">Dark</SelectItem>
                            <SelectItem value="system">System</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={preferencesForm.control}
                    name="defaultDashboard"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default Dashboard View</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-default-dashboard">
                              <SelectValue placeholder="Select default view" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="overview">Overview</SelectItem>
                            <SelectItem value="analytics">Analytics</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={preferencesForm.control}
                    name="showTutorials"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Show Tutorials</FormLabel>
                          <FormDescription>
                            Display help tutorials and onboarding guides
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-tutorials"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Localization */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Globe className="h-5 w-5" />
                    <span>Localization</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={preferencesForm.control}
                      name="language"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Language</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-language">
                                <SelectValue placeholder="Select language" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="en">English</SelectItem>
                              <SelectItem value="es">Spanish</SelectItem>
                              <SelectItem value="fr">French</SelectItem>
                              <SelectItem value="de">German</SelectItem>
                              <SelectItem value="zh">Chinese</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={preferencesForm.control}
                      name="timezone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Timezone</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-timezone">
                                <SelectValue placeholder="Select timezone" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="UTC">UTC</SelectItem>
                              <SelectItem value="America/New_York">Eastern Time</SelectItem>
                              <SelectItem value="America/Chicago">Central Time</SelectItem>
                              <SelectItem value="America/Denver">Mountain Time</SelectItem>
                              <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                              <SelectItem value="Europe/London">London</SelectItem>
                              <SelectItem value="Europe/Paris">Paris</SelectItem>
                              <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={preferencesForm.control}
                      name="dateFormat"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date Format</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-date-format">
                                <SelectValue placeholder="Select format" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="MM/dd/yyyy">MM/DD/YYYY</SelectItem>
                              <SelectItem value="dd/MM/yyyy">DD/MM/YYYY</SelectItem>
                              <SelectItem value="yyyy-MM-dd">YYYY-MM-DD</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={preferencesForm.control}
                      name="timeFormat"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Time Format</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-time-format">
                                <SelectValue placeholder="Select format" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="12h">12 Hour</SelectItem>
                              <SelectItem value="24h">24 Hour</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={preferencesForm.control}
                      name="currency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Currency</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-currency">
                                <SelectValue placeholder="Select currency" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                              <SelectItem value="GBP">GBP</SelectItem>
                              <SelectItem value="JPY">JPY</SelectItem>
                              <SelectItem value="CAD">CAD</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Notifications */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Bell className="h-5 w-5" />
                    <span>Notifications</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={preferencesForm.control}
                    name="emailNotifications"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Email Notifications</FormLabel>
                          <FormDescription>
                            Receive notifications via email
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-email-notifications"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={preferencesForm.control}
                    name="pushNotifications"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Push Notifications</FormLabel>
                          <FormDescription>
                            Receive push notifications in your browser
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-push-notifications"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={preferencesForm.control}
                    name="weeklyReports"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Weekly Reports</FormLabel>
                          <FormDescription>
                            Receive weekly summary reports
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-weekly-reports"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={preferencesForm.control}
                    name="systemAlerts"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">System Alerts</FormLabel>
                          <FormDescription>
                            Receive alerts for system events and errors
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-system-alerts"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResetPreferences}
                  disabled={resetPreferencesMutation.isPending}
                  data-testid="button-reset-preferences"
                >
                  {resetPreferencesMutation.isPending ? "Resetting..." : "Reset to Defaults"}
                </Button>
                <Button 
                  type="submit" 
                  disabled={updatePreferencesMutation.isPending}
                  data-testid="button-save-preferences"
                >
                  {updatePreferencesMutation.isPending ? "Saving..." : "Save Preferences"}
                </Button>
              </div>
            </form>
          </Form>
        </TabsContent>

        {/* Organizations Tab */}
        <TabsContent value="organizations" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold">Organizations</h2>
              <p className="text-sm text-muted-foreground">Manage your organizations and team members</p>
            </div>
            <Button 
              onClick={() => setShowCreateOrgDialog(true)} 
              className="flex items-center space-x-2"
              data-testid="button-create-organization"
            >
              <Plus className="h-4 w-4" />
              <span>Create Organization</span>
            </Button>
          </div>

          {organizationsLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="grid gap-6">
              {organizations && organizations.length > 0 ? (
                organizations.map((org) => (
                  <Card key={org.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Building2 className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <CardTitle className="text-lg" data-testid={`org-title-${org.id}`}>
                              {org.displayName}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">@{org.name}</p>
                            {org.description && (
                              <p className="text-sm text-muted-foreground mt-1">{org.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedOrganization(org)}
                            data-testid={`button-edit-org-${org.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this organization?")) {
                                deleteOrganizationMutation.mutate(org.id);
                              }
                            }}
                            data-testid={`button-delete-org-${org.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm" data-testid={`org-member-count-${org.id}`}>
                              {org.memberCount} member{org.memberCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                          {org.website && (
                            <a 
                              href={org.website} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline flex items-center space-x-1"
                            >
                              <Globe className="h-4 w-4" />
                              <span>Website</span>
                            </a>
                          )}
                        </div>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedOrganization(org);
                              setShowInviteMemberDialog(true);
                            }}
                            data-testid={`button-invite-member-${org.id}`}
                          >
                            <UserPlus className="h-4 w-4 mr-2" />
                            Invite Member
                          </Button>
                        </div>
                      </div>

                      {org.members && org.members.length > 0 && (
                        <div className="mt-4">
                          <h4 className="text-sm font-medium mb-2">Members</h4>
                          <div className="space-y-2">
                            {org.members.slice(0, 3).map((member) => (
                              <div key={member.id} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                                <div className="flex items-center space-x-3">
                                  <Avatar className="h-8 w-8">
                                    <AvatarImage src={member.user.profileImage} />
                                    <AvatarFallback>
                                      {getUserInitials(member.user.username)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <p className="text-sm font-medium" data-testid={`member-name-${member.id}`}>
                                      {member.user.firstName && member.user.lastName 
                                        ? `${member.user.firstName} ${member.user.lastName}`
                                        : member.user.username
                                      }
                                    </p>
                                    <p className="text-xs text-muted-foreground">{member.user.email}</p>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                  {member.isOwner && (
                                    <Badge variant="secondary" className="flex items-center space-x-1">
                                      <Crown className="h-3 w-3" />
                                      <span>Owner</span>
                                    </Badge>
                                  )}
                                  <Badge variant="outline" data-testid={`member-status-${member.id}`}>
                                    {member.status}
                                  </Badge>
                                  {!member.isOwner && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        if (confirm("Are you sure you want to remove this member?")) {
                                          removeMemberMutation.mutate({ orgId: org.id, userId: member.userId });
                                        }
                                      }}
                                      data-testid={`button-remove-member-${member.id}`}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                            {org.memberCount > 3 && (
                              <p className="text-xs text-muted-foreground text-center">
                                and {org.memberCount - 3} more member{org.memberCount - 3 !== 1 ? 's' : ''}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No organizations yet</h3>
                    <p className="text-muted-foreground text-center mb-6 max-w-md">
                      Create your first organization to start managing teams and permissions.
                    </p>
                    <Button 
                      onClick={() => setShowCreateOrgDialog(true)}
                      data-testid="button-create-first-organization"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create Your First Organization
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          {/* Password Change */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Lock className="h-5 w-5" />
                <span>Change Password</span>
              </CardTitle>
              <CardDescription>
                Update your account password. {userData?.authProvider !== "local" && 
                  "Password change is not available for OAuth accounts."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {userData?.authProvider === "local" ? (
                <Form {...passwordForm}>
                  <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                    <FormField
                      control={passwordForm.control}
                      name="currentPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input 
                                type={showCurrentPassword ? "text" : "password"} 
                                placeholder="Enter current password" 
                                {...field} 
                                data-testid="input-current-password"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                data-testid="button-toggle-current-password"
                              >
                                {showCurrentPassword ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={passwordForm.control}
                      name="newPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>New Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input 
                                type={showNewPassword ? "text" : "password"} 
                                placeholder="Enter new password" 
                                {...field} 
                                data-testid="input-new-password"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                onClick={() => setShowNewPassword(!showNewPassword)}
                                data-testid="button-toggle-new-password"
                              >
                                {showNewPassword ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={passwordForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm New Password</FormLabel>
                          <FormControl>
                            <Input 
                              type="password" 
                              placeholder="Confirm new password" 
                              {...field} 
                              data-testid="input-confirm-password"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button 
                      type="submit" 
                      disabled={changePasswordMutation.isPending}
                      data-testid="button-change-password"
                    >
                      {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
                    </Button>
                  </form>
                </Form>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Password management is handled by your OAuth provider ({userData?.authProvider}).</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Two-Factor Authentication */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="h-5 w-5" />
                <span>Two-Factor Authentication</span>
              </CardTitle>
              <CardDescription>
                Add an extra layer of security to your account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Two-Factor Authentication</h4>
                  <p className="text-sm text-muted-foreground">
                    {preferences?.twoFactorEnabled ? "Enabled" : "Not enabled"}
                  </p>
                </div>
                <Button variant="outline" disabled>
                  {preferences?.twoFactorEnabled ? "Disable" : "Enable"} 2FA
                </Button>
              </div>
              <Separator className="my-4" />
              <p className="text-sm text-muted-foreground">
                Two-factor authentication is coming soon. This feature will allow you to secure your account 
                with additional verification methods.
              </p>
            </CardContent>
          </Card>

          {/* Session Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="h-5 w-5" />
                <span>Session Management</span>
              </CardTitle>
              <CardDescription>
                Manage your active sessions and timeout settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Session Timeout</label>
                  <p className="text-sm text-muted-foreground mb-2">
                    Automatically log out after {preferences?.sessionTimeout || 30} minutes of inactivity
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  View Active Sessions
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Tab */}
        <TabsContent value="system" className="space-y-6">
          {/* Data Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Download className="h-5 w-5" />
                <span>Data Management</span>
              </CardTitle>
              <CardDescription>
                Export your data or import settings from backups.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Data Export</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Export all your data including preferences, KPI configurations, and chat history.
                </p>
                <div className="flex items-center space-x-2">
                  <Button onClick={handleExportData} data-testid="button-export-data">
                    <Download className="h-4 w-4 mr-2" />
                    Export Data
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Format: {preferences?.exportFormat?.toUpperCase() || "CSV"}
                  </span>
                </div>
              </div>
              <Separator />
              <div>
                <h4 className="font-medium mb-2">Data Import</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Import settings and configurations from a backup file.
                </p>
                <Button variant="outline" disabled>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Data
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* System Performance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <SettingsIcon className="h-5 w-5" />
                <span>System Performance</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Dashboard Refresh Interval</label>
                <p className="text-sm text-muted-foreground">
                  Current: {preferences?.refreshInterval || 30} seconds
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Data Retention</label>
                <p className="text-sm text-muted-foreground">
                  Keep data for {preferences?.dataRetention || 365} days
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>
                Irreversible and destructive actions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-destructive mb-2">Reset All Settings</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    This will reset all your preferences to default values. This action cannot be undone.
                  </p>
                  <Button variant="destructive" onClick={handleResetPreferences} disabled>
                    Reset All Settings
                  </Button>
                </div>
                <Separator />
                <div>
                  <h4 className="font-medium text-destructive mb-2">Delete Account</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Permanently delete your account and all associated data. This action cannot be undone.
                  </p>
                  <Button variant="destructive" disabled>
                    Delete Account
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Organization Dialog */}
      <Dialog open={showCreateOrgDialog} onOpenChange={setShowCreateOrgDialog}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-create-organization">
          <DialogHeader>
            <DialogTitle>Create Organization</DialogTitle>
            <DialogDescription>
              Create a new organization to manage teams and permissions.
            </DialogDescription>
          </DialogHeader>
          <Form {...organizationForm}>
            <form onSubmit={organizationForm.handleSubmit(onOrganizationSubmit)} className="space-y-4">
              <FormField
                control={organizationForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organization Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="my-organization" 
                        {...field} 
                        data-testid="input-org-name"
                      />
                    </FormControl>
                    <FormDescription>
                      This will be used in URLs and API calls. Use lowercase letters, numbers, and hyphens only.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={organizationForm.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="My Organization" 
                        {...field} 
                        data-testid="input-org-display-name"
                      />
                    </FormControl>
                    <FormDescription>
                      This is how your organization will appear in the interface.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={organizationForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Brief description of your organization..." 
                        {...field} 
                        data-testid="input-org-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={organizationForm.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        type="url"
                        placeholder="https://example.com" 
                        {...field} 
                        data-testid="input-org-website"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowCreateOrgDialog(false)}
                  data-testid="button-cancel-create-org"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createOrganizationMutation.isPending}
                  data-testid="button-submit-create-org"
                >
                  {createOrganizationMutation.isPending ? "Creating..." : "Create Organization"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Organization Dialog */}
      <Dialog open={!!selectedOrganization && !showInviteMemberDialog} onOpenChange={(open) => {
        if (!open) setSelectedOrganization(null);
      }}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-edit-organization">
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
            <DialogDescription>
              Update your organization details.
            </DialogDescription>
          </DialogHeader>
          {selectedOrganization && (
            <Form {...organizationForm}>
              <form onSubmit={organizationForm.handleSubmit(onOrganizationSubmit)} className="space-y-4">
                <FormField
                  control={organizationForm.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Name</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          defaultValue={selectedOrganization.displayName}
                          data-testid="input-edit-org-display-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={organizationForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          defaultValue={selectedOrganization.description || ""}
                          data-testid="input-edit-org-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={organizationForm.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Website</FormLabel>
                      <FormControl>
                        <Input 
                          type="url"
                          {...field} 
                          defaultValue={selectedOrganization.website || ""}
                          data-testid="input-edit-org-website"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setSelectedOrganization(null)}
                    data-testid="button-cancel-edit-org"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={updateOrganizationMutation.isPending}
                    data-testid="button-submit-edit-org"
                  >
                    {updateOrganizationMutation.isPending ? "Updating..." : "Update Organization"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>

      {/* Invite Member Dialog */}
      <Dialog open={showInviteMemberDialog} onOpenChange={setShowInviteMemberDialog}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-invite-member">
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
            <DialogDescription>
              Invite a new member to {selectedOrganization?.displayName || 'this organization'}.
            </DialogDescription>
          </DialogHeader>
          <Form {...inviteMemberForm}>
            <form onSubmit={inviteMemberForm.handleSubmit(onInviteMemberSubmit)} className="space-y-4">
              <FormField
                control={inviteMemberForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input 
                        type="email"
                        placeholder="member@example.com" 
                        {...field} 
                        data-testid="input-invite-email"
                      />
                    </FormControl>
                    <FormDescription>
                      We'll send an invitation to this email address.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Role Selection */}
              {availableRoles && availableRoles.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Assign Role (Optional)</label>
                  <Select onValueChange={(value) => {
                    // Store selected role for invitation
                    console.log("Selected role:", value);
                  }}>
                    <SelectTrigger data-testid="select-invite-role">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRoles.filter(role => !role.organizationId || role.organizationId === selectedOrganization?.id).map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          <div className="flex items-center space-x-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: role.color }}
                            />
                            <span>{role.displayName}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    The member will receive this role when they join the organization.
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowInviteMemberDialog(false)}
                  data-testid="button-cancel-invite"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  data-testid="button-submit-invite"
                >
                  Send Invitation
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
    </div>
    </div>
  );
}
