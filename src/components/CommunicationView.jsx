import React, { useState } from "react";
import { Send, RefreshCcw } from "lucide-react";
import { C } from "../data/constants.js";
import { useAppState } from "../context/AppStateContext.jsx";
import { Card, Btn, Badge } from "./Primitives.jsx";
import ViewWrap from "./ViewWrap.jsx";

export default function CommunicationView({ showToast }) {
  const { state, dispatch } = useAppState();
  const drafts = state.drafts;
  const [selectedId, setSelectedId] = useState(drafts[0]?.id);
  const [tab, setTab] = useState("unsent");
  const selected = drafts.find((d) => d.id === selectedId) || drafts[0];
  const visible = drafts.filter((d) => (tab === "unsent" ? !d.sent : d.sent));

  const updateText = (text) => dispatch({ type: "UPDATE_DRAFT_TEXT", id: selected.id, text });
  const regenerate = () => { updateText(selected.text + " (Vantage suggests keeping it under two lines for a higher reply rate.)"); showToast("Draft regenerated."); };
  const sendDraft = () => { dispatch({ type: "SEND_DRAFT", id: selected.id }); showToast(`Sent to ${selected.customer}.`); };

  return (
    <ViewWrap title="Customer Communication" subtitle="Drafted from each customer's order history — nothing sends without your review.">
      <div style={{ display: "flex", gap: 4, background: C.bg, borderRadius: 10, padding: 4, marginBottom: 14, width: "fit-content" }}>
        {[{ id: "unsent", label: "Unsent" }, { id: "sent", label: "Sent history" }].map((tb) => (
          <button key={tb.id} className="vantage-focus" onClick={() => setTab(tb.id)} style={{
            padding: "7px 14px", borderRadius: 8, border: "none", fontSize: 12.5, fontWeight: 700,
            background: tab === tb.id ? "#fff" : "transparent", color: tab === tb.id ? C.navy : C.inkFaint,
          }}>{tb.label} ({drafts.filter((d) => (tb.id === "unsent" ? !d.sent : d.sent)).length})</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16 }} className="vantage-grid-2">
        <Card style={{ padding: 8 }}>
          {visible.length === 0 && <div style={{ padding: 12, fontSize: 13, color: C.inkFaint }}>Nothing here yet.</div>}
          {visible.map((d) => (
            <button key={d.id} className="vantage-focus" onClick={() => setSelectedId(d.id)} style={{
              display: "block", width: "100%", textAlign: "left", padding: 12, borderRadius: 10, border: "none",
              background: selectedId === d.id ? C.bg : "transparent", marginBottom: 4,
            }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{d.customer}</div>
              <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 2 }}>{d.type}</div>
              {d.sent && <Badge tone="ok">Sent</Badge>}
            </button>
          ))}
        </Card>
        {selected && (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{selected.customer}</div>
                <div style={{ fontSize: 12, color: C.inkFaint }}>{selected.type} · drafted using purchase history context</div>
              </div>
              {selected.sent && <Badge tone="ok">Sent</Badge>}
            </div>
            <textarea value={selected.text} disabled={selected.sent} onChange={(e) => updateText(e.target.value)} rows={6}
              className="vantage-focus" style={{ width: "100%", padding: 14, borderRadius: 10, border: `1.5px solid ${C.line}`, fontSize: 14, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <Btn variant="ghost" onClick={regenerate} disabled={selected.sent}><RefreshCcw size={14} /> Regenerate</Btn>
              <Btn variant="primary" onClick={sendDraft} disabled={selected.sent}><Send size={14} /> {selected.sent ? "Sent" : "Send"}</Btn>
            </div>
          </Card>
        )}
      </div>
    </ViewWrap>
  );
}
