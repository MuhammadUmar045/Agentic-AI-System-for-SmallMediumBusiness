import { C } from "../data/constants.js";

const DEFAULT_PRICES = { 1: 1850, 2: 580, 3: 420, 4: 1350, 5: 1450, 6: 1200, 7: 290, 8: 340, 9: 210, 10: 220 };
const DEFAULT_SKUS = { 1: "RIC-001", 2: "OIL-002", 3: "DET-003", 4: "TEA-004", 5: "SUG-005", 6: "FLO-006", 7: "MLK-007", 8: "LEN-008", 9: "SPI-009", 10: "SNK-010" };
const DEFAULT_CATEGORIES = { 1: "Grains & Staples", 2: "Oils & Ghee", 3: "Household", 4: "Beverages", 5: "Grains & Staples", 6: "Grains & Staples", 7: "Dairy & Chilled", 8: "Grains & Staples", 9: "Spices & Pantry", 10: "Snacks" };
const DEFAULT_SUPPLIERS = {
  1: { id: 1, name: "Al-Baraka Grain Mills", email: "orders@albarakagrains.com", phone: "+92 301 5550192" },
  2: { id: 2, name: "Punjab Oil & Ghee Corp", email: "supply@punjaboilcorp.com", phone: "+92 312 4440819" },
  3: { id: 3, name: "Supreme Household Distributors", email: "sales@supremedistributors.com", phone: "+92 322 8889911" },
  4: { id: 4, name: "National Foods & Spices", email: "distribution@nationalfoods.pk", phone: "+92 333 7772233" },
  5: { id: 1, name: "Al-Baraka Grain Mills", email: "orders@albarakagrains.com", phone: "+92 301 5550192" },
  6: { id: 1, name: "Al-Baraka Grain Mills", email: "orders@albarakagrains.com", phone: "+92 301 5550192" },
  7: { id: 5, name: "Dairy Fresh Mills", email: "dispatch@dairyfresh.pk", phone: "+92 300 9991122" },
  8: { id: 1, name: "Al-Baraka Grain Mills", email: "orders@albarakagrains.com", phone: "+92 301 5550192" },
  9: { id: 4, name: "National Foods & Spices", email: "distribution@nationalfoods.pk", phone: "+92 333 7772233" },
  10: { id: 3, name: "Supreme Household Distributors", email: "sales@supremedistributors.com", phone: "+92 322 8889911" },
};

export function normalizeInventoryItem(item) {
  if (!item) return item;
  const defSup = DEFAULT_SUPPLIERS[item.id] || { id: 1, name: "Al-Baraka Grain Mills", email: "orders@albarakagrains.com", phone: "+92 301 5550192" };
  return {
    ...item,
    price: typeof item.price === "number" ? item.price : (DEFAULT_PRICES[item.id] || 450),
    sku: item.sku || DEFAULT_SKUS[item.id] || `SKU-${1000 + (item.id || 1)}`,
    category: item.category || DEFAULT_CATEGORIES[item.id] || "General",
    supplierId: item.supplierId || defSup.id,
    supplierName: item.supplierName || defSup.name,
    supplierEmail: item.supplierEmail || defSup.email,
    supplierPhone: item.supplierPhone || defSup.phone,
  };
}

export function invStatus(item) {
  if (item.stock < item.threshold * 0.5) return "critical";
  if (item.stock < item.threshold) return "low";
  return "ok";
}

let activityIdCounter = 1;
export function logEntry(agent, text) {
  return { id: `act-${Date.now()}-${activityIdCounter++}`, ts: new Date().toISOString(), agent, text };
}

export function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseSimpleCsv(text) {
  return text.trim().split(/\r?\n/).map((line) => line.split(",").map((c) => c.trim()));
}

export function loadPersisted() {
  try {
    const raw = typeof window !== "undefined" && window.localStorage.getItem("vantage_app_state_v2");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function savePersisted(state) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem("vantage_app_state_v2", JSON.stringify(state));
  } catch {
    /* storage unavailable — fail silently, app still works in-memory */
  }
}
