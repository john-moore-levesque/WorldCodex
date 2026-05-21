import { useState, useMemo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ─── Utility ─────────────────────────────────────────────────
export const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID)
  ? crypto.randomUUID()
  : `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

// URL-safe slug from an entity's display name. Not stored — computed on demand
// for routing. Renames change the slug; old shared links will stop resolving.
export function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")  // strip combining diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Map an entity to the string we want in its URL: prefer the slug of its
// display name, fall back to the UUID. Title is used for timeline events,
// name for everything else.
export function entitySlug(entity) {
  if (!entity) return "";
  const s = slugify(entity.name || entity.title);
  return s || entity.id;
}

// Look up an entity by URL parameter that could be either a slug or a raw id.
// Strategy:
//   1. Exact id match (existing UUID links keep working)
//   2. Slug match on name/title; if multiple, return the first
// Returns the entity, or null.
export function findBySlugOrId(items, slugOrId) {
  if (!items || !slugOrId) return null;
  const byId = items.find(x => x.id === slugOrId);
  if (byId) return byId;
  return items.find(x => slugify(x.name || x.title) === slugOrId) || null;
}

// Returns an array of { key, duplicates, missingIds } for any entity array
// with repeated or missing `id` values. Empty array = clean.
// Mirrors the server-side check in src/app.py findDuplicateIds.
export function findDuplicateIds(arrays) {
  const problems = [];
  for (const [key, arr] of Object.entries(arrays || {})) {
    if (!Array.isArray(arr)) continue;
    const seen = {};
    const missingIds = [];
    arr.forEach((entry, idx) => {
      if (!entry || typeof entry !== "object") return;
      if (!entry.id) { missingIds.push(idx); return; }
      (seen[entry.id] ||= []).push(idx);
    });
    const duplicates = {};
    for (const [eid, idxs] of Object.entries(seen)) if (idxs.length > 1) duplicates[eid] = idxs;
    if (Object.keys(duplicates).length || missingIds.length) problems.push({ key, duplicates, missingIds });
  }
  return problems;
}

// ─── Constants ───────────────────────────────────────────────
export const EVENT_CATEGORIES = [
  { id: "political",   label: "Political",          color: "var(--cat-political)",   soft: "var(--cat-political-soft)" },
  { id: "technology",  label: "Technology",         color: "var(--cat-technology)",  soft: "var(--cat-technology-soft)" },
  { id: "military",    label: "Military",           color: "var(--cat-military)",    soft: "var(--cat-military-soft)" },
  { id: "exploration", label: "Exploration",        color: "var(--cat-exploration)", soft: "var(--cat-exploration-soft)" },
  { id: "science",     label: "Science",            color: "var(--cat-science)",     soft: "var(--cat-science-soft)" },
  { id: "cultural",    label: "Cultural",           color: "var(--cat-cultural)",    soft: "var(--cat-cultural-soft)" },
];

export const FACTION_TYPES = ["government","corporation","military","religious","insurgent","criminal","other"];
export const SPECIES_STATUSES = ["extant","endangered","extinct","unknown"];
export const FACTION_STATUSES = ["active","dissolved","underground","unknown"];
export const TECH_CATEGORIES = ["infrastructure","propulsion","weapons","energy","computing","biotech","materials","communications","other","starships"];
export const TECH_STATUSES = ["theoretical","experimental","operational","widespread","obsolete","lost"];

export const TECH_SUBCATEGORIES = [
  { id: "propulsion",     label: "Propulsion",     color: "var(--tech-propulsion)",  soft: "var(--tech-propulsion-soft)" },
  { id: "communications", label: "Communications", color: "var(--tech-comms)",       soft: "var(--tech-comms-soft)" },
  { id: "energy",         label: "Energy",         color: "var(--tech-energy)",      soft: "var(--tech-energy-soft)" },
  { id: "weapons",        label: "Weapons",        color: "var(--tech-weapons)",     soft: "var(--tech-weapons-soft)" },
  { id: "starships",      label: "Starships",      color: "var(--tech-starships)",   soft: "var(--tech-starships-soft)" },
  { id: "materials",      label: "Materials",      color: "var(--tech-materials)",   soft: "var(--tech-materials-soft)" },
];
export const TECH_BY_ID = Object.fromEntries(TECH_SUBCATEGORIES.map(t => [t.id, t]));
export const LOCATION_TYPES = ["star-system","planet","moon","station","city","region","vessel","compartment","other"];
export const LOCATION_STATUSES = ["inhabited","uninhabited","contested","destroyed","unknown"];
export const CONNECTION_TYPES = ["warp-lane","trade-route","political-border","orbit","hyperspace","other"];
export const STORY_STATUSES = ["draft","in-progress","complete"];
export const STORY_RELATION_TYPES = ["sequel","prequel","sidequel"];

// ─── Cross-Module Link Picker ────────────────────────────────
export function CrossModuleLinkEditor({ links, allData, onChange }) {
  const [search, setSearch] = useState("");
  const allEntities = useMemo(() => {
    const out = [];
    const add = (type, items, nameKey) => (items||[]).forEach(i => out.push({ type, id: i.id, name: i[nameKey] || i.title || i.label || i.id }));
    add("event", allData.events, "title");
    add("species", allData.species, "name");
    add("faction", allData.factions, "name");
    add("tech", allData.technology, "name");
    add("location", allData.locations, "name");
    add("lore", allData.lore, "title");
    add("character", allData.characters, "name");
    add("story", allData.stories, "title");

    return out;
  }, [allData]);

  const linkedIds = new Set((links||[]).map(l => `${l.type}:${l.id}`));
  const filtered = search ? allEntities.filter(e => !linkedIds.has(`${e.type}:${e.id}`) && e.name.toLowerCase().includes(search.toLowerCase())) : [];

  return (
    <div>
      <div style={{ display:"flex",flexWrap:"wrap",gap:4,marginBottom:8 }}>
        {(links||[]).map((l, i) => {
          const entity = allEntities.find(e => e.type === l.type && e.id === l.id);
          return (
            <span key={i} style={{ ...S.linkChip, borderColor:"var(--accent)", background:"var(--accent-bg)", color:"var(--accent)" }}>
              <span style={{ fontSize:9,textTransform:"uppercase",opacity:0.7,marginRight:4 }}>{l.type}</span>
              {entity?.name || l.id}
              <button onClick={() => onChange(links.filter((_,j) => j !== i))} style={{ background:"none",border:"none",color:"var(--accent)",cursor:"pointer",marginLeft:4,fontSize:12,padding:0 }}>✕</button>
            </span>
          );
        })}
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)} style={{ ...S.input, fontSize: 12 }} placeholder="Search entities to link…" />
      {filtered.length > 0 && (
        <div style={{ maxHeight:120,overflowY:"auto",border:"1px solid var(--border)",borderRadius:4,marginTop:4 }}>
          {filtered.slice(0, 20).map(e => (
            <button key={`${e.type}:${e.id}`} onClick={() => { onChange([...(links||[]), { type: e.type, id: e.id }]); setSearch(""); }}
              style={{ display:"block",width:"100%",textAlign:"left",padding:"4px 8px",border:"none",background:"transparent",color:"var(--text-body)",cursor:"pointer",fontSize:12,fontFamily:"inherit" }}
              onMouseEnter={ev => ev.currentTarget.style.background="var(--bg-hover)"} onMouseLeave={ev => ev.currentTarget.style.background="transparent"}>
              <span style={{ fontSize:9,textTransform:"uppercase",color:"var(--text-dim)",marginRight:6 }}>{e.type}</span>{e.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CrossModuleLinksDisplay({ links, allData, onNavigate }) {
  const allEntities = useMemo(() => {
    const out = [];
    const add = (type, items, nameKey) => (items||[]).forEach(i => out.push({ type, id: i.id, name: i[nameKey] || i.title || i.label || i.id }));
    add("event", allData.events, "title");
    add("species", allData.species, "name");
    add("faction", allData.factions, "name");
    add("tech", allData.technology, "name");
    add("location", allData.locations, "name");
    add("lore", allData.lore, "title");
    add("character", allData.characters, "name");
    add("story", allData.stories, "title");
    return out;
  }, [allData]);

  if (!links?.length) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <h4 style={S.sectionHead}>Linked Entities</h4>
      {links.map((l, i) => {
        const entity = allEntities.find(e => e.type === l.type && e.id === l.id);
        return (
          <button key={i} onClick={() => onNavigate(l.type, l.id)} style={S.linkedEvent}>
            <span style={{ fontSize:9,textTransform:"uppercase",color:"var(--accent)",fontFamily:"var(--font-mono)",marginRight:8,letterSpacing:1 }}>{l.type}</span>
            {entity?.name || l.id}
          </button>
        );
      })}
    </div>
  );
}

// ─── Tag/Trait Input ─────────────────────────────────────────
export function TagInput({ tags, onChange, placeholder }) {
  const [input, setInput] = useState("");
  const add = () => { const v = input.trim(); if (v && !(tags||[]).includes(v)) { onChange([...(tags||[]), v]); } setInput(""); };
  return (
    <div>
      <div style={{ display:"flex",flexWrap:"wrap",gap:4,marginBottom:4 }}>
        {(tags||[]).map((t,i) => (
          <span key={i} style={{ padding:"2px 8px",border:"1px solid var(--border)",borderRadius:3,fontSize:11,color:"var(--text-secondary)",display:"flex",alignItems:"center",gap:4 }}>
            {t}<button onClick={() => onChange(tags.filter((_,j)=>j!==i))} style={{ background:"none",border:"none",color:"var(--text-dim)",cursor:"pointer",fontSize:10,padding:0 }}>✕</button>
          </span>
        ))}
      </div>
      <div style={{ display:"flex",gap:4 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add())} style={{ ...S.input, flex:1, fontSize:12 }} placeholder={placeholder || "Add tag…"} />
        <button onClick={add} style={{ ...S.ioBtn, fontSize:11 }}>+</button>
      </div>
    </div>
  );
}

// ─── Multi-Select for IDs ────────────────────────────────────
export function IdMultiSelect({ selected, options, onChange, placeholder }) {
  const selectedSet = new Set(selected || []);
  return (
    <div style={{ display:"flex",flexWrap:"wrap",gap:4 }}>
      {options.map(opt => {
        const on = selectedSet.has(opt.id);
        return (
          <button key={opt.id} onClick={() => onChange(on ? (selected||[]).filter(id=>id!==opt.id) : [...(selected||[]),opt.id])}
            style={{ ...S.filterChip, borderColor:on?"var(--accent)":"var(--border)", color:on?"var(--accent)":"var(--text-dim)", background:on?"var(--accent-bg)":"transparent" }}>
            {opt.name || opt.label || opt.id}
          </button>
        );
      })}
    </div>
  );
}

// ─── Generic Tree View (parent-pointer hierarchy) ────────────
// `parentKey` is the field on each entity that holds its parent's id
// (e.g. "parent" for locations/lore, "parentFaction" for factions).
export function buildEntityTree(items, parentKey = "parent") {
  const map = {};
  (items || []).forEach(e => { map[e.id] = { ...e, _children: [] }; });
  const roots = [];
  Object.values(map).forEach(e => {
    const pid = e[parentKey];
    if (pid && map[pid]) map[pid]._children.push(e);
    else roots.push(e);
  });
  const sortName = arr => arr.sort((a, b) => (a.name || a.title || "").localeCompare(b.name || b.title || ""));
  const sortDeep = nodes => { sortName(nodes); nodes.forEach(n => sortDeep(n._children)); return nodes; };
  return sortDeep(roots);
}

export function flattenTree(roots, expanded) {
  const out = [];
  const walk = (nodes, depth) => {
    nodes.forEach(n => {
      out.push({ ...n, _depth: depth });
      if (n._children?.length && expanded.has(n.id)) walk(n._children, depth + 1);
    });
  };
  walk(roots, 0);
  return out;
}

// Generic tree-row list. items already flattened with _depth + _children.
// Selection / hover / expand logic matches EntityList for visual consistency.
export function TreeList({ items, nameKey, onSelect, selectedId, onEdit, getSubtitle, getColor, expanded, onToggle }) {
  const [hoveredId, setHoveredId] = useState(null);
  if (!items?.length) return <div style={S.empty}>No entries yet. Click the button above to add one.</div>;
  return (
    <div style={{ padding:"8px 0" }}>
      {items.map(entry => {
        const isSel = selectedId === entry.id;
        const hasKids = entry._children?.length > 0;
        const isOpen = expanded?.has(entry.id);
        return (
          <div key={entry.id} onClick={() => onSelect(entry)}
            onMouseEnter={() => setHoveredId(entry.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              ...S.eventRow,
              marginLeft: (entry._depth || 0) * 20,
              borderLeftColor: getColor?.(entry) || "var(--accent)",
              background: isSel ? "var(--bg-selected)" : hoveredId === entry.id ? "var(--bg-hover)" : "transparent",
              animation: "fadeIn 0.2s ease",
            }}>
            <button onClick={e => { e.stopPropagation(); if (hasKids) onToggle?.(entry.id); }} style={{
              width: 18, height: 18, padding: 0,
              border: hasKids ? "1.5px solid var(--text-muted)" : "1px dashed var(--border-subtle)",
              borderRadius: 2,
              background: hasKids && isOpen ? "var(--text-primary)" : "var(--bg-main)",
              color:      hasKids && isOpen ? "var(--bg-main)"      : "var(--text-primary)",
              cursor: hasKids ? "pointer" : "default",
              flexShrink: 0,
              fontFamily: "var(--font-mono)",
              fontSize: 11, fontWeight: 700, lineHeight: 1,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}>{hasKids ? (isOpen ? "−" : "+") : ""}</button>
            <div style={S.eventBody}>
              <div style={S.eventTitle}>{entry[nameKey]}</div>
              {getSubtitle && <div style={S.eventSummary}>{getSubtitle(entry)}</div>}
            </div>
            <button style={S.editRowBtn} onClick={e => { e.stopPropagation(); onEdit(entry); }}>✎</button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Generic Entity List ─────────────────────────────────────
export function EntityList({ items, nameKey, onSelect, selectedId, onEdit, getSubtitle, getColor }) {
  const [hoveredId, setHoveredId] = useState(null);
  const unique = (items || []).filter((item, idx, arr) => arr.findIndex(x => x.id === item.id) === idx);
  if (!unique.length) return <div style={S.empty}>No entries yet. Click the button above to add one.</div>;
  return (
    <div style={{ padding:"8px 0" }}>
      {unique.map(item => {
        const isSel = selectedId === item.id;
        return (
          <div key={item.id} onClick={() => onSelect(item)}
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{ ...S.eventRow, borderLeftColor: getColor?.(item) || "var(--accent)", background: isSel ? "var(--bg-selected)" : hoveredId === item.id ? "var(--bg-hover)" : "transparent", animation:"fadeIn 0.2s ease" }}>
            <div style={S.eventBody}>
              <div style={S.eventTitle}>{item[nameKey]}</div>
              {getSubtitle && <div style={S.eventSummary}>{getSubtitle(item)}</div>}
            </div>
            <button style={S.editRowBtn} onClick={e => { e.stopPropagation(); onEdit(item); }}>✎</button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Image Upload ────────────────────────────────────────────
export function ImageUpload({ imageUrl, onUpload, entityType, entityId, apiPost }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Max 5 MB"); return; }
    setError(null);
    setUploading(true);
    try {
      const ext = file.name.split(".").pop().toLowerCase();
      const { uploadUrl, imageUrl: newUrl } = await apiPost("images/upload", {
        entityType, entityId, contentType: file.type, fileExt: ext,
      });
      await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      onUpload(newUrl);
    } catch (err) {
      setError("Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div>
      {imageUrl && <img src={imageUrl} alt="" style={{ maxWidth:"100%", maxHeight:120, borderRadius:4, marginBottom:6, display:"block" }} />}
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <label style={{ cursor: uploading ? "default" : "pointer" }}>
          <span style={{ ...S.ioBtn, display:"inline-block", fontSize:12, opacity: uploading ? 0.5 : 1 }}>
            {uploading ? "Uploading…" : imageUrl ? "Change image" : "Add image"}
          </span>
          <input type="file" accept="image/*" onChange={handleFile} style={{ display:"none" }} disabled={uploading} />
        </label>
        {imageUrl && !uploading && (
          <button onClick={() => onUpload("")} style={{ ...S.ioBtn, fontSize:11, color:"var(--danger)" }}>Remove</button>
        )}
      </div>
      {error && <span style={{ fontSize:11, color:"var(--danger)", fontFamily:"var(--font-mono)", marginTop:4, display:"block" }}>{error}</span>}
    </div>
  );
}

// ─── Markdown Renderer ───────────────────────────────────────
const mdComponents = {
  p:          ({children}) => <p style={{ margin:"0 0 8px 0" }}>{children}</p>,
  ul:         ({children}) => <ul style={{ margin:"0 0 8px 0", paddingLeft:18 }}>{children}</ul>,
  ol:         ({children}) => <ol style={{ margin:"0 0 8px 0", paddingLeft:18 }}>{children}</ol>,
  li:         ({children}) => <li style={{ marginBottom:2 }}>{children}</li>,
  strong:     ({children}) => <strong style={{ color:"var(--text-primary)", fontWeight:700 }}>{children}</strong>,
  em:         ({children}) => <em style={{ color:"var(--text-secondary)" }}>{children}</em>,
  h1:         ({children}) => <h1 style={{ fontSize:16, fontWeight:700, color:"var(--text-primary)", margin:"12px 0 6px 0", fontFamily:"var(--font-heading)" }}>{children}</h1>,
  h2:         ({children}) => <h2 style={{ fontSize:14, fontWeight:700, color:"var(--text-primary)", margin:"10px 0 5px 0", fontFamily:"var(--font-heading)" }}>{children}</h2>,
  h3:         ({children}) => <h3 style={{ fontSize:12, fontWeight:600, color:"var(--accent)", margin:"8px 0 4px 0", fontFamily:"var(--font-mono)", textTransform:"uppercase", letterSpacing:1 }}>{children}</h3>,
  blockquote: ({children}) => <blockquote style={{ borderLeft:"3px solid var(--accent)", paddingLeft:10, margin:"0 0 8px 0", color:"var(--text-secondary)", fontStyle:"italic" }}>{children}</blockquote>,
  hr:         () => <hr style={{ border:"none", borderTop:"1px solid var(--border)", margin:"10px 0" }} />,
  code:       ({children}) => <code style={{ fontFamily:"var(--font-mono)", fontSize:12, background:"var(--bg-input)", padding:"1px 4px", borderRadius:3, color:"var(--accent-purple)" }}>{children}</code>,
  table:      ({children}) => <table style={{ width:"100%", borderCollapse:"collapse", margin:"12px 0", fontSize:12, fontFamily:"var(--font-body)" }}>{children}</table>,
  thead:      ({children}) => <thead style={{ background:"var(--bg-input)", borderBottom:"2px solid var(--border)" }}>{children}</thead>,
  tbody:      ({children}) => <tbody>{children}</tbody>,
  tr:         ({children}) => <tr style={{ borderBottom:"1px solid var(--border-faint)" }}>{children}</tr>,
  th:         ({children}) => <th style={{ padding:"8px 10px", textAlign:"left", fontWeight:700, color:"var(--text-primary)" }}>{children}</th>,
  td:         ({children}) => <td style={{ padding:"8px 10px", color:"var(--text-body)" }}>{children}</td>,
};

export function MarkdownBody({ children, style }) {
  if (!children) return null;
  return (
    <div className="md-body" style={{ marginTop:14, fontSize:13, color:"var(--text-body)", lineHeight:1.6, ...style }}>
      <Markdown remarkPlugins={[remarkGfm]} components={mdComponents}>{children}</Markdown>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────
export const S = {
  addBtn: { padding:"8px 16px", border:"1px solid var(--accent)", borderRadius:4, background:"var(--accent-bg)", color:"var(--accent)", cursor:"pointer", fontFamily:"var(--font-heading)", fontWeight:600, fontSize:13 },
  ioBtn: { padding:"6px 12px", border:"1px solid var(--border)", borderRadius:4, background:"transparent", color:"var(--text-muted)", cursor:"pointer", fontFamily:"var(--font-mono)", fontSize:11 },
  input: { width:"100%", padding:"8px 12px", border:"1px solid var(--border)", borderRadius:4, background:"var(--bg-input)", color:"var(--text-body)", fontSize:14, fontFamily:"var(--font-body)" },
  select: { width:"100%", padding:"8px 12px", border:"1px solid var(--border)", borderRadius:4, background:"var(--bg-input)", color:"var(--text-body)", fontSize:14, fontFamily:"var(--font-body)" },
  fieldRow: { marginBottom:14 },
  label: { display:"block", fontSize:11, textTransform:"uppercase", letterSpacing:1.5, color:"var(--text-dim)", marginBottom:4, fontFamily:"var(--font-mono)" },
  overlay: { position:"fixed", inset:0, background:"var(--overlay)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20 },
  modal: { width:"100%", maxWidth:600, maxHeight:"90vh", background:"var(--bg-main)", border:"1px solid var(--border)", borderRadius:8, display:"flex", flexDirection:"column", overflow:"hidden" },
  modalHeader: { display:"flex", alignItems:"center", gap:12, padding:"14px 20px", borderBottom:"1px solid var(--border-subtle)" },
  modalHeaderDecor: { width:4, height:24, borderRadius:2, background:"linear-gradient(180deg, var(--accent), var(--accent-purple))" },
  modalTitle: { flex:1, fontSize:17, fontWeight:700, color:"var(--text-primary)", fontFamily:"var(--font-heading)" },
  closeBtn: { width:28, height:28, border:"none", borderRadius:4, background:"transparent", color:"var(--text-muted)", cursor:"pointer", fontSize:16 },
  modalBody: { padding:"16px 20px", overflowY:"auto", flex:1 },
  modalFooter: { display:"flex", gap:8, padding:"12px 20px", borderTop:"1px solid var(--border-subtle)" },
  saveBtn: { padding:"8px 20px", border:"none", borderRadius:4, background:"var(--accent)", color:"#080c14", cursor:"pointer", fontFamily:"var(--font-heading)", fontWeight:700, fontSize:14 },
  cancelBtn: { padding:"8px 16px", border:"1px solid var(--border)", borderRadius:4, background:"transparent", color:"var(--text-muted)", cursor:"pointer", fontFamily:"var(--font-body)", fontSize:13 },
  deleteBtn: { padding:"8px 16px", border:"1px solid var(--danger-border)", borderRadius:4, background:"var(--danger-bg)", color:"var(--danger)", cursor:"pointer", fontFamily:"var(--font-body)", fontSize:13 },
  eventRow: { display:"flex", alignItems:"center", gap:10, padding:"10px 14px", marginBottom:1, cursor:"pointer", borderLeft:"3px solid #555", borderRadius:"0 4px 4px 0", transition:"background 0.15s" },
  yearBadge: { fontFamily:"var(--font-mono)", fontSize:13, fontWeight:500, color:"var(--text-secondary)", minWidth:48, textAlign:"right" },
  eventBody: { flex:1, minWidth:0 },
  eventTitle: { fontWeight:600, fontSize:14, color:"var(--text-primary)", marginBottom:1, fontFamily:"var(--font-heading)" },
  eventSummary: { fontSize:12, color:"var(--text-muted)", lineHeight:1.4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  eventTags: { display:"flex", gap:8, marginTop:3 },
  microTag: { fontSize:9, textTransform:"uppercase", letterSpacing:1, fontFamily:"var(--font-mono)", color:"var(--tag-neutral)" },
  editRowBtn: { width:28, height:28, border:"1px solid var(--border)", borderRadius:4, background:"transparent", color:"var(--text-muted)", cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  detailPanel: { width:360, minWidth:300, borderLeft:"1px solid var(--border-subtle)", padding:"20px 24px", overflowY:"auto", background:"var(--bg-panel)" },
  listPanel: { width:300, minWidth:240, borderLeft:"1px solid var(--border-subtle)", display:"flex", flexDirection:"column", overflow:"hidden", background:"var(--bg-panel)" },
  detailTitle: { fontSize:18, fontWeight:700, color:"var(--text-primary)", margin:0, fontFamily:"var(--font-heading)" },
  detailYear: { fontFamily:"var(--font-mono)", fontSize:14, color:"var(--accent)" },
  detailSummary: { marginTop:10, fontSize:13, color:"var(--text-secondary)", lineHeight:1.5, whiteSpace:"pre-wrap" },
  detailBody: { marginTop:14, fontSize:13, color:"var(--text-body)", lineHeight:1.6, whiteSpace:"pre-wrap" },
  mdHint: { fontSize:10, color:"var(--text-dim)", fontFamily:"var(--font-mono)", marginTop:3 },
  sectionHead: { color:"var(--accent)", margin:"0 0 8px", fontSize:12, textTransform:"uppercase", letterSpacing:1, fontFamily:"var(--font-mono)" },
  linkedEvent: { display:"block", width:"100%", textAlign:"left", padding:"7px 10px", border:"1px solid var(--border-subtle)", borderRadius:4, marginBottom:4, background:"transparent", color:"var(--text-secondary)", cursor:"pointer", fontFamily:"var(--font-body)", fontSize:12 },
  panelBtn: { padding:"4px 12px", border:"1px solid var(--border)", borderRadius:4, background:"transparent", color:"var(--accent)", cursor:"pointer", fontFamily:"var(--font-body)", fontSize:12 },
  panelCloseBtn: { width:28, height:28, border:"1px solid var(--border)", borderRadius:4, background:"transparent", color:"var(--text-muted)", cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" },
  linkChip: { padding:"4px 10px", border:"1px solid var(--border)", borderRadius:3, cursor:"pointer", fontFamily:"var(--font-body)", fontSize:12, display:"flex", alignItems:"center" },
  filterChip: { padding:"4px 10px", border:"1px solid var(--border)", borderRadius:3, cursor:"pointer", fontFamily:"var(--font-body)", fontSize:12, background:"transparent" },
  empty: { textAlign:"center", padding:"60px 20px", color:"var(--text-faint)", fontFamily:"var(--font-mono)", fontSize:14 },
};
