import React, { createContext, useContext, useReducer, useMemo, useEffect, useState } from "react";
import {
  FINANCE_SERIES_SEED, FINANCE_KPIS_SEED, INITIAL_RECS,
  INITIAL_INVENTORY, INITIAL_DRAFTS, POS_SALES_SEED,
  CUSTOMERS_SEED, SUPPLIERS_SEED,
} from "../data/constants.js";
import { logEntry, savePersisted, invStatus, normalizeInventoryItem } from "../utils/helpers.js";

export function createBlankStoreState(businessName = "", ownerName = "") {
  return {
    finance: {
      kpis: [
        { key: "revenue", label: "Revenue (MTD)", value: 0, display: "₨0", trend: "flat", delta: "0%" },
        { key: "expenses", label: "Expenses (MTD)", value: 0, display: "₨0", trend: "flat", delta: "0%" },
        { key: "profit", label: "Net Profit", value: 0, display: "₨0", trend: "flat", delta: "0%" },
        { key: "runway", label: "Cash Runway", value: 0, display: "0 mo", trend: "flat", delta: "0 mo" },
      ],
      series: [
        { month: "Jan", revenue: 0, forecast: null },
        { month: "Feb", revenue: 0, forecast: null },
        { month: "Mar", revenue: 0, forecast: null },
        { month: "Apr", revenue: 0, forecast: null },
        { month: "May", revenue: 0, forecast: null },
        { month: "Jun", revenue: 0, forecast: null },
      ],
      recs: [],
      runwayAdjustment: 0,
    },
    inventory: [],
    customers: [],
    suppliers: [],
    drafts: [],
    pos: { status: "disconnected", lastSync: null, sales: [] },
    activity: [],
    reports: [],
  };
}

export function createDemoStoreState() {
  return {
    finance: { kpis: FINANCE_KPIS_SEED, series: FINANCE_SERIES_SEED, recs: INITIAL_RECS, runwayAdjustment: 0 },
    inventory: INITIAL_INVENTORY.map(normalizeInventoryItem),
    customers: CUSTOMERS_SEED,
    suppliers: SUPPLIERS_SEED,
    drafts: INITIAL_DRAFTS,
    pos: { status: "disconnected", lastSync: null, sales: POS_SALES_SEED },
    activity: [
      logEntry("system", "Demo sample data loaded successfully."),
    ],
    reports: [],
  };
}

export function appReducer(state, action) {
  switch (action.type) {
    case "HYDRATE": {
      const incoming = action.payload || {};
      const blank = createBlankStoreState();
      return {
        finance: {
          kpis: incoming.finance?.kpis || blank.finance.kpis,
          series: incoming.finance?.series || blank.finance.series,
          recs: Array.isArray(incoming.finance?.recs) ? incoming.finance.recs : [],
          runwayAdjustment: incoming.finance?.runwayAdjustment || 0,
        },
        inventory: Array.isArray(incoming.inventory) ? incoming.inventory.map(normalizeInventoryItem) : [],
        customers: Array.isArray(incoming.customers) ? incoming.customers : [],
        suppliers: Array.isArray(incoming.suppliers) ? incoming.suppliers : [],
        drafts: Array.isArray(incoming.drafts) ? incoming.drafts : [],
        pos: {
          status: incoming.pos?.status || "disconnected",
          lastSync: incoming.pos?.lastSync || null,
          sales: Array.isArray(incoming.pos?.sales) ? incoming.pos.sales : [],
        },
        activity: Array.isArray(incoming.activity) ? incoming.activity : [],
        reports: Array.isArray(incoming.reports) ? incoming.reports : [],
      };
    }

    case "CLEAR_STORE": {
      return createBlankStoreState();
    }

    case "LOAD_DEMO_DATA":
    case "RESET_DEMO": {
      return createDemoStoreState();
    }

    case "APPROVE_REC": {
      const rec = state.finance.recs.find((r) => r.id === action.id);
      if (!rec || rec.status !== "pending") return state;
      return {
        ...state,
        finance: {
          ...state.finance,
          recs: state.finance.recs.map((r) => (r.id === action.id ? { ...r, status: "approved" } : r)),
          runwayAdjustment: state.finance.runwayAdjustment + (rec.runwayBoost || 0),
        },
        activity: [logEntry("finance", `Approved: "${rec.title}" — ${rec.impactLabel}.`), ...state.activity].slice(0, 40),
      };
    }
    case "REJECT_REC": {
      const rec = state.finance.recs.find((r) => r.id === action.id);
      if (!rec || rec.status !== "pending") return state;
      return {
        ...state,
        finance: { ...state.finance, recs: state.finance.recs.map((r) => (r.id === action.id ? { ...r, status: "rejected" } : r)) },
        activity: [logEntry("finance", `Rejected: "${rec.title}".`), ...state.activity].slice(0, 40),
      };
    }
    case "ADD_REC": {
      const nextId = Math.max(0, ...state.finance.recs.map((r) => r.id)) + 1;
      return { ...state, finance: { ...state.finance, recs: [...state.finance.recs, { id: nextId, status: "pending", ...action.rec }] } };
    }
    case "IMPORT_FINANCE_SERIES": {
      return { ...state, finance: { ...state.finance, series: action.series }, activity: [logEntry("finance", `Imported ${action.series.length} months of revenue data — forecast recalculated.`), ...state.activity].slice(0, 40) };
    }

    case "PLACE_REORDER": {
      const item = state.inventory.find((i) => i.id === action.id);
      if (!item || item.reordered) return state;
      return {
        ...state,
        inventory: state.inventory.map((i) => (i.id === action.id ? { ...i, reordered: true } : i)),
        activity: [logEntry("inventory", `Reorder placed for ${item.name}.`), ...state.activity].slice(0, 40),
      };
    }
    case "ADD_INVENTORY_ITEM": {
      const inv = state.inventory || [];
      const nextId = Math.max(0, ...inv.map((i) => i.id || 0)) + 1;
      const newItem = normalizeInventoryItem({
        id: nextId,
        name: action.name,
        stock: Number(action.stock) || 0,
        threshold: Number(action.threshold) || 20,
        price: Number(action.price) || 100,
        category: action.category || "General",
        sku: action.sku || `SKU-${1000 + nextId}`,
        supplierName: action.supplierName || "Local Supplier",
        trend: "flat",
        reordered: false,
      });
      return {
        ...state,
        inventory: [...inv, newItem],
        activity: [logEntry("inventory", `Added "${action.name}" (${action.stock} units).`), ...(state.activity || [])].slice(0, 40),
      };
    }
    case "UPDATE_INVENTORY_STOCK": {
      const item = state.inventory.find((i) => i.id === action.id);
      if (!item) return state;
      return {
        ...state,
        inventory: state.inventory.map((i) => (i.id === action.id ? { ...i, stock: action.stock } : i)),
        activity: [logEntry("inventory", `Updated "${item.name}" stock to ${action.stock} units.`), ...state.activity].slice(0, 40),
      };
    }
    case "DELETE_INVENTORY_ITEM": {
      const item = state.inventory.find((i) => i.id === action.id);
      if (!item) return state;
      return {
        ...state,
        inventory: state.inventory.filter((i) => i.id !== action.id),
        activity: [logEntry("inventory", `Removed "${item.name}" from inventory.`), ...state.activity].slice(0, 40),
      };
    }
    case "UPDATE_INVENTORY_ITEM": {
      const item = state.inventory.find((i) => i.id === action.id);
      if (!item) return state;
      const updated = normalizeInventoryItem({ ...item, ...action.updates, id: item.id });
      return {
        ...state,
        inventory: state.inventory.map((i) => (i.id === action.id ? updated : i)),
        activity: [logEntry("inventory", `Updated product "${updated.name}".`), ...state.activity].slice(0, 40),
      };
    }
    case "IMPORT_INVENTORY_ITEMS": {
      return { ...state, inventory: action.items.map(normalizeInventoryItem), activity: [logEntry("inventory", `Imported ${action.items.length} inventory rows from file.`), ...state.activity].slice(0, 40) };
    }

    case "ADD_DRAFT": {
      const nextId = Math.max(0, ...state.drafts.map((d) => d.id)) + 1;
      return {
        ...state,
        drafts: [...state.drafts, { id: nextId, customer: action.customer, type: action.draftType || "Follow-up", text: action.text || "", sent: false, sentAt: null }],
        activity: [logEntry("communication", `Drafted "${action.draftType || "Follow-up"}" for ${action.customer}.`), ...state.activity].slice(0, 40),
      };
    }
    case "DELETE_DRAFT": {
      const draft = state.drafts.find((d) => d.id === action.id);
      if (!draft) return state;
      return {
        ...state,
        drafts: state.drafts.filter((d) => d.id !== action.id),
        activity: [logEntry("communication", `Deleted draft for ${draft.customer}.`), ...state.activity].slice(0, 40),
      };
    }
    case "UPDATE_DRAFT_TEXT": {
      return { ...state, drafts: state.drafts.map((d) => (d.id === action.id ? { ...d, text: action.text } : d)) };
    }
    case "SEND_DRAFT": {
      const draft = state.drafts.find((d) => d.id === action.id);
      if (!draft || draft.sent) return state;
      return {
        ...state,
        drafts: state.drafts.map((d) => (d.id === action.id ? { ...d, sent: true, sentAt: new Date().toISOString() } : d)),
        activity: [logEntry("communication", `Sent "${draft.type}" message to ${draft.customer}.`), ...state.activity].slice(0, 40),
      };
    }

    case "RECORD_CUSTOMER_PAYMENT": {
      const customer = (state.customers || []).find((c) => c.id === action.id);
      if (!customer) return state;
      const payment = Number(action.amount) || 0;
      const newDebit = Math.max(0, customer.debit - payment);
      const newStatus = newDebit === 0 ? "cleared" : customer.status;
      return {
        ...state,
        customers: (state.customers || []).map((c) => c.id === action.id ? { ...c, debit: newDebit, status: newStatus } : c),
        activity: [logEntry("finance", `Recorded payment of ₨${payment.toLocaleString()} from ${customer.name}. New debit balance: ₨${newDebit.toLocaleString()}.`), ...state.activity].slice(0, 40),
      };
    }

    case "UPDATE_CUSTOMER_DEBIT": {
      const customer = (state.customers || []).find((c) => c.id === action.id);
      if (!customer) return state;
      const newDebit = Math.max(0, Number(action.debit) || 0);
      return {
        ...state,
        customers: (state.customers || []).map((c) => c.id === action.id ? { ...c, debit: newDebit, status: newDebit === 0 ? "cleared" : "active" } : c),
        activity: [logEntry("finance", `Updated ${customer.name} debit balance to ₨${newDebit.toLocaleString()}.`), ...state.activity].slice(0, 40),
      };
    }

    case "SEND_CUSTOMER_DEBIT_REMINDER": {
      const customer = (state.customers || []).find((c) => c.id === action.id);
      if (!customer) return state;
      const channel = action.channel || "WhatsApp";
      const nextDraftId = Math.max(0, ...state.drafts.map((d) => d.id)) + 1;
      const reminderDraft = {
        id: nextDraftId,
        customer: customer.name,
        type: `Debit Reminder (${channel})`,
        text: action.text || `Dear ${customer.contactPerson || customer.name}, gentle reminder from Vantage: Your outstanding debit balance is ₨${customer.debit.toLocaleString()}. Please arrange payment at your earliest convenience.`,
        sent: true,
        sentAt: new Date().toISOString(),
      };
      return {
        ...state,
        drafts: [...state.drafts, reminderDraft],
        activity: [logEntry("finance", `Sent ${channel} debit reminder to ${customer.name} for ₨${customer.debit.toLocaleString()}.`), ...state.activity].slice(0, 40),
      };
    }

    case "SEND_SUPPLIER_REORDER": {
      const item = (state.inventory || []).find((i) => i.id === action.itemId);
      const supplierName = action.supplierName || item?.supplierName || "Supplier";
      const qty = action.qty || 50;
      const updatedInventory = (state.inventory || []).map((i) => (i.id === action.itemId ? { ...i, reordered: true } : i));
      const nextDraftId = Math.max(0, ...state.drafts.map((d) => d.id)) + 1;
      const poDraft = {
        id: nextDraftId,
        customer: `${supplierName} (Supplier PO)`,
        type: `Purchase Order (${action.channel || "Email"})`,
        text: action.message || `PO for ${qty} units of ${item?.name || "inventory"}`,
        sent: true,
        sentAt: new Date().toISOString(),
      };
      return {
        ...state,
        inventory: updatedInventory,
        drafts: [...state.drafts, poDraft],
        activity: [logEntry("inventory", `Placed restock order for ${qty} units of "${item?.name || 'Item'}" with ${supplierName} via ${action.channel || 'Email'}.`), ...state.activity].slice(0, 40),
      };
    }

    case "POS_SET_STATUS":
      return { ...state, pos: { ...state.pos, status: action.status } };
    case "POS_CONNECTED":
      return { ...state, pos: { ...state.pos, status: "connected", lastSync: new Date().toISOString() }, activity: [logEntry("inventory", "Vantage POS connected — sales will sync automatically."), ...state.activity].slice(0, 40) };
    case "POS_DISCONNECT":
      return { ...state, pos: { ...state.pos, status: "disconnected", lastSync: null } };
    case "POS_NEW_SALE": {
      return { ...state, pos: { ...state.pos, sales: [action.sale, ...state.pos.sales].slice(0, 50), lastSync: new Date().toISOString() } };
    }
    case "COMPLETE_POS_SALE": {
      const sale = action.sale;
      const qtyMap = {};
      (sale.items || []).forEach((it) => {
        if (it.id) qtyMap[it.id] = (qtyMap[it.id] || 0) + (Number(it.qty) || 1);
      });

      const updatedInventory = (state.inventory || []).map((inv) => {
        const normalized = normalizeInventoryItem(inv);
        if (qtyMap[normalized.id]) {
          const newStock = Math.max(0, normalized.stock - qtyMap[normalized.id]);
          return { ...normalized, stock: newStock };
        }
        return normalized;
      });

      const newSales = [sale, ...state.pos.sales].slice(0, 50);

      const updatedKpis = state.finance.kpis.map((k) => {
        if (k.key === "revenue") {
          const added = Number(sale.total) || 0;
          const newVal = (k.value || 0) + added;
          const displayLakhs = (newVal / 100000).toFixed(1);
          return { ...k, value: newVal, display: `₨${displayLakhs}L` };
        }
        return k;
      });

      const logMsg = `POS Sale #${sale.invoice}: ₨${(sale.total || 0).toLocaleString()} via ${sale.paymentMethod || "Cash"} (${(sale.items || []).length} line items).`;

      return {
        ...state,
        inventory: updatedInventory,
        pos: { ...state.pos, sales: newSales, lastSync: new Date().toISOString() },
        finance: { ...state.finance, kpis: updatedKpis },
        activity: [logEntry("inventory", logMsg), ...state.activity].slice(0, 40),
      };
    }

    case "GENERATE_REPORT": {
      return { ...state, reports: [action.report, ...state.reports].slice(0, 15) };
    }

    default:
      return state;
  }
}

const AppStateContext = createContext(null);

export function AppStateProvider({ children }) {
  const [activeBusinessId, setActiveBusinessId] = useState(null);
  const [state, dispatch] = useReducer(appReducer, null, () => createBlankStoreState());

  useEffect(() => {
    if (activeBusinessId && state) {
      savePersisted(state, activeBusinessId);
    }
  }, [state, activeBusinessId]);

  const derived = useMemo(() => {
    const inv = state?.inventory || [];
    const fin = state?.finance || { recs: [], kpis: [], runwayAdjustment: 0 };
    const drafts = state?.drafts || [];
    const pos = state?.pos || { sales: [] };
    const customers = state?.customers || [];

    const lowStock = inv.filter((i) => invStatus(i) !== "ok" && !i.reordered);
    const pendingRecs = fin.recs.filter((r) => r.status === "pending");
    const approvedRecs = fin.recs.filter((r) => r.status === "approved");
    const unsentDrafts = drafts.filter((d) => !d.sent);
    const sentDrafts = drafts.filter((d) => d.sent);
    const totalImpact = approvedRecs.reduce((s, r) => s + (r.impactValue || 0), 0);
    const pendingImpact = pendingRecs.reduce((s, r) => s + (r.impactValue || 0), 0);
    const runway = ((fin.kpis.find((k) => k.key === "runway")?.value || 0) + (fin.runwayAdjustment || 0));
    const todaysPosTotal = (pos.sales || []).reduce((s, x) => s + (x.total || 0), 0);
    const okInventoryRatio = inv.length ? (inv.length - lowStock.length) / inv.length : 1;
    const commsRatio = drafts.length ? sentDrafts.length / drafts.length : 0;
    const financeScore = Math.round(60 + (approvedRecs.length / Math.max(1, fin.recs.length)) * 35);
    const inventoryScore = Math.round(okInventoryRatio * 100);
    const commsScore = Math.round(50 + commsRatio * 50);
    const salesScore = Math.min(99, Math.round(60 + todaysPosTotal / 200));

    const customersWithDebit = customers.filter((c) => (c.debit || 0) > 0);
    const totalDebit = customersWithDebit.reduce((sum, c) => sum + (c.debit || 0), 0);
    const overdueDebitCount = customers.filter((c) => c.status === "overdue" && (c.debit || 0) > 0).length;

    return {
      lowStock, pendingRecs, approvedRecs, unsentDrafts, sentDrafts, totalImpact, pendingImpact, runway, todaysPosTotal,
      customersWithDebit, totalDebit, overdueDebitCount,
      deptScores: [
        { name: "Finance", score: financeScore },
        { name: "Inventory", score: inventoryScore },
        { name: "Communication", score: commsScore },
        { name: "Sales", score: salesScore },
      ],
    };
  }, [state]);

  const value = useMemo(
    () => ({ state, dispatch, derived, activeBusinessId, setActiveBusinessId }),
    [state, derived, activeBusinessId]
  );
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
