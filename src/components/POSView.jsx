import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Search, ShoppingCart, Plus, Minus, Trash2, CreditCard,
  DollarSign, Check, X, RotateCcw, Printer, Download,
  Send, Sparkles, AlertCircle, ArrowRight, Tag, Percent,
  Volume2, VolumeX, PauseCircle, PlayCircle, History,
  Grid, List, CheckCircle2, ShieldCheck, QrCode, Store,
  Laptop2, ArrowUpRight, Barcode, ChevronRight, User
} from "lucide-react";
import { C, POS_CATEGORIES } from "../data/constants.js";
import { useAppState } from "../context/AppStateContext.jsx";
import { invStatus, downloadTextFile, normalizeInventoryItem } from "../utils/helpers.js";
import { Card, Btn, Badge } from "./Primitives.jsx";
import ViewWrap from "./ViewWrap.jsx";

// Audio chime synthesizer for realistic retail register feedback
function playSound(type = "beep", enabled = true) {
  if (!enabled) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "beep") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(850, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    } else if (type === "success") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.09); // E5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } else if (type === "remove") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.07);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.07);
    }
  } catch {
    // Audio context may be restricted by autoplay policy
  }
}

export default function POSView({ showToast, onNavigate, ownerName, businessName, role }) {
  const { state, dispatch } = useAppState();

  // Normalized catalog from global inventory
  const inventoryItems = useMemo(() => {
    return (state.inventory || []).map(normalizeInventoryItem);
  }, [state.inventory]);

  // POS State
  const [cart, setCart] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "list"
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Customer selection
  const [customer, setCustomer] = useState("Walk-in Customer");
  const [isCustomCustomer, setIsCustomCustomer] = useState(false);
  const [customCustomerName, setCustomCustomerName] = useState("");

  // Discount & Tax settings
  const [discountType, setDiscountType] = useState("none"); // "none" | "pct5" | "pct10" | "pct15" | "custom"
  const [customDiscountValue, setCustomDiscountValue] = useState(0);
  const [taxRate, setTaxRate] = useState(0); // 0%, 5%, 17%

  // Payment method
  const [paymentMethod, setPaymentMethod] = useState("cash"); // "cash" | "card" | "raast"
  const [cashTendered, setCashTendered] = useState("");
  const [cardType, setCardType] = useState("Visa");
  const [cardAuthRef, setCardAuthRef] = useState("");

  // Modals / Drawers
  const [receiptModal, setReceiptModal] = useState(null); // completed sale object
  const [heldOrders, setHeldOrders] = useState([]);
  const [showHeldModal, setShowHeldModal] = useState(false);
  const [showRecentSalesModal, setShowRecentSalesModal] = useState(false);
  const [showCustomItemModal, setShowCustomItemModal] = useState(false);
  const [customItemForm, setCustomItemForm] = useState({ name: "", price: "", qty: 1 });

  const barcodeInputRef = useRef(null);

  // Filter products by category and search
  const filteredProducts = useMemo(() => {
    return inventoryItems.filter((item) => {
      const matchCat =
        selectedCategory === "All" ||
        item.category?.toLowerCase() === selectedCategory.toLowerCase();
      const query = searchQuery.trim().toLowerCase();
      const matchQuery =
        !query ||
        item.name.toLowerCase().includes(query) ||
        (item.sku && item.sku.toLowerCase().includes(query));
      return matchCat && matchQuery;
    });
  }, [inventoryItems, selectedCategory, searchQuery]);

  // Cart quantity lookup map: { [itemId]: qty }
  const cartQtyMap = useMemo(() => {
    const map = {};
    cart.forEach((line) => {
      if (line.id) map[line.id] = (map[line.id] || 0) + line.qty;
    });
    return map;
  }, [cart]);

  // Cart Calculations
  const calculations = useMemo(() => {
    const itemsCount = cart.length;
    const unitsCount = cart.reduce((s, it) => s + it.qty, 0);
    const subtotal = cart.reduce((s, it) => s + it.price * it.qty, 0);

    let discountAmount = 0;
    if (discountType === "pct5") discountAmount = Math.round(subtotal * 0.05);
    else if (discountType === "pct10") discountAmount = Math.round(subtotal * 0.10);
    else if (discountType === "pct15") discountAmount = Math.round(subtotal * 0.15);
    else if (discountType === "custom") discountAmount = Math.min(subtotal, Math.max(0, Number(customDiscountValue) || 0));

    const discountedBase = Math.max(0, subtotal - discountAmount);
    const taxAmount = Math.round(discountedBase * (taxRate / 100));
    const grandTotal = discountedBase + taxAmount;

    // Cash Change calculations
    const tenderedNumber = Number(cashTendered) || 0;
    const changeDue = Math.max(0, tenderedNumber - grandTotal);
    const remainingDue = Math.max(0, grandTotal - tenderedNumber);
    const isExact = tenderedNumber === grandTotal;
    const isSufficient = tenderedNumber >= grandTotal;

    return {
      itemsCount,
      unitsCount,
      subtotal,
      discountAmount,
      taxAmount,
      grandTotal,
      tenderedNumber,
      changeDue,
      remainingDue,
      isExact,
      isSufficient,
    };
  }, [cart, discountType, customDiscountValue, taxRate, cashTendered]);

  // Add product to cart
  const addToCart = (product) => {
    const currentQtyInCart = cartQtyMap[product.id] || 0;
    if (currentQtyInCart >= product.stock) {
      playSound("remove", soundEnabled);
      showToast(`Cannot add more: Only ${product.stock} in stock.`);
      return;
    }

    playSound("beep", soundEnabled);
    setCart((prev) => {
      const existingIdx = prev.findIndex((item) => item.id === product.id);
      if (existingIdx > -1) {
        const next = [...prev];
        next[existingIdx] = { ...next[existingIdx], qty: next[existingIdx].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          id: product.id,
          sku: product.sku,
          name: product.name,
          category: product.category,
          price: product.price,
          stock: product.stock,
          qty: 1,
        },
      ];
    });
  };

  // Adjust quantity
  const updateQty = (id, delta) => {
    setCart((prev) => {
      return prev
        .map((line) => {
          if (line.id !== id) return line;
          const nextQty = line.qty + delta;
          if (nextQty <= 0) {
            playSound("remove", soundEnabled);
            return null;
          }
          if (line.stock != null && nextQty > line.stock) {
            showToast(`Max stock reached (${line.stock} units).`);
            return line;
          }
          playSound("beep", soundEnabled);
          return { ...line, qty: nextQty };
        })
        .filter(Boolean);
    });
  };

  // Remove line item
  const removeFromCart = (id) => {
    playSound("remove", soundEnabled);
    setCart((prev) => prev.filter((it) => it.id !== id));
  };

  // Clear entire cart
  const clearCart = () => {
    if (!cart.length) return;
    playSound("remove", soundEnabled);
    setCart([]);
    setCashTendered("");
    showToast("Cart cleared.");
  };

  // Handle barcode / SKU scan Enter
  const handleBarcodeSubmit = (e) => {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;

    const matched = inventoryItems.find(
      (it) =>
        (it.sku && it.sku.toLowerCase() === code.toLowerCase()) ||
        it.name.toLowerCase() === code.toLowerCase()
    );

    if (matched) {
      addToCart(matched);
      setBarcodeInput("");
      showToast(`Scanned: ${matched.name}`);
    } else {
      playSound("remove", soundEnabled);
      showToast(`Item with SKU "${code}" not found.`);
    }
  };

  // Quick custom item addition
  const handleAddCustomItem = (e) => {
    e.preventDefault();
    if (!customItemForm.name.trim() || !customItemForm.price) return;
    const priceNum = Math.max(0, Number(customItemForm.price) || 0);
    const qtyNum = Math.max(1, Number(customItemForm.qty) || 1);

    const customLine = {
      id: `custom-${Date.now()}`,
      sku: "CUSTOM",
      name: customItemForm.name.trim(),
      category: "Custom Item",
      price: priceNum,
      stock: 999,
      qty: qtyNum,
    };

    setCart((prev) => [...prev, customLine]);
    playSound("beep", soundEnabled);
    setShowCustomItemModal(false);
    setCustomItemForm({ name: "", price: "", qty: 1 });
    showToast(`Added custom item: ${customLine.name}`);
  };

  // Park / Hold Order
  const holdCurrentOrder = () => {
    if (!cart.length) {
      showToast("Cannot hold an empty cart.");
      return;
    }
    const order = {
      holdId: `hold-${Date.now()}`,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      customer: isCustomCustomer && customCustomerName ? customCustomerName : customer,
      items: cart,
      calculations,
    };
    setHeldOrders((prev) => [order, ...prev]);
    setCart([]);
    setCashTendered("");
    playSound("beep", soundEnabled);
    showToast(`Order held for ${order.customer}.`);
  };

  // Resume parked order
  const resumeHeldOrder = (order) => {
    if (cart.length > 0) {
      // Park current first
      holdCurrentOrder();
    }
    setCart(order.items);
    setCustomer(order.customer);
    setHeldOrders((prev) => prev.filter((o) => o.holdId !== order.holdId));
    setShowHeldModal(false);
    playSound("beep", soundEnabled);
    showToast(`Resumed order for ${order.customer}.`);
  };

  // Complete checkout & process sale
  const handleCheckout = () => {
    if (!cart.length) {
      showToast("Please add items to cart before checkout.");
      return;
    }

    if (paymentMethod === "cash" && !calculations.isSufficient) {
      playSound("remove", soundEnabled);
      showToast(`Insufficient cash tendered. ₨${calculations.remainingDue.toLocaleString()} still due.`);
      return;
    }

    const effectiveCustomer =
      isCustomCustomer && customCustomerName ? customCustomerName.trim() : customer;
    const invoiceNumber = `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date();

    const saleRecord = {
      invoice: invoiceNumber,
      customer: effectiveCustomer,
      cashier: ownerName || role || "Staff",
      time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      date: now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      items: cart.map((line) => ({
        id: line.id,
        sku: line.sku,
        name: line.name,
        qty: line.qty,
        price: line.price,
        total: line.price * line.qty,
      })),
      subtotal: calculations.subtotal,
      discount: calculations.discountAmount,
      tax: calculations.taxAmount,
      total: calculations.grandTotal,
      paymentMethod:
        paymentMethod === "cash"
          ? "Cash"
          : paymentMethod === "card"
          ? `Card (${cardType})`
          : "Raast / QR",
      amountTendered:
        paymentMethod === "cash"
          ? calculations.tenderedNumber
          : calculations.grandTotal,
      change: paymentMethod === "cash" ? calculations.changeDue : 0,
      cardAuthRef: paymentMethod === "card" ? cardAuthRef || `AUTH-${Math.floor(100000 + Math.random() * 899999)}` : null,
    };

    // Dispatch to global application state (deducts inventory, records sale, updates revenue)
    dispatch({ type: "COMPLETE_POS_SALE", sale: saleRecord });

    playSound("success", soundEnabled);
    setReceiptModal(saleRecord);
    setCart([]);
    setCashTendered("");
    setCardAuthRef("");
    showToast(`Sale completed! Invoice #${invoiceNumber}`);
  };

  // Draft receipt follow-up via Customer Communication Agent
  const sendReceiptViaComms = (sale) => {
    dispatch({
      type: "ADD_DRAFT",
      customer: sale.customer,
      draftType: "Invoice Receipt",
      text: `Hi ${sale.customer}, thank you for shopping at ${businessName || "Vantage"}! Your receipt for ₨${sale.total.toLocaleString()} (Invoice #${sale.invoice}) has been recorded. Let us know if we can prepare your next order in advance!`,
    });
    showToast(`Receipt follow-up drafted for ${sale.customer} in Communication workspace.`);
  };

  // Download plain-text receipt slip
  const handleDownloadSlip = (sale) => {
    const lines = [
      `========================================`,
      `          ${(businessName || "VANTAGE RETAIL").toUpperCase()}`,
      `         POINT OF SALE RECEIPT`,
      `========================================`,
      `Invoice #: ${sale.invoice}`,
      `Date:      ${sale.date} ${sale.time}`,
      `Cashier:   ${sale.cashier}`,
      `Customer:  ${sale.customer}`,
      `----------------------------------------`,
      `ITEM                    QTY   PRICE   TOTAL`,
      `----------------------------------------`,
      ...sale.items.map(
        (it) =>
          `${it.name.slice(0, 20).padEnd(21)} ${String(it.qty).padStart(3)}  ₨${String(it.price).padStart(5)} ₨${String(it.total).padStart(6)}`
      ),
      `----------------------------------------`,
      `Subtotal:                    ₨${sale.subtotal.toLocaleString()}`,
      sale.discount > 0 ? `Discount:                   -₨${sale.discount.toLocaleString()}` : null,
      sale.tax > 0 ? `Sales Tax (GST):            +₨${sale.tax.toLocaleString()}` : null,
      `GRAND TOTAL:                 ₨${sale.total.toLocaleString()}`,
      `----------------------------------------`,
      `Payment Method:              ${sale.paymentMethod}`,
      `Amount Tendered:             ₨${sale.amountTendered.toLocaleString()}`,
      `Change Returned:             ₨${sale.change.toLocaleString()}`,
      `========================================`,
      `        Thank you for your business!`,
      `     Goods once sold are returnable with`,
      `         receipt within 7 days.`,
      `========================================`,
    ]
      .filter(Boolean)
      .join("\n");

    downloadTextFile(`receipt-${sale.invoice}.txt`, lines);
    showToast("Receipt downloaded.");
  };

  return (
    <ViewWrap
      title="Point of Sale (POS)"
      subtitle="Fast, interactive counter billing with live inventory deduction and real-time sales sync."
    >
      {/* Top POS Toolbar & Quick Stats */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 16,
          background: C.surface,
          padding: "12px 16px",
          borderRadius: 14,
          border: `1px solid ${C.line}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: C.tealSoft,
              color: "#0A7873",
              padding: "5px 12px",
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 700,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#0EA5A0",
                display: "inline-block",
              }}
            />
            Terminal #01 · Ready
          </div>

          <div style={{ fontSize: 13, color: C.inkSoft }}>
            Cashier: <strong style={{ color: C.ink }}>{ownerName || "Staff Member"}</strong>
          </div>

          <button
            onClick={() => setSoundEnabled((s) => !s)}
            className="vantage-focus"
            title={soundEnabled ? "Mute register sounds" : "Unmute register sounds"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: soundEnabled ? "rgba(14,165,160,0.1)" : C.bg,
              border: `1px solid ${soundEnabled ? "#0EA5A0" : C.line}`,
              color: soundEnabled ? "#0A7873" : C.inkFaint,
              padding: "4px 10px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span>{soundEnabled ? "Audio On" : "Muted"}</span>
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Btn
            variant={heldOrders.length > 0 ? "amber" : "ghost"}
            size="sm"
            onClick={() => setShowHeldModal(true)}
          >
            <PauseCircle size={14} />
            Parked Orders ({heldOrders.length})
          </Btn>

          <Btn
            variant="ghost"
            size="sm"
            onClick={() => setShowRecentSalesModal(true)}
          >
            <History size={14} />
            Today's Sales ({(state.pos?.sales || []).length})
          </Btn>

          <Btn
            variant="subtle"
            size="sm"
            onClick={() => setShowCustomItemModal(true)}
          >
            <Tag size={14} />
            + Custom Item
          </Btn>
        </div>
      </div>

      {/* Main Split Layout: Products Catalog (Left) + Cart & Auto Calculator (Right) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 410px",
          gap: 20,
          alignItems: "flex-start",
        }}
        className="vantage-pos-layout"
      >
        {/* =========================================================================
            LEFT COLUMN: INVENTORY PRODUCTS CATALOG
           ========================================================================= */}
        <div style={{ minWidth: 0 }}>
          {/* Search, Barcode Input & View Toggle */}
          <Card style={{ padding: 14, marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {/* Product Search */}
              <div
                style={{
                  flex: 1,
                  minWidth: 200,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: C.bg,
                  borderRadius: 10,
                  padding: "8px 12px",
                  border: `1px solid ${C.line}`,
                }}
              >
                <Search size={16} color={C.inkFaint} />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products by name or SKU..."
                  className="vantage-focus"
                  style={{
                    border: "none",
                    background: "transparent",
                    outline: "none",
                    width: "100%",
                    fontSize: 13.5,
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer" }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Barcode / SKU Instant Scan Field */}
              <form
                onSubmit={handleBarcodeSubmit}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: C.bg,
                  borderRadius: 10,
                  padding: "8px 12px",
                  border: `1px solid ${C.line}`,
                  width: 170,
                }}
              >
                <Barcode size={16} color={C.teal} />
                <input
                  ref={barcodeInputRef}
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="Scan SKU [Enter]"
                  className="vantage-focus font-mono"
                  style={{
                    border: "none",
                    background: "transparent",
                    outline: "none",
                    width: "100%",
                    fontSize: 12.5,
                  }}
                />
              </form>

              {/* Grid / List switch */}
              <div
                style={{
                  display: "flex",
                  background: C.bg,
                  borderRadius: 8,
                  padding: 3,
                  border: `1px solid ${C.line}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  style={{
                    border: "none",
                    background: viewMode === "grid" ? C.surface : "transparent",
                    color: viewMode === "grid" ? C.navy : C.inkFaint,
                    borderRadius: 6,
                    padding: "4px 8px",
                    display: "flex",
                    alignItems: "center",
                    boxShadow: viewMode === "grid" ? "0 1px 3px rgba(0,0,0,.08)" : "none",
                  }}
                  title="Grid View"
                >
                  <Grid size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  style={{
                    border: "none",
                    background: viewMode === "list" ? C.surface : "transparent",
                    color: viewMode === "list" ? C.navy : C.inkFaint,
                    borderRadius: 6,
                    padding: "4px 8px",
                    display: "flex",
                    alignItems: "center",
                    boxShadow: viewMode === "list" ? "0 1px 3px rgba(0,0,0,.08)" : "none",
                  }}
                  title="List View"
                >
                  <List size={15} />
                </button>
              </div>
            </div>

            {/* Category Pills */}
            <div
              className="vantage-scroll"
              style={{
                display: "flex",
                gap: 8,
                overflowX: "auto",
                marginTop: 12,
                paddingBottom: 2,
              }}
            >
              {POS_CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat;
                const count =
                  cat === "All"
                    ? inventoryItems.length
                    : inventoryItems.filter(
                        (i) => i.category?.toLowerCase() === cat.toLowerCase()
                      ).length;

                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className="vantage-focus"
                    style={{
                      whiteSpace: "nowrap",
                      padding: "5px 12px",
                      borderRadius: 20,
                      fontSize: 12.5,
                      fontWeight: 600,
                      border: isSelected
                        ? `1px solid ${C.navy}`
                        : `1px solid ${C.line}`,
                      background: isSelected ? C.navy : C.surface,
                      color: isSelected ? "#fff" : C.inkSoft,
                      cursor: "pointer",
                      transition: "all .15s ease",
                    }}
                  >
                    {cat}
                    <span
                      style={{
                        marginLeft: 6,
                        opacity: isSelected ? 0.85 : 0.6,
                        fontSize: 11,
                      }}
                    >
                      ({count})
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Product Items Display */}
          {filteredProducts.length === 0 ? (
            <Card style={{ textAlign: "center", padding: "40px 20px" }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: C.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 12px",
                }}
              >
                <Search size={22} color={C.inkFaint} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, color: C.ink }}>No products found</div>
              <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 4 }}>
                No items match your filter. Try clearing your search or category filter.
              </div>
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("All");
                }}
                style={{ marginTop: 14 }}
              >
                Reset Filters
              </Btn>
            </Card>
          ) : viewMode === "grid" ? (
            /* Grid View */
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
                gap: 12,
              }}
            >
              {filteredProducts.map((item) => {
                const status = invStatus(item);
                const isOutOfStock = item.stock <= 0;
                const inCartQty = cartQtyMap[item.id] || 0;
                const isMaxInCart = inCartQty >= item.stock && !isOutOfStock;

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (!isOutOfStock) addToCart(item);
                    }}
                    className="vantage-focus"
                    style={{
                      background: C.surface,
                      borderRadius: 14,
                      border: inCartQty > 0 ? `1.5px solid ${C.teal}` : `1px solid ${C.line}`,
                      padding: "14px 14px 12px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      cursor: isOutOfStock ? "not-allowed" : "pointer",
                      opacity: isOutOfStock ? 0.6 : 1,
                      position: "relative",
                      transition: "transform .15s ease, box-shadow .15s ease",
                      boxShadow:
                        inCartQty > 0
                          ? "0 4px 12px rgba(14,165,160,0.12)"
                          : "0 2px 5px rgba(0,0,0,0.02)",
                    }}
                  >
                    {/* Top tags */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <span
                        className="font-mono"
                        style={{
                          fontSize: 11,
                          color: C.inkFaint,
                          fontWeight: 600,
                          background: C.bg,
                          padding: "2px 6px",
                          borderRadius: 6,
                        }}
                      >
                        {item.sku}
                      </span>

                      {/* Stock badge */}
                      {isOutOfStock ? (
                        <span
                          style={{
                            background: C.coralSoft,
                            color: C.coral,
                            fontSize: 10.5,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 6,
                          }}
                        >
                          Out of stock
                        </span>
                      ) : status === "critical" || status === "low" ? (
                        <span
                          style={{
                            background: C.amberSoft,
                            color: C.amberDeep,
                            fontSize: 10.5,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 6,
                          }}
                        >
                          Low ({item.stock})
                        </span>
                      ) : (
                        <span
                          style={{
                            background: C.tealSoft,
                            color: "#0A7873",
                            fontSize: 10.5,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 6,
                          }}
                        >
                          {item.stock} left
                        </span>
                      )}
                    </div>

                    {/* Product Name & Category */}
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          color: C.inkFaint,
                          textTransform: "uppercase",
                          letterSpacing: 0.3,
                          fontWeight: 600,
                          marginBottom: 3,
                        }}
                      >
                        {item.category}
                      </div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 14,
                          color: C.ink,
                          lineHeight: 1.3,
                          minHeight: 36,
                        }}
                      >
                        {item.name}
                      </div>
                    </div>

                    {/* Bottom Price and Add Button */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginTop: 12,
                        paddingTop: 8,
                        borderTop: `1px solid ${C.line}`,
                      }}
                    >
                      <div>
                        <div
                          className="font-mono"
                          style={{
                            fontSize: 16,
                            fontWeight: 800,
                            color: C.navy,
                          }}
                        >
                          ₨{item.price?.toLocaleString()}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {inCartQty > 0 && (
                          <span
                            className="font-mono"
                            style={{
                              background: C.teal,
                              color: "#fff",
                              fontSize: 11,
                              fontWeight: 700,
                              borderRadius: 999,
                              padding: "2px 7px",
                            }}
                          >
                            x{inCartQty}
                          </span>
                        )}

                        <button
                          type="button"
                          disabled={isOutOfStock || isMaxInCart}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isOutOfStock) addToCart(item);
                          }}
                          className="vantage-focus"
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            border: "none",
                            background: isOutOfStock
                              ? C.bg
                              : isMaxInCart
                              ? C.amberSoft
                              : C.navy,
                            color: isOutOfStock
                              ? C.inkFaint
                              : isMaxInCart
                              ? C.amberDeep
                              : "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor:
                              isOutOfStock || isMaxInCart ? "not-allowed" : "pointer",
                            transition: "all .15s ease",
                          }}
                          title={
                            isMaxInCart ? "Max stock reached in cart" : "Add to cart"
                          }
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* List View */
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead>
                  <tr style={{ background: C.bg, textAlign: "left" }}>
                    <th style={{ padding: "10px 14px", color: C.inkFaint, fontWeight: 700, fontSize: 11.5 }}>SKU</th>
                    <th style={{ padding: "10px 14px", color: C.inkFaint, fontWeight: 700, fontSize: 11.5 }}>Product</th>
                    <th style={{ padding: "10px 14px", color: C.inkFaint, fontWeight: 700, fontSize: 11.5 }}>Category</th>
                    <th style={{ padding: "10px 14px", color: C.inkFaint, fontWeight: 700, fontSize: 11.5 }}>Stock</th>
                    <th style={{ padding: "10px 14px", color: C.inkFaint, fontWeight: 700, fontSize: 11.5 }}>Price</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((item) => {
                    const status = invStatus(item);
                    const isOutOfStock = item.stock <= 0;
                    const inCartQty = cartQtyMap[item.id] || 0;

                    return (
                      <tr
                        key={item.id}
                        style={{
                          borderTop: `1px solid ${C.line}`,
                          background: inCartQty > 0 ? "rgba(14,165,160,0.03)" : "transparent",
                        }}
                      >
                        <td style={{ padding: "10px 14px" }} className="font-mono">
                          <span style={{ fontSize: 11.5, color: C.inkFaint, background: C.bg, padding: "2px 6px", borderRadius: 4 }}>
                            {item.sku}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", fontWeight: 600 }}>{item.name}</td>
                        <td style={{ padding: "10px 14px", color: C.inkSoft, fontSize: 12.5 }}>{item.category}</td>
                        <td style={{ padding: "10px 14px" }}>
                          {isOutOfStock ? (
                            <Badge tone="critical">0 out</Badge>
                          ) : (
                            <Badge tone={status}>{item.stock} left</Badge>
                          )}
                        </td>
                        <td style={{ padding: "10px 14px", fontWeight: 700 }} className="font-mono">
                          ₨{item.price?.toLocaleString()}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            {inCartQty > 0 && (
                              <span style={{ fontSize: 11.5, fontWeight: 700, color: "#0A7873" }}>
                                ({inCartQty} in cart)
                              </span>
                            )}
                            <Btn
                              variant="primary"
                              size="sm"
                              disabled={isOutOfStock || inCartQty >= item.stock}
                              onClick={() => addToCart(item)}
                            >
                              <Plus size={13} /> Add
                            </Btn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        {/* =========================================================================
            RIGHT COLUMN: CART & AUTO CALCULATOR (Sticky Sidebar)
           ========================================================================= */}
        <div style={{ position: "sticky", top: 18 }}>
          <Card
            style={{
              padding: 0,
              overflow: "hidden",
              boxShadow: "0 8px 30px rgba(19,26,44,0.06)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Cart Header */}
            <div
              style={{
                padding: "14px 16px",
                background: C.navyDeep,
                color: "#fff",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ShoppingCart size={17} color={C.amber} />
                <span style={{ fontWeight: 700, fontSize: 15 }}>Current Order</span>
                {cart.length > 0 && (
                  <span
                    style={{
                      background: C.amber,
                      color: C.navyDeep,
                      fontSize: 11,
                      fontWeight: 800,
                      borderRadius: 999,
                      padding: "1px 7px",
                    }}
                  >
                    {calculations.unitsCount}
                  </span>
                )}
              </div>

              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="vantage-focus"
                  title="Clear Cart"
                  style={{
                    background: "rgba(255,255,255,0.1)",
                    border: "none",
                    color: "rgba(255,255,255,0.8)",
                    borderRadius: 6,
                    padding: "4px 8px",
                    fontSize: 11.5,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <RotateCcw size={12} /> Clear
                </button>
              )}
            </div>

            {/* Customer Selector */}
            <div
              style={{
                padding: "10px 16px",
                background: C.bg,
                borderBottom: `1px solid ${C.line}`,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <User size={15} color={C.inkFaint} />
              {!isCustomCustomer ? (
                <select
                  value={customer}
                  onChange={(e) => {
                    if (e.target.value === "__NEW__") {
                      setIsCustomCustomer(true);
                    } else {
                      setCustomer(e.target.value);
                    }
                  }}
                  className="vantage-focus"
                  style={{
                    flex: 1,
                    border: "none",
                    background: "transparent",
                    fontSize: 13,
                    fontWeight: 600,
                    color: C.ink,
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="Walk-in Customer">Walk-in Customer (General)</option>
                  {(state.customers || []).map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name} {c.debit > 0 ? `(₨${c.debit.toLocaleString()} debit)` : ""}
                    </option>
                  ))}
                  <option value="__NEW__">+ Enter custom customer...</option>
                </select>
              ) : (
                <div style={{ display: "flex", gap: 6, flex: 1, alignItems: "center" }}>
                  <input
                    value={customCustomerName}
                    onChange={(e) => setCustomCustomerName(e.target.value)}
                    placeholder="Customer / Business name..."
                    autoFocus
                    className="vantage-focus"
                    style={{
                      flex: 1,
                      border: `1px solid ${C.line}`,
                      borderRadius: 6,
                      padding: "4px 8px",
                      fontSize: 12.5,
                      background: "#fff",
                    }}
                  />
                  <button
                    onClick={() => setIsCustomCustomer(false)}
                    style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer" }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* Cart Items List */}
            <div
              className="vantage-scroll"
              style={{
                maxHeight: 230,
                minHeight: 120,
                overflowY: "auto",
                padding: "8px 12px",
                borderBottom: `1px solid ${C.line}`,
              }}
            >
              {cart.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "36px 12px",
                    color: C.inkFaint,
                    textAlign: "center",
                  }}
                >
                  <ShoppingCart size={28} strokeWidth={1.4} style={{ marginBottom: 8, opacity: 0.5 }} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.inkSoft }}>Register cart is empty</div>
                  <div style={{ fontSize: 12, marginTop: 2 }}>Tap any product on the left to start ring up</div>
                </div>
              ) : (
                cart.map((line) => (
                  <div
                    key={line.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 4px",
                      borderBottom: `1px solid ${C.line}`,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          color: C.ink,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {line.name}
                      </div>
                      <div style={{ fontSize: 11.5, color: C.inkFaint, display: "flex", gap: 6, marginTop: 1 }}>
                        <span className="font-mono">₨{line.price?.toLocaleString()}</span>
                        {line.sku && line.sku !== "CUSTOM" && <span>· {line.sku}</span>}
                      </div>
                    </div>

                    {/* Quantity Stepper */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          background: C.bg,
                          borderRadius: 6,
                          border: `1px solid ${C.line}`,
                          overflow: "hidden",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => updateQty(line.id, -1)}
                          style={{
                            border: "none",
                            background: "transparent",
                            padding: "3px 6px",
                            cursor: "pointer",
                            color: C.inkSoft,
                            display: "flex",
                          }}
                        >
                          <Minus size={12} />
                        </button>
                        <span
                          className="font-mono"
                          style={{
                            padding: "0 6px",
                            fontSize: 12.5,
                            fontWeight: 700,
                            minWidth: 20,
                            textAlign: "center",
                          }}
                        >
                          {line.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQty(line.id, 1)}
                          style={{
                            border: "none",
                            background: "transparent",
                            padding: "3px 6px",
                            cursor: "pointer",
                            color: C.inkSoft,
                            display: "flex",
                          }}
                        >
                          <Plus size={12} />
                        </button>
                      </div>

                      {/* Line Total */}
                      <span
                        className="font-mono"
                        style={{
                          fontWeight: 700,
                          fontSize: 13,
                          minWidth: 58,
                          textAlign: "right",
                        }}
                      >
                        ₨{(line.price * line.qty).toLocaleString()}
                      </span>

                      {/* Remove Line */}
                      <button
                        onClick={() => removeFromCart(line.id)}
                        className="vantage-focus"
                        title="Remove item"
                        style={{
                          border: "none",
                          background: "none",
                          color: C.inkFaint,
                          cursor: "pointer",
                          padding: 4,
                          display: "flex",
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Auto Calculator Panel */}
            <div style={{ padding: "12px 16px", background: "#FAFBFD" }}>
              {/* Subtotal */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  color: C.inkSoft,
                  marginBottom: 6,
                }}
              >
                <span>Subtotal ({calculations.unitsCount} units)</span>
                <span className="font-mono" style={{ fontWeight: 600, color: C.ink }}>
                  ₨{calculations.subtotal.toLocaleString()}
                </span>
              </div>

              {/* Discount Selector */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 12.5,
                  color: C.inkSoft,
                  marginBottom: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Tag size={13} color={C.amberDeep} />
                  <span>Discount</span>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {[
                    { id: "none", label: "0%" },
                    { id: "pct5", label: "5%" },
                    { id: "pct10", label: "10%" },
                    { id: "pct15", label: "15%" },
                  ].map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setDiscountType(d.id)}
                      className="vantage-focus"
                      style={{
                        padding: "2px 6px",
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 4,
                        border: discountType === d.id ? `1px solid ${C.amberDeep}` : `1px solid ${C.line}`,
                        background: discountType === d.id ? C.amberSoft : "#fff",
                        color: discountType === d.id ? C.amberDeep : C.inkSoft,
                        cursor: "pointer",
                      }}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {calculations.discountAmount > 0 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12.5,
                    color: C.amberDeep,
                    marginBottom: 6,
                  }}
                >
                  <span>Savings Applied</span>
                  <span className="font-mono" style={{ fontWeight: 700 }}>
                    -₨{calculations.discountAmount.toLocaleString()}
                  </span>
                </div>
              )}

              {/* Tax / GST Selector */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 12.5,
                  color: C.inkSoft,
                  marginBottom: 10,
                }}
              >
                <span>Sales Tax / GST</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {[
                    { rate: 0, label: "0%" },
                    { rate: 5, label: "5%" },
                    { rate: 17, label: "17%" },
                  ].map((t) => (
                    <button
                      key={t.rate}
                      onClick={() => setTaxRate(t.rate)}
                      className="vantage-focus"
                      style={{
                        padding: "2px 6px",
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 4,
                        border: taxRate === t.rate ? `1px solid ${C.navy}` : `1px solid ${C.line}`,
                        background: taxRate === t.rate ? C.navy : "#fff",
                        color: taxRate === t.rate ? "#fff" : C.inkSoft,
                        cursor: "pointer",
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {calculations.taxAmount > 0 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12.5,
                    color: C.inkSoft,
                    marginBottom: 6,
                  }}
                >
                  <span>Tax ({taxRate}%)</span>
                  <span className="font-mono" style={{ fontWeight: 600 }}>
                    +₨{calculations.taxAmount.toLocaleString()}
                  </span>
                </div>
              )}

              {/* NET GRAND TOTAL */}
              <div
                style={{
                  borderTop: `1.5px dashed ${C.line}`,
                  paddingTop: 8,
                  marginTop: 4,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>Grand Total</span>
                <span
                  className="font-mono"
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    color: C.navy,
                  }}
                >
                  ₨{calculations.grandTotal.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Payment Method Switcher (Cash / Card / Raast) */}
            <div
              style={{
                padding: "12px 16px 14px",
                borderTop: `1px solid ${C.line}`,
                background: "#fff",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 6,
                  marginBottom: 12,
                }}
              >
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cash")}
                  className="vantage-focus"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    padding: "8px 4px",
                    borderRadius: 9,
                    border: paymentMethod === "cash" ? `1.5px solid ${C.teal}` : `1px solid ${C.line}`,
                    background: paymentMethod === "cash" ? C.tealSoft : C.bg,
                    color: paymentMethod === "cash" ? "#0A7873" : C.inkSoft,
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  <DollarSign size={16} />
                  Cash
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod("card")}
                  className="vantage-focus"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    padding: "8px 4px",
                    borderRadius: 9,
                    border: paymentMethod === "card" ? `1.5px solid ${C.teal}` : `1px solid ${C.line}`,
                    background: paymentMethod === "card" ? C.tealSoft : C.bg,
                    color: paymentMethod === "card" ? "#0A7873" : C.inkSoft,
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  <CreditCard size={16} />
                  Card
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod("raast")}
                  className="vantage-focus"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    padding: "8px 4px",
                    borderRadius: 9,
                    border: paymentMethod === "raast" ? `1.5px solid ${C.teal}` : `1px solid ${C.line}`,
                    background: paymentMethod === "raast" ? C.tealSoft : C.bg,
                    color: paymentMethod === "raast" ? "#0A7873" : C.inkSoft,
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  <QrCode size={16} />
                  Raast / QR
                </button>
              </div>

              {/* PAYMENT DETAILS CONTENT */}
              {paymentMethod === "cash" && (
                <div style={{ marginBottom: 12 }}>
                  {/* Tendered Input & Quick Presets */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.inkSoft }}>Amount Tendered</span>
                    <button
                      type="button"
                      onClick={() => setCashTendered(String(calculations.grandTotal))}
                      className="vantage-focus"
                      style={{
                        background: "none",
                        border: "none",
                        color: C.teal,
                        fontSize: 11.5,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Exact (₨{calculations.grandTotal.toLocaleString()})
                    </button>
                  </div>

                  <div style={{ position: "relative", marginBottom: 8 }}>
                    <span
                      style={{
                        position: "absolute",
                        left: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: 14,
                        fontWeight: 700,
                        color: C.inkFaint,
                      }}
                    >
                      ₨
                    </span>
                    <input
                      type="number"
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                      placeholder={String(calculations.grandTotal || "0")}
                      className="vantage-focus font-mono"
                      style={{
                        width: "100%",
                        padding: "8px 12px 8px 28px",
                        borderRadius: 8,
                        border: `1px solid ${C.line}`,
                        fontSize: 16,
                        fontWeight: 700,
                        outline: "none",
                      }}
                    />
                  </div>

                  {/* Quick Preset Buttons */}
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                    {[500, 1000, 2000, 5000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setCashTendered(String(preset))}
                        className="vantage-focus font-mono"
                        style={{
                          flex: 1,
                          padding: "3px 4px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          border: `1px solid ${C.line}`,
                          background: C.bg,
                          color: C.ink,
                          cursor: "pointer",
                        }}
                      >
                        ₨{preset.toLocaleString()}
                      </button>
                    ))}
                  </div>

                  {/* Change / Due Feedback Calculator Box */}
                  {calculations.grandTotal > 0 && calculations.tenderedNumber > 0 && (
                    <div
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        background: calculations.isSufficient ? C.tealSoft : C.coralSoft,
                        border: `1px solid ${calculations.isSufficient ? "#0EA5A0" : C.coral}`,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: calculations.isSufficient ? "#0A7873" : C.coral,
                        }}
                      >
                        {calculations.isSufficient ? "Change to return:" : "Remaining amount due:"}
                      </span>
                      <span
                        className="font-mono"
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          color: calculations.isSufficient ? "#0A7873" : C.coral,
                        }}
                      >
                        ₨{calculations.isSufficient
                          ? calculations.changeDue.toLocaleString()
                          : calculations.remainingDue.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {paymentMethod === "card" && (
                <div
                  style={{
                    background: C.bg,
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 12,
                    border: `1px solid ${C.line}`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#0A7873" }}>
                      <CheckCircle2 size={14} /> Terminal Ready
                    </div>
                    <span style={{ fontSize: 11, color: C.inkFaint }}>Tap or Insert</span>
                  </div>

                  {/* Card brand switcher */}
                  <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                    {["Visa", "Mastercard", "PayPak", "UnionPay"].map((brand) => (
                      <button
                        key={brand}
                        type="button"
                        onClick={() => setCardType(brand)}
                        style={{
                          flex: 1,
                          padding: "3px 4px",
                          borderRadius: 6,
                          fontSize: 10.5,
                          fontWeight: 700,
                          border: cardType === brand ? `1px solid ${C.navy}` : `1px solid ${C.line}`,
                          background: cardType === brand ? C.navy : "#fff",
                          color: cardType === brand ? "#fff" : C.inkSoft,
                          cursor: "pointer",
                        }}
                      >
                        {brand}
                      </button>
                    ))}
                  </div>

                  <input
                    value={cardAuthRef}
                    onChange={(e) => setCardAuthRef(e.target.value)}
                    placeholder="Terminal Auth / Slip # (Optional)"
                    className="vantage-focus font-mono"
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: `1px solid ${C.line}`,
                      fontSize: 11.5,
                      background: "#fff",
                    }}
                  />
                </div>
              )}

              {paymentMethod === "raast" && (
                <div
                  style={{
                    background: C.bg,
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 12,
                    border: `1px solid ${C.line}`,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 4 }}>
                    Instant Raast QR / Mobile Transfer
                  </div>
                  <div style={{ fontSize: 11, color: C.inkSoft, marginBottom: 8 }}>
                    Scan with any banking app (Easypaisa, JazzCash, HBL, Meezan)
                  </div>
                  <div
                    style={{
                      width: 90,
                      height: 90,
                      margin: "0 auto 8px",
                      background: "#fff",
                      borderRadius: 8,
                      border: `1px solid ${C.line}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <QrCode size={70} color={C.navyDeep} />
                  </div>
                  <div className="font-mono" style={{ fontSize: 11, color: C.inkFaint }}>
                    Raast ID: 0300-VANTAGE-POS
                  </div>
                </div>
              )}

              {/* Checkout / Hold Actions */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={holdCurrentOrder}
                  disabled={!cart.length}
                  className="vantage-focus"
                  title="Park this cart to serve another customer"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: `1px solid ${C.line}`,
                    background: C.bg,
                    color: C.inkSoft,
                    cursor: cart.length ? "pointer" : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: cart.length ? 1 : 0.5,
                  }}
                >
                  <PauseCircle size={17} />
                </button>

                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={!cart.length || (paymentMethod === "cash" && calculations.grandTotal > 0 && !calculations.isSufficient)}
                  className="vantage-focus"
                  style={{
                    flex: 1,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "12px 18px",
                    borderRadius: 10,
                    border: "none",
                    background: C.navy,
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 14.5,
                    cursor:
                      !cart.length || (paymentMethod === "cash" && calculations.grandTotal > 0 && !calculations.isSufficient)
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      !cart.length || (paymentMethod === "cash" && calculations.grandTotal > 0 && !calculations.isSufficient)
                        ? 0.55
                        : 1,
                    transition: "all .15s ease",
                  }}
                >
                  <Check size={18} />
                  <span>
                    Charge ₨{calculations.grandTotal.toLocaleString()}
                  </span>
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* =========================================================================
          MODAL: COMPLETED SALE RECEIPT PREVIEW
         ========================================================================= */}
      {receiptModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(19,26,44,0.65)",
            zIndex: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setReceiptModal(null)}
        >
          <div
            className="anim-in"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 18,
              width: "100%",
              maxWidth: 440,
              boxShadow: "0 24px 60px rgba(19,26,44,0.35)",
              overflow: "hidden",
            }}
          >
            {/* Header banner */}
            <div
              style={{
                background: "#0A7873",
                color: "#fff",
                padding: "16px 20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <CheckCircle2 size={22} color="#fff" />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>Payment Successful</div>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>Invoice #{receiptModal.invoice}</div>
                </div>
              </div>
              <button
                onClick={() => setReceiptModal(null)}
                style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Printable Receipt Paper Body */}
            <div
              className="vantage-printable-receipt"
              style={{
                padding: "20px 24px",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 12.5,
                color: C.ink,
                maxHeight: "65vh",
                overflowY: "auto",
              }}
            >
              <div style={{ textAlign: "center", marginBottom: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{businessName || "VANTAGE STORE"}</div>
                <div style={{ fontSize: 11, color: C.inkFaint }}>Point of Sale Terminal #01</div>
                <div style={{ fontSize: 11, color: C.inkFaint }}>
                  {receiptModal.date} · {receiptModal.time}
                </div>
              </div>

              <div
                style={{
                  borderTop: "1px dashed #aaa",
                  borderBottom: "1px dashed #aaa",
                  padding: "6px 0",
                  margin: "8px 0",
                  fontSize: 11.5,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Customer: {receiptModal.customer}</span>
                <span>Cashier: {receiptModal.cashier}</span>
              </div>

              {/* Items Table */}
              <div style={{ marginBottom: 10 }}>
                {receiptModal.items.map((it, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "4px 0",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div>{it.name}</div>
                      <div style={{ fontSize: 10.5, color: C.inkFaint }}>
                        {it.qty} x ₨{it.price?.toLocaleString()}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700 }}>₨{it.total?.toLocaleString()}</div>
                  </div>
                ))}
              </div>

              {/* Financial Breakdown */}
              <div style={{ borderTop: "1px dashed #aaa", paddingTop: 8, marginTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span>Subtotal</span>
                  <span>₨{receiptModal.subtotal?.toLocaleString()}</span>
                </div>
                {receiptModal.discount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span>Discount</span>
                    <span>-₨{receiptModal.discount?.toLocaleString()}</span>
                  </div>
                )}
                {receiptModal.tax > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span>Tax</span>
                    <span>+₨{receiptModal.tax?.toLocaleString()}</span>
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontWeight: 800,
                    fontSize: 15,
                    borderTop: "1px solid #111",
                    paddingTop: 6,
                    marginTop: 4,
                  }}
                >
                  <span>TOTAL PAID</span>
                  <span>₨{receiptModal.total?.toLocaleString()}</span>
                </div>
              </div>

              {/* Payment Details */}
              <div style={{ borderTop: "1px dashed #aaa", paddingTop: 8, marginTop: 8, fontSize: 11.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span>Method</span>
                  <span>{receiptModal.paymentMethod}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span>Tendered</span>
                  <span>₨{receiptModal.amountTendered?.toLocaleString()}</span>
                </div>
                {receiptModal.change > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                    <span>Change Returned</span>
                    <span>₨{receiptModal.change?.toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div
                style={{
                  textAlign: "center",
                  marginTop: 16,
                  paddingTop: 8,
                  borderTop: "1px dashed #aaa",
                  fontSize: 10.5,
                  color: C.inkFaint,
                }}
              >
                Thank you for your business!
                <br />
                Powered by Vantage AI COO
              </div>
            </div>

            {/* Modal Actions */}
            <div
              style={{
                background: C.bg,
                padding: "14px 20px",
                borderTop: `1px solid ${C.line}`,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => window.print()}
              >
                <Printer size={14} /> Print Receipt
              </Btn>

              <Btn
                variant="ghost"
                size="sm"
                onClick={() => handleDownloadSlip(receiptModal)}
              >
                <Download size={14} /> Download Slip
              </Btn>

              <Btn
                variant="subtle"
                size="sm"
                onClick={() => sendReceiptViaComms(receiptModal)}
              >
                <Send size={14} /> Send Follow-up
              </Btn>

              <Btn
                variant="primary"
                size="sm"
                onClick={() => setReceiptModal(null)}
              >
                <Plus size={14} /> New Sale
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: PARKED / HELD ORDERS
         ========================================================================= */}
      {showHeldModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(19,26,44,0.5)",
            zIndex: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setShowHeldModal(false)}
        >
          <div
            className="anim-in"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 16,
              width: "100%",
              maxWidth: 480,
              padding: 20,
              boxShadow: "0 24px 60px rgba(19,26,44,0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <PauseCircle size={18} color={C.amberDeep} /> Parked / Held Carts ({heldOrders.length})
              </div>
              <button
                onClick={() => setShowHeldModal(false)}
                style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            {heldOrders.length === 0 ? (
              <div style={{ padding: "30px 0", textAlign: "center", color: C.inkFaint, fontSize: 13.5 }}>
                No held orders right now. Click the pause button in the cart to park an order.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 320, overflowY: "auto" }}>
                {heldOrders.map((ord) => (
                  <div
                    key={ord.holdId}
                    style={{
                      border: `1px solid ${C.line}`,
                      borderRadius: 10,
                      padding: 12,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{ord.customer}</div>
                      <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 2 }}>
                        {ord.time} · {ord.items.length} items (₨{ord.calculations.grandTotal.toLocaleString()})
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn
                        variant="subtle"
                        size="sm"
                        onClick={() => resumeHeldOrder(ord)}
                      >
                        <PlayCircle size={13} /> Resume
                      </Btn>
                      <button
                        onClick={() => setHeldOrders((prev) => prev.filter((o) => o.holdId !== ord.holdId))}
                        style={{ background: "none", border: "none", color: C.coral, cursor: "pointer", padding: 6 }}
                        title="Discard held order"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: RECENT TODAY'S SALES DRAWER
         ========================================================================= */}
      {showRecentSalesModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(19,26,44,0.5)",
            zIndex: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setShowRecentSalesModal(false)}
        >
          <div
            className="anim-in"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 16,
              width: "100%",
              maxWidth: 580,
              padding: 20,
              boxShadow: "0 24px 60px rgba(19,26,44,0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <History size={18} color={C.navy} /> Today's Completed Sales ({(state.pos?.sales || []).length})
              </div>
              <button
                onClick={() => setShowRecentSalesModal(false)}
                style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              {(state.pos?.sales || []).length === 0 ? (
                <div style={{ padding: "30px 0", textAlign: "center", color: C.inkFaint }}>
                  No completed sales today yet.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: C.bg, textAlign: "left" }}>
                      <th style={{ padding: "8px 10px", fontSize: 11, color: C.inkFaint }}>Invoice</th>
                      <th style={{ padding: "8px 10px", fontSize: 11, color: C.inkFaint }}>Time</th>
                      <th style={{ padding: "8px 10px", fontSize: 11, color: C.inkFaint }}>Customer</th>
                      <th style={{ padding: "8px 10px", fontSize: 11, color: C.inkFaint }}>Total</th>
                      <th style={{ padding: "8px 10px", fontSize: 11, color: C.inkFaint }}>Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(state.pos?.sales || []).map((sale, idx) => (
                      <tr
                        key={idx}
                        style={{ borderTop: `1px solid ${C.line}`, cursor: "pointer" }}
                        onClick={() => {
                          setShowRecentSalesModal(false);
                          setReceiptModal({
                            invoice: sale.invoice,
                            customer: sale.customer || "Walk-in Customer",
                            cashier: sale.cashier || "Counter",
                            date: sale.date || new Date().toLocaleDateString(),
                            time: sale.time || "Today",
                            items: sale.items && Array.isArray(sale.items) && typeof sale.items[0] === "object"
                              ? sale.items
                              : [{ name: "Registered Sale Items", qty: typeof sale.items === "number" ? sale.items : 1, price: sale.total, total: sale.total }],
                            subtotal: sale.subtotal || sale.total,
                            discount: sale.discount || 0,
                            tax: sale.tax || 0,
                            total: sale.total,
                            paymentMethod: sale.paymentMethod || "Cash",
                            amountTendered: sale.amountTendered || sale.total,
                            change: sale.change || 0,
                          });
                        }}
                      >
                        <td style={{ padding: "9px 10px" }} className="font-mono">
                          <span style={{ color: C.navy, fontWeight: 700 }}>{sale.invoice}</span>
                        </td>
                        <td style={{ padding: "9px 10px", color: C.inkFaint }}>{sale.time}</td>
                        <td style={{ padding: "9px 10px", fontWeight: 600 }}>{sale.customer || "Walk-in"}</td>
                        <td style={{ padding: "9px 10px", fontWeight: 700 }} className="font-mono">
                          ₨{sale.total?.toLocaleString()}
                        </td>
                        <td style={{ padding: "9px 10px" }}>
                          <span style={{ fontSize: 11, color: C.inkSoft, background: C.bg, padding: "2px 6px", borderRadius: 4 }}>
                            {sale.paymentMethod || "Cash"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: ADD QUICK CUSTOM / AD-HOC ITEM
         ========================================================================= */}
      {showCustomItemModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(19,26,44,0.5)",
            zIndex: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setShowCustomItemModal(false)}
        >
          <form
            onSubmit={handleAddCustomItem}
            className="anim-in"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 16,
              width: "100%",
              maxWidth: 400,
              padding: 22,
              boxShadow: "0 24px 60px rgba(19,26,44,0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Add Custom / Open Item</div>
              <button
                type="button"
                onClick={() => setShowCustomItemModal(false)}
                style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: C.inkSoft, display: "block", marginBottom: 4 }}>
                Item Description / Name
              </label>
              <input
                required
                autoFocus
                value={customItemForm.name}
                onChange={(e) => setCustomItemForm({ ...customItemForm, name: e.target.value })}
                placeholder="e.g. Gift Wrapping, Delivery Fee, Special Loose Item"
                className="vantage-focus"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: `1px solid ${C.line}`,
                  fontSize: 13.5,
                }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: C.inkSoft, display: "block", marginBottom: 4 }}>
                  Price (₨)
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={customItemForm.price}
                  onChange={(e) => setCustomItemForm({ ...customItemForm, price: e.target.value })}
                  placeholder="e.g. 250"
                  className="vantage-focus font-mono"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: `1px solid ${C.line}`,
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: C.inkSoft, display: "block", marginBottom: 4 }}>
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  value={customItemForm.qty}
                  onChange={(e) => setCustomItemForm({ ...customItemForm, qty: Number(e.target.value) || 1 })}
                  className="vantage-focus font-mono"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: `1px solid ${C.line}`,
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="ghost" size="sm" onClick={() => setShowCustomItemModal(false)}>
                Cancel
              </Btn>
              <Btn variant="primary" size="sm" type="submit">
                Add to Cart
              </Btn>
            </div>
          </form>
        </div>
      )}
    </ViewWrap>
  );
}
