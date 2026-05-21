import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { uid, CrossModuleLinkEditor, CrossModuleLinksDisplay, IdMultiSelect, TreeList, buildEntityTree, flattenTree, FACTION_TYPES, FACTION_STATUSES, ImageUpload, MarkdownBody, S, entitySlug, findBySlugOrId } from "./shared.jsx";

export default function FactionsModule({ factions, species, onSave, onDelete, allData, onNavigate, apiPost }) {
  const { id: selectedId } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [activeTypes, setActiveTypes] = useState(() => new Set(FACTION_TYPES));
  const [expanded, setExpanded] = useState(new Set());

  const selected = findBySlugOrId(factions, selectedId);

  const filtered = useMemo(() => {
    const all = factions || [];
    const typeOk = f => activeTypes.has(f.type || "other");
    if (!search.trim()) return all.filter(typeOk);
    const q = search.toLowerCase();
    const matched = new Set(all.filter(f => typeOk(f) && (f.name?.toLowerCase().includes(q) || f.shortName?.toLowerCase().includes(q))).map(f => f.id));
    const withAncestors = new Set(matched);
    let added = true;
    while (added) {
      added = false;
      all.forEach(f => {
        if (withAncestors.has(f.id) && f.parentFaction && !withAncestors.has(f.parentFaction)) {
          withAncestors.add(f.parentFaction);
          added = true;
        }
      });
    }
    return all.filter(f => withAncestors.has(f.id));
  }, [factions, search, activeTypes]);

  const tree = useMemo(() => buildEntityTree(filtered, "parentFaction"), [filtered]);
  const effectiveExpanded = useMemo(() =>
    search.trim() ? new Set((factions || []).map(f => f.id)) : expanded,
    [search, factions, expanded]);
  const visible = useMemo(() => flattenTree(tree, effectiveExpanded), [tree, effectiveExpanded]);

  const toggleType = c => setActiveTypes(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const toggleExpand = id => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ─── Detail view ───────────────────────────────────────────
  if (selectedId && !selected) {
    return (
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12 }}>
        <span style={S.empty}>Faction not found.</span>
        <button style={S.ioBtn} onClick={() => navigate("/factions")}>← Back to Factions</button>
      </div>
    );
  }
  if (selected) {
    const parent = selected.parentFaction ? factions.find(f => f.id === selected.parentFaction) : null;
    return (
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--border-faint)", display:"flex", gap:8, alignItems:"center" }}>
          <button style={S.ioBtn} onClick={() => navigate("/factions")}>← Factions</button>
          <div style={{ flex:1 }} />
          <button style={S.panelBtn} onClick={() => setEditing(selected)}>Edit</button>
        </div>
        <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"20px 32px", maxWidth:920, alignSelf:"center", width:"100%", boxSizing:"border-box" }}>
          {selected.imageUrl && <img src={selected.imageUrl} alt="" style={{ width:"100%", borderRadius:4, marginBottom:12, display:"block" }} />}
          {selected.color && <div style={{ width:40,height:4,borderRadius:2,background:selected.color,marginBottom:8 }} />}
          <h2 style={S.detailTitle}>{selected.name}</h2>
          {selected.shortName && <span style={{ fontFamily:"var(--font-mono)",fontSize:12,color:"var(--text-muted)" }}>{selected.shortName}</span>}
          <div style={{ display:"flex",gap:6,marginTop:8,flexWrap:"wrap" }}>
            {selected.type && <span style={{ ...S.microTag,border:"1px solid var(--accent)",color:"var(--accent)",padding:"2px 6px",borderRadius:3 }}>{selected.type}</span>}
            {selected.status && <span style={{ ...S.microTag,border:"1px solid var(--border)",padding:"2px 6px",borderRadius:3 }}>{selected.status}</span>}
          </div>
          {parent && <p style={{ fontSize:12,color:"var(--text-muted)",fontFamily:"var(--font-mono)",marginTop:8 }}>Part of: <button onClick={() => navigate(`/factions/${entitySlug(parent)}`)} style={{ background:"transparent", border:"none", color:"var(--accent)", cursor:"pointer", fontFamily:"inherit", fontSize:"inherit", padding:0 }}>{parent.name}</button></p>}
          {selected.motto && <p style={{ ...S.detailSummary, fontStyle:"italic", marginTop:12 }}>"{selected.motto}"</p>}
          {selected.description && <MarkdownBody style={{ marginTop:14 }}>{selected.description}</MarkdownBody>}
          {selected.allies?.length > 0 && <div style={{ marginTop:16 }}><h4 style={S.sectionHead}>Allies</h4>{selected.allies.map(id => { const a = factions.find(f=>f.id===id); return <button key={id} onClick={() => a && navigate(`/factions/${entitySlug(a)}`)} style={{ ...S.microTag, border:"1px solid var(--success)", color:"var(--success)", padding:"2px 6px", borderRadius:3, marginRight:4, background:"transparent", cursor: a ? "pointer" : "default" }}>{a?.name||id}</button>; })}</div>}
          {selected.enemies?.length > 0 && <div style={{ marginTop:12 }}><h4 style={S.sectionHead}>Enemies</h4>{selected.enemies.map(id => { const e = factions.find(f=>f.id===id); return <button key={id} onClick={() => e && navigate(`/factions/${entitySlug(e)}`)} style={{ ...S.microTag, border:"1px solid var(--danger)", color:"var(--danger)", padding:"2px 6px", borderRadius:3, marginRight:4, background:"transparent", cursor: e ? "pointer" : "default" }}>{e?.name||id}</button>; })}</div>}
          <CrossModuleLinksDisplay links={selected.crossModuleLinks} allData={allData} onNavigate={onNavigate} />
        </div>
        {(editing !== null && editing !== undefined) && <FactionModal entity={editing} species={species} factions={factions} allData={allData} apiPost={apiPost} onSave={e=>{onSave(e);setEditing(null);}} onDelete={id=>{onDelete(id);setEditing(null);navigate("/factions");}} onClose={()=>setEditing(null)} />}
      </div>
    );
  }

  // ─── List view (tree) ──────────────────────────────────────
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--border-faint)", display:"flex", gap:8, alignItems:"center" }}>
        <input style={{ ...S.input, flex:1, maxWidth:480 }} placeholder="Search factions…" value={search} onChange={e => setSearch(e.target.value)} />
        <button style={S.addBtn} onClick={() => setEditing(undefined)}>+ Faction</button>
      </div>
      <div style={{ padding:"8px 16px", display:"flex", gap:6, flexWrap:"wrap", borderBottom:"1px solid var(--border-faint)" }}>
        <span style={{ fontSize:10, color:"var(--text-dim)", fontFamily:"var(--font-mono)", letterSpacing:1, textTransform:"uppercase", alignSelf:"center", marginRight:4 }}>Type:</span>
        {FACTION_TYPES.map(c => {
          const on = activeTypes.has(c);
          return (
            <button key={c} onClick={() => toggleType(c)} style={{
              ...S.filterChip, fontSize:11,
              borderColor: on ? "var(--accent)" : "var(--border)",
              color: on ? "var(--accent)" : "var(--text-dim)",
              background: on ? "var(--accent-bg)" : "transparent",
            }}>{c}</button>
          );
        })}
      </div>
      <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"4px 16px" }}>
        <TreeList items={visible} nameKey="name" onSelect={f => navigate(`/factions/${entitySlug(f)}`)} selectedId={null} onEdit={setEditing}
          expanded={effectiveExpanded} onToggle={toggleExpand}
          getSubtitle={f => [f.shortName, f.type, f.status].filter(Boolean).join(" · ")}
          getColor={f => f.color || "var(--accent)"} />
      </div>
      {(editing !== null && editing !== undefined) && <FactionModal entity={editing} species={species} factions={factions} allData={allData} apiPost={apiPost} onSave={e=>{onSave(e);setEditing(null);}} onDelete={id=>{onDelete(id);setEditing(null);}} onClose={()=>setEditing(null)} />}
      {editing === undefined && <FactionModal entity={null} species={species} factions={factions} allData={allData} apiPost={apiPost} onSave={e=>{onSave(e);setEditing(null);navigate(`/factions/${entitySlug(e)}`);}} onDelete={()=>{}} onClose={()=>setEditing(null)} />}
    </div>
  );
}

function FactionModal({ entity, species, factions, allData, apiPost, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(entity || { id:uid(), name:"", shortName:"", color:"#5b8dd9", type:"government", motto:"", description:"", history:"", territory:"", leadership:"", species:[], status:"active", parentFaction:null, allies:[], enemies:[], imageUrl:"", crossModuleLinks:[] });
  const isNew = !entity; const set = (k,v) => setForm(f => ({ ...f,[k]:v }));
  const otherFactions = (factions||[]).filter(f => f.id !== form.id);
  return (
    <div style={S.overlay}><div style={{ ...S.modal, maxWidth:640 }}>
      <div style={S.modalHeader}><span style={S.modalHeaderDecor} /><h2 style={S.modalTitle}>{isNew?"New Faction":"Edit Faction"}</h2><button style={S.closeBtn} onClick={onClose}>✕</button></div>
      <div style={S.modalBody}>
        <div style={{ display:"flex",gap:14 }}>
          <div style={{ ...S.fieldRow,flex:2 }}><label style={S.label}>Name</label><input value={form.name} onChange={e=>set("name",e.target.value)} style={S.input} autoFocus /></div>
          <div style={{ ...S.fieldRow,flex:1 }}><label style={S.label}>Short Name</label><input value={form.shortName} onChange={e=>set("shortName",e.target.value)} style={S.input} placeholder="UEG" /></div>
          <div style={S.fieldRow}><label style={S.label}>Color</label><input type="color" value={form.color} onChange={e=>set("color",e.target.value)} style={{ width:40,height:36,border:"none",cursor:"pointer" }} /></div>
        </div>
        <div style={{ display:"flex",gap:14 }}>
          <div style={{ ...S.fieldRow,flex:1 }}><label style={S.label}>Type</label><select value={form.type} onChange={e=>set("type",e.target.value)} style={S.select}>{FACTION_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
          <div style={{ ...S.fieldRow,flex:1 }}><label style={S.label}>Status</label><select value={form.status} onChange={e=>set("status",e.target.value)} style={S.select}>{FACTION_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
          <div style={{ ...S.fieldRow,flex:1 }}><label style={S.label}>Parent Faction</label><select value={form.parentFaction||""} onChange={e=>set("parentFaction",e.target.value||null)} style={S.select}><option value="">— None —</option>{otherFactions.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
        </div>
        <div style={S.fieldRow}><label style={S.label}>Motto</label><input value={form.motto} onChange={e=>set("motto",e.target.value)} style={S.input} /></div>
        <div style={S.fieldRow}><label style={S.label}>Description</label><textarea value={form.description} onChange={e=>set("description",e.target.value)} style={{ ...S.input,minHeight:60,resize:"vertical",fontFamily:"inherit" }} /><div style={S.mdHint}>Markdown: **bold** *italic* - list ## heading</div></div>
        <div style={S.fieldRow}><label style={S.label}>Species</label><IdMultiSelect selected={form.species} options={(species||[]).map(s=>({id:s.id,name:s.name}))} onChange={v=>set("species",v)} /></div>
        <div style={S.fieldRow}><label style={S.label}>Allies</label><IdMultiSelect selected={form.allies} options={otherFactions.map(f=>({id:f.id,name:f.name}))} onChange={v=>set("allies",v)} /></div>
        <div style={S.fieldRow}><label style={S.label}>Enemies</label><IdMultiSelect selected={form.enemies} options={otherFactions.map(f=>({id:f.id,name:f.name}))} onChange={v=>set("enemies",v)} /></div>
        <div style={S.fieldRow}><label style={S.label}>Image</label><ImageUpload imageUrl={form.imageUrl} onUpload={url=>set("imageUrl",url)} entityType="faction" entityId={form.id} apiPost={apiPost} /></div>
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
