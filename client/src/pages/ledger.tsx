import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getApiUrl } from "@/lib/api-config";
import { performLogout } from "@/lib/logout";
import type { User } from "@shared/schema";
import { EmailRowMenu } from "@/components/email/email-context-menu";
import { draftFromLedger } from "@shared/email-format";

interface Status { enabled: boolean; lastSync: string | null; counts: { customers: number; items: number; orders: number; invoices: number; jobs: number; shipments: number; payments: number } }
interface Customer { id: string; name: string; email: string | null; phone: string | null; paymentTermsDays: number }
interface Item { id: string; sku: string; name: string; unitCost: string; unitPrice: string; onHand: string; isActive: boolean }
interface Line { id: string; lineNo: number; itemId: string | null; sku: string | null; itemName: string | null; description: string | null; qty: string; unitPrice: string; unitCost: string; dueDate: string | null; qtyShipped: string }
interface Order { id: string; number: string; customerName: string; customerId: string; orderDate: string; requestedDate: string | null; status: string; lines: Line[]; total: number; invoiced: boolean }
interface Invoice { id: string; number: string; customerName: string; orderNumber: string | null; invoiceDate: string; dueDate: string | null; amount: string; isCreditMemo: boolean; paid: number; balance: number }
interface Job { id: string; number: string; sku: string | null; itemName: string | null; qty: string; startDate: string | null; dueDate: string | null; completedDate: string | null; status: string }

const money = (v: unknown) => Number(v ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const n = (v: unknown) => Number(v ?? 0);
const today = () => new Date().toISOString().slice(0, 10);

export default function LedgerPage() {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState("orders");
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");
    if (!token || !userData) { setLocation("/login"); return; }
    try { setUser(JSON.parse(userData)); } catch { setLocation("/login"); }
  }, [setLocation]);

  const { data: status } = useQuery<Status>({ queryKey: ["/api/ledger/status"], enabled: !!user });
  const invalidateAll = () => {
    for (const k of ["/api/ledger/status", "/api/ledger/customers", "/api/ledger/items", "/api/ledger/orders", "/api/ledger/invoices", "/api/ledger/jobs", "/api/erp/systems", "/api/erp/sync-status"]) qc.invalidateQueries({ queryKey: [k] });
    // KPIs/charts recalc a moment after edits
    setTimeout(() => { for (const k of ["/api/dashboard/kpi-preferences", "/api/realtime/kpi-updates", "/api/charts/revenue-90d", "/api/charts/unpaid-invoices", "/api/analytics/overview"]) qc.invalidateQueries({ queryKey: [k] }); }, 2500);
  };
  const fail = (title: string) => (e: any) => toast({ title, description: e.message, variant: "destructive" });

  const enable = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ledger/enable"),
    onSuccess: () => { toast({ title: "Jeldi is now your system of record", description: "Enter data below or import CSV files. KPIs update as you go." }); invalidateAll(); },
    onError: fail("Could not enable the ledger"),
  });
  const sync = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ledger/sync"),
    onSuccess: () => { toast({ title: "KPIs recalculated" }); invalidateAll(); },
    onError: fail("Sync failed"),
  });

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background" data-testid="ledger-page">
      <Sidebar user={user} onLogout={() => performLogout(setLocation, { showToast: true })} onERPClick={() => setLocation("/dashboard")} connectedCount={status?.enabled ? 1 : 0} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header connectedCount={status?.enabled ? 1 : 0} connectionStatus={status?.enabled ? "connected" : "disconnected"} />
        <div className="flex-1 overflow-auto p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">Ledger</h1>
              <p className="text-muted-foreground">Customers, items, orders, shipments, invoices, payments and jobs, kept in Jeldi.</p>
            </div>
            {status?.enabled ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Last sync {status.lastSync ? new Date(status.lastSync).toLocaleString() : "never"}</span>
                <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending} data-testid="button-ledger-sync"><i className="fas fa-sync mr-2"></i>Recalculate KPIs</Button>
              </div>
            ) : null}
          </div>

          {!status?.enabled && (
            <Card className="border-primary/40">
              <CardHeader>
                <CardTitle>Use Jeldi as your ERP</CardTitle>
                <CardDescription>No external system to connect? Keep your orders, shipments, invoices, payments and jobs here. The dashboard, charts, drill-downs and AI assistant read from this ledger exactly as they would from Epicor or SyteLine.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button onClick={() => enable.mutate()} disabled={enable.isPending} data-testid="button-enable-ledger"><i className="fas fa-book mr-2"></i>{enable.isPending ? "Setting up…" : "Turn on the ledger"}</Button>
                <p className="text-sm text-muted-foreground self-center">You can still connect an external ERP later; both feed the same KPIs.</p>
              </CardContent>
            </Card>
          )}

          {status && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
              {([["Customers", status.counts.customers], ["Items", status.counts.items], ["Orders", status.counts.orders], ["Invoices", status.counts.invoices], ["Jobs", status.counts.jobs]] as const).map(([l, v]) => (
                <div key={l} className="rounded-lg border bg-card p-3"><div className="text-muted-foreground">{l}</div><div className="text-2xl font-semibold">{v}</div></div>
              ))}
            </div>
          )}

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="orders">Orders</TabsTrigger>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
              <TabsTrigger value="jobs">Jobs</TabsTrigger>
              <TabsTrigger value="customers">Customers</TabsTrigger>
              <TabsTrigger value="items">Items</TabsTrigger>
              <TabsTrigger value="import">Import CSV</TabsTrigger>
            </TabsList>
            <TabsContent value="orders"><OrdersTab onChange={invalidateAll} /></TabsContent>
            <TabsContent value="invoices"><InvoicesTab onChange={invalidateAll} /></TabsContent>
            <TabsContent value="jobs"><JobsTab onChange={invalidateAll} /></TabsContent>
            <TabsContent value="customers"><CustomersTab onChange={invalidateAll} /></TabsContent>
            <TabsContent value="items"><ItemsTab onChange={invalidateAll} /></TabsContent>
            <TabsContent value="import"><ImportTab onChange={invalidateAll} /></TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------- customers
function CustomersTab({ onChange }: { onChange: () => void }) {
  const { toast } = useToast();
  const { data: rows = [] } = useQuery<Customer[]>({ queryKey: ["/api/ledger/customers"] });
  const [form, setForm] = useState({ name: "", email: "", phone: "", paymentTermsDays: "30" });
  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ledger/customers", { ...form, paymentTermsDays: Number(form.paymentTermsDays) || 30 }),
    onSuccess: () => { setForm({ name: "", email: "", phone: "", paymentTermsDays: "30" }); onChange(); },
    onError: (e: any) => toast({ title: "Could not add customer", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({ mutationFn: (id: string) => apiRequest("DELETE", `/api/ledger/customers/${id}`), onSuccess: onChange, onError: (e: any) => toast({ title: "Could not delete", description: e.message, variant: "destructive" }) });
  return (
    <Card>
      <CardHeader><CardTitle>Customers</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[2fr_2fr_1fr_1fr_auto] items-end">
          <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="input-customer-name" /></div>
          <div><Label>Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Terms (days)</Label><Input value={form.paymentTermsDays} onChange={e => setForm({ ...form, paymentTermsDays: e.target.value })} /></div>
          <Button onClick={() => create.mutate()} disabled={!form.name.trim() || create.isPending} data-testid="button-add-customer">Add</Button>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead className="text-right">Terms</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No customers yet</TableCell></TableRow>}
            {rows.map(c => (
              <EmailRowMenu key={c.id} draft={() => draftFromLedger("customer", c)} as="tr" className="border-b transition-colors hover:bg-muted/50" testId={`customer-${c.id}`}><TableCell className="font-medium">{c.name}</TableCell><TableCell>{c.email ?? "—"}</TableCell><TableCell>{c.phone ?? "—"}</TableCell><TableCell className="text-right">{c.paymentTermsDays}d</TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => remove.mutate(c.id)} title="Delete"><i className="fas fa-trash"></i></Button></TableCell></EmailRowMenu>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------- items
function ItemsTab({ onChange }: { onChange: () => void }) {
  const { toast } = useToast();
  const { data: rows = [] } = useQuery<Item[]>({ queryKey: ["/api/ledger/items"] });
  const [form, setForm] = useState({ sku: "", name: "", unitCost: "", unitPrice: "", onHand: "" });
  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ledger/items", form),
    onSuccess: () => { setForm({ sku: "", name: "", unitCost: "", unitPrice: "", onHand: "" }); onChange(); },
    onError: (e: any) => toast({ title: "Could not add item", description: e.message, variant: "destructive" }),
  });
  const adjust = useMutation({
    mutationFn: ({ id, onHand }: { id: string; onHand: string }) => apiRequest("PUT", `/api/ledger/items/${id}`, { onHand }),
    onSuccess: onChange, onError: (e: any) => toast({ title: "Could not update", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({ mutationFn: (id: string) => apiRequest("DELETE", `/api/ledger/items/${id}`), onSuccess: onChange });
  return (
    <Card>
      <CardHeader><CardTitle>Items</CardTitle><CardDescription>Parts and products you sell or make. Unit cost drives margin and inventory value.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr_1fr_1fr_1fr_auto] items-end">
          <div><Label>SKU</Label><Input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} data-testid="input-item-sku" /></div>
          <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Unit cost</Label><Input value={form.unitCost} onChange={e => setForm({ ...form, unitCost: e.target.value })} placeholder="0.00" /></div>
          <div><Label>Unit price</Label><Input value={form.unitPrice} onChange={e => setForm({ ...form, unitPrice: e.target.value })} placeholder="0.00" /></div>
          <div><Label>On hand</Label><Input value={form.onHand} onChange={e => setForm({ ...form, onHand: e.target.value })} placeholder="0" /></div>
          <Button onClick={() => create.mutate()} disabled={!form.sku.trim() || !form.name.trim() || create.isPending} data-testid="button-add-item">Add</Button>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Name</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Price</TableHead><TableHead className="text-right">On hand</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No items yet</TableCell></TableRow>}
            {rows.map(i => (
              <TableRow key={i.id} className={i.isActive ? "" : "opacity-50"}>
                <TableCell className="font-medium">{i.sku}</TableCell><TableCell>{i.name}</TableCell>
                <TableCell className="text-right">{money(i.unitCost)}</TableCell><TableCell className="text-right">{money(i.unitPrice)}</TableCell>
                <TableCell className="text-right"><Input className="w-24 h-8 text-right inline-block" defaultValue={n(i.onHand)} onBlur={e => { if (e.target.value !== String(n(i.onHand))) adjust.mutate({ id: i.id, onHand: e.target.value }); }} /></TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => remove.mutate(i.id)} title="Delete or deactivate"><i className="fas fa-trash"></i></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------- orders
function OrdersTab({ onChange }: { onChange: () => void }) {
  const { toast } = useToast();
  const { data: orders = [] } = useQuery<Order[]>({ queryKey: ["/api/ledger/orders"] });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/ledger/customers"] });
  const { data: items = [] } = useQuery<Item[]>({ queryKey: ["/api/ledger/items"] });
  const [open, setOpen] = useState(false);
  const [ship, setShip] = useState<{ order: Order; line: Line } | null>(null);
  const [shipForm, setShipForm] = useState({ qty: "", shipDate: today() });
  const blank = { customerId: "", orderDate: today(), requestedDate: "", notes: "", lines: [{ itemId: "", qty: "1", unitPrice: "", dueDate: "" }] };
  const [form, setForm] = useState(blank);
  const fail = (t: string) => (e: any) => toast({ title: t, description: e.message, variant: "destructive" });

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ledger/orders", { ...form, lines: form.lines.filter(l => l.itemId && Number(l.qty) > 0) }),
    onSuccess: () => { setOpen(false); setForm(blank); toast({ title: "Order created" }); onChange(); }, onError: fail("Could not create order"),
  });
  const shipMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/ledger/orders/${ship!.order.id}/ship`, { lineId: ship!.line.id, qty: shipForm.qty, shipDate: shipForm.shipDate }),
    onSuccess: () => { setShip(null); toast({ title: "Shipment recorded" }); onChange(); }, onError: fail("Could not ship"),
  });
  const invoice = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/ledger/orders/${id}/invoice`, {}),
    onSuccess: () => { toast({ title: "Invoice created", description: "See the Invoices tab." }); onChange(); }, onError: fail("Could not invoice"),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/ledger/orders/${id}`, { status: "cancelled" }),
    onSuccess: () => { toast({ title: "Order cancelled" }); onChange(); }, onError: fail("Could not cancel"),
  });

  const setLine = (i: number, patch: Partial<typeof blank.lines[number]>) => setForm(f => ({ ...f, lines: f.lines.map((l, idx) => idx === i ? { ...l, ...patch } : l) }));
  const remaining = ship ? n(ship.line.qty) - n(ship.line.qtyShipped) : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div><CardTitle>Sales orders</CardTitle><CardDescription>Ship lines as they go out; invoice an order once something has shipped.</CardDescription></div>
        <Button onClick={() => setOpen(true)} disabled={customers.length === 0 || items.length === 0} title={customers.length === 0 || items.length === 0 ? "Add a customer and an item first" : ""} data-testid="button-new-order"><i className="fas fa-plus mr-2"></i>New order</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Customer</TableHead><TableHead>Ordered</TableHead><TableHead>Requested</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead><TableHead>Lines</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {orders.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No orders yet</TableCell></TableRow>}
            {orders.map(o => (
              <EmailRowMenu key={o.id} draft={() => draftFromLedger("order", o)} as="tr" className="border-b transition-colors hover:bg-muted/50" testId={`order-${o.number}`}>
                <TableCell className="font-medium">{o.number}</TableCell><TableCell>{o.customerName}</TableCell><TableCell>{o.orderDate}</TableCell><TableCell>{o.requestedDate ?? "—"}</TableCell>
                <TableCell className="text-right">{money(o.total)}</TableCell>
                <TableCell><Badge variant={o.status === "open" ? "default" : o.status === "cancelled" ? "destructive" : "secondary"}>{o.status}</Badge>{o.invoiced && <Badge variant="outline" className="ml-1">invoiced</Badge>}</TableCell>
                <TableCell>
                  <div className="space-y-1 text-xs">
                    {o.lines.map(l => (
                      <div key={l.id} className="flex items-center gap-2">
                        <span className="w-6 text-muted-foreground">{l.lineNo}</span>
                        <span className="flex-1 truncate">{l.sku ?? l.description}</span>
                        <span className="tabular-nums">{n(l.qtyShipped)}/{n(l.qty)}</span>
                        {o.status !== "cancelled" && n(l.qtyShipped) < n(l.qty) && (
                          <Button variant="outline" size="sm" className="h-6 px-2" onClick={() => { setShip({ order: o, line: l }); setShipForm({ qty: String(n(l.qty) - n(l.qtyShipped)), shipDate: today() }); }} data-testid={`button-ship-${o.number}-${l.lineNo}`}>Ship</Button>
                        )}
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {!o.invoiced && o.status !== "cancelled" && o.lines.some(l => n(l.qtyShipped) > 0) && <Button variant="outline" size="sm" onClick={() => invoice.mutate(o.id)} data-testid={`button-invoice-${o.number}`}>Invoice</Button>}
                  {o.status === "open" && !o.lines.some(l => n(l.qtyShipped) > 0) && <Button variant="ghost" size="sm" onClick={() => cancel.mutate(o.id)} title="Cancel order"><i className="fas fa-ban"></i></Button>}
                </TableCell>
              </EmailRowMenu>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>New sales order</DialogTitle><DialogDescription>Prices default to the item's unit price; due dates default to the requested date.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1"><Label>Customer</Label>
              <Select value={form.customerId} onValueChange={v => setForm({ ...form, customerId: v })}><SelectTrigger data-testid="select-order-customer"><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Order date</Label><Input type="date" value={form.orderDate} onChange={e => setForm({ ...form, orderDate: e.target.value })} /></div>
            <div><Label>Requested date</Label><Input type="date" value={form.requestedDate} onChange={e => setForm({ ...form, requestedDate: e.target.value })} /></div>
          </div>
          <div className="space-y-2">
            <Label>Lines</Label>
            {form.lines.map((l, i) => (
              <div key={i} className="grid gap-2 grid-cols-[2fr_1fr_1fr_1fr_auto] items-center">
                <Select value={l.itemId} onValueChange={v => setLine(i, { itemId: v, unitPrice: String(n(items.find(x => x.id === v)?.unitPrice)) })}><SelectTrigger data-testid={`select-line-item-${i}`}><SelectValue placeholder="Item" /></SelectTrigger><SelectContent>{items.filter(x => x.isActive).map(x => <SelectItem key={x.id} value={x.id}>{x.sku} · {x.name}</SelectItem>)}</SelectContent></Select>
                <Input placeholder="Qty" value={l.qty} onChange={e => setLine(i, { qty: e.target.value })} />
                <Input placeholder="Unit price" value={l.unitPrice} onChange={e => setLine(i, { unitPrice: e.target.value })} />
                <Input type="date" value={l.dueDate} onChange={e => setLine(i, { dueDate: e.target.value })} />
                <Button variant="ghost" size="sm" onClick={() => setForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }))} disabled={form.lines.length === 1}><i className="fas fa-times"></i></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setForm(f => ({ ...f, lines: [...f.lines, { itemId: "", qty: "1", unitPrice: "", dueDate: "" }] }))}><i className="fas fa-plus mr-1"></i>Add line</Button>
          </div>
          <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => create.mutate()} disabled={!form.customerId || !form.lines.some(l => l.itemId && Number(l.qty) > 0) || create.isPending} data-testid="button-save-order">Create order</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!ship} onOpenChange={o => { if (!o) setShip(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ship {ship?.order.number} line {ship?.line.lineNo}</DialogTitle><DialogDescription>{ship?.line.sku ?? ship?.line.description}: {remaining} remaining of {n(ship?.line.qty)}</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Quantity</Label><Input value={shipForm.qty} onChange={e => setShipForm({ ...shipForm, qty: e.target.value })} data-testid="input-ship-qty" /></div>
            <div><Label>Ship date</Label><Input type="date" value={shipForm.shipDate} onChange={e => setShipForm({ ...shipForm, shipDate: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShip(null)}>Cancel</Button><Button onClick={() => shipMut.mutate()} disabled={shipMut.isPending || !(Number(shipForm.qty) > 0)} data-testid="button-confirm-ship">Record shipment</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------- invoices
function InvoicesTab({ onChange }: { onChange: () => void }) {
  const { toast } = useToast();
  const { data: rows = [] } = useQuery<Invoice[]>({ queryKey: ["/api/ledger/invoices"] });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/ledger/customers"] });
  const [pay, setPay] = useState<Invoice | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", paymentDate: today(), reference: "" });
  const [newInv, setNewInv] = useState({ customerId: "", amount: "", invoiceDate: today(), dueDate: "", isCreditMemo: false });
  const fail = (t: string) => (e: any) => toast({ title: t, description: e.message, variant: "destructive" });
  const payMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/ledger/invoices/${pay!.id}/payments`, payForm),
    onSuccess: () => { setPay(null); toast({ title: "Payment recorded" }); onChange(); }, onError: fail("Could not record payment"),
  });
  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ledger/invoices", newInv),
    onSuccess: () => { setNewInv({ customerId: "", amount: "", invoiceDate: today(), dueDate: "", isCreditMemo: false }); toast({ title: "Invoice added" }); onChange(); }, onError: fail("Could not add invoice"),
  });
  const totalOpen = rows.reduce((s, r) => s + r.balance, 0);
  return (
    <Card>
      <CardHeader><CardTitle>Invoices</CardTitle><CardDescription>Open receivables: {money(totalOpen)}. Invoices are usually created from orders; add one directly for anything else.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto_auto] items-end">
          <div><Label>Customer</Label><Select value={newInv.customerId} onValueChange={v => setNewInv({ ...newInv, customerId: v })}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Amount</Label><Input value={newInv.amount} onChange={e => setNewInv({ ...newInv, amount: e.target.value })} placeholder="0.00" /></div>
          <div><Label>Invoice date</Label><Input type="date" value={newInv.invoiceDate} onChange={e => setNewInv({ ...newInv, invoiceDate: e.target.value })} /></div>
          <div><Label>Due date</Label><Input type="date" value={newInv.dueDate} onChange={e => setNewInv({ ...newInv, dueDate: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" checked={newInv.isCreditMemo} onChange={e => setNewInv({ ...newInv, isCreditMemo: e.target.checked })} />Credit memo</label>
          <Button onClick={() => create.mutate()} disabled={!newInv.customerId || !(Number(newInv.amount) > 0) || create.isPending}>Add</Button>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Customer</TableHead><TableHead>Order</TableHead><TableHead>Date</TableHead><TableHead>Due</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Balance</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No invoices yet</TableCell></TableRow>}
            {rows.map(r => {
              const overdue = r.balance > 0 && r.dueDate && r.dueDate < today();
              return (
                <EmailRowMenu key={r.id} draft={() => draftFromLedger("invoice", r)} as="tr" className="border-b transition-colors hover:bg-muted/50" testId={`invoice-${r.number}`}>
                  <TableCell className="font-medium">{r.number}{r.isCreditMemo && <Badge variant="outline" className="ml-1">credit</Badge>}</TableCell><TableCell>{r.customerName}</TableCell><TableCell>{r.orderNumber ?? "—"}</TableCell><TableCell>{r.invoiceDate}</TableCell>
                  <TableCell className={overdue ? "text-destructive font-medium" : ""}>{r.dueDate ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.isCreditMemo ? "-" : ""}{money(r.amount)}</TableCell><TableCell className="text-right">{money(r.paid)}</TableCell>
                  <TableCell className={`text-right ${r.balance > 0 ? "font-medium" : "text-muted-foreground"}`}>{money(r.balance)}</TableCell>
                  <TableCell className="text-right">{r.balance > 0 && <Button variant="outline" size="sm" onClick={() => { setPay(r); setPayForm({ amount: r.balance.toFixed(2), paymentDate: today(), reference: "" }); }} data-testid={`button-pay-${r.number}`}>Record payment</Button>}</TableCell>
                </EmailRowMenu>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
      <Dialog open={!!pay} onOpenChange={o => { if (!o) setPay(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Payment on {pay?.number}</DialogTitle><DialogDescription>Balance {money(pay?.balance)}</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>Amount</Label><Input value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} data-testid="input-pay-amount" /></div>
            <div><Label>Date</Label><Input type="date" value={payForm.paymentDate} onChange={e => setPayForm({ ...payForm, paymentDate: e.target.value })} /></div>
            <div><Label>Reference</Label><Input value={payForm.reference} onChange={e => setPayForm({ ...payForm, reference: e.target.value })} placeholder="check #, ACH…" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPay(null)}>Cancel</Button><Button onClick={() => payMut.mutate()} disabled={payMut.isPending || !(Number(payForm.amount) > 0)} data-testid="button-confirm-pay">Record</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------- jobs
function JobsTab({ onChange }: { onChange: () => void }) {
  const { toast } = useToast();
  const { data: rows = [] } = useQuery<Job[]>({ queryKey: ["/api/ledger/jobs"] });
  const { data: items = [] } = useQuery<Item[]>({ queryKey: ["/api/ledger/items"] });
  const [form, setForm] = useState({ itemId: "", qty: "1", startDate: today(), dueDate: "" });
  const fail = (t: string) => (e: any) => toast({ title: t, description: e.message, variant: "destructive" });
  const create = useMutation({ mutationFn: () => apiRequest("POST", "/api/ledger/jobs", form), onSuccess: () => { setForm({ itemId: "", qty: "1", startDate: today(), dueDate: "" }); onChange(); }, onError: fail("Could not add job") });
  const complete = useMutation({ mutationFn: (id: string) => apiRequest("POST", `/api/ledger/jobs/${id}/complete`, {}), onSuccess: () => { toast({ title: "Job completed" }); onChange(); }, onError: fail("Could not complete job") });
  return (
    <Card>
      <CardHeader><CardTitle>Jobs</CardTitle><CardDescription>Production or service jobs. Start-to-completion drives cycle time; completion vs due date drives performance.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] items-end">
          <div><Label>Item</Label><Select value={form.itemId} onValueChange={v => setForm({ ...form, itemId: v })}><SelectTrigger data-testid="select-job-item"><SelectValue placeholder="Optional" /></SelectTrigger><SelectContent>{items.map(x => <SelectItem key={x.id} value={x.id}>{x.sku} · {x.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Qty</Label><Input value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} /></div>
          <div><Label>Start</Label><Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></div>
          <div><Label>Due</Label><Input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></div>
          <Button onClick={() => create.mutate()} disabled={create.isPending} data-testid="button-add-job">Add job</Button>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Job</TableHead><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Start</TableHead><TableHead>Due</TableHead><TableHead>Completed</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No jobs yet</TableCell></TableRow>}
            {rows.map(j => (
              <EmailRowMenu key={j.id} draft={() => draftFromLedger("job", j)} as="tr" className="border-b transition-colors hover:bg-muted/50" testId={`job-${j.number}`}>
                <TableCell className="font-medium">{j.number}</TableCell><TableCell>{j.sku ? `${j.sku} · ${j.itemName}` : "—"}</TableCell><TableCell className="text-right">{n(j.qty)}</TableCell>
                <TableCell>{j.startDate ?? "—"}</TableCell><TableCell>{j.dueDate ?? "—"}</TableCell><TableCell>{j.completedDate ?? "—"}</TableCell>
                <TableCell><Badge variant={j.status === "open" ? "default" : "secondary"}>{j.status}</Badge></TableCell>
                <TableCell className="text-right">{j.status === "open" && <Button variant="outline" size="sm" onClick={() => complete.mutate(j.id)} data-testid={`button-complete-${j.number}`}>Complete</Button>}</TableCell>
              </EmailRowMenu>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------- import
function ImportTab({ onChange }: { onChange: () => void }) {
  const { toast } = useToast();
  const [entity, setEntity] = useState("customers");
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<{ imported: number; updated: number; skipped: number; errors: string[] } | null>(null);
  const run = useMutation({
    mutationFn: () => apiRequest("POST", `/api/ledger/import/${entity}`, { csv }).then(r => r.json()),
    onSuccess: (r: any) => { setResult(r); toast({ title: "Import finished", description: `${r.imported} added, ${r.updated} updated, ${r.skipped} skipped` }); onChange(); },
    onError: (e: any) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });
  const onFile = (f: File | null) => { if (!f) return; f.text().then(setCsv); };
  const templateUrl = useMemo(() => getApiUrl(`/api/ledger/templates/${entity}`), [entity]);
  const downloadTemplate = async () => {
    const res = await fetch(templateUrl, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
    const text = await res.text();
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); a.download = `jeldi-${entity}-template.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 0);
  };
  const order = ["customers", "items", "orders", "invoices", "jobs"];
  return (
    <Card>
      <CardHeader><CardTitle>Import from spreadsheets</CardTitle><CardDescription>Export CSV from your current spreadsheets or system and load it here. Import in this order: customers, items, orders, invoices, jobs. Re-importing a file updates customers and items and skips orders, invoices and jobs that already exist.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div><Label>What are you importing?</Label>
            <Select value={entity} onValueChange={v => { setEntity(v); setResult(null); }}><SelectTrigger className="w-56" data-testid="select-import-entity"><SelectValue /></SelectTrigger><SelectContent>{order.map(e => <SelectItem key={e} value={e}>{e[0].toUpperCase() + e.slice(1)}</SelectItem>)}</SelectContent></Select></div>
          <Button variant="outline" onClick={downloadTemplate}><i className="fas fa-download mr-2"></i>Download template</Button>
          <div><Label htmlFor="csv-file">CSV file</Label><Input id="csv-file" type="file" accept=".csv,text/csv" onChange={e => onFile(e.target.files?.[0] ?? null)} /></div>
        </div>
        <div><Label>Or paste CSV</Label><Textarea rows={8} value={csv} onChange={e => setCsv(e.target.value)} placeholder="name,email,phone,payment_terms_days" className="font-mono text-xs" data-testid="textarea-import-csv" /></div>
        <Button onClick={() => run.mutate()} disabled={!csv.trim() || run.isPending} data-testid="button-run-import">{run.isPending ? "Importing…" : "Import"}</Button>
        {result && (
          <div className="rounded-lg border p-3 text-sm space-y-1" data-testid="import-result">
            <div>Added <b>{result.imported}</b>, updated <b>{result.updated}</b>, skipped <b>{result.skipped}</b>.</div>
            {result.errors.length > 0 && <ul className="list-disc pl-5 text-destructive">{result.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}{result.errors.length > 20 && <li>…and {result.errors.length - 20} more</li>}</ul>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
