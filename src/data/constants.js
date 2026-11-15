import {
  DollarSign, Package, MessageSquare, BarChart3,
  Sparkles, Compass, CheckCircle2, TrendingUp, TrendingDown, MinusCircle,
  Zap, ClipboardCheck, Activity, Wifi, Laptop2, Link2, RotateCw,
  Download, Command, Search, Plus, LogOut, Menu, Bell, Users,
  Building2, User, Mail, Lock, Eye, EyeOff, ArrowRight,
  Send, UploadCloud, FileDown, RefreshCcw, AlertTriangle,
  Trash2, History, ListChecks, Info, ArrowUpRight,
  Minus, Plus as PlusIcon, Search as SearchIcon, X, ChevronRight,
  CreditCard, ShieldCheck, Store, BarChart3 as BarChart3Icon, LayoutDashboard,
  ShoppingCart, Receipt, Calculator, Tag, QrCode, Printer,
  Phone, Truck, Building, MessageCircle, ExternalLink,
  Clock, Calendar, FileText, BookOpen, Settings,
} from "lucide-react";

/* ============================== DESIGN TOKENS ============================== */
export const C = {
  bg: "#F6F7FB",
  surface: "#FFFFFF",
  navyDeep: "#131A2C",
  navy: "#1F2A44",
  navySoft: "#324167",
  ink: "#12141C",
  inkSoft: "#5B6172",
  inkFaint: "#8A90A2",
  amber: "#E3A008",
  amberDeep: "#B87F04",
  amberSoft: "#FCEFC7",
  teal: "#0EA5A0",
  tealSoft: "#DCF5F3",
  coral: "#DC4C3E",
  coralSoft: "#FBE4E1",
  line: "#E5E8F0",
};

export const AGENTS = {
  finance: { label: "Finance Agent", icon: DollarSign, color: C.teal, soft: C.tealSoft },
  inventory: { label: "Inventory Agent", icon: Package, color: C.amberDeep, soft: C.amberSoft },
  communication: { label: "Communication Agent", icon: MessageSquare, color: C.navy, soft: "#E7EAF3" },
  analytics: { label: "Analytics Agent", icon: BarChart3, color: C.coral, soft: C.coralSoft },
};

export const NAV_ITEMS = {
  // Operations Group
  dashboard: { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Operations" },
  pos: { id: "pos", label: "Point of Sale", icon: Store, group: "Operations" },
  chat: { id: "chat", label: "Planner", icon: Sparkles, group: "Operations" },
  inventory: { id: "inventory", label: "Inventory", icon: Package, group: "Operations" },
  communication: { id: "communication", label: "Communication", icon: MessageSquare, group: "Operations" },
  analytics: { id: "analytics", label: "Analytics", icon: BarChart3, group: "Operations" },

  // Finance Group
  finance: { id: "finance", label: "Overview & Forecast", icon: DollarSign, group: "Finance" },
  transactions: { id: "transactions", label: "Ledger & Import", icon: Receipt, group: "Finance" },

  // Employees (HR) Group
  hr_dashboard: { id: "hr_dashboard", label: "HR Dashboard", icon: Activity, group: "Employees" },
  hr_employees: { id: "hr_employees", label: "Employees", icon: Users, group: "Employees" },
  hr_attendance: { id: "hr_attendance", label: "Attendance", icon: Clock, group: "Employees" },
  hr_leave: { id: "hr_leave", label: "Leave Requests", icon: Calendar, group: "Employees" },
  hr_payroll: { id: "hr_payroll", label: "Payroll & Payslips", icon: FileText, group: "Employees" },
  hr_policies: { id: "hr_policies", label: "HR Assistant & Docs", icon: BookOpen, group: "Employees" },

  // Account Group
  profile: { id: "profile", label: "Profile", icon: User, group: "Account" },
  manage_roles: { id: "manage_roles", label: "Manage Roles", icon: ShieldCheck, group: "Account" },
  business_setup: { id: "business_setup", label: "Business Setup", icon: Building2, group: "Account" },
  billing: { id: "billing", label: "Billing & AI Meter", icon: CreditCard, group: "Account" },
  connections: { id: "connections", label: "Connections", icon: Wifi, group: "Account" },
  connectpos: { id: "connectpos", label: "Connect POS", icon: Link2, group: "Account" },

  // Compatibility aliases
  team: { id: "manage_roles", label: "Manage Roles", icon: ShieldCheck, group: "Account" },
};

export const ROLE_NAV = {
  owner: [
    "dashboard", "pos", "chat", "inventory", "communication", "analytics",
    "finance", "transactions",
    "hr_dashboard", "hr_employees", "hr_attendance", "hr_leave", "hr_payroll", "hr_policies",
    "profile", "manage_roles", "business_setup", "billing", "connections", "connectpos"
  ],
  manager: [
    "dashboard", "pos", "chat", "inventory", "communication", "analytics",
    "finance", "transactions",
    "hr_dashboard", "hr_employees", "hr_attendance", "hr_leave", "hr_payroll", "hr_policies",
    "profile", "business_setup", "connections", "connectpos"
  ],
  hr_officer: [
    "hr_dashboard", "hr_employees", "hr_attendance", "hr_leave", "hr_payroll", "hr_policies",
    "profile"
  ],
  cashier: [
    "pos",
    "hr_attendance", "hr_leave", "hr_payroll", "hr_policies",
    "profile"
  ],
  staff: [
    "dashboard", "pos", "chat", "inventory", "communication",
    "hr_attendance", "hr_leave", "hr_payroll", "hr_policies",
    "profile"
  ],
  admin: [
    "dashboard", "pos", "chat", "inventory", "communication", "analytics",
    "finance", "transactions",
    "hr_dashboard", "hr_employees", "hr_attendance", "hr_leave", "hr_payroll", "hr_policies",
    "profile", "manage_roles", "business_setup", "billing", "connections", "connectpos"
  ],
};

export const ROLE_META = {
  owner: { label: "Business Owner", desc: "Full executive access — finances, accounting, team, HR, inventory, POS, and AI planner." },
  manager: { label: "Store Manager", desc: "Operational management — POS, inventory, customer communication, HR, and connections." },
  hr_officer: { label: "HR Officer", desc: "Dedicated HR management — employee profiles, attendance logs, leave approvals, and payroll preparation." },
  cashier: { label: "Cashier Counter", desc: "Dedicated POS Counter & self-service clocking — scan items, process payments, personal attendance and payslips." },
  staff: { label: "Staff Member", desc: "Floor operations & self-service — inventory, customer messaging, personal attendance and leave requests." },
  admin: { label: "System Administrator", desc: "System health, user administration, and global platform configuration." },
};

/* ============================== SEED DATA ============================== */
export const FINANCE_SERIES_SEED = [
  { month: "Mar", revenue: 780, forecast: null },
  { month: "Apr", revenue: 820, forecast: null },
  { month: "May", revenue: 865, forecast: null },
  { month: "Jun", revenue: 910, forecast: null },
  { month: "Jul", revenue: 940, forecast: null },
  { month: "Aug", revenue: 980, forecast: 980 },
  { month: "Sep", revenue: null, forecast: 1040 },
  { month: "Oct", revenue: null, forecast: 1105 },
  { month: "Nov", revenue: null, forecast: 1180 },
];

export const FINANCE_KPIS_SEED = [
  { key: "revenue", label: "Revenue (MTD)", value: 980000, display: "₨9.8L", trend: "up", delta: "+6.2%" },
  { key: "expenses", label: "Expenses (MTD)", value: 690000, display: "₨6.9L", trend: "up", delta: "+2.1%" },
  { key: "profit", label: "Net Profit", value: 290000, display: "₨2.9L", trend: "up", delta: "+8.4%" },
  { key: "runway", label: "Cash Runway", value: 5.4, display: "5.4 mo", trend: "down", delta: "-0.3 mo" },
];

export const INITIAL_RECS = [
  { id: 1, title: "Reduce ad spend by 12%", detail: "Facebook ad spend has grown faster than the revenue it drives this month.", status: "pending", impactLabel: "Frees ~₨42,000/mo", impactValue: 42000, runwayBoost: 0.3 },
  { id: 2, title: "Renegotiate supplier payment terms", detail: "Shifting to 30-day terms with your top supplier frees up about ₨85,000 in monthly cash flow.", status: "pending", impactLabel: "Frees ~₨85,000/mo", impactValue: 85000, runwayBoost: 0.5 },
];

export const SUPPLIERS_SEED = [
  {
    id: 1,
    name: "Al-Baraka Grain Mills",
    contactPerson: "Haji Muhammad Usman",
    email: "orders@albarakagrains.com",
    phone: "+92 301 5550192",
    address: "Plot 14-A, Industrial Estate, Gujranwala",
    categories: ["Grains & Staples"],
    products: ["Basmati Rice 5kg", "Sugar 10kg", "Wheat Flour (Atta) 10kg", "Red Lentils (Daal Masoor) 1kg"],
    paymentTerms: "Net 30 days",
    leadTime: "24-48 hours",
  },
  {
    id: 2,
    name: "Punjab Oil & Ghee Corp",
    contactPerson: "Farhan Saeed",
    email: "supply@punjaboilcorp.com",
    phone: "+92 312 4440819",
    address: "Sector 7, Korangi Industrial Area, Karachi",
    categories: ["Oils & Ghee"],
    products: ["Cooking Oil 1L"],
    paymentTerms: "Net 15 days",
    leadTime: "24 hours",
  },
  {
    id: 3,
    name: "Supreme Household Distributors",
    contactPerson: "Suleman Khan",
    email: "sales@supremedistributors.com",
    phone: "+92 322 8889911",
    address: "Warehouse 5, Ring Road Logistics Hub, Lahore",
    categories: ["Household", "Snacks"],
    products: ["Detergent Powder 1kg", "Assorted Biscuits Family Box"],
    paymentTerms: "Net 30 days",
    leadTime: "48 hours",
  },
  {
    id: 4,
    name: "National Foods & Spices",
    contactPerson: "Tariq Mehmood",
    email: "distribution@nationalfoods.pk",
    phone: "+92 333 7772233",
    address: "Export Processing Zone, Karachi",
    categories: ["Beverages", "Spices & Pantry"],
    products: ["Tea Pack 950g", "Mixed Spices Garam Masala 200g"],
    paymentTerms: "Net 20 days",
    leadTime: "24-48 hours",
  },
  {
    id: 5,
    name: "Dairy Fresh Mills",
    contactPerson: "Dr. Asim Qureshi",
    email: "dispatch@dairyfresh.pk",
    phone: "+92 300 9991122",
    address: "Model Dairy Farm, Sahiwal",
    categories: ["Dairy & Chilled"],
    products: ["UHT Pure Milk 1L"],
    paymentTerms: "Cash on Delivery",
    leadTime: "Same day dispatch",
  },
];

export const CUSTOMERS_SEED = [
  {
    id: 1,
    name: "Ahmed Traders",
    contactPerson: "Ahmed Raza",
    phone: "+92 300 1234567",
    email: "ahmed.traders@example.com",
    city: "Lahore",
    debit: 45000,
    creditLimit: 100000,
    lastPurchase: "2 days ago",
    status: "overdue",
    notes: "Regular wholesale client for rice and flour. Pending balance from invoice INV-4790.",
  },
  {
    id: 2,
    name: "Zainab Mart",
    contactPerson: "Zainab Bibi",
    phone: "+92 321 9876543",
    email: "zainab.mart@example.com",
    city: "Karachi",
    debit: 18500,
    creditLimit: 50000,
    lastPurchase: "Yesterday",
    status: "current",
    notes: "Supermarket chain branch. High volume cooking oil and detergents.",
  },
  {
    id: 3,
    name: "Bilal & Sons",
    contactPerson: "Bilal Malik",
    phone: "+92 333 4567890",
    email: "bilal.sons@example.com",
    city: "Rawalpindi",
    debit: 62000,
    creditLimit: 75000,
    lastPurchase: "5 days ago",
    status: "overdue",
    notes: "Bulk grocery shop. Reached 82% of credit limit. Needs debit reminder.",
  },
  {
    id: 4,
    name: "Karachi Super Store",
    contactPerson: "Tariq Jameel",
    phone: "+92 345 6789012",
    email: "karachi.superstore@example.com",
    city: "Karachi",
    debit: 28400,
    creditLimit: 60000,
    lastPurchase: "3 days ago",
    status: "current",
    notes: "Beverages and spices monthly credit account.",
  },
  {
    id: 5,
    name: "Fatima Grocery Hub",
    contactPerson: "Fatima Noor",
    phone: "+92 312 3456789",
    email: "fatima.hub@example.com",
    city: "Faisalabad",
    debit: 0,
    creditLimit: 40000,
    lastPurchase: "Today",
    status: "cleared",
    notes: "Always pays promptly via Cash/Raast on invoice delivery.",
  },
  {
    id: 6,
    name: "Usman & Brothers",
    contactPerson: "Usman Ghani",
    phone: "+92 301 8765432",
    email: "usman.brothers@example.com",
    city: "Multan",
    debit: 35000,
    creditLimit: 80000,
    lastPurchase: "1 week ago",
    status: "overdue",
    notes: "Owes balance for 50 bags of sugar and tea packs.",
  },
];

export const INITIAL_INVENTORY = [
  { id: 1, sku: "RIC-001", name: "Basmati Rice 5kg", category: "Grains & Staples", price: 1850, stock: 42, threshold: 60, trend: "down", reordered: false, supplierId: 1, supplierName: "Al-Baraka Grain Mills", supplierEmail: "orders@albarakagrains.com", supplierPhone: "+92 301 5550192" },
  { id: 2, sku: "OIL-002", name: "Cooking Oil 1L", category: "Oils & Ghee", price: 580, stock: 15, threshold: 50, trend: "down", reordered: false, supplierId: 2, supplierName: "Punjab Oil & Ghee Corp", supplierEmail: "supply@punjaboilcorp.com", supplierPhone: "+92 312 4440819" },
  { id: 3, sku: "DET-003", name: "Detergent Powder 1kg", category: "Household", price: 420, stock: 120, threshold: 40, trend: "flat", reordered: false, supplierId: 3, supplierName: "Supreme Household Distributors", supplierEmail: "sales@supremedistributors.com", supplierPhone: "+92 322 8889911" },
  { id: 4, sku: "TEA-004", name: "Tea Pack 950g", category: "Beverages", price: 1350, stock: 30, threshold: 35, trend: "down", reordered: false, supplierId: 4, supplierName: "National Foods & Spices", supplierEmail: "distribution@nationalfoods.pk", supplierPhone: "+92 333 7772233" },
  { id: 5, sku: "SUG-005", name: "Sugar 10kg", category: "Grains & Staples", price: 1450, stock: 88, threshold: 45, trend: "up", reordered: false, supplierId: 1, supplierName: "Al-Baraka Grain Mills", supplierEmail: "orders@albarakagrains.com", supplierPhone: "+92 301 5550192" },
  { id: 6, sku: "FLO-006", name: "Wheat Flour (Atta) 10kg", category: "Grains & Staples", price: 1200, stock: 35, threshold: 40, trend: "up", reordered: false, supplierId: 1, supplierName: "Al-Baraka Grain Mills", supplierEmail: "orders@albarakagrains.com", supplierPhone: "+92 301 5550192" },
  { id: 7, sku: "MLK-007", name: "UHT Pure Milk 1L", category: "Dairy & Chilled", price: 290, stock: 68, threshold: 30, trend: "flat", reordered: false, supplierId: 5, supplierName: "Dairy Fresh Mills", supplierEmail: "dispatch@dairyfresh.pk", supplierPhone: "+92 300 9991122" },
  { id: 8, sku: "LEN-008", name: "Red Lentils (Daal Masoor) 1kg", category: "Grains & Staples", price: 340, stock: 54, threshold: 30, trend: "flat", reordered: false, supplierId: 1, supplierName: "Al-Baraka Grain Mills", supplierEmail: "orders@albarakagrains.com", supplierPhone: "+92 301 5550192" },
  { id: 9, sku: "SPI-009", name: "Mixed Spices Garam Masala 200g", category: "Spices & Pantry", price: 210, stock: 65, threshold: 25, trend: "up", reordered: false, supplierId: 4, supplierName: "National Foods & Spices", supplierEmail: "distribution@nationalfoods.pk", supplierPhone: "+92 333 7772233" },
  { id: 10, sku: "SNK-010", name: "Assorted Biscuits Family Box", category: "Snacks", price: 220, stock: 90, threshold: 40, trend: "up", reordered: false, supplierId: 3, supplierName: "Supreme Household Distributors", supplierEmail: "sales@supremedistributors.com", supplierPhone: "+92 322 8889911" },
];

export const POS_CATEGORIES = [
  "All",
  "Grains & Staples",
  "Oils & Ghee",
  "Beverages",
  "Household",
  "Dairy & Chilled",
  "Spices & Pantry",
  "Snacks",
];

export const INITIAL_DRAFTS = [
  { id: 1, customer: "Ahmed Traders", type: "Follow-up", text: "Hi Ahmed, just checking in since your last order of Basmati Rice — would you like to restock before the Eid rush? Happy to hold today's rate for you.", sent: false, sentAt: null },
  { id: 2, customer: "Zainab Mart", type: "Promotion", text: "Eid Sale for Zainab Mart: 20% off cooking oil and detergent this week only. Reply to lock in your order before stock runs out.", sent: false, sentAt: null },
  { id: 3, customer: "Bilal & Sons", type: "Query response", text: "Thanks for reaching out — delivery to your area usually takes 1-2 working days. I'll flag your order for priority dispatch tomorrow.", sent: false, sentAt: null },
];

export const PLANS = [
  {
    id: "basic", name: "Basic", price: { monthly: 4999, annual: 4249 },
    tagline: "For a solo owner just getting started with Vantage.",
    features: ["Planner Agent orchestration", "Inventory Optimization Agent", "Communication Agent drafts", "1 team seat", "Email support"],
  },
  {
    id: "standard", name: "Standard", price: { monthly: 9999, annual: 8499 }, popular: true,
    tagline: "The full agent team for a business that's growing.",
    features: ["Everything in Basic", "Finance Intelligence Agent", "Analytics & Reporting", "Up to 5 team seats", "Priority support"],
  },
  {
    id: "premium", name: "Premium", price: { monthly: 17999, annual: 15299 },
    tagline: "For multi-location businesses that need it all.",
    features: ["Everything in Standard", "Connect POS sync", "Admin monitoring dashboard", "Unlimited team seats", "Dedicated onboarding"],
  },
];

export const POS_SALES_SEED = [
  { invoice: "INV-2026-4821", items: 5, total: 2870, time: "10:42 AM" },
  { invoice: "INV-2026-4820", items: 2, total: 980, time: "10:15 AM" },
  { invoice: "INV-2026-4818", items: 8, total: 6120, time: "9:52 AM" },
  { invoice: "INV-2026-4815", items: 1, total: 320, time: "9:30 AM" },
];

export const POS_ITEM_NAMES = ["Basmati Rice 5kg", "Cooking Oil 1L", "Detergent Powder 1kg", "Tea Pack 950g", "Sugar 10kg", "Assorted snacks"];

export const STORAGE_KEY = "vantage_app_state_v2";
