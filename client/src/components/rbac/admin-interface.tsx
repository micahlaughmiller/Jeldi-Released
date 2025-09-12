import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AdminGuard, AccessDenied } from "./role-guard";
import { Role, Permission } from "@/hooks/use-permissions";

interface User {
  id: string;
  username: string;
  email: string;
  role: string; // Legacy role field
  createdAt: string;
}

interface UserWithRoles extends User {
  roles: Role[];
  permissions: Permission[];
}

interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

export function AdminInterface() {
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isRevokeDialogOpen, setIsRevokeDialogOpen] = useState(false);

  // Fetch all roles
  const { data: roles = [], isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ["/api/rbac/roles"],
  });

  // Fetch all permissions grouped by category
  const { data: permissionsData, isLoading: permissionsLoading } = useQuery<{
    permissions: Permission[];
    byCategory: Record<string, Permission[]>;
    categories: string[];
  }>({
    queryKey: ["/api/rbac/permissions"],
  });

  // Fetch audit logs
  const { data: auditLogs = [], isLoading: auditLoading } = useQuery<any[]>({
    queryKey: ["/api/rbac/audit-logs"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Assign role mutation
  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      const response = await apiRequest("POST", "/api/rbac/assign-role", { userId, roleId });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Role Assigned",
        description: "Role has been successfully assigned to the user.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/rbac"] });
      setIsAssignDialogOpen(false);
      setSelectedUser("");
      setSelectedRole("");
    },
    onError: (error: Error) => {
      toast({
        title: "Assignment Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Revoke role mutation
  const revokeRoleMutation = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      const response = await apiRequest("DELETE", "/api/rbac/revoke-role", { userId, roleId });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Role Revoked",
        description: "Role has been successfully revoked from the user.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/rbac"] });
      setIsRevokeDialogOpen(false);
      setSelectedUser("");
      setSelectedRole("");
    },
    onError: (error: Error) => {
      toast({
        title: "Revocation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAssignRole = () => {
    if (selectedUser && selectedRole) {
      assignRoleMutation.mutate({ userId: selectedUser, roleId: selectedRole });
    }
  };

  const handleRevokeRole = () => {
    if (selectedUser && selectedRole) {
      revokeRoleMutation.mutate({ userId: selectedUser, roleId: selectedRole });
    }
  };

  return (
    <AdminGuard fallback={<AccessDenied message="Administrator access required to manage user roles." />}>
      <div className="container mx-auto p-6 space-y-6" data-testid="admin-interface">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Role Management</h1>
            <p className="text-muted-foreground">Manage user roles and permissions</p>
          </div>
          <Badge variant="secondary" className="bg-red-100 text-red-800">
            <i className="fas fa-shield-alt mr-2" />
            Admin Access
          </Badge>
        </div>

        <Tabs defaultValue="roles" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="assign">Assign Roles</TabsTrigger>
            <TabsTrigger value="audit">Audit Log</TabsTrigger>
          </TabsList>

          {/* Roles Tab */}
          <TabsContent value="roles" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>System Roles</CardTitle>
                <CardDescription>
                  Available roles in the system and their configurations
                </CardDescription>
              </CardHeader>
              <CardContent>
                {rolesLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="animate-pulse bg-muted h-20 rounded-lg" />
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {roles.map((role) => (
                      <Card key={role.id} className="border-l-4" style={{ borderLeftColor: role.color }}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold">{role.displayName}</h3>
                            <Badge 
                              variant={role.isActive ? "default" : "secondary"}
                              className={role.isActive ? "bg-green-100 text-green-800" : ""}
                            >
                              {role.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">{role.description}</p>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Code: {role.name}</span>
                            <span>{role.isSystem ? "System" : "Custom"}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Permissions Tab */}
          <TabsContent value="permissions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>System Permissions</CardTitle>
                <CardDescription>
                  Granular permissions organized by category
                </CardDescription>
              </CardHeader>
              <CardContent>
                {permissionsLoading ? (
                  <div className="animate-pulse bg-muted h-40 rounded-lg" />
                ) : (
                  <div className="space-y-6">
                    {permissionsData?.categories.map((category) => (
                      <div key={category} className="space-y-3">
                        <h3 className="text-lg font-semibold capitalize">
                          {category.replace(/_/g, ' ')}
                        </h3>
                        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                          {permissionsData.byCategory[category]?.map((permission) => (
                            <Card key={permission.id} className="border border-border/50">
                              <CardContent className="p-3">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-medium text-sm">{permission.displayName}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {permission.resource}.{permission.action}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">{permission.description}</p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Assign Roles Tab */}
          <TabsContent value="assign" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Assign Role</CardTitle>
                  <CardDescription>
                    Grant additional roles to users
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="assign-user">User Email</Label>
                    <Input
                      id="assign-user"
                      placeholder="user@example.com"
                      value={selectedUser}
                      onChange={(e) => setSelectedUser(e.target.value)}
                      data-testid="input-assign-user"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="assign-role">Role</Label>
                    <Select value={selectedRole} onValueChange={setSelectedRole}>
                      <SelectTrigger data-testid="select-assign-role">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    onClick={handleAssignRole}
                    disabled={!selectedUser || !selectedRole || assignRoleMutation.isPending}
                    className="w-full"
                    data-testid="button-assign-role"
                  >
                    {assignRoleMutation.isPending ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2" />
                        Assigning...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-plus mr-2" />
                        Assign Role
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Revoke Role</CardTitle>
                  <CardDescription>
                    Remove roles from users
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="revoke-user">User Email</Label>
                    <Input
                      id="revoke-user"
                      placeholder="user@example.com"
                      value={selectedUser}
                      onChange={(e) => setSelectedUser(e.target.value)}
                      data-testid="input-revoke-user"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="revoke-role">Role</Label>
                    <Select value={selectedRole} onValueChange={setSelectedRole}>
                      <SelectTrigger data-testid="select-revoke-role">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    onClick={handleRevokeRole}
                    disabled={!selectedUser || !selectedRole || revokeRoleMutation.isPending}
                    variant="destructive"
                    className="w-full"
                    data-testid="button-revoke-role"
                  >
                    {revokeRoleMutation.isPending ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2" />
                        Revoking...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-minus mr-2" />
                        Revoke Role
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Alert>
              <i className="fas fa-info-circle h-4 w-4" />
              <AlertDescription>
                Users can have multiple roles. Permissions are additive - users get the union of all permissions from their assigned roles.
              </AlertDescription>
            </Alert>
          </TabsContent>

          {/* Audit Log Tab */}
          <TabsContent value="audit" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Audit Log</CardTitle>
                <CardDescription>
                  Recent role and permission changes
                </CardDescription>
              </CardHeader>
              <CardContent>
                {auditLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="animate-pulse bg-muted h-16 rounded-lg" />
                    ))}
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <i className="fas fa-clipboard-list text-4xl mb-4" />
                    <p>No audit events recorded yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {auditLogs.map((log) => (
                      <Card key={log.id} className="border-l-4 border-l-blue-500">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">{log.action.replace(/_/g, ' ')}</span>
                            <span className="text-sm text-muted-foreground">
                              {new Date(log.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <p>Resource: {log.resource} {log.resourceId && `(${log.resourceId})`}</p>
                            {log.ipAddress && <p>IP: {log.ipAddress}</p>}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminGuard>
  );
}