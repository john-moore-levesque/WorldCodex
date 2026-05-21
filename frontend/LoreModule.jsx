import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { uid, ImageUpload, MarkdownBody, S, entitySlug, findBySlugOrId } from "./shared.jsx";

// ─── Constants ───────────────────────────────────────────────────────────────

export const LORE_CANON_STATUSES = ["confirmed", "speculative", "retconned"];

const CANON_COLORS = {
  confirmed:   "var(--success)",
  speculative: "var(--warning)",
  retconned:   "var(--text-dim)",
};

const CANON_ICONS = {
  confirmed:   "◉",
  speculative: "◎",
  retconned:   "⊘",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function CanonBadge({ status }) {
  const color = CANON_COLORS[status] || "var(--text-dim)";
  const icon  = CANON_ICONS[status]  || "○";
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:4,
      padding:"2px 8px", borderRadius:3, fontSize:10,
      fontFamily:"var(--font-mono)", letterSpacing:1, textTransform:"uppercase",
      border:`1px solid ${color}`,
      color,
      background:`color-mix(in srgb, ${color} 12%, transparent)`,
    }}>
      {icon} {status}
    </span>
  );
}

// ─── CrossModule (local copies) ───────────────────────────────────────────────

function CrossModuleLinkEditor({ links, allData, onChange }) {
  const [search, setSearch] = useState("");
  const allEntities = useMemo(() => {
    const out = [];
    const add = (type, items, nameKey) => (items||[]).forEach(i => out.push({ type, id: i.id, name: i[nameKey] || i.title || i.label || i.id }));
    add("event",    allData.events,    "title");
    add("species",  allData.species,   "name");
    add("faction",  allData.factions,  "name");
    add("tech",     allData.technology,"name");
    add("location", allData.locations, "name");
    add("lore",     allData.lore,      "title");
    return out;
  }, [allData]);
  const linkedIds = new Set((links||[]).map(l => `${l.type}:${l.id}`));
  const filtered = search ? allEntities.filter(e => !linkedIds.has(`${e.type}:${e.id}`) && e.name.toLowerCase().includes(search.toLowerCase())) : [];
  const linkChip = { padding:"4px 10px", border:"1px solid var(--accent)", borderRadius:3, cursor:"pointer", fontFamily:"var(--font-body)", fontSize:12, display:"flex", alignItems:"center", background:"var(--accent-bg)", color:"var(--accent)" };
  return (
    <div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:8 }}>
        {(links||[]).map((l, i) => {
          const entity = allEntities.find(e => e.type === l.type && e.id === l.id);
          return (
            <span key={i} style={linkChip}>
              <span style={{ fontSize:9, textTransform:"uppercase", opacity:0.7, marginRight:4 }}>{l.type}</span>
              {entity?.name || l.id}
              <button onClick={() => onChange(links.filter((_,j) => j !== i))} style={{ background:"none", border:"none", color:"var(--accent)", cursor:"pointer", marginLeft:4, fontSize:12, padding:0 }}>✕</button>
            </span>
          );
        })}
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)} style={{ ...S.input, fontSize:12 }} placeholder="Search entities to link…" />
      {filtered.length > 0 && (
        <div style={{ maxHeight:120, overflowY:"auto", border:"1px solid var(--border)", borderRadius:4, marginTop:4 }}>
          {filtered.slice(0,20).map(e => (
            <button key={`${e.type}:${e.id}`} onClick={() => { onChange([...(links||[]), { type:e.type, id:e.id }]); setSearch(""); }}
              style={{ display:"block", width:"100%", textAlign:"left", padding:"4px 8px", border:"none", background:"transparent", color:"var(--text-body)", cursor:"pointer", fontSize:12, fontFamily:"inherit" }}
              onMouseEnter={ev => ev.currentTarget.style.background="var(--bg-hover)"} onMouseLeave={ev => ev.currentTarget.style.background="transparent"}>
              <span style={{ fontSize:9, textTransform:"uppercase", color:"var(--text-dim)", marginRight:6 }}>{e.type}</span>{e.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CrossModuleLinksDisplay({ links, allData, onNavigate }) {
  const allEntities = useMemo(() => {
    const out = [];
    const add = (type, items, nameKey) => (items||[]).forEach(i => out.push({ type, id: i.id, name: i[nameKey] || i.title || i.label || i.id }));
    add("event",    allData.events,    "title");
    add("species",  allData.species,   "name");
    add("faction",  allData.factions,  "name");
    add("tech",     allData.technology,"name");
    add("location", allData.locations, "name");
    add("lore",     allData.lore,      "title");
    return out;
  }, [allData]);
  if (!links?.length) return null;
  return (
    <div style={{ marginTop:16 }}>
      <h4 style={S.sectionHead}>Linked Entities</h4>
      {links.map((l, i) => {
        const entity = allEntities.find(e => e.type === l.type && e.id === l.id);
        return (
          <button key={i} onClick={() => onNavigate(l.type, l.id)} style={S.linkedEvent}>
            <span style={{ fontSize:9, textTransform:"uppercase", color:"var(--accent)", fontFamily:"var(--font-mono)", marginRight:8, letterSpacing:1 }}>{l.type}</span>
            {entity?.name || l.id}
          </button>
        );
      })}
    </div>
  );
}

// ─── Lore tree helpers ────────────────────────────────────────────────────────

function buildTree(lore) {
  const map = {};
  (lore||[]).forEach(e => { map[e.id] = { ...e, children: [] }; });
  const roots = [];
  Object.values(map).forEach(e => {
    if (e.parent && map[e.parent]) map[e.parent].children.push(e);
    else roots.push(e);
  });
  const sort = arr => arr.sort((a,b) => a.title.localeCompare(b.title));
  const sortDeep = nodes => { sort(nodes); nodes.forEach(n => sortDeep(n.children)); return nodes; };
  return sortDeep(roots);
}

function flattenVisible(nodes, expanded) {
  const out = [];
  const walk = (nodes, depth) => {
    nodes.forEach(n => {
      out.push({ ...n, depth });
      if (n.children.length > 0 && expanded.has(n.id)) walk(n.children, depth + 1);
    });
  };
  walk(nodes, 0);
  return out;
}

// ─── Lore Modal ───────────────────────────────────────────────────────────────

function LoreModal({ entity, lore, allData, apiPost, onSave, onDelete, onClose }) {
  const isNew = !entity;
  const [form, setForm] = useState(() => entity || {
    id: uid(), title: "", body: "", tags: [],
    canonStatus: "confirmed", parent: null, imageUrl: "", crossModuleLinks: [],
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [tagInput, setTagInput] = useState("");

  const addTag = () => {
    const v = tagInput.trim();
    if (v && !(form.tags||[]).includes(v)) set("tags", [...(form.tags||[]), v]);
    setTagInput("");
  };

  const otherEntries = (lore||[]).filter(e => e.id !== form.id);

  return (
    <div style={S.overlay}>
      <div style={{ ...S.modal, maxWidth:640, maxHeight:"92vh" }}>
        <div style={S.modalHeader}>
          <span style={S.modalHeaderDecor} />
          <h2 style={S.modalTitle}>{isNew ? "New Lore Entry" : "Edit Lore Entry"}</h2>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.modalBody}>

          <div style={S.fieldRow}>
            <label style={S.label}>Title</label>
            <input value={form.title} onChange={e => set("title", e.target.value)} style={S.input} autoFocus />
          </div>

          <div style={{ display:"flex", gap:14 }}>
            <div style={{ ...S.fieldRow, flex:1 }}>
              <label style={S.label}>Canon Status</label>
              <select value={form.canonStatus} onChange={e => set("canonStatus", e.target.value)} style={S.select}>
                {LORE_CANON_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ ...S.fieldRow, flex:2 }}>
              <label style={S.label}>Parent Entry</label>
              <select value={form.parent||""} onChange={e => set("parent", e.target.value || null)} style={S.select}>
                <option value="">— None (top-level) —</option>
                {otherEntries.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </div>
          </div>

          <div style={S.fieldRow}>
            <label style={S.label}>Body</label>
            <textarea
              value={form.body}
              onChange={e => set("body", e.target.value)}
              style={{ ...S.input, minHeight:200, resize:"vertical", fontFamily:"inherit", lineHeight:1.7 }}
              placeholder="The lore text…"
            />
            <div style={S.mdHint}>Markdown: **bold** *italic* - list ## heading &gt; blockquote</div>
          </div>

          <div style={S.fieldRow}>
            <label style={S.label}>Tags</label>
            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:4 }}>
              {(form.tags||[]).map((t,i) => (
                <span key={i} style={{ padding:"2px 8px", border:"1px solid var(--border)", borderRadius:3, fontSize:11, color:"var(--text-secondary)", display:"flex", alignItems:"center", gap:4 }}>
                  {t}
                  <button onClick={() => set("tags", form.tags.filter((_,j)=>j!==i))} style={{ background:"none", border:"none", color:"var(--text-dim)", cursor:"pointer", fontSize:10, padding:0 }}>✕</button>
                </span>
              ))}
            </div>
            <div style={{ display:"flex", gap:4 }}>
              <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())} style={{ ...S.input, flex:1, fontSize:12 }} placeholder="Add tag…" />
              <button onClick={addTag} style={{ ...S.ioBtn, fontSize:11 }}>+</button>
            </div>
          </div>

          <div style={S.fieldRow}>
            <label style={S.label}>Image</label>
            <ImageUpload imageUrl={form.imageUrl} onUpload={url => set("imageUrl", url)} entityType="lore" entityId={form.id} apiPost={apiPost} />
          </div>

          <div style={S.fieldRow}>
            <label style={S.label}>Cross-Module Links</label>
            <CrossModuleLinkEditor links={form.crossModuleLinks} allData={allData} onChange={v => set("crossModuleLinks", v)} />
          </div>

        </div>
        <div style={S.modalFooter}>
          {!isNew && <button style={S.deleteBtn} onClick={() => onDelete(form.id)}>Delete</button>}
          <div style={{ flex:1 }} />
          <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={S.saveBtn} onClick={() => onSave(form)} disabled={!form.title.trim()}>
            {isNew ? "Add" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tree row ─────────────────────────────────────────────────────────────────

function LoreTreeRow({ entry, depth, isSelected, isExpanded, onSelect, onEdit, onToggle }) {
  const hasChildren = entry.children?.length > 0;
  const color = CANON_COLORS[entry.canonStatus] || "var(--text-dim)";

  return (
    <div
      onClick={() => onSelect(isSelected ? null : entry)}
      style={{
        display:"flex", alignItems:"center", gap:8,
        padding:"8px 14px",
        paddingLeft: 14 + depth * 20,
        marginBottom:1, cursor:"pointer",
        borderLeft:`3px solid ${color}`,
        borderRadius:"0 4px 4px 0",
        background: isSelected ? "var(--bg-selected)" : "transparent",
        transition:"background 0.15s",
        animation:"fadeIn 0.2s ease",
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background="var(--bg-hover)"; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background="transparent"; }}
    >
      {/* Expand toggle */}
      <button
        onClick={e => { e.stopPropagation(); if (hasChildren) onToggle(entry.id); }}
        style={{
          width: 18, height: 18, padding: 0,
          border: hasChildren ? "1.5px solid var(--text-muted)" : "1px dashed var(--border-subtle)",
          borderRadius: 2,
          background: hasChildren && isExpanded ? "var(--text-primary)" : "var(--bg-main)",
          color:      hasChildren && isExpanded ? "var(--bg-main)"      : "var(--text-primary)",
          cursor: hasChildren ? "pointer" : "default",
          flexShrink: 0,
          fontFamily: "var(--font-mono)",
          fontSize: 11, fontWeight: 700, lineHeight: 1,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {hasChildren ? (isExpanded ? "−" : "+") : ""}
      </button>

      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:600, fontSize:14, color:"var(--text-primary)", fontFamily:"var(--font-heading)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {entry.title}
        </div>
        <div style={{ display:"flex", gap:6, marginTop:2, alignItems:"center" }}>
          <span style={{ ...S.microTag, color }}>{CANON_ICONS[entry.canonStatus]} {entry.canonStatus}</span>
          {entry.tags?.length > 0 && entry.tags.slice(0,3).map((t,i) => (
            <span key={i} style={S.microTag}>{t}</span>
          ))}
          {entry.children?.length > 0 && (
            <span style={{ ...S.microTag, color:"var(--text-faint)" }}>{entry.children.length} sub-entr{entry.children.length === 1 ? "y" : "ies"}</span>
          )}
        </div>
      </div>

      <button
        style={{ width:28, height:28, border:"1px solid var(--border)", borderRadius:4, background:"transparent", color:"var(--text-muted)", cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}
        onClick={e => { e.stopPropagation(); onEdit(entry); }}
      >✎</button>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function LoreModule({ lore, onSave, onDelete, allData, onNavigate, apiPost }) {
  const { id: selectedId } = useParams();
  const navigate = useNavigate();
  const selected = findBySlugOrId(lore, selectedId);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(new Set());

  // Canon status visibility toggles — all on by default
  const [showConfirmed,   setShowConfirmed]   = useState(true);
  const [showSpeculative, setShowSpeculative] = useState(true);
  const [showRetconned,   setShowRetconned]   = useState(true);

  const toggleExpand = (id) => setExpanded(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  // Filter by canon status and search
  const visibleStatuses = useMemo(() => {
    const s = new Set();
    if (showConfirmed)   s.add("confirmed");
    if (showSpeculative) s.add("speculative");
    if (showRetconned)   s.add("retconned");
    return s;
  }, [showConfirmed, showSpeculative, showRetconned]);

  // For search: flatten all lore, filter, then show only matching + their ancestors
  const filteredLore = useMemo(() => {
    const all = lore || [];
    const statusFiltered = all.filter(e => visibleStatuses.has(e.canonStatus));
    if (!search.trim()) return statusFiltered;
    const q = search.toLowerCase();
    const matched = new Set(statusFiltered.filter(e =>
      e.title?.toLowerCase().includes(q) || e.body?.toLowerCase().includes(q) || e.tags?.some(t => t.toLowerCase().includes(q))
    ).map(e => e.id));
    // include ancestors of matched entries so tree structure is preserved
    const withAncestors = new Set(matched);
    all.forEach(e => { if (matched.has(e.id) && e.parent) withAncestors.add(e.parent); });
    return statusFiltered.filter(e => withAncestors.has(e.id));
  }, [lore, search, visibleStatuses]);

  const tree = useMemo(() => buildTree(filteredLore), [filteredLore]);

  // Auto-expand all when searching
  const effectiveExpanded = useMemo(() => {
    if (search.trim()) {
      return new Set((lore||[]).map(e => e.id));
    }
    return expanded;
  }, [search, lore, expanded]);

  const flat = useMemo(() => flattenVisible(tree, effectiveExpanded), [tree, effectiveExpanded]);

  // ─── Detail view ───────────────────────────────────────────
  if (selectedId && !selected) {
    return (
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12 }}>
        <span style={S.empty}>Lore entry not found.</span>
        <button style={S.ioBtn} onClick={() => navigate("/lore")}>← Back to Lore</button>
      </div>
    );
  }
  if (selected) {
    const children = (lore||[]).filter(e => e.parent === selected.id);
    const parent = selected.parent ? (lore||[]).find(e => e.id === selected.parent) : null;
    return (
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--border-faint)", display:"flex", gap:8, alignItems:"center" }}>
          <button style={S.ioBtn} onClick={() => navigate("/lore")}>← Lore</button>
          <div style={{ flex:1 }} />
          <button style={S.panelBtn} onClick={() => setEditing(selected)}>Edit</button>
        </div>
        <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"20px 32px", maxWidth:920, alignSelf:"center", width:"100%", boxSizing:"border-box" }}>
          {selected.imageUrl && <img src={selected.imageUrl} alt="" style={{ width:"100%", borderRadius:4, marginBottom:12, display:"block" }} />}
          <h2 style={S.detailTitle}>{selected.title}</h2>
          <div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
            <CanonBadge status={selected.canonStatus} />
            {parent && (
              <button onClick={() => navigate(`/lore/${entitySlug(parent)}`)} style={{ ...S.ioBtn, fontSize:11 }}>↑ {parent.title}</button>
            )}
          </div>
          {selected.tags?.length > 0 && (
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:8 }}>
              {selected.tags.map((t,i) => <span key={i} style={{ ...S.microTag, border:"1px solid var(--border)", padding:"2px 6px", borderRadius:3 }}>{t}</span>)}
            </div>
          )}
          {selected.body && <MarkdownBody style={{ lineHeight:1.7, marginTop:14 }}>{selected.body}</MarkdownBody>}
          {children.length > 0 && (
            <div style={{ marginTop:16 }}>
              <h4 style={S.sectionHead}>Sub-entries</h4>
              {children.map(c => (
                <button key={c.id} onClick={() => navigate(`/lore/${entitySlug(c)}`)} style={{ ...S.linkedEvent, borderLeftColor: CANON_COLORS[c.canonStatus] }}>
                  <span style={{ fontSize:9, textTransform:"uppercase", color: CANON_COLORS[c.canonStatus], fontFamily:"var(--font-mono)", marginRight:8 }}>
                    {CANON_ICONS[c.canonStatus]} {c.canonStatus}
                  </span>
                  {c.title}
                </button>
              ))}
            </div>
          )}
          <CrossModuleLinksDisplay links={selected.crossModuleLinks} allData={allData} onNavigate={onNavigate} />
        </div>
        {(editing !== null && editing !== undefined) && (
          <LoreModal entity={editing} lore={lore} allData={allData} apiPost={apiPost}
            onSave={e => { onSave(e); setEditing(null); }}
            onDelete={id => { onDelete(id); setEditing(null); navigate("/lore"); }}
            onClose={() => setEditing(null)} />
        )}
      </div>
    );
  }

  // ─── List view (tree) ──────────────────────────────────────
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--border-faint)", display:"flex", gap:8, alignItems:"center" }}>
        <input style={{ ...S.input, flex:1, maxWidth:480 }} placeholder="Search lore…" value={search} onChange={e => setSearch(e.target.value)} />
        <button style={S.addBtn} onClick={() => setEditing(undefined)}>+ Entry</button>
      </div>
      <div style={{ padding:"8px 16px", display:"flex", gap:6, flexWrap:"wrap", borderBottom:"1px solid var(--border-faint)" }}>
        <span style={{ fontSize:10, color:"var(--text-dim)", fontFamily:"var(--font-mono)", letterSpacing:1, textTransform:"uppercase", alignSelf:"center", marginRight:4 }}>Canon:</span>
        {[
          ["confirmed",   showConfirmed,   setShowConfirmed],
          ["speculative", showSpeculative, setShowSpeculative],
          ["retconned",   showRetconned,   setShowRetconned],
        ].map(([status, on, setOn]) => {
          const color = CANON_COLORS[status];
          return (
            <button key={status} onClick={() => setOn(!on)} style={{
              ...S.filterChip, fontSize:11, whiteSpace:"nowrap",
              borderColor: on ? color : "var(--border)",
              color: on ? color : "var(--text-dim)",
              background: on ? `color-mix(in srgb, ${color} 12%, transparent)` : "transparent",
            }}>
              {CANON_ICONS[status]} {status}
            </button>
          );
        })}
      </div>
      <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"4px 16px" }}>
        {flat.length === 0
          ? <div style={S.empty}>{(lore||[]).length === 0 ? "No lore entries yet." : "No entries match filters."}</div>
          : flat.map(entry => (
            <LoreTreeRow
              key={entry.id}
              entry={entry}
              depth={entry.depth}
              isSelected={false}
              isExpanded={effectiveExpanded.has(entry.id)}
              onSelect={e => navigate(`/lore/${entitySlug(e)}`)}
              onEdit={setEditing}
              onToggle={toggleExpand}
            />
          ))
        }
      </div>
      {(editing !== null && editing !== undefined) && (
        <LoreModal entity={editing} lore={lore} allData={allData} apiPost={apiPost}
          onSave={e => { onSave(e); setEditing(null); }}
          onDelete={id => { onDelete(id); setEditing(null); }}
          onClose={() => setEditing(null)} />
      )}
      {editing === undefined && (
        <LoreModal entity={null} lore={lore} allData={allData} apiPost={apiPost}
          onSave={e => { onSave(e); setEditing(null); navigate(`/lore/${entitySlug(e)}`); }}
          onDelete={() => {}}
          onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
