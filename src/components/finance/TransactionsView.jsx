import React, { useState, useEffect, useRef } from "react";
import {
  DollarSign, Plus, UploadCloud, AlertTriangle, FileText, Download,
  CheckCircle2, XCircle, Search, Filter, RefreshCw, Sparkles, ShieldAlert
} from "lucide-react";
import { C } from "../../data/constants.js";
import { Card, Btn, Badge } from "../Primitives.jsx";
import ViewWrap from "../ViewWrap.jsx";
import {
  agentMapCsv,
  financeListLedger,
  financeCreateLedger,
  financeVoidLedger,
  financeImportCsv,
  financeGetAnomalies,
  financeTriggerAnomalies,
  financeGenerateReport,
} from "../../utils/api.js";

export default function TransactionsView({ showToast }) {
  const [entries, setEntries] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterType, setFilterType] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Add Transaction Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    entry_type: "expense",
    category: "inventory",
    amount: "",
    contact_name: "",
    description: "",
    source: "manual",
    transaction_date: new Date().toISOString().split("T")[0],
  });

  // Void Modal
  const [voidingEntry, setVoidingEntry] = useState(null);
  const [voidReason, setVoidReason] = useState("");

  // CSV Import Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const csvFileRef = useRef(null);

  // Executive Report Modal
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportDates, setReportDates] = useState({
    start_date: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
    end_date: new Date().toISOString().split("T")[0],
  });
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportResult, setReportResult] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterType) params.entry_type = filterType;
      const [ledgerData, anomData] = await Promise.all([
        financeListLedger(params).catch(() => []),
        financeGetAnomalies().catch(() => []),
      ]);
      setEntries(ledgerData || []);
      setAnomalies(anomData || []);
    } catch (err) {
      showToast(err.message || "Failed to load transactions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterType]);

  const handleCreateEntry = async (e) => {
    e.preventDefault();
    if (!addForm.amount || isNaN(Number(addForm.amount)) || Number(addForm.amount) <= 0) {
      showToast("Please enter a valid transaction amount.");
      return;
    }
    try {
      await financeCreateLedger({
        ...addForm,
        amount: Number(addForm.amount),
      });
      showToast("Ledger entry added successfully.");
      setShowAddModal(false);
      setAddForm({
        entry_type: "expense",
        category: "inventory",
        amount: "",
        contact_name: "",
        description: "",
        source: "manual",
        transaction_date: new Date().toISOString().split("T")[0],
      });
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to record transaction.");
    }
  };

  const handleVoidEntry = async (e) => {
    e.preventDefault();
    if (!voidingEntry || !voidReason.trim()) {
      showToast("A reason is mandatory for voiding entries (Audit requirement).");
      return;
    }
    try {
      await financeVoidLedger(voidingEntry.id, voidReason);
      showToast("Transaction voided and audit recorded.");
      setVoidingEntry(null);
      setVoidReason("");
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to void transaction.");
    }
  };

  const handleDetectAnomalies = async () => {
    try {
      const res = await financeTriggerAnomalies();
      showToast(`Audit scan complete: detected ${res.detected_count || 0} anomaly patterns.`);
      const updated = await financeGetAnomalies();
      setAnomalies(updated || []);
    } catch (err) {
      showToast(err.message || "Failed to run anomaly scan.");
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvText(event.target.result || "");
    };
    reader.readAsText(file);
  };

  const handleProcessCsv = async () => {
    if (!csvText.trim()) {
      showToast("Please upload or paste CSV text.");
      return;
    }
    try {
      setImporting(true);
      const mapped = await agentMapCsv("ledger", csvText);
      const rows = Array.isArray(mapped?.normalized_rows) ? mapped.normalized_rows : [];
      if (rows.length === 0) {
        showToast(mapped?.notes || "Could not detect valid ledger rows from that CSV.");
        return;
      }
      const result = await financeImportCsv(rows);
      setImportResults({ ...result, mappingNotes: mapped.notes });
      showToast(`Imported ${result.imported_count} rows (${result.error_count} rejected).`);
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to import CSV.");
    } finally {
      setImporting(false);
    }
  };

  const handleGenerateReport = async () => {
    try {
      setGeneratingReport(true);
      const rep = await financeGenerateReport(reportDates.start_date, reportDates.end_date);
      setReportResult(rep);
      showToast("Executive report synthesized.");
    } catch (err) {
      showToast(err.message || "Failed to generate report.");
    } finally {
      setGeneratingReport(false);
    }
  };

  // Filter entries locally by search term
  const filteredEntries = entries.filter((e) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (e.description && e.description.toLowerCase().includes(term)) ||
      (e.contact_name && e.contact_name.toLowerCase().includes(term)) ||
      (e.category && e.category.toLowerCase().includes(term))
    );
  });

  return (
    <ViewWrap
      title="Accounting Ledger & Audit (FR-2.1, FR-2.5, UC-3, UC-10)"
      subtitle="Complete double-entry record, anomaly detection (40% expense spikes & duplicate bills), and CSV reconciliation."
    >
      {/* Top Anomaly Banner */}
      {anomalies.filter((a) => a.status === "active").length > 0 && (
        <div
          style={{
            background: "#FEF2F2",
            border: "1px solid #FCA5A5",
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ShieldAlert size={20} color="#DC4C3E" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: "#991B1B" }}>
                {anomalies.filter((a) => a.status === "active").length} Financial Anomalies Flagged
              </div>
              <div style={{ fontSize: 12, color: "#7F1D1D", marginTop: 2 }}>
                Potential duplicate invoices or irregular 40%+ expense spikes detected in the recent ledger.
              </div>
            </div>
          </div>
          <Btn size="sm" onClick={handleDetectAnomalies} style={{ background: "#DC4C3E", borderColor: "#DC4C3E" }}>
            Re-scan Ledger
          </Btn>
        </div>
      )}

      {/* Action Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: C.inkSoft }} />
            <input
              type="text"
              placeholder="Search description, vendor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: "8px 10px 8px 30px",
                borderRadius: 8,
                border: `1px solid ${C.line}`,
                fontSize: 13,
                width: 220,
              }}
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${C.line}`,
              background: "#FFF",
              fontSize: 13,
            }}
          >
            <option value="">All Types (Income & Expense)</option>
            <option value="income">Income Only</option>
            <option value="expense">Expense Only</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn variant="secondary" onClick={() => setShowImportModal(true)} style={{ gap: 6 }}>
            <UploadCloud size={14} /> Import CSV
          </Btn>
          <Btn variant="secondary" onClick={() => { setShowReportModal(true); handleGenerateReport(); }} style={{ gap: 6 }}>
            <Sparkles size={14} color={C.teal} /> Executive Report
          </Btn>
          <Btn onClick={() => setShowAddModal(true)} style={{ gap: 6 }}>
            <Plus size={15} /> Add Entry
          </Btn>
        </div>
      </div>

      {/* Ledger Table */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <DollarSign size={16} color={C.teal} /> Itemized Ledger Records
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "30px", color: C.inkSoft }}>Loading ledger records...</div>
        ) : filteredEntries.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: C.inkSoft }}>
            <FileText size={32} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
            <div>No matching transactions found.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.line}`, textAlign: "left", color: C.inkSoft }}>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Date</th>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Type</th>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Category</th>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Contact / Party</th>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Description</th>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Amount</th>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Source</th>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Status</th>
                  <th style={{ padding: "10px 12px", fontWeight: 600, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((row) => {
                  const isVoided = row.status === "voided";
                  const isIncome = row.entry_type === "income";
                  return (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: `1px solid ${C.lineLighter}`,
                        opacity: isVoided ? 0.6 : 1,
                        textDecoration: isVoided ? "line-through" : "none",
                      }}
                    >
                      <td style={{ padding: "12px", color: C.inkSoft }}>{row.transaction_date}</td>
                      <td style={{ padding: "12px" }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 6,
                            fontSize: 11.5,
                            fontWeight: 600,
                            background: isIncome ? "#DCFCE7" : "#FEE2E2",
                            color: isIncome ? "#166534" : "#991B1B",
                            textTransform: "capitalize",
                          }}
                        >
                          {row.entry_type}
                        </span>
                      </td>
                      <td style={{ padding: "12px", fontWeight: 600, color: C.ink }}>{row.category}</td>
                      <td style={{ padding: "12px", color: C.inkSoft }}>{row.contact_name || "—"}</td>
                      <td style={{ padding: "12px", color: C.inkSoft, maxWidth: 220 }}>
                        <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {row.description || "—"}
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "12px",
                          fontWeight: 700,
                          color: isIncome ? "#166534" : C.ink,
                        }}
                      >
                        {isIncome ? "+" : "-"}₨{Number(row.amount || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: "12px", color: C.inkLighter, textTransform: "capitalize", fontSize: 12 }}>
                        {row.source}
                      </td>
                      <td style={{ padding: "12px" }}>
                        <Badge
                          text={row.status || "active"}
                          tone={row.status === "voided" ? "negative" : "positive"}
                        />
                      </td>
                      <td style={{ padding: "12px", textAlign: "right" }}>
                        {!isVoided && (
                          <button
                            onClick={() => { setVoidingEntry(row); setVoidReason(""); }}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "#DC4C3E",
                              fontSize: 11.5,
                              cursor: "pointer",
                              textDecoration: "underline",
                            }}
                          >
                            Void
                          </button>
                        )}
                        {isVoided && (
                          <span style={{ fontSize: 11, color: C.inkLighter }} title={row.voided_reason}>
                            Voided
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal: Add Ledger Entry */}
      {showAddModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#FFF",
              borderRadius: 12,
              padding: 24,
              width: "100%",
              maxWidth: 480,
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: C.ink }}>Record New Transaction</div>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: C.inkSoft }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateEntry} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                    Type
                  </label>
                  <select
                    value={addForm.entry_type}
                    onChange={(e) => setAddForm({ ...addForm, entry_type: e.target.value })}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
                  >
                    <option value="expense">Expense (-)</option>
                    <option value="income">Income (+)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={addForm.transaction_date}
                    onChange={(e) => setAddForm({ ...addForm, transaction_date: e.target.value })}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                    Category
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Inventory, Utilities, Rent"
                    value={addForm.category}
                    onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                    Amount (PKR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={addForm.amount}
                    onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  Contact / Vendor Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Al-Baraka Grain Mills / Walk-in Customer"
                  value={addForm.contact_name}
                  onChange={(e) => setAddForm({ ...addForm, contact_name: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  Description / Remarks
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bulk grain purchase, payment via cheque"
                  value={addForm.description}
                  onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
                />
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
                <Btn variant="secondary" type="button" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Btn>
                <Btn type="submit">Save Transaction</Btn>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Void Transaction */}
      {voidingEntry && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#FFF",
              borderRadius: 12,
              padding: 24,
              width: "100%",
              maxWidth: 440,
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 16, color: "#991B1B", marginBottom: 12 }}>
              Void Transaction (Audit Recorded)
            </div>
            <p style={{ fontSize: 13, color: C.inkSoft, margin: "0 0 16px" }}>
              Are you sure you want to void this <strong>₨{Number(voidingEntry.amount).toLocaleString()}</strong>{" "}
              {voidingEntry.category} entry? It will remain in the append-only ledger marked voided.
            </p>

            <form onSubmit={handleVoidEntry} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  Mandatory Void Reason
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Duplicate bill entry, incorrect amount billed"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
                />
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
                <Btn variant="secondary" type="button" onClick={() => setVoidingEntry(null)}>
                  Cancel
                </Btn>
                <Btn type="submit" style={{ background: "#DC4C3E", borderColor: "#DC4C3E" }}>
                  Confirm Void
                </Btn>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: CSV Import */}
      {showImportModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#FFF",
              borderRadius: 12,
              padding: 24,
              width: "100%",
              maxWidth: 540,
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: C.ink }}>Import Ledger CSV</div>
              <button
                onClick={() => { setShowImportModal(false); setImportResults(null); }}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: C.inkSoft }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 12.5, color: C.inkSoft, margin: "0 0 12px" }}>
              Upload or paste any CSV (including bank statements with Debit/Credit or custom headers). Our AI Schema Agent automatically maps columns to the ledger schema.
            </p>

            <input
              type="file"
              ref={csvFileRef}
              accept=".csv"
              style={{ display: "none" }}
              onChange={handleFileUpload}
            />

            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <Btn variant="secondary" onClick={() => csvFileRef.current?.click()} style={{ gap: 6 }}>
                <UploadCloud size={14} /> Choose CSV File
              </Btn>
              <Btn
                variant="ghost"
                onClick={() =>
                  setCsvText(
                    "transaction_date,entry_type,category,amount,description,contact_name\n2026-10-15,expense,inventory,45000,Bulk rice sack purchase,Al-Baraka Grain Mills\n2026-10-18,income,sales,120000,Weekend POS counter sales,Walk-in Customers"
                  )
                }
              >
                Load Sample
              </Btn>
            </div>

            <textarea
              rows={6}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="Paste raw CSV lines here..."
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: 8,
                border: `1px solid ${C.line}`,
                fontFamily: "monospace",
                fontSize: 12,
                marginBottom: 12,
              }}
            />

            {importResults && (
              <div style={{ background: "#F8FAFC", padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 12.5 }}>
                {importResults.mappingNotes && (
                  <div style={{ color: C.teal, fontWeight: 600, marginBottom: 4 }}>
                    {importResults.mappingNotes}
                  </div>
                )}
                <div style={{ fontWeight: 600, color: "#166534" }}>
                  Successfully imported: {importResults.imported_count} rows
                </div>
                {importResults.error_count > 0 && (
                  <div style={{ color: "#DC4C3E", marginTop: 4 }}>
                    Errors ({importResults.error_count}):
                    <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                      {importResults.errors.slice(0, 3).map((err, eIdx) => (
                        <li key={eIdx}>Row {err.row}: {err.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => { setShowImportModal(false); setImportResults(null); }}>
                Close
              </Btn>
              <Btn onClick={handleProcessCsv} disabled={importing}>
                {importing ? "Validating & Importing..." : "Execute Import"}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Executive Financial Report */}
      {showReportModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#FFF",
              borderRadius: 12,
              padding: 24,
              width: "100%",
              maxWidth: 580,
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: C.ink, display: "flex", alignItems: "center", gap: 6 }}>
                <Sparkles size={17} color={C.teal} /> Executive Financial Report
              </div>
              <button
                onClick={() => setShowReportModal(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: C.inkSoft }}
              >
                ✕
              </button>
            </div>

            {generatingReport ? (
              <div style={{ textAlign: "center", padding: "40px", color: C.inkSoft }}>
                Synthesizing narrative executive report...
              </div>
            ) : reportResult ? (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                  <div style={{ background: "#F8FAFC", padding: 12, borderRadius: 8 }}>
                    <div style={{ fontSize: 11.5, color: C.inkSoft }}>Total Revenue</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#166534" }}>
                      ₨{Number(reportResult.total_revenue || 0).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ background: "#F8FAFC", padding: 12, borderRadius: 8 }}>
                    <div style={{ fontSize: 11.5, color: C.inkSoft }}>Total Expenses</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#DC4C3E" }}>
                      ₨{Number(reportResult.total_expense || 0).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ background: "#F8FAFC", padding: 12, borderRadius: 8 }}>
                    <div style={{ fontSize: 11.5, color: C.inkSoft }}>Health Score</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.teal }}>
                      {reportResult.financial_health_score}/100
                    </div>
                  </div>
                </div>

                <div style={{ fontWeight: 600, fontSize: 13, color: C.ink, marginBottom: 6 }}>
                  AI Narrative Analysis:
                </div>
                <div
                  style={{
                    background: "#F1F5F9",
                    padding: 14,
                    borderRadius: 8,
                    fontSize: 12.5,
                    lineHeight: 1.6,
                    color: C.ink,
                    marginBottom: 16,
                  }}
                >
                  {reportResult.narrative_summary}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Btn onClick={() => setShowReportModal(false)}>Close Report</Btn>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </ViewWrap>
  );
}
