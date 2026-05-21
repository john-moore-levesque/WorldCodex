import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { uid, CrossModuleLinkEditor, CrossModuleLinksDisplay, EVENT_CATEGORIES, ImageUpload, MarkdownBody, S, entitySlug, findBySlugOrId } from "./shared.jsx";

const TIME_UNIT = (() => { try { return import.meta.env?.VITE_TIME_UNIT || "Year"; } catch { return "Year"; } })();
const ERA_KINDS = [
  { id: "in-system", label: "In-System" },
  { id: "transit",   label: "Transit" },
  { id: "stasis",    label: "Stasis" },
];

// Given the era list, build a crew-time mapper. Crew time pauses while the
// crew is in stasis: events strictly after a stasis era subtract that era's
// duration; events *inside* a stasis era pin to the era's startYear (the
// crew "experiences" them on wake-up). Overlapping stasis eras are summed
// naively — author's responsibility to keep them disjoint.
function buildCrewTimeFn(eras) {
  const stasis = (eras || [])
    .filter(e => e.kind === "stasis" && typeof e.startYear === "number" && typeof e.endYear === "number")
    .map(e => ({ start: Math.min(e.startYear, e.endYear), end: Math.max(e.startYear, e.endYear) }))
    .sort((a, b) => a.start - b.start);
  if (stasis.length === 0) return (y) => y;
  return (y) => {
    let crew = y;
    for (const s of stasis) {
      if (y >= s.end) crew -= (s.end - s.start);
      else if (y > s.start) crew -= (y - s.start);
    }
    return crew;
  };
}

export default function TimelineModule({ events, eras, factions, characters, onSaveEvent, onDeleteEvent, onSaveEras, allData, onNavigate, apiPost }) {
  const { id: selectedId } = useParams();
  const navigate = useNavigate();
  const selected = findBySlugOrId(events, selectedId);
  const [editing, setEditing] = useState(null);
  const [showEras, setShowEras] = useState(false);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("list");
  const [filterCats, setFilterCats] = useState(new Set(EVENT_CATEGORIES.map(c=>c.id)));
  const [hoveredId, setHoveredId] = useState(null);
  const [showCharacters, setShowCharacters] = useState(false);
  const [filterChars, setFilterChars] = useState(new Set());
  const [timeAxis, setTimeAxis] = useState("ship");

  const crewTime = useMemo(() => buildCrewTimeFn(eras), [eras]);
  const hasStasis = useMemo(() => (eras||[]).some(e => e.kind === "stasis"), [eras]);
  const axisOf = (y) => timeAxis === "crew" ? crewTime(y) : y;
  const formatBadge = (ship) => {
    const crew = crewTime(ship);
    if (ship === crew) return String(ship);
    return timeAxis === "crew" ? `${crew} / ${ship}` : `${ship} / ${crew}`;
  };

  // Build a map of eventId -> characters associated with that event
  const charsByEvent = useMemo(() => {
    const m = {};
    (characters||[]).forEach(c => (c.events||[]).forEach(eid => { (m[eid] = m[eid]||[]).push(c); }));
    return m;
  }, [characters]);

  const sorted = useMemo(() =>
    events.filter(e => filterCats.has(e.category))
      .filter(e => !search || e.title?.toLowerCase().includes(search.toLowerCase()) || String(e.year).includes(search))
      .filter(e => {
        if (!showCharacters || filterChars.size === 0) return true;
        return [...filterChars].some(charId => charsByEvent[e.id]?.find(c => c.id === charId));
      })
      .sort((a,b) => axisOf(a.year)-axisOf(b.year) || a.year-b.year || (a.sortOrder||0)-(b.sortOrder||0)),
    [events, filterCats, search, showCharacters, filterChars, charsByEvent, timeAxis, crewTime]);

  const getFactionName = id => factions?.find(f => f.id === id)?.name || null;
  const getFactionColor = id => factions?.find(f => f.id === id)?.color || null;

  // Adapter: ZoomTimeline takes a callback (selected, onSelect); we navigate instead.
  const zoomSelect = ev => navigate(ev ? `/timeline/${ev.id}` : "/timeline");

  // ─── Detail view ───────────────────────────────────────────
  if (selectedId && !selected) {
    return (
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12 }}>
        <span style={S.empty}>Event not found.</span>
        <button style={S.ioBtn} onClick={() => navigate("/timeline")}>← Back to Timeline</button>
      </div>
    );
  }
  if (selected) {
    return (
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--border-faint)", display:"flex", gap:8, alignItems:"center" }}>
          <button style={S.ioBtn} onClick={() => navigate("/timeline")}>← Timeline</button>
          <div style={{ flex:1 }} />
          <button style={S.panelBtn} onClick={() => setEditing(selected)}>Edit</button>
        </div>
        <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"20px 32px", maxWidth:920, alignSelf:"center", width:"100%", boxSizing:"border-box" }}>
          {selected.imageUrl && <img src={selected.imageUrl} alt="" style={{ width:"100%", borderRadius:4, marginBottom:12, display:"block" }} />}
          <h2 style={S.detailTitle}>{selected.title}</h2>
          <span style={S.detailYear}>{formatBadge(selected.year)}</span>
          {selected.summary && <p style={S.detailSummary}>{selected.summary}</p>}
          {selected.detail && <MarkdownBody>{selected.detail}</MarkdownBody>}
          <CrossModuleLinksDisplay links={selected.crossModuleLinks} allData={allData} onNavigate={onNavigate} />
        </div>
        {editing !== undefined && editing !== null && (
          <EventModal event={editing} factions={factions} allData={allData} apiPost={apiPost} onSave={ev => { onSaveEvent(ev); setEditing(null); }} onDelete={id => { onDeleteEvent(id); setEditing(null); navigate("/timeline"); }} onClose={() => setEditing(null)} />
        )}
      </div>
    );
  }

  // ─── List view ─────────────────────────────────────────────
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--border-faint)", display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        <input style={{ ...S.input, flex:1, minWidth:200, maxWidth:480 }} placeholder="Search events…" value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display:"flex", borderRadius:4, overflow:"hidden", border:"1px solid var(--border)" }}>
          {[["list","List"],["zoom","Zoom"]].map(([k,l]) => (
            <button key={k} onClick={() => setView(k)} style={{ padding:"6px 12px", border:"none", borderRight: k==="list" ? "1px solid var(--border)" : "none", cursor:"pointer", fontFamily:"var(--font-heading)", fontSize:12, fontWeight:600, background: view===k ? "var(--accent-bg)" : "transparent", color: view===k ? "var(--accent)" : "var(--text-dim)" }}>{l}</button>
          ))}
        </div>
        {hasStasis && (
          <div style={{ display:"flex", borderRadius:4, overflow:"hidden", border:"1px solid var(--border)" }} title="Ship time always advances; crew time pauses during stasis eras.">
            {[["ship","Ship"],["crew","Crew"]].map(([k,l]) => (
              <button key={k} onClick={() => setTimeAxis(k)} style={{ padding:"6px 12px", border:"none", borderRight: k==="ship" ? "1px solid var(--border)" : "none", cursor:"pointer", fontFamily:"var(--font-heading)", fontSize:12, fontWeight:600, background: timeAxis===k ? "var(--accent-bg)" : "transparent", color: timeAxis===k ? "var(--accent)" : "var(--text-dim)" }}>{l}</button>
            ))}
          </div>
        )}
        <button style={{ ...S.ioBtn, borderColor:showCharacters?"var(--accent-purple)":"var(--border)", color:showCharacters?"var(--accent-purple)":"var(--text-muted)" }} onClick={() => { setShowCharacters(p=>!p); if (showCharacters) setFilterChars(new Set()); }}>Characters</button>
        <button style={S.ioBtn} onClick={() => setShowEras(true)}>Eras</button>
        <button style={S.addBtn} onClick={() => setEditing(undefined)}>+ Event</button>
      </div>
      <div style={{ padding:"6px 16px", display:"flex", gap:4, flexWrap:"wrap", borderBottom:"1px solid var(--border-faint)" }}>
        <span style={{ fontSize:10, color:"var(--text-dim)", fontFamily:"var(--font-mono)", letterSpacing:1, textTransform:"uppercase", alignSelf:"center", marginRight:4 }}>Category:</span>
        {EVENT_CATEGORIES.map(c => { const on = filterCats.has(c.id); return (
          <button key={c.id} onClick={() => setFilterCats(prev => { const n = new Set(prev); n.has(c.id)?n.delete(c.id):n.add(c.id); return n; })}
            style={{ ...S.filterChip, fontSize:11, borderColor:on?c.color:"var(--border)", color:on?c.color:"var(--tag-neutral)", background:on?c.soft:"transparent" }}>{c.label}</button>
        ); })}
      </div>
      {showCharacters && (
        <div style={{ padding:"6px 16px", display:"flex", gap:4, flexWrap:"wrap", borderBottom:"1px solid var(--border-faint)", alignItems:"center" }}>
          <span style={{ fontSize:10, color:"var(--text-dim)", fontFamily:"var(--font-mono)", letterSpacing:1, textTransform:"uppercase", marginRight:4 }}>Filter:</span>
          {(characters||[]).length === 0
            ? <span style={{ fontSize:11, color:"var(--text-faint)", fontFamily:"var(--font-mono)" }}>No characters yet</span>
            : (characters||[]).map(c => { const on = filterChars.has(c.id); return (
              <button key={c.id} onClick={() => setFilterChars(prev => { const n = new Set(prev); n.has(c.id)?n.delete(c.id):n.add(c.id); return n; })}
                style={{ ...S.filterChip, fontSize:11, borderColor:on?"var(--accent-purple)":"var(--border)", color:on?"var(--accent-purple)":"var(--tag-neutral)", background:on?"color-mix(in srgb, var(--accent-purple) 12%, transparent)":"transparent" }}>{c.name}</button>
            ); })
          }
          {filterChars.size > 0 && <button onClick={() => setFilterChars(new Set())} style={{ ...S.ioBtn, fontSize:10, marginLeft:4 }}>Clear</button>}
        </div>
      )}
      {view === "list" && (
        <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"4px 16px" }}>
          {sorted.length === 0 && <div style={S.empty}>{events.length===0?"No events yet.":"No events match filters."}</div>}
          {sorted.map(ev => {
            const cat = EVENT_CATEGORIES.find(c=>c.id===ev.category);
            const facName = getFactionName(ev.faction);
            return (
              <div key={ev.id} onClick={() => navigate(`/timeline/${entitySlug(ev)}`)}
                onMouseEnter={() => setHoveredId(ev.id)} onMouseLeave={() => setHoveredId(null)}
                style={{ ...S.eventRow, borderLeftColor:cat?.color||"#555", background: hoveredId===ev.id?"var(--bg-hover)":"transparent" }}>
                <div style={S.yearBadge}>{formatBadge(ev.year)}</div>
                <div style={S.eventBody}>
                  <div style={S.eventTitle}>{ev.title}</div>
                  <div style={S.eventSummary}>{ev.summary}</div>
                  <div style={S.eventTags}>
                    {cat && <span style={{ ...S.microTag, color:cat.color }}>{cat.label}</span>}
                    {facName && <span style={{ ...S.microTag, color:getFactionColor(ev.faction)||"var(--text-dim)" }}>{facName}</span>}
                    {ev.crossModuleLinks?.length > 0 && <span style={S.microTag}>🔗 {ev.crossModuleLinks.length}</span>}
                    {showCharacters && (charsByEvent[ev.id]||[]).map(c => (
                      <span key={c.id} style={{ ...S.microTag, color:"var(--accent-purple)", border:"1px solid var(--accent-purple)44", padding:"1px 5px", borderRadius:3 }}>{c.name}</span>
                    ))}
                  </div>
                </div>
                <button style={S.editRowBtn} onClick={e => { e.stopPropagation(); setEditing(ev); }}>✎</button>
              </div>
            );
          })}
        </div>
      )}
      {view === "zoom" && <ZoomTimeline events={sorted} eras={eras} factions={factions} selected={selected} onSelect={zoomSelect} charsByEvent={charsByEvent} showCharacters={showCharacters} axisOf={axisOf} formatBadge={formatBadge} timeAxis={timeAxis} />}

      {editing !== undefined && editing !== null && (
        <EventModal event={editing} factions={factions} allData={allData} apiPost={apiPost} onSave={ev => { onSaveEvent(ev); setEditing(null); }} onDelete={id => { onDeleteEvent(id); setEditing(null); }} onClose={() => setEditing(null)} />
      )}
      {editing === undefined && (
        <EventModal event={null} factions={factions} allData={allData} apiPost={apiPost} onSave={ev => { onSaveEvent(ev); setEditing(null); navigate(`/timeline/${entitySlug(ev)}`); }} onDelete={() => {}} onClose={() => setEditing(null)} />
      )}
      {showEras && <EraManager eras={eras} onSave={onSaveEras} onClose={() => setShowEras(false)} />}
    </div>
  );
}

function ZoomTimeline({ events, eras, factions, selected, onSelect, charsByEvent, showCharacters, axisOf, formatBadge, timeAxis }) {
  const [zoom, setZoom] = useState(1);
  const ax = axisOf || ((y) => y);
  const fmt = formatBadge || ((y) => String(y));

  // Project eras onto the active axis. Stasis eras collapse to zero length on
  // the crew axis (crew was asleep), so we floor their visible height to a
  // thin marker rather than letting them disappear.
  const erasProjected = useMemo(() =>
    (eras||[]).map(e => ({ ...e, _start: ax(e.startYear), _end: ax(e.endYear) })),
    [eras, timeAxis]);

  const erasWithTracks = useMemo(() => {
    const sorted = [...erasProjected].sort((a,b) => a._start-b._start || a._end-b._end);
    const assigned = [], tracksEnd = [];
    for (const era of sorted) {
      if (typeof era.track === "number" && era.track >= 0) {
        assigned.push({ ...era });
        tracksEnd[era.track] = Math.max(tracksEnd[era.track] ?? -Infinity, era._end);
        continue;
      }
      let track = 0;
      while (tracksEnd[track] !== undefined && tracksEnd[track] > era._start) track++;
      tracksEnd[track] = era._end;
      assigned.push({ ...era, track });
    }
    return assigned;
  }, [erasProjected]);

  const totalTracks = Math.max(1, ...erasWithTracks.map(e => (e.track||0)+1));

  if (events.length === 0 && erasWithTracks.length === 0) {
    return <div style={S.empty}>No events or eras to display.</div>;
  }

  const allYears = [...events.map(e => ax(e.year)), ...erasProjected.map(e => e._start), ...erasProjected.map(e => e._end)];
  const minY = (allYears.length ? Math.min(...allYears) : 0) - 10;
  const maxY = (allYears.length ? Math.max(...allYears) : 100) + 10;
  const range = maxY - minY || 1;
  const baseH = 60, totalH = range * baseH * zoom;
  const toY = yr => ((yr - minY) / range) * totalH;
  const eraStripWidth = 90;
  const trackWidth = eraStripWidth / totalTracks;
  const eventsLeft = eraStripWidth + 30;

  const byAxisYear = {};
  events.forEach(e => { const k = ax(e.year); (byAxisYear[k] = byAxisYear[k]||[]).push(e); });

  const getFaction = id => factions?.find(f => f.id === id);

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <div style={{ padding:"8px 16px", borderBottom:"1px solid var(--border-faint)", display:"flex", alignItems:"center", gap:12 }}>
        <span style={{ fontSize:11, color:"var(--text-dim)", fontFamily:"var(--font-mono)", letterSpacing:1 }}>ZOOM</span>
        <input type="range" min={0.3} max={4} step={0.1} value={zoom} onChange={e => setZoom(+e.target.value)} style={{ flex:1, maxWidth:240, accentColor:"var(--accent)" }} />
        <span style={{ fontSize:11, color:"var(--text-muted)", fontFamily:"var(--font-mono)", minWidth:40 }}>{zoom.toFixed(1)}×</span>
      </div>
      <div style={{ flex:1, minHeight:0, overflowY:"auto", position:"relative" }}>
        <div style={{ position:"relative", height: totalH+40, minHeight:"100%" }}>
          {erasWithTracks.map(era => {
            const top = toY(era._start), h = Math.max(2, toY(era._end)-top), left = (era.track||0)*trackWidth;
            const rot = true;
            return (
              <div key={era.id} title={`${era.label} (${era.startYear}–${era.endYear}${era.kind && era.kind !== "in-system" ? ` · ${era.kind}` : ""})`} style={{ position:"absolute", left, width:trackWidth, top:top+20, height:h, background:era.color+"24", borderTop:`1px solid ${era.color}66`, borderBottom:`1px solid ${era.color}66`, borderLeft:`2px solid ${era.color}`, pointerEvents:"none", overflow:"hidden" }}>
                <div style={{ position:"sticky", top:4, padding:"3px 6px" }}>
                  <span style={{ display:"inline-block", fontSize:10, fontWeight:700, color:era.color, background:"var(--bg-deep)", fontFamily:"var(--font-heading)", letterSpacing:1, textTransform:"uppercase", borderRadius:2, border:`1px solid ${era.color}66`, padding: rot ? "6px 2px" : "2px 6px", writingMode: rot ? "vertical-rl" : "horizontal-tb", transform: rot ? "rotate(180deg)" : "none", whiteSpace:"nowrap", maxHeight: rot ? h-20 : "auto", overflow:"hidden", textOverflow:"ellipsis" }}>{era.label}</span>
                </div>
              </div>
            );
          })}
          <div style={{ position:"absolute", left:eraStripWidth+15, top:20, bottom:20, width:2, background:"var(--border)" }} />
          {(() => {
            const step = zoom > 2 ? 5 : zoom > 1 ? 10 : 25;
            const marks = [];
            for (let yr = Math.ceil(minY/step)*step; yr <= maxY; yr += step) {
              marks.push(<div key={yr} style={{ position:"absolute", left:eraStripWidth+2, top:toY(yr)+20, fontSize:10, color:"var(--text-dimmer)", fontFamily:"var(--font-mono)", transform:"translateY(-50%)", background:"var(--bg-deep)", padding:"1px 3px", borderRadius:2 }}>{yr}</div>);
            }
            return marks;
          })()}
          {events.map(ev => {
            const cat = EVENT_CATEGORIES.find(c => c.id === ev.category);
            const fac = getFaction(ev.faction);
            const axisYear = ax(ev.year);
            const sameYear = byAxisYear[axisYear]||[], idx = sameYear.indexOf(ev);
            const top = toY(axisYear)+20+idx*32;
            const isSel = selected?.id === ev.id;
            return (
              <div key={ev.id} onClick={() => onSelect(isSel ? null : ev)} style={{ position:"absolute", left:eventsLeft, right:16, top, display:"flex", alignItems:"center", gap:10, padding:"6px 12px", cursor:"pointer", borderRadius:4, borderLeft:`3px solid ${cat?.color||"#555"}`, background: isSel ? "var(--bg-selected)" : "var(--bg-main)" }}
                onMouseEnter={e => { if(!isSel) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={e => { if(!isSel) e.currentTarget.style.background = "var(--bg-main)"; }}>
                <span style={{ fontSize:12, fontWeight:500, color:"var(--text-secondary)", fontFamily:"var(--font-mono)", minWidth:60 }}>{fmt(ev.year)}</span>
                <span style={{ fontWeight:600, fontSize:13, color:"var(--text-primary)", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ev.title}</span>
                {cat && <span style={{ fontSize:9, color:cat.color, fontFamily:"var(--font-mono)", textTransform:"uppercase", letterSpacing:1 }}>{cat.label}</span>}
                {fac && <span style={{ fontSize:9, color:fac.color||"var(--text-dim)", fontFamily:"var(--font-mono)", textTransform:"uppercase", letterSpacing:1 }}>{fac.name}</span>}
                {showCharacters && (charsByEvent[ev.id]||[]).map(c => (
                  <span key={c.id} style={{ fontSize:9, color:"var(--accent-purple)", fontFamily:"var(--font-mono)", border:"1px solid var(--accent-purple)44", padding:"1px 5px", borderRadius:3 }}>{c.name}</span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EventModal({ event, factions, allData, apiPost, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(event || { id:uid(), year:2100, sortOrder:0, title:"", summary:"", detail:"", category:"technology", faction:null, imageUrl:"", crossModuleLinks:[] });
  const isNew = !event;
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div style={S.overlay}><div style={S.modal}>
      <div style={S.modalHeader}><span style={S.modalHeaderDecor} /><h2 style={S.modalTitle}>{isNew?"New Event":"Edit Event"}</h2><button style={S.closeBtn} onClick={onClose}>✕</button></div>
      <div style={S.modalBody}>
        <div style={{ display:"flex",gap:14 }}>
          <div style={{ ...S.fieldRow, flex:1 }}><label style={S.label}>{TIME_UNIT}</label><input type="number" value={form.year} onChange={e=>set("year",+e.target.value||0)} style={S.input} /></div>
          <div style={{ ...S.fieldRow, flex:2 }}><label style={S.label}>Title</label><input value={form.title} onChange={e=>set("title",e.target.value)} style={S.input} autoFocus /></div>
        </div>
        <div style={S.fieldRow}><label style={S.label}>Summary</label><input value={form.summary} onChange={e=>set("summary",e.target.value)} style={S.input} /></div>
        <div style={S.fieldRow}><label style={S.label}>Detail</label><textarea value={form.detail} onChange={e=>set("detail",e.target.value)} style={{ ...S.input, minHeight:80,resize:"vertical",fontFamily:"inherit" }} /><div style={S.mdHint}>Markdown: **bold** *italic* - list ## heading</div></div>
        <div style={{ display:"flex",gap:14,marginBottom:14 }}>
          <div style={{flex:1}}><label style={S.label}>Category</label><select value={form.category} onChange={e=>set("category",e.target.value)} style={S.select}>{EVENT_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
          <div style={{flex:1}}><label style={S.label}>Faction</label><select value={form.faction||""} onChange={e=>set("faction",e.target.value||null)} style={S.select}><option value="">— None —</option>{(factions||[]).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
        </div>
        <div style={S.fieldRow}><label style={S.label}>Image</label><ImageUpload imageUrl={form.imageUrl} onUpload={url=>set("imageUrl",url)} entityType="event" entityId={form.id} apiPost={apiPost} /></div>
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

function EraManager({ eras, onSave, onClose }) {
  const [list, setList] = useState((eras||[]).map(e => ({ ...e })));
  const add = () => setList(l => [...l, { id:uid(), startYear:2100, endYear:2200, label:"New Era", color:"#1e3a5f", kind:"in-system" }]);
  const update = (i,k,v) => setList(l => { const n=[...l]; n[i]={...n[i],[k]:v}; return n; });
  const remove = i => setList(l => l.filter((_,j) => j!==i));
  return (
    <div style={S.overlay}><div style={{ ...S.modal, maxWidth:680 }}>
      <div style={S.modalHeader}><span style={S.modalHeaderDecor} /><h2 style={S.modalTitle}>Manage Eras</h2><button style={S.closeBtn} onClick={onClose}>✕</button></div>
      <div style={{ ...S.modalBody, maxHeight:440 }}>
        <p style={{ fontSize:11, color:"var(--text-muted)", fontFamily:"var(--font-mono)", marginBottom:12, lineHeight:1.5 }}>Overlapping eras are auto-placed on separate tracks in the Zoom view. Leave <em>Track</em> blank for automatic placement, or set a number (0, 1, 2…) to pin an era to a specific lane. <em>Kind</em> distinguishes in-system, transit, and stasis periods — stasis eras pause crew time, so events inside them appear at the era's start on the crew-time axis.</p>
        {list.map((era,i) => (
          <div key={era.id} style={{ display:"flex",gap:8,alignItems:"center",marginBottom:10 }}>
            <input type="color" value={era.color} onChange={e=>update(i,"color",e.target.value)} style={{ width:32,height:32,border:"none",background:"none",cursor:"pointer" }} />
            <input value={era.label} onChange={e=>update(i,"label",e.target.value)} style={{ ...S.input,flex:1 }} />
            <input type="number" value={era.startYear} onChange={e=>update(i,"startYear",+e.target.value||0)} style={{ ...S.input,width:80 }} />
            <span style={{ color:"var(--text-dim)" }}>–</span>
            <input type="number" value={era.endYear} onChange={e=>update(i,"endYear",+e.target.value||0)} style={{ ...S.input,width:80 }} />
            <input type="number" min={0} placeholder="auto" value={typeof era.track === "number" ? era.track : ""} onChange={e => { const v = e.target.value; update(i,"track", v === "" ? undefined : Math.max(0, +v)); }} style={{ ...S.input,width:60,textAlign:"center" }} title="Track (lane) for overlapping eras" />
            <select value={era.kind || "in-system"} onChange={e => update(i,"kind", e.target.value)} style={{ ...S.select, width:110 }} title="Era kind — stasis pauses crew time">
              {ERA_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
            <button onClick={() => remove(i)} style={{ ...S.deleteBtn, padding:"4px 8px",fontSize:12 }}>✕</button>
          </div>
        ))}
        <button onClick={add} style={{ ...S.ioBtn, marginTop:8 }}>+ Add Era</button>
      </div>
      <div style={S.modalFooter}><div style={{flex:1}} /><button style={S.cancelBtn} onClick={onClose}>Cancel</button><button style={S.saveBtn} onClick={() => { onSave(list); onClose(); }}>Save Eras</button></div>
    </div></div>
  );
}
