/**
 * Morton Industries: a fictional precision-machining and fabrication company used for demos
 * and tests. Generates a realistic, deterministic ErpSnapshot (same seed -> same data) so the
 * whole pipeline (connector -> snapshot -> KPI engine -> dashboard) runs without a real ERP.
 *
 * Numbers are tuned to look like a ~$25M/yr job shop: ~5 orders a day, net-30 terms, ~93%
 * on-time delivery, ~38% gross margin, a few late payers and the odd cancelled order.
 */
import { emptySnapshot, daysAgo, type ErpSnapshot } from "../connectors/types";

export const DEMO_COMPANY = {
  name: "Morton Industries",
  erpSystem: "demo",
  description: "Precision machining and fabrication, Peoria IL. Fictional company for demos.",
};

const CUSTOMERS = [
  "Caterpillar Heavy Equipment", "Deere Ag Components", "Midwest Rail Systems", "Great Lakes Pump Co",
  "Illinois Valley Fabricators", "Prairie State Energy", "Riverbend Aerospace", "Komatsu Mining Parts",
  "Tri-County Hydraulics", "Northstar Medical Devices", "Vulcan Foundry Supply", "Heartland Trailer Works",
  "Peoria Precision Gears", "Summit Conveyor Systems", "BlueLine Defense Machining",
];

const PART_FAMILIES = [
  ["Hydraulic Manifold", 420, 640], ["Gear Housing", 310, 480], ["Precision Shaft", 95, 150], ["Valve Body", 180, 290],
  ["Mounting Bracket", 22, 38], ["Weldment Frame", 780, 1250], ["Turbine Spacer", 140, 230], ["Bearing Cap", 60, 95],
  ["Pump Impeller", 260, 410], ["Cylinder End Cap", 75, 120], ["Spline Coupling", 115, 185], ["Gearbox Cover", 240, 390],
] as const;

const CANCEL_REASON_WEIGHT = 0.03;

/** Small deterministic PRNG (mulberry32) so the demo is stable across restarts */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface DemoCompanyOptions {
  now?: Date;
  historyDays?: number;
  seed?: number;
  ordersPerDay?: number;
}

export function generateMortonSnapshot(options: DemoCompanyOptions = {}): ErpSnapshot {
  const now = options.now ?? new Date();
  const historyDays = options.historyDays ?? 400;
  const rand = rng(options.seed ?? 20260101);
  const ordersPerDay = options.ordersPerDay ?? 5;
  const start = daysAgo(historyDays, now);
  const snap = emptySnapshot(DEMO_COMPANY.erpSystem, start);
  snap.fetchedAt = now.toISOString();

  // Parts: 40 SKUs with a unit cost and on-hand quantity
  const parts = Array.from({ length: 40 }, (_, i) => {
    const fam = PART_FAMILIES[i % PART_FAMILIES.length];
    const unitCost = round2(fam[1] + rand() * (fam[2] - fam[1]));
    return { item: `MI-${String(1000 + i)}`, name: `${fam[0]} ${String.fromCharCode(65 + (i % 6))}`, unitCost, price: round2(unitCost * (1.5 + rand() * 0.3)) };
  });
  for (const p of parts) {
    snap.inventory.push({ item: p.item, onHand: Math.floor(rand() * 220) + (rand() < 0.15 ? 0 : 10), unitCost: p.unitCost });
  }

  let orderSeq = 48200;
  let invoiceSeq = 91300;
  let jobSeq = 7100;
  let creditSeq = 1;

  for (let day = 0; day < historyDays; day++) {
    const orderDate = addDays(start, day);
    const dow = orderDate.getUTCDay();
    if (dow === 0 || dow === 6) continue; // no orders on weekends
    // gentle growth plus seasonality so trends are visible
    const growth = 1 + (day / historyDays) * 0.18;
    const season = 1 + 0.12 * Math.sin(((orderDate.getUTCMonth() + 1) / 12) * 2 * Math.PI);
    const count = Math.max(1, Math.round(ordersPerDay * growth * season * (0.6 + rand() * 0.8)));

    for (let k = 0; k < count; k++) {
      const id = String(orderSeq++);
      const customer = CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)];
      const lineCount = 1 + Math.floor(rand() * 3);
      const cancelled = rand() < CANCEL_REASON_WEIGHT;
      const leadDays = 10 + Math.floor(rand() * 25);
      const requested = addDays(orderDate, leadDays);
      let amount = 0;
      const lines: Array<{ line: number; part: typeof parts[number]; qty: number; due: Date }> = [];
      for (let l = 1; l <= lineCount; l++) {
        const part = parts[Math.floor(rand() * parts.length)];
        const qty = 1 + Math.floor(rand() * 40);
        amount += part.price * qty;
        lines.push({ line: l, part, qty, due: addDays(requested, Math.floor(rand() * 5) - 2) });
      }
      amount = round2(amount);

      if (cancelled) {
        snap.salesOrders.push({ id, orderDate: iso(orderDate), customer, status: "cancelled", amount, requestedDate: iso(requested) });
        continue;
      }

      // Ship each line: 93% on or before due, the rest 1-9 days late; nothing ships in the future
      let allShipped = true;
      let lastShip: Date | null = null;
      for (const ln of lines) {
        const late = rand() > 0.93;
        const shipDate = addDays(ln.due, late ? 1 + Math.floor(rand() * 9) : -Math.floor(rand() * 3));
        if (shipDate.getTime() > now.getTime()) { allShipped = false; continue; }
        const short = rand() < 0.06;
        const qtyShipped = short ? Math.max(1, ln.qty - Math.ceil(ln.qty * 0.2)) : ln.qty;
        snap.deliveries.push({ orderId: id, line: String(ln.line), dueDate: iso(ln.due), shippedDate: iso(shipDate), qtyOrdered: ln.qty, qtyShipped });
        snap.margin.push({ date: iso(shipDate), revenue: round2(ln.part.price * qtyShipped), cost: round2(ln.part.unitCost * qtyShipped), units: qtyShipped });
        if (!lastShip || shipDate > lastShip) lastShip = shipDate;
      }

      snap.salesOrders.push({ id, orderDate: iso(orderDate), customer, status: allShipped ? "closed" : "open", amount, requestedDate: iso(requested) });

      // Invoice on the last shipment, net 30. Older invoices are mostly paid; a few customers pay late.
      if (lastShip) {
        const invDate = addDays(lastShip, 1);
        if (invDate.getTime() <= now.getTime()) {
          const due = addDays(invDate, 30);
          const ageDays = (now.getTime() - invDate.getTime()) / DAY;
          const slowPayer = customer === "Vulcan Foundry Supply" || customer === "Heartland Trailer Works";
          let balance = amount;
          if (ageDays > 30) balance = slowPayer ? (ageDays > 75 ? 0 : amount) : ((rand() < 0.9 || ageDays > 120) ? 0 : amount);
          else if (ageDays > 20 && rand() < 0.35) balance = 0;
          snap.invoices.push({ id: String(invoiceSeq++), date: iso(invDate), dueDate: iso(due), customer, amount, balance: round2(balance), isCreditMemo: false });
          // ~2% of invoices get a partial credit memo a week later
          if (rand() < 0.02) {
            const cmDate = addDays(invDate, 7);
            if (cmDate.getTime() <= now.getTime()) {
              snap.invoices.push({ id: `CM-${String(creditSeq++).padStart(4, "0")}`, date: iso(cmDate), dueDate: null, customer, amount: round2(amount * (0.05 + rand() * 0.15)), balance: 0, isCreditMemo: true });
            }
          }
        }
      }

      // One production job per order line for made-to-order parts (~60%)
      for (const ln of lines) {
        if (rand() > 0.6) continue;
        const startDate = addDays(orderDate, 1 + Math.floor(rand() * 4));
        const dueDate = addDays(ln.due, -1);
        const plannedDays = Math.max(3, (dueDate.getTime() - startDate.getTime()) / DAY);
        const actualDays = plannedDays * (0.75 + rand() * 0.4);
        const completeDate = addDays(startDate, Math.round(actualDays));
        const done = completeDate.getTime() <= now.getTime();
        snap.jobs.push({
          id: `J${jobSeq++}`,
          startDate: startDate.getTime() <= now.getTime() ? iso(startDate) : null,
          dueDate: iso(dueDate),
          completedDate: done ? iso(completeDate) : null,
          status: done ? "complete" : "open",
          qty: ln.qty,
        });
      }
    }
  }

  return snap;
}
