import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { uid, CrossModuleLinkEditor, CrossModuleLinksDisplay, IdMultiSelect, EntityList, TECH_CATEGORIES, TECH_STATUSES, TECH_SUBCATEGORIES, TECH_BY_ID, ImageUpload, MarkdownBody, S, entitySlug, findBySlugOrId } from "./shared.jsx";

export default function TechnologyModule({ technology, onSave, onDelete, allData, onNavigate, apiPost }) {
  const { id: selectedId } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [activeCats, setActiveCats] = useState(() => new Set(TECH_SUBCATEGORIES.map(s => s.id)));

  const selected = findBySlugOrId(technology, selectedId);

  const filtered = useMemo(() =>
    (technology||[]).filter(t => {
      const isKnown = !!TECH_BY_ID[t.category];
      return (isKnown ? activeCats.has(t.category) : true) &&
        (!search || t.name?.toLowerCase().includes(search.toLowerCase()));
    }),
    [technology, search, activeCats]
  );

  const toggleCat = c => setActiveCats(prev => {
    const n = new Set(prev);
    n.has(c) ? n.delete(c) : n.add(c);
    return n;
  });

  // ─── Detail view ───────────────────────────────────────────
  if (selectedId && !selected) {
    return (
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12 }}>
        <span style={S.empty}>Technology not found.</span>
        <button style={S.ioBtn} onClick={() => navigate("/technology")}>← Back to Technology</button>
      </div>
    );
  }
  if (selected) {
    return (
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--border-faint)", display:"flex", gap:8, alignItems:"center" }}>
          <button style={S.ioBtn} onClick={() => navigate("/technology")}>← Technology</button>
          <div style={{ flex:1 }} />
          <button style={S.panelBtn} onClick={() => setEditing(selected)}>Edit</button>
        </div>
        <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"20px 32px", maxWidth:920, alignSelf:"center", width:"100%", boxSizing:"border-box" }}>
          {selected.imageUrl && <img src={selected.imageUrl} alt="" style={{ width:"100%", borderRadius:4, marginBottom:12, display:"block" }} />}
          <h2 style={S.detailTitle}>{selected.name}</h2>
          <div style={{ display:"flex",gap:6,marginTop:8,flexWrap:"wrap" }}>
            {selected.category && (() => { const sub = TECH_BY_ID[selected.category]; const c = sub?.color ?? "var(--accent)"; return <span style={{ ...S.microTag,border:`1px solid ${c}`,color:c,padding:"2px 6px",borderRadius:3 }}>{sub?.label ?? selected.category}</span>; })()}
            {selected.status && <span style={{ ...S.microTag,border:"1px solid var(--border)",padding:"2px 6px",borderRadius:3 }}>{selected.status}</span>}
          </div>
          {selected.yearInvented && <p style={{ fontSize:12,color:"var(--text-muted)",fontFamily:"var(--font-mono)",marginTop:8 }}>Invented: {selected.yearInvented}{selected.yearObsoleted ? ` · Obsoleted: ${selected.yearObsoleted}` : ""}</p>}
          {selected.summary && <MarkdownBody style={{ marginTop:14, fontSize:14, color:"var(--text-secondary)" }}>{selected.summary}</MarkdownBody>}
          {selected.principles && <><h4 style={{ ...S.sectionHead,marginTop:16 }}>Principles</h4><MarkdownBody style={{ marginTop:6 }}>{selected.principles}</MarkdownBody></>}
          {selected.limitations && <><h4 style={{ ...S.sectionHead,marginTop:16 }}>Limitations</h4><MarkdownBody style={{ marginTop:6 }}>{selected.limitations}</MarkdownBody></>}
          {selected.prerequisites?.length > 0 && <div style={{ marginTop:16 }}><h4 style={S.sectionHead}>Prerequisites</h4>{selected.prerequisites.map(id => { const t = technology.find(x=>x.id===id); return <button key={id} onClick={() => t && navigate(`/technology/${entitySlug(t)}`)} style={{ ...S.microTag,border:"1px solid var(--warning)",color:"var(--warning)",padding:"2px 6px",borderRadius:3,marginRight:4,background:"transparent",cursor:t?"pointer":"default" }}>{t?.name||id}</button>; })}</div>}
          <CrossModuleLinksDisplay links={selected.crossModuleLinks} allData={allData} onNavigate={onNavigate} />
        </div>
        {(editing !== null && editing !== undefined) && <TechModal entity={editing} technology={technology} allData={allData} apiPost={apiPost} onSave={e=>{onSave(e);setEditing(null);}} onDelete={id=>{onDelete(id);setEditing(null);navigate("/technology");}} onClose={()=>setEditing(null)} />}
      </div>
    );
  }

  // ─── List view ────────────────────────────────────────────
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--border-faint)", display:"flex", gap:8, alignItems:"center" }}>
        <input style={{ ...S.input, flex:1, maxWidth:480 }} placeholder="Search technology…" value={search} onChange={e => setSearch(e.target.value)} />
        <button style={S.addBtn} onClick={() => setEditing(undefined)}>+ Technology</button>
      </div>
      <div style={{ padding:"8px 16px", display:"flex", gap:6, flexWrap:"wrap", borderBottom:"1px solid var(--border-faint)" }}>
        <span style={{ fontSize:10, color:"var(--text-dim)", fontFamily:"var(--font-mono)", letterSpacing:1, textTransform:"uppercase", alignSelf:"center", marginRight:4 }}>Subcategory:</span>
        {TECH_SUBCATEGORIES.map(s => {
          const on = activeCats.has(s.id);
          return (
            <button key={s.id} onClick={() => toggleCat(s.id)} style={{
              ...S.filterChip, fontSize:11,
              borderColor: on ? s.color : "var(--border)",
              color: on ? s.color : "var(--tag-neutral)",
              background: on ? s.soft : "transparent",
            }}>{s.label}</button>
          );
        })}
      </div>
      <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"4px 16px" }}>
        <EntityList items={filtered} nameKey="name" onSelect={t => navigate(`/technology/${entitySlug(t)}`)} selectedId={null} onEdit={setEditing}
          getSubtitle={t => [TECH_BY_ID[t.category]?.label ?? t.category, t.status, t.yearInvented && `${t.yearInvented}`].filter(Boolean).join(" · ")}
          getColor={t => TECH_BY_ID[t.category]?.color ?? "var(--tag-neutral)"} />
      </div>
      {(editing !== null && editing !== undefined) && <TechModal entity={editing} technology={technology} allData={allData} apiPost={apiPost} onSave={e=>{onSave(e);setEditing(null);}} onDelete={id=>{onDelete(id);setEditing(null);}} onClose={()=>setEditing(null)} />}
      {editing === undefined && <TechModal entity={null} technology={technology} allData={allData} apiPost={apiPost} onSave={e=>{onSave(e);setEditing(null);navigate(`/technology/${entitySlug(e)}`);}} onDelete={()=>{}} onClose={()=>setEditing(null)} />}
    </div>
  );
}

function TechModal({ entity, technology, allData, apiPost, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(entity || { id:uid(), name:"", category:"other", tier:"", inventor:"", yearInvented:null, yearObsoleted:null, summary:"", principles:"", limitations:"", impact:"", status:"theoretical", prerequisites:[], imageUrl:"", crossModuleLinks:[] });
  const isNew = !entity; const set = (k,v) => setForm(f => ({ ...f,[k]:v }));
  const otherTech = (technology||[]).filter(t => t.id !== form.id);
  return (
    <div style={S.overlay}><div style={S.modal}>
      <div style={S.modalHeader}><span style={S.modalHeaderDecor} /><h2 style={S.modalTitle}>{isNew?"New Technology":"Edit Technology"}</h2><button style={S.closeBtn} onClick={onClose}>✕</button></div>
      <div style={S.modalBody}>
        <div style={S.fieldRow}><label style={S.label}>Name</label><input value={form.name} onChange={e=>set("name",e.target.value)} style={S.input} autoFocus /></div>
        <div style={{ display:"flex",gap:14 }}>
          <div style={{ ...S.fieldRow,flex:1 }}><label style={S.label}>Category</label><select value={form.category} onChange={e=>set("category",e.target.value)} style={S.select}>{TECH_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          <div style={{ ...S.fieldRow,flex:1 }}><label style={S.label}>Status</label><select value={form.status} onChange={e=>set("status",e.target.value)} style={S.select}>{TECH_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
        </div>
        <div style={{ display:"flex",gap:14 }}>
          <div style={{ ...S.fieldRow,flex:1 }}><label style={S.label}>Year Invented</label><input type="number" value={form.yearInvented||""} onChange={e=>set("yearInvented",e.target.value?+e.target.value:null)} style={S.input} /></div>
          <div style={{ ...S.fieldRow,flex:1 }}><label style={S.label}>Year Obsoleted</label><input type="number" value={form.yearObsoleted||""} onChange={e=>set("yearObsoleted",e.target.value?+e.target.value:null)} style={S.input} /></div>
        </div>
        <div style={S.fieldRow}><label style={S.label}>Tier</label><input value={form.tier} onChange={e=>set("tier",e.target.value)} style={S.input} placeholder="e.g. Tier 3 — Interstellar" /></div>
        <div style={S.fieldRow}><label style={S.label}>Inventor</label><input value={form.inventor} onChange={e=>set("inventor",e.target.value)} style={S.input} /></div>
        <div style={S.fieldRow}><label style={S.label}>Summary</label><textarea value={form.summary} onChange={e=>set("summary",e.target.value)} style={{ ...S.input,minHeight:60,resize:"vertical",fontFamily:"inherit" }} /><div style={S.mdHint}>Markdown: **bold** *italic* - list ## heading</div></div>
        <div style={S.fieldRow}><label style={S.label}>Prerequisites</label><IdMultiSelect selected={form.prerequisites} options={otherTech.map(t=>({id:t.id,name:t.name}))} onChange={v=>set("prerequisites",v)} /></div>
        <div style={S.fieldRow}><label style={S.label}>Image</label><ImageUpload imageUrl={form.imageUrl} onUpload={url=>set("imageUrl",url)} entityType="technology" entityId={form.id} apiPost={apiPost} /></div>
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
