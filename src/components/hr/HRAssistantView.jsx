import React, { useState, useEffect } from "react";
import { MessageSquare, Upload, Trash2, BookOpen, Send, Sparkles, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { C } from "../../data/constants.js";
import { Card, Btn, Badge } from "../Primitives.jsx";
import ViewWrap from "../ViewWrap.jsx";
import { hrListPolicies, hrUploadPolicy, hrDeletePolicy, hrAskAssistant, accountGetBilling } from "../../utils/api.js";

export default function HRAssistantView({ showToast, role }) {
  const isManagement = ["owner", "manager", "hr_officer"].includes(role);

  const [policies, setPolicies] = useState([]);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hello! I am your AI HR Assistant. You can ask me questions about company policies, leave entitlements, code of conduct, or compensation guidelines. How can I assist you today?",
      sources: [],
    },
  ]);
  const [inputQuestion, setInputQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [billingInfo, setBillingInfo] = useState(null);

  // Policy upload state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadDocName, setUploadDocName] = useState("");
  const [uploadContent, setUploadContent] = useState("");
  const [uploading, setUploading] = useState(false);

  const loadData = async () => {
    try {
      const [polList, bill] = await Promise.all([
        hrListPolicies().catch(() => []),
        accountGetBilling().catch(() => null),
      ]);
      setPolicies(polList || []);
      setBillingInfo(bill);
    } catch {
      // fallback
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAsk = async (e) => {
    e.preventDefault();
    const query = inputQuestion.trim();
    if (!query || asking) return;

    const newMsgs = [...messages, { role: "user", content: query }];
    setMessages(newMsgs);
    setInputQuestion("");
    setAsking(true);

    try {
      const res = await hrAskAssistant(query);
      setMessages([
        ...newMsgs,
        {
          role: "assistant",
          content: res.answer,
          sources: res.sources || [],
        },
      ]);
      if (res.ai_queries_remaining !== undefined && billingInfo) {
        setBillingInfo((b) => (b ? { ...b, ai_queries_remaining: res.ai_queries_remaining, queries_remaining: res.ai_queries_remaining } : b));
      }
    } catch (err) {
      setMessages([
        ...newMsgs,
        {
          role: "assistant",
          content: `Sorry, an error occurred: ${err.message || "Failed to query HR assistant."}`,
          sources: [],
        },
      ]);
    } finally {
      setAsking(false);
    }
  };

  const handleUploadPolicy = async (e) => {
    e.preventDefault();
    if (!uploadDocName || !uploadContent) {
      showToast("Please provide both document name and policy text.");
      return;
    }
    try {
      setUploading(true);
      await hrUploadPolicy(uploadDocName, uploadContent);
      showToast("Policy document chunked and vectorized successfully into pgvector.");
      setShowUploadModal(false);
      setUploadDocName("");
      setUploadContent("");
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to upload and vectorize policy document.");
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePolicy = async (docName) => {
    if (!window.confirm(`Delete "${docName}" from policy knowledge base?`)) return;
    try {
      await hrDeletePolicy(docName);
      showToast("Policy document chunks removed.");
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to delete policy.");
    }
  };

  return (
    <ViewWrap
      title="HR Policy Intelligence & Grounded Assistant (FR-5.5)"
      subtitle="Grounded Q&A powered by Supabase pgvector embeddings. Strictly retrieves approved enterprise policies."
    >
      <div style={{ display: "grid", gridTemplateColumns: isManagement ? "320px 1fr" : "1fr", gap: 20 }}>
        {/* Left: Document Manager (For HR/Management) */}
        {isManagement && (
          <div>
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.ink, display: "flex", alignItems: "center", gap: 6 }}>
                  <BookOpen size={16} color={C.teal} /> Policy Knowledge
                </div>
                <Btn size="sm" onClick={() => setShowUploadModal(true)} style={{ gap: 4 }}>
                  <Upload size={13} /> Add Doc
                </Btn>
              </div>

              {policies.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 10px", color: C.inkSoft, fontSize: 12.5 }}>
                  <FileText size={24} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
                  <div>No policy documents uploaded.</div>
                  <p style={{ margin: "4px 0 0", color: C.inkLighter, fontSize: 11.5 }}>
                    Upload employee handbooks, leave rules, or code of conduct.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {policies.map((p) => (
                    <div
                      key={p.document_name}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: "#F8FAFC",
                        border: `1px solid ${C.line}`,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ minWidth: 0, paddingRight: 8 }}>
                        <div style={{ fontWeight: 600, fontSize: 12.5, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {p.document_name}
                        </div>
                        <div style={{ fontSize: 11, color: C.inkSoft }}>
                          {p.chunks_count || 1} chunk(s) &bull; pgvector
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeletePolicy(p.document_name)}
                        title="Delete Document"
                        style={{ border: "none", background: "transparent", color: "#DC4C3E", cursor: "pointer", padding: 4 }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* AI Meter Quick Status */}
            {billingInfo && (() => {
              const allowance = Number(billingInfo.ai_query_allowance ?? billingInfo.query_allowance ?? 0);
              const used = Number(billingInfo.ai_queries_used ?? billingInfo.queries_used ?? 0);
              const remaining = Number(billingInfo.ai_queries_remaining ?? billingInfo.queries_remaining ?? Math.max(0, allowance - used));
              return (
                <Card>
                  <div style={{ fontWeight: 600, fontSize: 12.5, color: C.inkSoft, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <Sparkles size={14} color={C.teal} /> AI Query Allowance
                  </div>
                  <div style={{ fontSize: 13, color: C.ink }}>
                    Remaining: <strong>{remaining}</strong> / {allowance} queries
                  </div>
                  <div style={{ width: "100%", background: "#E5E8F0", height: 6, borderRadius: 3, marginTop: 8, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, (used / (allowance || 1)) * 100)}%`,
                        background: C.teal,
                      }}
                    />
                  </div>
                </Card>
              );
            })()}
          </div>
        )}

        {/* Right: Grounded Assistant Chat */}
        <Card style={{ display: "flex", flexDirection: "column", height: 600 }}>
          <div style={{ fontWeight: 700, fontSize: 15, paddingBottom: 12, borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 8 }}>
            <MessageSquare size={17} color={C.teal} /> HR Policy Assistant (RAG)
          </div>

          {/* Messages Stream */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 0", display: "flex", flexDirection: "column", gap: 14 }}>
            {messages.map((m, idx) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isUser ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "85%",
                      padding: "10px 14px",
                      borderRadius: 12,
                      fontSize: 13,
                      lineHeight: 1.5,
                      background: isUser ? C.teal : "#F1F5F9",
                      color: isUser ? "#FFF" : C.ink,
                      borderBottomRightRadius: isUser ? 2 : 12,
                      borderBottomLeftRadius: isUser ? 12 : 2,
                    }}
                  >
                    {m.content}
                  </div>

                  {m.sources && m.sources.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 11, color: C.inkLighter, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span>Sources:</span>
                      {m.sources.map((s, sIdx) => (
                        <span key={sIdx} style={{ background: "#E2E8F0", padding: "1px 6px", borderRadius: 4, color: C.inkSoft }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {asking && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.inkSoft, fontSize: 12.5, fontStyle: "italic" }}>
                <Sparkles size={14} color={C.teal} className="animate-spin" /> Searching policy vector store & formulating answer...
              </div>
            )}
          </div>

          {/* Chat Input */}
          <form onSubmit={handleAsk} style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12, display: "flex", gap: 10 }}>
            <input
              type="text"
              placeholder="e.g. How many annual leaves am I entitled to? What is the sick leave policy?"
              value={inputQuestion}
              onChange={(e) => setInputQuestion(e.target.value)}
              disabled={asking}
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: 8,
                border: `1px solid ${C.line}`,
                fontSize: 13,
              }}
            />
            <Btn type="submit" disabled={asking || !inputQuestion.trim()} style={{ gap: 6 }}>
              <Send size={14} /> Ask
            </Btn>
          </form>
        </Card>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
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
              maxWidth: 520,
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: C.ink }}>Upload Enterprise Policy Document</div>
              <button
                onClick={() => setShowUploadModal(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: C.inkSoft }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadPolicy} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  Document Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Annual Leave Policy 2026, Code of Business Conduct"
                  value={uploadDocName}
                  onChange={(e) => setUploadDocName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${C.line}`,
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  Policy Content / Text
                </label>
                <textarea
                  rows={8}
                  required
                  placeholder="Paste the full text or markdown of your company policy here. The system will chunk and generate 1536-dimensional vector embeddings for cosine retrieval."
                  value={uploadContent}
                  onChange={(e) => setUploadContent(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: 8,
                    border: `1px solid ${C.line}`,
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    resize: "vertical",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
                <Btn variant="secondary" type="button" onClick={() => setShowUploadModal(false)}>
                  Cancel
                </Btn>
                <Btn type="submit" disabled={uploading}>
                  {uploading ? "Chunking & Vectorizing..." : "Process & Save"}
                </Btn>
              </div>
            </form>
          </div>
        </div>
      )}
    </ViewWrap>
  );
}
