import { useState, useMemo } from "react";
import { TagInput, S } from "./shared.jsx";

export default function OverviewModule({ overview, onChange, allData, onNavigate }) {
  const [editing, setEditing] = useState(false);
  const set = (k, v) => onChange({ ...overview, [k]: v });

  const counts = useMemo(() => ({
    events: allData.events?.length || 0,
    species: allData.species?.length || 0,
    factions: allData.factions?.length || 0,
    technology: allData.technology?.length || 0,
    locations: allData.locations?.length || 0,
    lore: allData.lore?.length || 0,
  }), [allData]);

  const totalEntities = Object.values(counts).reduce((a, b) => a + b, 0);

  if (editing) {
    return (
      <div style={{ flex:1, overflowY:"auto", padding:"32px 40px", maxWidth:800 }}>
        <div style={{ marginBottom:20 }}>
          <label style={S.label}>Title</label>
          <input value={overview.title} onChange={e => set("title", e.target.value)} style={{ ...S.input, fontFamily:"var(--font-heading)", fontSize:22, fontWeight:700, padding:"12px 16px" }} placeholder="Name your universe…" autoFocus />
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={S.label}>Subtitle</label>
          <input value={overview.subtitle} onChange={e => set("subtitle", e.target.value)} style={{ ...S.input, fontSize:15 }} placeholder="A tagline or elevator pitch" />
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={S.label}>Body</label>
          <textarea value={overview.body} onChange={e => set("body", e.target.value)} style={{ ...S.input, minHeight:280, resize:"vertical", fontFamily:"var(--font-body)", fontSize:14, lineHeight:1.7 }} placeholder="The premise, the tone, the ground rules, the big picture — whatever you need to set the stage." />
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={S.label}>Author Notes</label>
          <textarea value={overview.notes} onChange={e => set("notes", e.target.value)} style={{ ...S.input, minHeight:100, resize:"vertical", fontFamily:"var(--font-mono)", fontSize:12, lineHeight:1.6 }} placeholder="Scratchpad for things that aren't lore — reminders, TODOs, open questions…" />
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={S.label}>Tags</label>
          <TagInput tags={overview.tags} onChange={v => set("tags", v)} placeholder="e.g. hard-sf, space-opera, grimdark" />
        </div>
        <button onClick={() => setEditing(false)} style={S.saveBtn}>Done</button>
      </div>
    );
  }

  // ── Display mode ──
  const hasContent = overview.title || overview.body;

  return (
    <div style={{ flex:1, overflowY:"auto" }}>
      <div style={{ padding:"40px 48px", maxWidth:800 }}>
        {/* Title area */}
        <div style={{ marginBottom:32 }}>
          {overview.title ? (
            <h1 style={{ fontFamily:"var(--font-heading)", fontSize:32, fontWeight:700, color:"var(--text-primary)", margin:0, letterSpacing:2, lineHeight:1.2 }}>{overview.title}</h1>
          ) : (
            <h1 style={{ fontFamily:"var(--font-heading)", fontSize:32, fontWeight:700, color:"var(--text-faint)", margin:0, letterSpacing:2, lineHeight:1.2, fontStyle:"italic" }}>Untitled World</h1>
          )}
          {overview.subtitle && (
            <p style={{ fontFamily:"var(--font-body)", fontSize:16, color:"var(--text-secondary)", marginTop:8, lineHeight:1.5, fontStyle:"italic" }}>{overview.subtitle}</p>
          )}
          {overview.tags?.length > 0 && (
            <div style={{ display:"flex", gap:6, marginTop:12, flexWrap:"wrap" }}>
              {overview.tags.map((tag, i) => (
                <span key={i} style={{ padding:"3px 10px", border:"1px solid var(--border)", borderRadius:3, fontSize:11, fontFamily:"var(--font-mono)", color:"var(--text-muted)", letterSpacing:0.5 }}>{tag}</span>
              ))}
            </div>
          )}
        </div>

        {/* Stats bar */}
        <div style={{ display:"flex", gap:12, marginBottom:32, flexWrap:"wrap" }}>
          {[
            ["Events", counts.events, "⟐", "timeline"],
            ["Species", counts.species, "◈", "species"],
            ["Factions", counts.factions, "⚑", "factions"],
            ["Technology", counts.technology, "⚙", "technology"],
            ["Locations", counts.locations, "◎", "locations"],
            ["Lore", counts.lore, "✦", "lore"],
          ].map(([label, count, icon, moduleId]) => (
            <div key={label} onClick={() => onNavigate && onNavigate(moduleId)} style={{ padding:"10px 16px", border:"1px solid var(--border-faint)", borderRadius:6, background:"var(--bg-panel)", minWidth:100, flex:"1 1 100px", cursor: onNavigate ? "pointer" : "default", transition:"all 0.15s", boxShadow: "none" }} onMouseEnter={e => { if(onNavigate) e.currentTarget.style.boxShadow = "0 2px 8px var(--shadow-hover)"; e.currentTarget.style.borderColor = "var(--border)"; }} onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "var(--border-faint)"; }}>
              <div style={{ fontSize:11, color:"var(--text-dim)", fontFamily:"var(--font-mono)", textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>
                <span style={{ marginRight:6, opacity:0.6 }}>{icon}</span>{label}
              </div>
              <div style={{ fontSize:22, fontWeight:700, color: count > 0 ? "var(--accent)" : "var(--text-faint)", fontFamily:"var(--font-heading)" }}>{count}</div>
            </div>
          ))}
        </div>

        {/* Body */}
        {overview.body ? (
          <div style={{ fontFamily:"var(--font-body)", fontSize:15, color:"var(--text-body)", lineHeight:1.8, whiteSpace:"pre-wrap", marginBottom:32 }}>{overview.body}</div>
        ) : (
          <div style={{ padding:"48px 24px", border:"1px dashed var(--border)", borderRadius:8, textAlign:"center", marginBottom:32 }}>
            <p style={{ color:"var(--text-faint)", fontFamily:"var(--font-mono)", fontSize:13, marginBottom:12 }}>This is your universe's front page.</p>
            <p style={{ color:"var(--text-dimmer)", fontFamily:"var(--font-mono)", fontSize:12, lineHeight:1.6 }}>Click "Edit" to set the title, describe the premise, and make it yours.</p>
          </div>
        )}

        {/* Notes (author-facing) */}
        {overview.notes && (
          <div style={{ padding:"16px 20px", border:"1px solid var(--border-faint)", borderRadius:6, background:"var(--bg-input)", marginBottom:32 }}>
            <h4 style={{ ...S.sectionHead, marginBottom:8 }}>Author Notes</h4>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:12, color:"var(--text-muted)", lineHeight:1.6, whiteSpace:"pre-wrap" }}>{overview.notes}</div>
          </div>
        )}

        {/* Edit button */}
        <button onClick={() => setEditing(true)} style={{ ...S.addBtn, fontSize:14, padding:"10px 24px" }}>Edit Overview</button>
      </div>
    </div>
  );
}
