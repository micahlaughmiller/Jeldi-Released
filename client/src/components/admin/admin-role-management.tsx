import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

interface Permission {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  category: string;
  resource: string;
  action: string;
}

interface Role {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  color: string;
  isSystem: boolean;
  isActive: boolean;
}

interface PermissionMatrixData {
  matrix: Array<{
    roleId: string;
    roleName: string;
    permissions: Permission[];
  }>;
  permissions: Permission[];
  roles: Role[];
  categories: string[];
}

export function AdminRoleManagement() {
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  
  // Fetch permission matrix data
  const { data: matrixData, isLoading } = useQuery<PermissionMatrixData>({
    queryKey: ['/api/admin/roles/matrix'],
    refetchInterval: 30000,
  });

  const getPermissionsByCategory = (permissions: Permission[]) => {
    return permissions.reduce((acc, permission) => {
      if (!acc[permission.category]) {
        acc[permission.category] = [];
      }
      acc[permission.category].push(permission);
      return acc;
    }, {} as Record<string, Permission[]>);
  };

  const hasRolePermission = (roleId: string, permissionId: string) => {
    const roleMatrix = matrixData?.matrix.find(m => m.roleId === roleId);
    return roleMatrix?.permissions.some(p => p.id === permissionId) || false;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Role & Permission Management</h2>
          <p className="text-muted-foreground">Manage system roles and their permissions</p>
        </div>
        <Button data-testid="button-create-role">
          <i className="fas fa-plus mr-2"></i>
          Create Role
        </Button>
      </div>

      {/* Roles Overview */}
      <Card>
        <CardHeader>
          <CardTitle>System Roles</CardTitle>
          <CardDescription>
            Current roles and their configurations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {matrixData?.roles.map((role) => {
              const rolePermissions = matrixData.matrix.find(m => m.roleId === role.id)?.permissions || [];
              return (
                <Card 
                  key={role.id} 
                  className={`cursor-pointer transition-all ${
                    selectedRole === role.id ? 'ring-2 ring-primary' : 'hover:shadow-md'
                  }`}
                  onClick={() => setSelectedRole(selectedRole === role.id ? null : role.id)}
                  data-testid={`role-card-${role.name}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: role.color }}
                        ></div>
                        {role.displayName}
                      </CardTitle>
                      {role.isSystem && (
                        <Badge variant="secondary" className="text-xs">
                          System
                        </Badge>
                      )}
                    </div>
                    {role.description && (
                      <CardDescription className="text-sm">
                        {role.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {rolePermissions.length} permissions
                      </span>
                      <Badge variant={role.isActive ? "default" : "secondary"}>
                        {role.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Permission Matrix */}
      <Card>
        <CardHeader>
          <CardTitle>Permission Matrix</CardTitle>
          <CardDescription>
            Visual representation of role-permission relationships
          </CardDescription>
        </CardHeader>
        <CardContent>
          {matrixData?.categories.map((category) => {
            const categoryPermissions = matrixData.permissions.filter(p => p.category === category);
            
            return (
              <div key={category} className="mb-8 last:mb-0">
                <h3 className="text-lg font-semibold mb-4 capitalize">
                  {category.replace(/_/g, ' ')}
                </h3>
                
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-1/3">Permission</TableHead>
                        {matrixData.roles.map((role) => (
                          <TableHead key={role.id} className="text-center">
                            <div className="flex flex-col items-center">
                              <div 
                                className="w-3 h-3 rounded-full mb-1" 
                                style={{ backgroundColor: role.color }}
                              ></div>
                              <span className="text-xs">{role.displayName}</span>
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryPermissions.map((permission) => (
                        <TableRow key={permission.id} data-testid={`permission-row-${permission.name}`}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{permission.displayName}</p>
                              <p className="text-sm text-muted-foreground">
                                {permission.description}
                              </p>
                              <code className="text-xs bg-muted px-1 rounded">
                                {permission.name}
                              </code>
                            </div>
                          </TableCell>
                          {matrixData.roles.map((role) => (
                            <TableCell key={role.id} className="text-center">
                              <div className="flex justify-center">
                                {hasRolePermission(role.id, permission.id) ? (
                                  <i 
                                    className="fas fa-check-circle text-green-500" 
                                    data-testid={`permission-${permission.name}-${role.name}-granted`}
                                  ></i>
                                ) : (
                                  <i 
                                    className="fas fa-times-circle text-gray-300" 
                                    data-testid={`permission-${permission.name}-${role.name}-denied`}
                                  ></i>
                                )}
                              </div>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                
                {category !== matrixData.categories[matrixData.categories.length - 1] && (
                  <Separator className="my-6" />
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Selected Role Details */}
      {selectedRole && (
        <Card>
          <CardHeader>
            <CardTitle>Role Details</CardTitle>
            <CardDescription>
              Detailed view of the selected role
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const role = matrixData?.roles.find(r => r.id === selectedRole);
              const roleMatrix = matrixData?.matrix.find(m => m.roleId === selectedRole);
              
              if (!role || !roleMatrix) return null;
              
              const permissionsByCategory = getPermissionsByCategory(roleMatrix.permissions);
              
              return (
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div 
                      className="w-6 h-6 rounded-full" 
                      style={{ backgroundColor: role.color }}
                    ></div>
                    <div>
                      <h3 className="text-xl font-semibold">{role.displayName}</h3>
                      <p className="text-muted-foreground">{role.description}</p>
                    </div>
                    <div className="ml-auto flex gap-2">
                      <Badge variant={role.isActive ? "default" : "secondary"}>
                        {role.isActive ? "Active" : "Inactive"}
                      </Badge>
                      {role.isSystem && (
                        <Badge variant="outline">System Role</Badge>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-3">
                      Granted Permissions ({roleMatrix.permissions.length})
                    </h4>
                    <div className="space-y-4">
                      {Object.entries(permissionsByCategory).map(([category, permissions]) => (
                        <div key={category}>
                          <h5 className="text-sm font-medium mb-2 capitalize">
                            {category.replace(/_/g, ' ')}
                          </h5>
                          <div className="flex flex-wrap gap-2">
                            {permissions.map((permission) => (
                              <Badge 
                                key={permission.id} 
                                variant="secondary"
                                className="text-xs"
                                data-testid={`role-permission-${permission.name}`}
                              >
                                {permission.displayName}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button size="sm" data-testid="button-edit-role">
                      <i className="fas fa-edit mr-2"></i>
                      Edit Role
                    </Button>
                    <Button size="sm" variant="outline" data-testid="button-clone-role">
                      <i className="fas fa-copy mr-2"></i>
                      Clone Role
                    </Button>
                    {!role.isSystem && (
                      <Button size="sm" variant="destructive" data-testid="button-delete-role">
                        <i className="fas fa-trash mr-2"></i>
                        Delete Role
                      </Button>
                    )}
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  );
}