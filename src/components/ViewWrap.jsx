import React from "react";

export default function ViewWrap({ title, subtitle, children }) {
  return (
    <div className="vantage-scroll anim-in" style={{ padding: "26px 28px", overflowY: "auto", height: "calc(100vh - 61px)" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 className="font-display" style={{ fontSize: 24, fontWeight: 600, marginBottom: 3 }}>{title}</h1>
        <p style={{ color: "#5B6172", fontSize: 14, marginBottom: 18 }}>{subtitle}</p>
        {children}
      </div>
    </div>
  );
}
