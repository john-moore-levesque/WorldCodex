import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { uid, CrossModuleLinkEditor, CrossModuleLinksDisplay, IdMultiSelect, EntityList, ImageUpload, MarkdownBody, S, entitySlug, findBySlugOrId } from "./shared.jsx";

export default function CharactersModule({ characters, species, factions, stories, onSave, onDelete, allData, onNavigate, apiPost }) {
  const { id: selectedId } = useParams();
  const navigate = useNavigate();
  const selected = findBySlugOrId(characters, selectedId);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => (characters||[]).filter(c => !search || c.name?.toLowerCase().includes(search.toLowerCase())), [characters, search]);
  const getSpeciesNames = ids => (ids||[]).map(id => species?.find(s=>s.id===id)?.name).filter(Boolean).join(" · ");
  const getFactionNames = ids => (ids||[]).map(id => factions?.find(f=>f.id===id)?.name).filter(Boolean).join(" · ");

  if (selectedId && !selected) {
    return (
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12 }}>
        <span style={S.empty}>Character not found.</span>
        <button style={S.ioBtn} onClick={() => navigate("/characters")}>← Back to Characters</button>
      </div>
    );
  }
  if (selected) {
    return (
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--border-faint)", display:"flex", gap:8, alignItems:"center" }}>
          <button style={S.ioBtn} onClick={() => navigate("/characters")}>← Characters</button>
          <div style={{ flex:1 }} />
          <button style={S.panelBtn} onClick={() => setEditing(selected)}>Edit</button>
        </div>
        <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"20px 32px", maxWidth:920, alignSelf:"center", width:"100%", boxSizing:"border-box" }}>
          {selected.imageUrl && <img src={selected.imageUrl} alt="" style={{ width:"100%", borderRadius:4, marginBottom:12, display:"block" }} />}
          <h2 style={S.detailTitle}>{selected.name}</h2>
          {selected.bio && <><h4 style={{ ...S.sectionHead, marginTop:14 }}>Bio</h4><MarkdownBody>{selected.bio}</MarkdownBody></>}
          {selected.physicalDescription && <><h4 style={{ ...S.sectionHead, marginTop:14 }}>Physical Description</h4><p style={S.detailSummary}>{selected.physicalDescription}</p></>}
          {selected.motivations && <><h4 style={{ ...S.sectionHead, marginTop:14 }}>Motivations</h4><p style={S.detailSummary}>{selected.motivations}</p></>}
          {selected.backstory && <><h4 style={{ ...S.sectionHead, marginTop:14 }}>Backstory</h4><MarkdownBody>{selected.backstory}</MarkdownBody></>}
          {selected.species?.length > 0 && (
            <div style={{ marginTop:12 }}>
              <h4 style={S.sectionHead}>Species</h4>
              {selected.species.map(id => { const s = species?.find(x=>x.id===id); return <button key={id} onClick={() => s && navigate(`/species/${entitySlug(s)}`)} style={{ ...S.microTag, border:"1px solid var(--border)", color:"var(--text-secondary)", padding:"2px 6px", borderRadius:3, marginRight:4, background:"transparent", cursor: s ? "pointer" : "default" }}>{s?.name||id}</button>; })}
            </div>
          )}
          {selected.factions?.length > 0 && (
            <div style={{ marginTop:8 }}>
              <h4 style={S.sectionHead}>Factions</h4>
              {selected.factions.map(id => { const f = factions?.find(x=>x.id===id); return <button key={id} onClick={() => f && navigate(`/factions/${entitySlug(f)}`)} style={{ ...S.microTag, border:"1px solid var(--border)", color:f?.color||"var(--text-secondary)", padding:"2px 6px", borderRadius:3, marginRight:4, background:"transparent", cursor: f ? "pointer" : "default" }}>{f?.name||id}</button>; })}
            </div>
          )}
          {selected.allies?.length > 0 && (
            <div style={{ marginTop:8 }}>
              <h4 style={S.sectionHead}>Allies</h4>
              {selected.allies.map(id => { const c = characters?.find(x=>x.id===id); return <button key={id} onClick={() => c && navigate(`/characters/${entitySlug(c)}`)} style={{ ...S.microTag, border:"1px solid var(--success)", color:"var(--success)", padding:"2px 6px", borderRadius:3, marginRight:4, background:"transparent", cursor: c ? "pointer" : "default" }}>{c?.name||id}</button>; })}
            </div>
          )}
          {selected.enemies?.length > 0 && (
            <div style={{ marginTop:8 }}>
              <h4 style={S.sectionHead}>Enemies</h4>
              {selected.enemies.map(id => { const c = characters?.find(x=>x.id===id); return <button key={id} onClick={() => c && navigate(`/characters/${entitySlug(c)}`)} style={{ ...S.microTag, border:"1px solid var(--danger)", color:"var(--danger)", padding:"2px 6px", borderRadius:3, marginRight:4, background:"transparent", cursor: c ? "pointer" : "default" }}>{c?.name||id}</button>; })}
            </div>
          )}
          {selected.events?.length > 0 && (
            <div style={{ marginTop:12 }}>
              <h4 style={S.sectionHead}>Timeline Events</h4>
              {selected.events.map(id => { const ev = allData.events?.find(e=>e.id===id); return (
                <button key={id} onClick={() => onNavigate("event", id)} style={S.linkedEvent}>
                  <span style={{ fontSize:9,textTransform:"uppercase",color:"var(--accent)",fontFamily:"var(--font-mono)",marginRight:8,letterSpacing:1 }}>event</span>
                  {ev?.title||id}
                </button>
              ); })}
            </div>
          )}
          {(() => {
            const appearsIn = (stories||[]).filter(s => s.characters?.includes(selected.id));
            if (!appearsIn.length) return null;
            return (
              <div style={{ marginTop:12 }}>
                <h4 style={S.sectionHead}>Appears In</h4>
                {appearsIn.map(s => (
                  <button key={s.id} onClick={() => onNavigate("story", s.id)} style={S.linkedEvent}>
                    <span style={{ fontSize:9,textTransform:"uppercase",color:"var(--accent)",fontFamily:"var(--font-mono)",marginRight:8,letterSpacing:1 }}>story</span>
                    {s.title}
                  </button>
                ))}
              </div>
            );
          })()}
          <CrossModuleLinksDisplay links={selected.crossModuleLinks} allData={allData} onNavigate={onNavigate} />
        </div>
        {(editing !== null && editing !== undefined) && <CharacterModal entity={editing} species={species} factions={factions} characters={characters} allData={allData} apiPost={apiPost} onSave={e=>{onSave(e);setEditing(null);}} onDelete={id=>{onDelete(id);setEditing(null);navigate("/characters");}} onClose={()=>setEditing(null)} />}
      </div>
    );
  }

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--border-faint)", display:"flex", gap:8, alignItems:"center" }}>
        <input style={{ ...S.input, flex:1, maxWidth:480 }} placeholder="Search characters…" value={search} onChange={e => setSearch(e.target.value)} />
        <button style={S.addBtn} onClick={() => setEditing(undefined)}>+ Character</button>
      </div>
      <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"4px 16px" }}>
        <EntityList items={filtered} nameKey="name" onSelect={c => navigate(`/characters/${entitySlug(c)}`)} selectedId={null} onEdit={setEditing}
          getSubtitle={c => [getSpeciesNames(c.species), getFactionNames(c.factions)].filter(Boolean).join(" · ")}
          getColor={() => "var(--accent)"} />
      </div>
      {(editing !== null && editing !== undefined) && <CharacterModal entity={editing} species={species} factions={factions} characters={characters} allData={allData} apiPost={apiPost} onSave={e=>{onSave(e);setEditing(null);}} onDelete={id=>{onDelete(id);setEditing(null);}} onClose={()=>setEditing(null)} />}
      {editing === undefined && <CharacterModal entity={null} species={species} factions={factions} characters={characters} allData={allData} apiPost={apiPost} onSave={e=>{onSave(e);setEditing(null);navigate(`/characters/${entitySlug(e)}`);}} onDelete={()=>{}} onClose={()=>setEditing(null)} />}
    </div>
  );
}

function CharacterModal({ entity, species, factions, characters, allData, apiPost, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(entity || { id:uid(), name:"", bio:"", physicalDescription:"", motivations:"", backstory:"", species:[], factions:[], allies:[], enemies:[], events:[], imageUrl:"", crossModuleLinks:[] });
  const isNew = !entity;
  const set = (k,v) => setForm(f => ({ ...f, [k]:v }));
  const otherChars = (characters||[]).filter(c => c.id !== form.id);

  return (
    <div style={S.overlay}><div style={{ ...S.modal, maxWidth:660 }}>
      <div style={S.modalHeader}><span style={S.modalHeaderDecor} /><h2 style={S.modalTitle}>{isNew?"New Character":"Edit Character"}</h2><button style={S.closeBtn} onClick={onClose}>✕</button></div>
      <div style={S.modalBody}>
        <div style={S.fieldRow}><label style={S.label}>Name</label><input value={form.name} onChange={e=>set("name",e.target.value)} style={S.input} autoFocus /></div>
        <div style={S.fieldRow}><label style={S.label}>Bio</label><textarea value={form.bio} onChange={e=>set("bio",e.target.value)} style={{ ...S.input, minHeight:80, resize:"vertical", fontFamily:"inherit" }} /><div style={S.mdHint}>Markdown: **bold** *italic* - list ## heading</div></div>
        <div style={S.fieldRow}><label style={S.label}>Physical Description</label><input value={form.physicalDescription} onChange={e=>set("physicalDescription",e.target.value)} style={S.input} /></div>
        <div style={S.fieldRow}><label style={S.label}>Motivations</label><input value={form.motivations} onChange={e=>set("motivations",e.target.value)} style={S.input} /></div>
        <div style={S.fieldRow}><label style={S.label}>Backstory</label><textarea value={form.backstory} onChange={e=>set("backstory",e.target.value)} style={{ ...S.input, minHeight:80, resize:"vertical", fontFamily:"inherit" }} /><div style={S.mdHint}>Markdown: **bold** *italic* - list ## heading</div></div>
        <div style={S.fieldRow}><label style={S.label}>Species</label><IdMultiSelect selected={form.species} options={(species||[]).map(s=>({id:s.id,name:s.name}))} onChange={v=>set("species",v)} /></div>
        <div style={S.fieldRow}><label style={S.label}>Factions</label><IdMultiSelect selected={form.factions} options={(factions||[]).map(f=>({id:f.id,name:f.name}))} onChange={v=>set("factions",v)} /></div>
        <div style={S.fieldRow}><label style={S.label}>Allies</label><IdMultiSelect selected={form.allies} options={otherChars.map(c=>({id:c.id,name:c.name}))} onChange={v=>set("allies",v)} /></div>
        <div style={S.fieldRow}><label style={S.label}>Enemies</label><IdMultiSelect selected={form.enemies} options={otherChars.map(c=>({id:c.id,name:c.name}))} onChange={v=>set("enemies",v)} /></div>
        <div style={S.fieldRow}><label style={S.label}>Timeline Events</label><IdMultiSelect selected={form.events} options={(allData.events||[]).map(e=>({id:e.id,name:`${e.year} — ${e.title}`}))} onChange={v=>set("events",v)} /></div>
        <div style={S.fieldRow}><label style={S.label}>Image</label><ImageUpload imageUrl={form.imageUrl} onUpload={url=>set("imageUrl",url)} entityType="character" entityId={form.id} apiPost={apiPost} /></div>
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
