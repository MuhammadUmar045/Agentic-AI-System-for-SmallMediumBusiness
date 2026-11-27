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
  const defSup = DEFAULT_SUPPLIERS[item.id];
  return {
    ...item,
    price: typeof item.price === "number" ? item.price : (DEFAULT_PRICES[item.id] || 450),
    sku: item.sku || DEFAULT_SKUS[item.id] || `SKU-${1000 + (item.id || 1)}`,
    category: item.category || DEFAULT_CATEGORIES[item.id] || "General",
    supplierId: item.supplierId || defSup?.id || 1,
    supplierName: item.supplierName || defSup?.name || "Local Supplier",
    supplierEmail: item.supplierEmail || defSup?.email || "supplier@local.pk",
    supplierPhone: item.supplierPhone || defSup?.phone || "+92 300 0000000",
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
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const input = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim()); cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    if (row.some((value) => value !== "")) rows.push(row);
  }
  return rows;
}

// Maps any product CSV onto the inventory schema. Headers are matched by
// exact alias first, then by keyword, then numeric columns are inferred.
// Columns that don't fit the schema are kept on the item as `attributes`.
const INVENTORY_FIELDS = {
  name: { exact: ["name", "productname", "itemname", "product", "item", "title", "description1"], words: ["name", "product", "item", "title"] },
  sku: { exact: ["sku", "productid", "itemid", "code", "productcode", "itemcode", "barcode", "id"], words: ["sku", "code", "barcode"] },
  category: { exact: ["category", "type", "producttype", "department", "group"], words: ["categ", "type", "department"] },
  stock: { exact: ["stock", "quantity", "stockquantity", "qty", "onhand", "availablequantity", "instock", "units", "inventory", "stocklevel"], words: ["stock", "qty", "quant", "onhand", "units"] },
  threshold: { exact: ["threshold", "reorderthreshold", "reorderlevel", "reorderpoint", "minimumstock", "minstock", "safetystock", "minqty"], words: ["reorder", "threshold", "minimum", "safety"] },
  price: { exact: ["price", "unitprice", "pricepkr", "sellingprice", "saleprice", "retailprice", "mrp", "rate", "cost"], words: ["price", "rate", "mrp", "amount"] },
  supplierName: { exact: ["supplier", "suppliername", "vendor", "vendorname", "distributor"], words: ["supplier", "vendor", "distributor"] },
  trend: { exact: ["trend", "demandtrend"], words: ["trend"] },
};

export function mapInventoryCsv(rows) {
  if (!rows?.length) return { items: [], mapping: {} };
  const key = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const toNum = (v) => {
    const s = String(v ?? "").trim().replace(/^(rs\.?|pkr|₨|\$)\s*/i, "").replace(/[,\s]/g, "");
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    return Number(s);
  };
  const headers = rows[0].map(key);
  const used = new Set();
  const mapping = {};
  const claim = (field, idx) => { if (idx >= 0 && !used.has(idx)) { mapping[field] = idx; used.add(idx); } };

  // Pass 1: exact aliases. Pass 2: keyword contains.
  for (const [field, def] of Object.entries(INVENTORY_FIELDS)) claim(field, headers.findIndex((h, i) => !used.has(i) && def.exact.includes(h)));
  for (const [field, def] of Object.entries(INVENTORY_FIELDS)) {
    if (mapping[field] !== undefined) continue;
    claim(field, headers.findIndex((h, i) => !used.has(i) && def.words.some((w) => h.includes(w))));
  }

  const looksLikeHeader = rows[0].some((c) => toNum(c) === null) && Object.keys(mapping).length >= 1;
  const dataRows = (looksLikeHeader ? rows.slice(1) : rows).filter((r) => r.some(Boolean));
  if (!looksLikeHeader) { Object.keys(mapping).forEach((k) => delete mapping[k]); used.clear(); }

  // Pass 3: infer from values for anything still missing.
  const width = Math.max(...rows.map((r) => r.length));
  const numericCols = [];
  for (let c = 0; c < width; c += 1) {
    if (used.has(c)) continue;
    const vals = dataRows.map((r) => r[c]).filter((v) => String(v ?? "").trim() !== "");
    if (vals.length && vals.every((v) => toNum(v) !== null)) numericCols.push(c);
  }
  if (mapping.name === undefined) {
    // Text column with the most distinct values is most likely the name.
    let best = -1, bestScore = -1;
    for (let c = 0; c < width; c += 1) {
      if (used.has(c) || numericCols.includes(c)) continue;
      const score = new Set(dataRows.map((r) => r[c])).size;
      if (score > bestScore) { best = c; bestScore = score; }
    }
    claim("name", best);
  }
  const free = numericCols.filter((c) => !used.has(c));
  // Larger-valued numeric column is price, smaller is stock.
  const avg = (c) => dataRows.reduce((s, r) => s + (toNum(r[c]) || 0), 0) / (dataRows.length || 1);
  free.sort((a, b) => avg(a) - avg(b));
  if (mapping.stock === undefined && free.length) claim("stock", free.shift());
  if (mapping.price === undefined && free.length) claim("price", free.pop());
  if (mapping.threshold === undefined && free.length) claim("threshold", free.shift());

  const original = looksLikeHeader ? rows[0] : rows[0].map((_, i) => `column_${i + 1}`);
  const extraCols = original.map((h, i) => i).filter((i) => !used.has(i));
  const at = (row, f) => (mapping[f] === undefined ? undefined : String(row[mapping[f]] ?? "").trim() || undefined);

  const items = dataRows.map((row, i) => {
    const stock = toNum(at(row, "stock")) ?? 0;
    const attributes = {};
    extraCols.forEach((c) => { if (String(row[c] ?? "").trim()) attributes[original[c]] = row[c]; });
    const trend = (at(row, "trend") || "flat").toLowerCase();
    return {
      id: i + 1,
      name: at(row, "name") || "",
      sku: at(row, "sku"),
      category: at(row, "category"),
      stock,
      threshold: toNum(at(row, "threshold")) ?? Math.max(5, Math.round(stock * 0.3)),
      price: toNum(at(row, "price")) ?? 0,
      supplierName: at(row, "supplierName") || "Local Supplier",
      trend: ["up", "down", "flat"].includes(trend) ? trend : "flat",
      reordered: false,
      ...(Object.keys(attributes).length ? { attributes } : {}),
    };
  }).filter((it) => it.name);

  const named = {};
  Object.entries(mapping).forEach(([f, c]) => { named[f] = original[c]; });
  return { items, mapping: named };
}

export function getStorageKey(businessId) {
  return businessId ? `vantage_app_state_v2_${businessId}` : null;
}

export function loadPersisted(businessId) {
  try {
    if (typeof window === "undefined" || !businessId) return null;
    const key = getStorageKey(businessId);
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function savePersisted(state, businessId) {
  try {
    if (typeof window === "undefined" || !businessId) return;
    const key = getStorageKey(businessId);
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* storage unavailable — fail silently, app still works in-memory */
  }
}

export function clearPersisted(businessId) {
  try {
    if (typeof window === "undefined") return;
    if (businessId) {
      window.localStorage.removeItem(getStorageKey(businessId));
    }
    // Clean up any legacy unscoped storage keys so they never leak into other accounts
    window.localStorage.removeItem("vantage_app_state_v2");
    window.localStorage.removeItem("vantage_app_state");
  } catch {
    /* ignore */
  }
}
