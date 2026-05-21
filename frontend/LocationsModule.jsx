import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { uid, CrossModuleLinkEditor, CrossModuleLinksDisplay, TagInput, TreeList, buildEntityTree, flattenTree, LOCATION_TYPES, LOCATION_STATUSES, CONNECTION_TYPES, ImageUpload, MarkdownBody, S, entitySlug, findBySlugOrId } from "./shared.jsx";

export default function LocationsModule({ locations, onSave, onDelete, allData, onNavigate, apiPost }) {
  const { id: selectedId } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [activeTypes, setActiveTypes] = useState(() => new Set(LOCATION_TYPES));
  const [expanded, setExpanded] = useState(new Set());

  const selected = findBySlugOrId(locations, selectedId);

  // Filter by type + search. For search, also include ancestors so tree structure is preserved.
  const filtered = useMemo(() => {
    const all = locations || [];
    const typeOk = l => activeTypes.has(l.type || "other");
    if (!search.trim()) return all.filter(typeOk);
    const q = search.toLowerCase();
    const matched = new Set(all.filter(l => typeOk(l) && (l.name?.toLowerCase().includes(q))).map(l => l.id));
    const withAncestors = new Set(matched);
    let added = true;
    while (added) {
      added = false;
      all.forEach(l => {
        if (withAncestors.has(l.id) && l.parent && !withAncestors.has(l.parent)) {
          withAncestors.add(l.parent);
          added = true;
        }
      });
    }
    return all.filter(l => withAncestors.has(l.id));
  }, [locations, search, activeTypes]);

  const tree = useMemo(() => buildEntityTree(filtered, "parent"), [filtered]);
  // Auto-expand all when searching.
  const effectiveExpanded = useMemo(() =>
    search.trim() ? new Set((locations || []).map(l => l.id)) : expanded,
    [search, locations, expanded]);
  const visible = useMemo(() => flattenTree(tree, effectiveExpanded), [tree, effectiveExpanded]);

  const factionsById = useMemo(
    () => Object.fromEntries((allData?.factions || []).map(f => [f.id, f])),
    [allData?.factions]
  );
  const locationBarColor = l => factionsById[l.faction]?.color || "var(--success)";

  const toggleType = c => setActiveTypes(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const toggleExpand = id => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ─── Detail view ───────────────────────────────────────────
  if (selectedId && !selected) {
    return (
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12 }}>
        <span style={S.empty}>Location not found.</span>
        <button style={S.ioBtn} onClick={() => navigate("/locations")}>← Back to Locations</button>
      </div>
    );
  }
  if (selected) {
    const parent = selected.parent ? locations.find(l => l.id === selected.parent) : null;
    return (
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--border-faint)", display:"flex", gap:8, alignItems:"center" }}>
          <button style={S.ioBtn} onClick={() => navigate("/locations")}>← Locations</button>
          <div style={{ flex:1 }} />
          <button style={S.panelBtn} onClick={() => setEditing(selected)}>Edit</button>
        </div>
        <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"20px 32px", maxWidth:920, alignSelf:"center", width:"100%", boxSizing:"border-box" }}>
          {selected.imageUrl && <img src={selected.imageUrl} alt="" style={{ width:"100%", borderRadius:4, marginBottom:12, display:"block" }} />}
          <h2 style={S.detailTitle}>{selected.name}</h2>
          <div style={{ display:"flex",gap:6,marginTop:8,flexWrap:"wrap" }}>
            {selected.type && <span style={{ ...S.microTag,border:"1px solid var(--success)",color:"var(--success)",padding:"2px 6px",borderRadius:3 }}>{selected.type}</span>}
            {selected.status && <span style={{ ...S.microTag,border:"1px solid var(--border)",padding:"2px 6px",borderRadius:3 }}>{selected.status}</span>}
          </div>
          {selected.faction && (() => { const f = factionsById[selected.faction]; if (!f) return null; const c = f.color || "var(--accent)"; return (<p style={{ fontSize:12,color:"var(--text-muted)",fontFamily:"var(--font-mono)",marginTop:8 }}>Claimed by:{" "}<button onClick={() => onNavigate("faction", f.id)} style={{ background:"transparent",border:`1px solid ${c}`,borderRadius:3,padding:"2px 6px",marginLeft:2,color:c,fontFamily:"inherit",fontSize:"inherit",cursor:"pointer",textTransform:"uppercase",letterSpacing:"0.08em" }}>{f.shortName||f.name}</button></p>); })()}
          {parent && <p style={{ fontSize:12,color:"var(--text-muted)",fontFamily:"var(--font-mono)",marginTop:8 }}>Part of: <button onClick={() => navigate(`/locations/${entitySlug(parent)}`)} style={{ background:"transparent", border:"none", color:"var(--accent)", cursor:"pointer", fontFamily:"inherit", fontSize:"inherit", padding:0 }}>{parent.name}</button></p>}
          {selected.description && <MarkdownBody style={{ marginTop:14 }}>{selected.description}</MarkdownBody>}
          {selected.properties && <><h4 style={{ ...S.sectionHead,marginTop:16 }}>Properties</h4><MarkdownBody style={{ marginTop:6 }}>{selected.properties}</MarkdownBody></>}
          {selected.connections?.length > 0 && (
            <div style={{ marginTop:16 }}><h4 style={S.sectionHead}>Connections</h4>
              {selected.connections.map((c,i) => { const target = locations.find(l=>l.id===c.to); return (
                <div key={i} onClick={() => target && navigate(`/locations/${entitySlug(target)}`)} style={{ padding:"6px 8px",border:"1px solid var(--border-subtle)",borderRadius:4,marginBottom:4,fontSize:12, cursor: target ? "pointer" : "default" }}>
                  <div style={{ fontWeight:600,color:"var(--text-primary)" }}>{target?.name||c.to}</div>
                  <div style={{ color:"var(--text-dim)",fontSize:11 }}>{[c.connectionType, c.label, c.distance, c.travelTime].filter(Boolean).join(" · ")}</div>
                </div>
              ); })}
            </div>
          )}
          <CrossModuleLinksDisplay links={selected.crossModuleLinks} allData={allData} onNavigate={onNavigate} />
        </div>
        {(editing !== null && editing !== undefined) && <LocationModal entity={editing} locations={locations} allData={allData} apiPost={apiPost} onSave={e=>{onSave(e);setEditing(null);}} onDelete={id=>{onDelete(id);setEditing(null);navigate("/locations");}} onClose={()=>setEditing(null)} />}
      </div>
    );
  }

  // ─── List view (tree) ──────────────────────────────────────
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--border-faint)", display:"flex", gap:8, alignItems:"center" }}>
        <input style={{ ...S.input, flex:1, maxWidth:480 }} placeholder="Search locations…" value={search} onChange={e => setSearch(e.target.value)} />
        <button style={S.addBtn} onClick={() => setEditing(undefined)}>+ Location</button>
      </div>
      <div style={{ padding:"8px 16px", display:"flex", gap:6, flexWrap:"wrap", borderBottom:"1px solid var(--border-faint)" }}>
        <span style={{ fontSize:10, color:"var(--text-dim)", fontFamily:"var(--font-mono)", letterSpacing:1, textTransform:"uppercase", alignSelf:"center", marginRight:4 }}>Type:</span>
        {LOCATION_TYPES.map(c => {
          const on = activeTypes.has(c);
          return (
            <button key={c} onClick={() => toggleType(c)} style={{
              ...S.filterChip, fontSize:11,
              borderColor: on ? "var(--success)" : "var(--border)",
              color: on ? "var(--success)" : "var(--text-dim)",
              background: on ? "color-mix(in srgb, var(--success) 12%, transparent)" : "transparent",
            }}>{c}</button>
          );
        })}
      </div>
      <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"4px 16px" }}>
        <TreeList items={visible} nameKey="name" onSelect={l => navigate(`/locations/${entitySlug(l)}`)} selectedId={null} onEdit={setEditing}
          expanded={effectiveExpanded} onToggle={toggleExpand}
          getSubtitle={l => [l.type, l.status, l.connections?.length && `${l.connections.length} connections`].filter(Boolean).join(" · ")}
          getColor={locationBarColor} />
      </div>
      {(editing !== null && editing !== undefined) && <LocationModal entity={editing} locations={locations} allData={allData} apiPost={apiPost} onSave={e=>{onSave(e);setEditing(null);}} onDelete={id=>{onDelete(id);setEditing(null);}} onClose={()=>setEditing(null)} />}
      {editing === undefined && <LocationModal entity={null} locations={locations} allData={allData} apiPost={apiPost} onSave={e=>{onSave(e);setEditing(null);navigate(`/locations/${entitySlug(e)}`);}} onDelete={()=>{}} onClose={()=>setEditing(null)} />}
    </div>
  );
}

function LocationModal({ entity, locations, allData, apiPost, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(entity || { id:uid(), name:"", type:"star-system", parent:null, faction:null, description:"", properties:"", history:"", status:"inhabited", tags:[], connections:[], imageUrl:"", crossModuleLinks:[] });
  const isNew = !entity; const set = (k,v) => setForm(f => ({ ...f,[k]:v }));
  const otherLocs = (locations||[]).filter(l => l.id !== form.id);
  const addConn = () => set("connections", [...(form.connections||[]), { to:"", label:"", connectionType:"warp-lane", distance:"", travelTime:"", detail:"" }]);
  const updateConn = (i,k,v) => { const c = [...form.connections]; c[i] = { ...c[i],[k]:v }; set("connections",c); };
  const removeConn = i => set("connections", form.connections.filter((_,j)=>j!==i));
  return (
    <div style={S.overlay}><div style={{ ...S.modal, maxWidth:640 }}>
      <div style={S.modalHeader}><span style={S.modalHeaderDecor} /><h2 style={S.modalTitle}>{isNew?"New Location":"Edit Location"}</h2><button style={S.closeBtn} onClick={onClose}>✕</button></div>
      <div style={S.modalBody}>
        <div style={S.fieldRow}><label style={S.label}>Name</label><input value={form.name} onChange={e=>set("name",e.target.value)} style={S.input} autoFocus /></div>
        <div style={{ display:"flex",gap:14 }}>
          <div style={{ ...S.fieldRow,flex:1 }}><label style={S.label}>Type</label><select value={form.type} onChange={e=>set("type",e.target.value)} style={S.select}>{LOCATION_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
          <div style={{ ...S.fieldRow,flex:1 }}><label style={S.label}>Status</label><select value={form.status} onChange={e=>set("status",e.target.value)} style={S.select}>{LOCATION_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
          <div style={{ ...S.fieldRow,flex:1 }}><label style={S.label}>Faction</label><select value={form.faction||""} onChange={e=>set("faction",e.target.value||null)} style={S.select}><option value="">— None —</option>{(allData.factions||[]).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
          <div style={{ ...S.fieldRow,flex:1 }}><label style={S.label}>Parent</label><select value={form.parent||""} onChange={e=>set("parent",e.target.value||null)} style={S.select}><option value="">— None —</option>{otherLocs.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        </div>
        <div style={S.fieldRow}><label style={S.label}>Description</label><textarea value={form.description} onChange={e=>set("description",e.target.value)} style={{ ...S.input,minHeight:60,resize:"vertical",fontFamily:"inherit" }} /><div style={S.mdHint}>Markdown: **bold** *italic* - list ## heading</div></div>
        <div style={S.fieldRow}><label style={S.label}>Properties</label><textarea value={form.properties} onChange={e=>set("properties",e.target.value)} style={{ ...S.input,minHeight:40,resize:"vertical",fontFamily:"inherit" }} placeholder="e.g. Class M atmosphere, 1.1g gravity" /><div style={S.mdHint}>Markdown: **bold** *italic* - list ## heading</div></div>
        <div style={S.fieldRow}><label style={S.label}>Tags</label><TagInput tags={form.tags} onChange={v=>set("tags",v)} placeholder="e.g. capital, mining colony" /></div>
        <div style={S.fieldRow}>
          <label style={S.label}>Connections</label>
          {(form.connections||[]).map((c,i) => (
            <div key={i} style={{ display:"flex",gap:6,alignItems:"center",marginBottom:8,padding:8,border:"1px solid var(--border-faint)",borderRadius:4 }}>
              <select value={c.to} onChange={e=>updateConn(i,"to",e.target.value)} style={{ ...S.select,flex:2 }}><option value="">— Target —</option>{otherLocs.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select>
              <select value={c.connectionType} onChange={e=>updateConn(i,"connectionType",e.target.value)} style={{ ...S.select,flex:1 }}>{CONNECTION_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select>
              <input value={c.distance||""} onChange={e=>updateConn(i,"distance",e.target.value)} style={{ ...S.input,flex:1 }} placeholder="Distance" />
              <input value={c.travelTime||""} onChange={e=>updateConn(i,"travelTime",e.target.value)} style={{ ...S.input,flex:1 }} placeholder="Travel time" />
              <button onClick={() => removeConn(i)} style={{ ...S.deleteBtn,padding:"4px 8px",fontSize:12 }}>✕</button>
            </div>
          ))}
          <button onClick={addConn} style={{ ...S.ioBtn,fontSize:11 }}>+ Add Connection</button>
        </div>
        <div style={S.fieldRow}><label style={S.label}>Image</label><ImageUpload imageUrl={form.imageUrl} onUpload={url=>set("imageUrl",url)} entityType="location" entityId={form.id} apiPost={apiPost} /></div>
        <div style={S.fieldRow}><label style={S.label}>Cross-Module Links</label><CrossModuleLinkEditor links={form.crossModuleLinks} allData={allData} onChange={v=>set("crossModuleLinks",v)} /></div>
      </div>
      <div style={S.modalFooter}>
        {!isNew && <button style={S.deleteBtn} onClick={() => onDelete(form.id)}>Delete</button>}
        <div style={{flex:1}} /><button style={S.cancelBtn} onClick={onClose}>Cancel</button>
        <button style={S.saveBtn} onClick={() => onSave(form)} disabled={!form.name.trim()}>{isNew?"Add":"Save"}</button>
      </div>
    </div></div>
  );
}
