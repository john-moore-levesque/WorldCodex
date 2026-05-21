import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { uid, CrossModuleLinkEditor, CrossModuleLinksDisplay, TagInput, SPECIES_STATUSES, EntityList, ImageUpload, MarkdownBody, S, entitySlug, findBySlugOrId } from "./shared.jsx";

export default function SpeciesModule({ species, onSave, onDelete, allData, onNavigate, apiPost }) {
  const { id: selectedId } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [activeStatuses, setActiveStatuses] = useState(() => new Set(SPECIES_STATUSES));

  const selected = findBySlugOrId(species, selectedId);

  const filtered = useMemo(() =>
    (species||[]).filter(s =>
      activeStatuses.has(s.status || "unknown") &&
      (!search || s.name?.toLowerCase().includes(search.toLowerCase()))
    ),
    [species, search, activeStatuses]
  );

  const toggleStatus = c => setActiveStatuses(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });

  if (selectedId && !selected) {
    return (
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12 }}>
        <span style={S.empty}>Species not found.</span>
        <button style={S.ioBtn} onClick={() => navigate("/species")}>← Back to Species</button>
      </div>
    );
  }
  if (selected) {
    return (
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--border-faint)", display:"flex", gap:8, alignItems:"center" }}>
          <button style={S.ioBtn} onClick={() => navigate("/species")}>← Species</button>
          <div style={{ flex:1 }} />
          <button style={S.panelBtn} onClick={() => setEditing(selected)}>Edit</button>
        </div>
        <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"20px 32px", maxWidth:920, alignSelf:"center", width:"100%", boxSizing:"border-box" }}>
          {selected.imageUrl && <img src={selected.imageUrl} alt="" style={{ width:"100%", borderRadius:4, marginBottom:12, display:"block" }} />}
          <h2 style={S.detailTitle}>{selected.name}</h2>
          {selected.classification && <p style={{ ...S.detailSummary, fontStyle:"italic" }}>{selected.classification}</p>}
          {selected.homeworld && <p style={{ fontSize:12, color:"var(--text-muted)", fontFamily:"var(--font-mono)" }}>Homeworld: {selected.homeworld}</p>}
          {selected.traits?.length > 0 && <div style={{ display:"flex",gap:4,flexWrap:"wrap",marginTop:8 }}>{selected.traits.map((t,i) => <span key={i} style={{ ...S.microTag, border:"1px solid var(--border)", padding:"2px 6px", borderRadius:3 }}>{t}</span>)}</div>}
          {selected.physiology && <><h4 style={{ ...S.sectionHead, marginTop:16 }}>Physiology</h4><MarkdownBody style={{ marginTop:6 }}>{selected.physiology}</MarkdownBody></>}
          {selected.culture && <><h4 style={{ ...S.sectionHead, marginTop:12 }}>Culture</h4><MarkdownBody style={{ marginTop:6 }}>{selected.culture}</MarkdownBody></>}
          {selected.history && <><h4 style={{ ...S.sectionHead, marginTop:12 }}>History</h4><MarkdownBody style={{ marginTop:6 }}>{selected.history}</MarkdownBody></>}
          <CrossModuleLinksDisplay links={selected.crossModuleLinks} allData={allData} onNavigate={onNavigate} />
        </div>
        {(editing !== null && editing !== undefined) && <SpeciesModal entity={editing} allData={allData} apiPost={apiPost} onSave={e=>{onSave(e);setEditing(null);}} onDelete={id=>{onDelete(id);setEditing(null);navigate("/species");}} onClose={()=>setEditing(null)} />}
      </div>
    );
  }

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--border-faint)", display:"flex", gap:8, alignItems:"center" }}>
        <input style={{ ...S.input, flex:1, maxWidth:480 }} placeholder="Search species…" value={search} onChange={e => setSearch(e.target.value)} />
        <button style={S.addBtn} onClick={() => setEditing(undefined)}>+ Species</button>
      </div>
      <div style={{ padding:"8px 16px", display:"flex", gap:6, flexWrap:"wrap", borderBottom:"1px solid var(--border-faint)" }}>
        <span style={{ fontSize:10, color:"var(--text-dim)", fontFamily:"var(--font-mono)", letterSpacing:1, textTransform:"uppercase", alignSelf:"center", marginRight:4 }}>Status:</span>
        {SPECIES_STATUSES.map(c => {
          const on = activeStatuses.has(c);
          return (
            <button key={c} onClick={() => toggleStatus(c)} style={{
              ...S.filterChip, fontSize:11,
              borderColor: on ? "var(--accent-purple)" : "var(--border)",
              color: on ? "var(--accent-purple)" : "var(--text-dim)",
              background: on ? "color-mix(in srgb, var(--accent-purple) 12%, transparent)" : "transparent",
            }}>{c}</button>
          );
        })}
      </div>
      <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"4px 16px" }}>
        <EntityList items={filtered} nameKey="name" onSelect={s => navigate(`/species/${entitySlug(s)}`)} selectedId={null} onEdit={setEditing}
          getSubtitle={s => [s.classification, s.status].filter(Boolean).join(" · ")}
          getColor={() => "var(--accent-purple)"} />
      </div>
      {(editing !== null && editing !== undefined) && <SpeciesModal entity={editing} allData={allData} apiPost={apiPost} onSave={e=>{onSave(e);setEditing(null);}} onDelete={id=>{onDelete(id);setEditing(null);}} onClose={()=>setEditing(null)} />}
      {editing === undefined && <SpeciesModal entity={null} allData={allData} apiPost={apiPost} onSave={e=>{onSave(e);setEditing(null);navigate(`/species/${entitySlug(e)}`);}} onDelete={()=>{}} onClose={()=>setEditing(null)} />}
    </div>
  );
}

function SpeciesModal({ entity, allData, apiPost, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(entity || { id:uid(), name:"", classification:"", homeworld:"", physiology:"", culture:"", history:"", traits:[], status:"extant", imageUrl:"", crossModuleLinks:[] });
  const isNew = !entity; const set = (k,v) => setForm(f => ({ ...f,[k]:v }));
  return (
    <div style={S.overlay}><div style={S.modal}>
      <div style={S.modalHeader}><span style={S.modalHeaderDecor} /><h2 style={S.modalTitle}>{isNew?"New Species":"Edit Species"}</h2><button style={S.closeBtn} onClick={onClose}>✕</button></div>
      <div style={S.modalBody}>
        <div style={S.fieldRow}><label style={S.label}>Name</label><input value={form.name} onChange={e=>set("name",e.target.value)} style={S.input} autoFocus /></div>
        <div style={{ display:"flex",gap:14 }}>
          <div style={{ ...S.fieldRow,flex:1 }}><label style={S.label}>Classification</label><input value={form.classification} onChange={e=>set("classification",e.target.value)} style={S.input} placeholder="e.g. Carbon-based bipedal" /></div>
          <div style={{ ...S.fieldRow,flex:1 }}><label style={S.label}>Status</label><select value={form.status} onChange={e=>set("status",e.target.value)} style={S.select}>{SPECIES_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
        </div>
        <div style={S.fieldRow}><label style={S.label}>Homeworld</label><input value={form.homeworld} onChange={e=>set("homeworld",e.target.value)} style={S.input} /></div>
        <div style={S.fieldRow}><label style={S.label}>Traits</label><TagInput tags={form.traits} onChange={v=>set("traits",v)} placeholder="e.g. telepathic, silicon-based" /></div>
        <div style={S.fieldRow}><label style={S.label}>Physiology</label><textarea value={form.physiology} onChange={e=>set("physiology",e.target.value)} style={{ ...S.input,minHeight:60,resize:"vertical",fontFamily:"inherit" }} /><div style={S.mdHint}>Markdown: **bold** *italic* - list ## heading</div></div>
        <div style={S.fieldRow}><label style={S.label}>Culture</label><textarea value={form.culture} onChange={e=>set("culture",e.target.value)} style={{ ...S.input,minHeight:60,resize:"vertical",fontFamily:"inherit" }} /><div style={S.mdHint}>Markdown: **bold** *italic* - list ## heading</div></div>
        <div style={S.fieldRow}><label style={S.label}>History</label><textarea value={form.history} onChange={e=>set("history",e.target.value)} style={{ ...S.input,minHeight:60,resize:"vertical",fontFamily:"inherit" }} /><div style={S.mdHint}>Markdown: **bold** *italic* - list ## heading</div></div>
        <div style={S.fieldRow}><label style={S.label}>Image</label><ImageUpload imageUrl={form.imageUrl} onUpload={url=>set("imageUrl",url)} entityType="species" entityId={form.id} apiPost={apiPost} /></div>
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
