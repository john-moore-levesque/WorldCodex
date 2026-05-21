import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { uid, CrossModuleLinkEditor, CrossModuleLinksDisplay, IdMultiSelect, ImageUpload, MarkdownBody, STORY_STATUSES, STORY_RELATION_TYPES, S, entitySlug, findBySlugOrId } from "./shared.jsx";

const STATUS_COLORS = { draft:"var(--text-dim)", "in-progress":"var(--warning)", complete:"var(--success)" };

export default function StoriesModule({ stories, onSave, onDelete, allData, onNavigate, apiPost }) {
  const { id: selectedId } = useParams();
  const navigate = useNavigate();
  const selected = findBySlugOrId(stories, selectedId);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [hoveredId, setHoveredId] = useState(null);
  const [activeStatuses, setActiveStatuses] = useState(() => new Set(STORY_STATUSES));

  const filtered = useMemo(() => {
    const base = (stories||[]).filter(s =>
      activeStatuses.has(s.status || "draft") &&
      (!search || s.title?.toLowerCase().includes(search.toLowerCase()))
    );
    const topLevel = base.filter(s => !s.parentStory);
    const chapters = base.filter(s => !!s.parentStory);
    const result = [];
    for (const story of topLevel) {
      result.push({ ...story, _isParent: true });
      chapters.filter(c => c.parentStory === story.id).forEach(c => result.push({ ...c, _isChapter: true }));
    }
    chapters.filter(c => !topLevel.find(s => s.id === c.parentStory)).forEach(c => result.push({ ...c, _isChapter: true }));
    return result;
  }, [stories, search, activeStatuses]);

  const toggleStatus = c => setActiveStatuses(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });

  const getSubtitle = s => {
    const parts = [s.status];
    if (s.parentStory) {
      const parent = (stories||[]).find(x => x.id === s.parentStory);
      if (parent) parts.push(`Chapter of: ${parent.title}`);
    }
    if (s.characters?.length) parts.push(`${s.characters.length} character${s.characters.length>1?"s":""}`);
    return parts.filter(Boolean).join(" · ");
  };

  if (selectedId && !selected) {
    return (
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12 }}>
        <span style={S.empty}>Story not found.</span>
        <button style={S.ioBtn} onClick={() => navigate("/stories")}>← Back to Stories</button>
      </div>
    );
  }
  if (selected) {
    const parent = selected.parentStory ? (stories||[]).find(s => s.id === selected.parentStory) : null;
    const chapters = (stories||[]).filter(s => s.parentStory === selected.id);
    return (
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--border-faint)", display:"flex", gap:8, alignItems:"center" }}>
          <button style={S.ioBtn} onClick={() => navigate("/stories")}>← Stories</button>
          <div style={{ flex:1 }} />
          <button style={S.panelBtn} onClick={() => setEditing(selected)}>Edit</button>
        </div>
        <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"20px 32px", maxWidth:920, alignSelf:"center", width:"100%", boxSizing:"border-box" }}>
          {selected.imageUrl && <img src={selected.imageUrl} alt="" style={{ width:"100%", borderRadius:4, marginBottom:12, display:"block" }} />}
          <h2 style={S.detailTitle}>{selected.title}</h2>
          <div style={{ marginTop:6, display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
            <span style={{ fontSize:11, fontFamily:"var(--font-mono)", textTransform:"uppercase", letterSpacing:1, color:STATUS_COLORS[selected.status]||"var(--text-dim)" }}>{selected.status}</span>
            {parent && (
              <button onClick={() => navigate(`/stories/${entitySlug(parent)}`)} style={{ ...S.ioBtn, fontSize:11 }}>↑ {parent.title}</button>
            )}
          </div>
          {selected.summary && <p style={{ ...S.detailSummary, marginTop:14 }}>{selected.summary}</p>}
          {selected.content && <MarkdownBody>{selected.content}</MarkdownBody>}
          {chapters.length > 0 && (
            <div style={{ marginTop:16 }}>
              <h4 style={S.sectionHead}>Chapters</h4>
              {chapters.map(c => (
                <button key={c.id} onClick={() => navigate(`/stories/${entitySlug(c)}`)} style={S.linkedEvent}>
                  <span style={{ fontSize:9,textTransform:"uppercase",color:STATUS_COLORS[c.status]||"var(--accent)",fontFamily:"var(--font-mono)",marginRight:8,letterSpacing:1 }}>{c.status}</span>
                  {c.title}
                </button>
              ))}
            </div>
          )}

          {selected.relatedStories?.length > 0 && (
            <div style={{ marginTop:12 }}>
              <h4 style={S.sectionHead}>Related Stories</h4>
              {selected.relatedStories.map((r,i) => { const s = (stories||[]).find(x=>x.id===r.id); return (
                <button key={i} onClick={() => onNavigate("story", r.id)} style={S.linkedEvent}>
                  <span style={{ fontSize:9,textTransform:"uppercase",color:"var(--accent-purple)",fontFamily:"var(--font-mono)",marginRight:8,letterSpacing:1 }}>{r.relation}</span>
                  {s?.title||r.id}
                </button>
              ); })}
            </div>
          )}

          {selected.characters?.length > 0 && (
            <div style={{ marginTop:12 }}>
              <h4 style={S.sectionHead}>Characters</h4>
              {selected.characters.map(id => { const c = allData.characters?.find(x=>x.id===id); return <button key={id} onClick={()=>onNavigate("character",id)} style={S.linkedEvent}><span style={{ fontSize:9,textTransform:"uppercase",color:"var(--accent)",fontFamily:"var(--font-mono)",marginRight:8,letterSpacing:1 }}>char</span>{c?.name||id}</button>; })}
            </div>
          )}

          {[
            ["species","Species","name"],
            ["factions","Factions","name"],
            ["locations","Locations","name"],
            ["events","Events","title"],
            ["technology","Technology","name"],
            ["lore","Lore","title"],
          ].map(([field, label, nameKey]) => selected[field]?.length > 0 && (
            <div key={field} style={{ marginTop:8 }}>
              <h4 style={S.sectionHead}>{label}</h4>
              {selected[field].map(id => { const entity = allData[field]?.find(x=>x.id===id) || allData.technology?.find(x=>x.id===id); const resolvedLabel = field==="technology" ? allData.technology?.find(x=>x.id===id)?.[nameKey] : allData[field]?.find(x=>x.id===id)?.[nameKey]; const typeMap = {species:"species",factions:"faction",locations:"location",events:"event",technology:"tech",lore:"lore"}; return <button key={id} onClick={()=>onNavigate(typeMap[field],id)} style={S.linkedEvent}><span style={{ fontSize:9,textTransform:"uppercase",color:"var(--accent)",fontFamily:"var(--font-mono)",marginRight:8,letterSpacing:1 }}>{typeMap[field]}</span>{resolvedLabel||id}</button>; })}
            </div>
          ))}

          <CrossModuleLinksDisplay links={selected.crossModuleLinks} allData={allData} onNavigate={onNavigate} />
        </div>
        {(editing !== null && editing !== undefined) && <StoryModal entity={editing} stories={stories} allData={allData} apiPost={apiPost} onSave={e=>{onSave(e);setEditing(null);}} onDelete={id=>{onDelete(id);setEditing(null);navigate("/stories");}} onClose={()=>setEditing(null)} />}
      </div>
    );
  }

  // ─── List view ─────────────────────────────────────────────
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--border-faint)", display:"flex", gap:8, alignItems:"center" }}>
        <input style={{ ...S.input, flex:1, maxWidth:480 }} placeholder="Search stories…" value={search} onChange={e => setSearch(e.target.value)} />
        <button style={S.addBtn} onClick={() => setEditing(undefined)}>+ Story</button>
      </div>
      <div style={{ padding:"8px 16px", display:"flex", gap:6, flexWrap:"wrap", borderBottom:"1px solid var(--border-faint)" }}>
        <span style={{ fontSize:10, color:"var(--text-dim)", fontFamily:"var(--font-mono)", letterSpacing:1, textTransform:"uppercase", alignSelf:"center", marginRight:4 }}>Status:</span>
        {STORY_STATUSES.map(c => {
          const on = activeStatuses.has(c);
          const color = STATUS_COLORS[c] || "var(--accent)";
          return (
            <button key={c} onClick={() => toggleStatus(c)} style={{
              ...S.filterChip, fontSize:11,
              borderColor: on ? color : "var(--border)",
              color: on ? color : "var(--text-dim)",
              background: on ? `color-mix(in srgb, ${color} 12%, transparent)` : "transparent",
            }}>{c}</button>
          );
        })}
      </div>
      <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"4px 16px" }}>
        {filtered.length === 0 && <div style={S.empty}>{(stories||[]).length===0?"No stories yet. Click the button above to add one.":"No stories match filters."}</div>}
        {filtered.map(item => {
          const color = STATUS_COLORS[item.status] || "var(--accent)";
          return (
            <div key={item.id} onClick={() => navigate(`/stories/${entitySlug(item)}`)}
              onMouseEnter={() => setHoveredId(item.id)} onMouseLeave={() => setHoveredId(null)}
              style={{ ...S.eventRow, borderLeftColor:color, background: hoveredId===item.id ? "var(--bg-hover)" : "transparent", paddingLeft: item._isChapter ? 28 : 14, animation:"fadeIn 0.2s ease" }}>
              <div style={S.eventBody}>
                <div style={S.eventTitle}>
                  {item._isChapter && <span style={{ fontSize:10, color:"var(--text-dim)", marginRight:6, fontFamily:"var(--font-mono)" }}>└</span>}
                  {item.title}
                </div>
                <div style={S.eventSummary}>{getSubtitle(item)}</div>
              </div>
              <button style={S.editRowBtn} onClick={e=>{e.stopPropagation();setEditing(item);}}>✎</button>
            </div>
          );
        })}
      </div>
      {(editing !== null && editing !== undefined) && <StoryModal entity={editing} stories={stories} allData={allData} apiPost={apiPost} onSave={e=>{onSave(e);setEditing(null);}} onDelete={id=>{onDelete(id);setEditing(null);}} onClose={()=>setEditing(null)} />}
      {editing === undefined && <StoryModal entity={null} stories={stories} allData={allData} apiPost={apiPost} onSave={e=>{onSave(e);setEditing(null);navigate(`/stories/${entitySlug(e)}`);}} onDelete={()=>{}} onClose={()=>setEditing(null)} />}
    </div>
  );
}

function RelatedStoriesEditor({ relatedStories, allStories, currentId, onChange }) {
  const available = (allStories||[]).filter(s => s.id !== currentId && !(relatedStories||[]).find(r=>r.id===s.id));
  const [sel, setSel] = useState("");
  const [rel, setRel] = useState("sequel");
  const add = () => { if (!sel) return; onChange([...(relatedStories||[]), { id:sel, relation:rel }]); setSel(""); };
  return (
    <div>
      {(relatedStories||[]).map((r,i) => { const s = (allStories||[]).find(x=>x.id===r.id); return (
        <div key={i} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
          <span style={{ ...S.filterChip, borderColor:"var(--accent-purple)", color:"var(--accent-purple)", fontSize:10, textTransform:"uppercase", letterSpacing:1 }}>{r.relation}</span>
          <span style={{ flex:1, fontSize:13, color:"var(--text-body)" }}>{s?.title||r.id}</span>
          <button onClick={() => onChange((relatedStories||[]).filter((_,j)=>j!==i))} style={{ ...S.ioBtn, padding:"2px 8px", fontSize:11, color:"var(--danger)" }}>✕</button>
        </div>
      ); })}
      {available.length > 0 && (
        <div style={{ display:"flex", gap:6, marginTop:4 }}>
          <select value={sel} onChange={e=>setSel(e.target.value)} style={{ ...S.select, flex:2 }}>
            <option value="">— Select story —</option>
            {available.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <select value={rel} onChange={e=>setRel(e.target.value)} style={{ ...S.select, flex:1 }}>
            {STORY_RELATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={add} style={{ ...S.ioBtn, flexShrink:0 }} disabled={!sel}>+</button>
        </div>
      )}
    </div>
  );
}

function StoryModal({ entity, stories, allData, apiPost, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(entity || { id:uid(), title:"", summary:"", content:"", status:"draft", parentStory:null, relatedStories:[], characters:[], species:[], factions:[], locations:[], events:[], technology:[], lore:[], imageUrl:"", crossModuleLinks:[] });
  const [preview, setPreview] = useState(false);
  const isNew = !entity;
  const set = (k,v) => setForm(f => ({ ...f, [k]:v }));
  const otherStories = (stories||[]).filter(s => s.id !== form.id);

  return (
    <div style={S.overlay}><div style={{ ...S.modal, maxWidth:720 }}>
      <div style={S.modalHeader}><span style={S.modalHeaderDecor} /><h2 style={S.modalTitle}>{isNew?"New Story":"Edit Story"}</h2><button style={S.closeBtn} onClick={onClose}>✕</button></div>
      <div style={S.modalBody}>
        <div style={{ display:"flex", gap:14 }}>
          <div style={{ ...S.fieldRow, flex:2 }}><label style={S.label}>Title</label><input value={form.title} onChange={e=>set("title",e.target.value)} style={S.input} autoFocus /></div>
          <div style={{ ...S.fieldRow, flex:1 }}><label style={S.label}>Status</label><select value={form.status} onChange={e=>set("status",e.target.value)} style={S.select}>{STORY_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
        </div>
        <div style={S.fieldRow}><label style={S.label}>Summary</label><input value={form.summary} onChange={e=>set("summary",e.target.value)} style={S.input} /></div>
        <div style={S.fieldRow}><label style={S.label}>Parent Story (for chapters)</label><select value={form.parentStory||""} onChange={e=>set("parentStory",e.target.value||null)} style={S.select}><option value="">— Standalone Story —</option>{otherStories.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></div>
        <div style={S.fieldRow}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
            <label style={S.label}>Content</label>
            <button onClick={() => setPreview(p=>!p)} style={{ ...S.ioBtn, fontSize:10 }}>{preview?"Edit":"Preview"}</button>
          </div>
          {preview
            ? <div style={{ border:"1px solid var(--border)", borderRadius:4, padding:"8px 12px", minHeight:160, background:"var(--bg-input)" }}><MarkdownBody>{form.content||"_Nothing to preview yet._"}</MarkdownBody></div>
            : <textarea value={form.content} onChange={e=>set("content",e.target.value)} style={{ ...S.input, minHeight:160, resize:"vertical", fontFamily:"var(--font-mono)", fontSize:13 }} />
          }
          {!preview && <div style={S.mdHint}>Markdown: **bold** *italic* - list ## heading `code` &gt; quote</div>}
        </div>
        <div style={S.fieldRow}><label style={S.label}>Related Stories</label><RelatedStoriesEditor relatedStories={form.relatedStories} allStories={otherStories} currentId={form.id} onChange={v=>set("relatedStories",v)} /></div>
        <div style={S.fieldRow}><label style={S.label}>Characters</label><IdMultiSelect selected={form.characters} options={(allData.characters||[]).map(c=>({id:c.id,name:c.name}))} onChange={v=>set("characters",v)} /></div>
        <div style={S.fieldRow}><label style={S.label}>Species</label><IdMultiSelect selected={form.species} options={(allData.species||[]).map(s=>({id:s.id,name:s.name}))} onChange={v=>set("species",v)} /></div>
        <div style={S.fieldRow}><label style={S.label}>Factions</label><IdMultiSelect selected={form.factions} options={(allData.factions||[]).map(f=>({id:f.id,name:f.name}))} onChange={v=>set("factions",v)} /></div>
        <div style={S.fieldRow}><label style={S.label}>Locations</label><IdMultiSelect selected={form.locations} options={(allData.locations||[]).map(l=>({id:l.id,name:l.name}))} onChange={v=>set("locations",v)} /></div>
        <div style={S.fieldRow}><label style={S.label}>Timeline Events</label><IdMultiSelect selected={form.events} options={(allData.events||[]).map(e=>({id:e.id,name:`${e.year} — ${e.title}`}))} onChange={v=>set("events",v)} /></div>
        <div style={S.fieldRow}><label style={S.label}>Technology</label><IdMultiSelect selected={form.technology} options={(allData.technology||[]).map(t=>({id:t.id,name:t.name}))} onChange={v=>set("technology",v)} /></div>
        <div style={S.fieldRow}><label style={S.label}>Lore</label><IdMultiSelect selected={form.lore} options={(allData.lore||[]).map(l=>({id:l.id,name:l.title}))} onChange={v=>set("lore",v)} /></div>
        <div style={S.fieldRow}><label style={S.label}>Image</label><ImageUpload imageUrl={form.imageUrl} onUpload={url=>set("imageUrl",url)} entityType="story" entityId={form.id} apiPost={apiPost} /></div>
        <div style={S.fieldRow}><label style={S.label}>Cross-Module Links</label><CrossModuleLinkEditor links={form.crossModuleLinks} allData={allData} onChange={v=>set("crossModuleLinks",v)} /></div>
      </div>
      <div style={S.modalFooter}>
        {!isNew && <button style={S.deleteBtn} onClick={() => onDelete(form.id)}>Delete</button>}
        <div style={{flex:1}} /><button style={S.cancelBtn} onClick={onClose}>Cancel</button>
        <button style={S.saveBtn} onClick={() => onSave(form)} disabled={!form.title.trim()}>{isNew?"Add":"Save"}</button>
      </div>
    </div></div>
  );
}
