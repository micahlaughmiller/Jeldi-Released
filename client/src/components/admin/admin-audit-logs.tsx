import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";

interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  oldValue?: any;
  newValue?: any;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
  offset: number;
  limit: number;
  filters: {
    userId?: string;
    action?: string;
    resource?: string;
    startDate?: string;
    endDate?: string;
  };
}

export function AdminAuditLogs() {
  const [actionFilter, setActionFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Fetch audit logs
  const { data: auditData, isLoading } = useQuery<AuditLogsResponse>({
    queryKey: [
      '/api/admin/audit-logs/enhanced',
      {
        action: actionFilter,
        resource: resourceFilter,
        userId: userFilter,
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
      }
    ],
    refetchInterval: 15000, // Refresh every 15 seconds for real-time feeling
  });

  // Recent activity for real-time stream
  const { data: recentActivity } = useQuery({
    queryKey: ['/api/admin/activity/stream'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const getActionIcon = (action: string) => {
    if (action.includes('login')) return 'fas fa-sign-in-alt text-blue-500';
    if (action.includes('logout')) return 'fas fa-sign-out-alt text-gray-500';
    if (action.includes('created')) return 'fas fa-plus text-green-500';
    if (action.includes('updated')) return 'fas fa-edit text-orange-500';
    if (action.includes('deleted')) return 'fas fa-trash text-red-500';
    if (action.includes('assigned')) return 'fas fa-user-tag text-purple-500';
    if (action.includes('revoked')) return 'fas fa-user-minus text-red-500';
    if (action.includes('accessed')) return 'fas fa-eye text-blue-500';
    return 'fas fa-info-circle text-gray-500';
  };

  const getActionBadge = (action: string) => {
    if (action.includes('login') || action.includes('accessed')) return 'default';
    if (action.includes('created') || action.includes('assigned')) return 'default';
    if (action.includes('updated')) return 'secondary';
    if (action.includes('deleted') || action.includes('revoked')) return 'destructive';
    return 'outline';
  };

  const clearFilters = () => {
    setActionFilter("");
    setResourceFilter("");
    setUserFilter("");
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const hasFilters = actionFilter || resourceFilter || userFilter || startDate || endDate;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Audit & Security Logs</h2>
          <p className="text-muted-foreground">Monitor system activity and security events</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" data-testid="button-export-logs">
            <i className="fas fa-download mr-2"></i>
            Export Logs
          </Button>
          <Button variant="outline" data-testid="button-refresh-logs">
            <i className="fas fa-sync-alt mr-2"></i>
            Refresh
          </Button>
        </div>
      </div>

      {/* Real-time Activity Stream */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <i className="fas fa-broadcast-tower text-primary"></i>
            Real-time Activity Stream
          </CardTitle>
          <CardDescription>
            Live feed of system events (updates every 5 seconds)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {recentActivity?.activities?.slice(0, 10).map((activity: AuditLog) => (
              <div 
                key={activity.id} 
                className="flex items-center gap-3 p-2 rounded hover:bg-muted transition-colors"
                data-testid={`real-time-activity-${activity.id}`}
              >
                <i className={getActionIcon(activity.action)}></i>
                <div className="flex-1">
                  <span className="font-medium">{activity.action}</span>
                  <span className="text-muted-foreground"> on </span>
                  <span className="font-medium">{activity.resource}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(activity.timestamp).toLocaleTimeString()}
                </span>
              </div>
            )) || (
              <div className="text-center py-4 text-muted-foreground">
                No recent activity
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filter & Search</CardTitle>
          <CardDescription>
            Filter audit logs by action, resource, user, or date range
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Action</label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger data-testid="select-action-filter">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Actions</SelectItem>
                  <SelectItem value="login">Login Events</SelectItem>
                  <SelectItem value="created">Create Actions</SelectItem>
                  <SelectItem value="updated">Update Actions</SelectItem>
                  <SelectItem value="deleted">Delete Actions</SelectItem>
                  <SelectItem value="assigned">Assignment Actions</SelectItem>
                  <SelectItem value="accessed">Access Events</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Resource</label>
              <Select value={resourceFilter} onValueChange={setResourceFilter}>
                <SelectTrigger data-testid="select-resource-filter">
                  <SelectValue placeholder="All resources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Resources</SelectItem>
                  <SelectItem value="users">Users</SelectItem>
                  <SelectItem value="roles">Roles</SelectItem>
                  <SelectItem value="permissions">Permissions</SelectItem>
                  <SelectItem value="user_management">User Management</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">User ID</label>
              <Input
                placeholder="Filter by user ID"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                data-testid="input-user-filter"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Start Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start" data-testid="button-start-date">
                    <i className="fas fa-calendar mr-2"></i>
                    {startDate ? format(startDate, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">End Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start" data-testid="button-end-date">
                    <i className="fas fa-calendar mr-2"></i>
                    {endDate ? format(endDate, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {hasFilters && (
            <div className="mt-4">
              <Button variant="outline" onClick={clearFilters} data-testid="button-clear-filters">
                <i className="fas fa-times mr-2"></i>
                Clear All Filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Audit Trail</CardTitle>
          <CardDescription>
            Detailed system audit logs
            {auditData && (
              <span className="ml-2">
                ({auditData.total} total records)
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(10)].map((_, index) => (
                    <TableRow key={index}>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    </TableRow>
                  ))
                ) : auditData?.logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No audit logs found
                    </TableCell>
                  </TableRow>
                ) : (
                  auditData?.logs.map((log) => (
                    <TableRow 
                      key={log.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedLog(log)}
                      data-testid={`audit-log-${log.id}`}
                    >
                      <TableCell>
                        <div className="text-sm">
                          {new Date(log.timestamp).toLocaleString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <i className={getActionIcon(log.action)}></i>
                          <Badge variant={getActionBadge(log.action) as any} className="text-xs">
                            {log.action}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1 rounded">
                          {log.resource}
                        </code>
                      </TableCell>
                      <TableCell>
                        {log.userId ? (
                          <span className="text-sm font-mono">{log.userId.slice(0, 8)}...</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">System</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground">
                          {log.ipAddress && (
                            <div>IP: {log.ipAddress}</div>
                          )}
                          {log.resourceId && (
                            <div>Resource: {log.resourceId.slice(0, 8)}...</div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {auditData && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {auditData.logs.length} of {auditData.total} logs
              </p>
              <div className="flex space-x-2">
                <Button variant="outline" size="sm" disabled>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log Details Modal */}
      {selectedLog && (
        <Card className="fixed inset-4 z-50 bg-background border-2 shadow-lg overflow-auto">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Audit Log Details</CardTitle>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setSelectedLog(null)}
                data-testid="button-close-log-details"
              >
                <i className="fas fa-times"></i>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Timestamp</label>
                <p className="text-sm">{new Date(selectedLog.timestamp).toLocaleString()}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Action</label>
                <p className="text-sm">{selectedLog.action}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Resource</label>
                <p className="text-sm">{selectedLog.resource}</p>
              </div>
              <div>
                <label className="text-sm font-medium">User ID</label>
                <p className="text-sm font-mono">{selectedLog.userId || 'System'}</p>
              </div>
              <div>
                <label className="text-sm font-medium">IP Address</label>
                <p className="text-sm">{selectedLog.ipAddress || 'Unknown'}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Resource ID</label>
                <p className="text-sm font-mono">{selectedLog.resourceId || 'N/A'}</p>
              </div>
            </div>

            {selectedLog.oldValue && (
              <div>
                <label className="text-sm font-medium">Previous Value</label>
                <pre className="text-xs bg-muted p-3 rounded overflow-auto">
                  {JSON.stringify(selectedLog.oldValue, null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.newValue && (
              <div>
                <label className="text-sm font-medium">New Value</label>
                <pre className="text-xs bg-muted p-3 rounded overflow-auto">
                  {JSON.stringify(selectedLog.newValue, null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.userAgent && (
              <div>
                <label className="text-sm font-medium">User Agent</label>
                <p className="text-xs break-all">{selectedLog.userAgent}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}