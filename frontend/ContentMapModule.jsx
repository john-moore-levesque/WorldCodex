import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { S } from "./shared.jsx";

const TYPE_META = {
  event:    { label: "Events",     color: "var(--warning)" },
  species:  { label: "Species",    color: "var(--accent-purple)" },
  faction:  { label: "Factions",   color: "var(--accent)" },
  tech:     { label: "Technology", color: "var(--accent)" },
  location: { label: "Locations",  color: "var(--success)" },
  lore:     { label: "Lore",       color: "var(--text-secondary)" },
};

// Unique color per type for filter chips / legend
const TYPE_COLORS = {
  event:    "var(--warning)",
  species:  "var(--accent-purple)",
  faction:  "var(--accent)",
  tech:     "#47e8d4",
  location: "var(--success)",
  lore:     "var(--text-secondary)",
};

function nodeColor(node) {
  if (node.type === "faction" && node.entityColor) return node.entityColor;
  return TYPE_COLORS[node.type] ?? "var(--text-dim)";
}

function buildGraph(allData, filter) {
  const nodes = [];
  const nodeById = {};

  const addEntities = (type, items, nameKey) => {
    if (!filter.has(type)) return;
    (items || []).forEach(item => {
      const n = {
        id: `${type}:${item.id}`,
        type,
        entityId: item.id,
        name: item[nameKey] || item.id,
        entityColor: item.color || null,
        links: item.crossModuleLinks || [],
        degree: 0,
        x: 0, y: 0, vx: 0, vy: 0, pinned: false,
      };
      nodes.push(n);
      nodeById[n.id] = n;
    });
  };

  addEntities("event",    allData.events,    "title");
  addEntities("species",  allData.species,   "name");
  addEntities("faction",  allData.factions,  "name");
  addEntities("tech",     allData.technology,"name");
  addEntities("location", allData.locations, "name");
  addEntities("lore",     allData.lore,      "title");

  const edgeSet = new Set();
  const edges = [];
  nodes.forEach(n => {
    n.links.forEach(link => {
      const targetId = `${link.type}:${link.id}`;
      if (!nodeById[targetId]) return;
      const key = [n.id, targetId].sort().join("~~");
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({ source: n.id, target: targetId });
        nodeById[n.id].degree++;
        nodeById[targetId].degree++;
      }
    });
  });

  return { nodes, edges, nodeById };
}

function seedPositions(nodes, w, h) {
  nodes.forEach((n, i) => {
    // Distribute in a rough circle to reduce initial overlap
    const angle = (i / nodes.length) * Math.PI * 2;
    const r = Math.min(w, h) * 0.3;
    n.x = w / 2 + r * Math.cos(angle) + (Math.random() - 0.5) * 60;
    n.y = h / 2 + r * Math.sin(angle) + (Math.random() - 0.5) * 60;
    n.vx = 0; n.vy = 0; n.pinned = false;
  });
}

export default function ContentMapModule({ allData, onNavigate }) {
  const containerRef = useRef(null);
  const simRef = useRef(null);
  const rafRef = useRef(null);
  const svgRef = useRef(null);
  const [tick, setTick] = useState(0);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const [hovered, setHovered] = useState(null);
  const [filter, setFilter] = useState(() => new Set(Object.keys(TYPE_COLORS)));
  const panRef = useRef(null); // { startX, startY, startTX, startTY }
  const dragRef = useRef(null); // { nodeId }
  const [dims, setDims] = useState({ w: 800, h: 600 });

  // Keep transformRef in sync
  const setTransformSync = useCallback(fn => {
    setTransform(prev => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      transformRef.current = next;
      return next;
    });
  }, []);

  // Measure container
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setDims({ w: width, h: height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Build graph data (no positions yet)
  const graphData = useMemo(() => buildGraph(allData, filter), [allData, filter]);

  // Start / restart simulation whenever graph data or dims change
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const { w, h } = dims;
    const { nodes, edges, nodeById } = graphData;
    seedPositions(nodes, w, h);
    simRef.current = { nodes, edges, nodeById, alpha: 1, running: true };

    const tick = () => {
      const sim = simRef.current;
      if (!sim || !sim.running) return;
      const { nodes, edges, nodeById } = sim;
      let alpha = sim.alpha;

      // Repulsion between all pairs
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          const d2 = dx * dx + dy * dy + 1;
          const d = Math.sqrt(d2);
          const strength = (-1400 / d2) * alpha;
          const fx = strength * dx / d, fy = strength * dy / d;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
      }

      // Spring attraction along edges
      const targetDist = 110;
      edges.forEach(({ source, target }) => {
        const a = nodeById[source], b = nodeById[target];
        if (!a || !b) return;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const f = (d - targetDist) * 0.04 * alpha;
        const fx = f * dx / d, fy = f * dy / d;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      });

      // Center gravity
      const cx = w / 2, cy = h / 2;
      nodes.forEach(n => {
        n.vx += (cx - n.x) * 0.008 * alpha;
        n.vy += (cy - n.y) * 0.008 * alpha;
      });

      // Integrate
      nodes.forEach(n => {
        if (n.pinned) { n.vx = 0; n.vy = 0; return; }
        n.vx *= 0.82; n.vy *= 0.82;
        n.x += n.vx; n.y += n.vy;
      });

      sim.alpha *= 0.992;
      if (sim.alpha < 0.004) sim.running = false;

      setTick(t => t + 1);
      if (sim.running) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (simRef.current) simRef.current.running = false;
    };
  }, [graphData, dims]);

  // Convert SVG coords from client coords
  const clientToSVG = useCallback((cx, cy) => {
    const t = transformRef.current;
    return { x: (cx - t.x) / t.scale, y: (cy - t.y) / t.scale };
  }, []);

  const getSVGPoint = useCallback((e) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return clientToSVG(e.clientX - rect.left, e.clientY - rect.top);
  }, [clientToSVG]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    setTransformSync(prev => {
      const factor = e.deltaY < 0 ? 1.1 : 0.909;
      const newScale = Math.min(3, Math.max(0.15, prev.scale * factor));
      const ratio = newScale / prev.scale;
      return {
        scale: newScale,
        x: mx - ratio * (mx - prev.x),
        y: my - ratio * (my - prev.y),
      };
    });
  }, [setTransformSync]);

  const handleSVGMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    // Hit-test nodes
    const { x: sx, y: sy } = getSVGPoint(e);
    const sim = simRef.current;
    if (sim) {
      for (let i = sim.nodes.length - 1; i >= 0; i--) {
        const n = sim.nodes[i];
        const r = 6 + Math.min(n.degree * 1.5, 14);
        if ((sx - n.x) ** 2 + (sy - n.y) ** 2 <= r * r) {
          dragRef.current = { nodeId: n.id, moved: false };
          n.pinned = true;
          e.stopPropagation();
          return;
        }
      }
    }
    // Pan
    panRef.current = { startX: e.clientX, startY: e.clientY, startTX: transformRef.current.x, startTY: transformRef.current.y };
  }, [getSVGPoint]);

  useEffect(() => {
    const onMove = (e) => {
      const sim = simRef.current;
      if (dragRef.current && sim) {
        const { x, y } = getSVGPoint(e);
        const n = sim.nodeById[dragRef.current.nodeId];
        if (n) { n.x = x; n.y = y; dragRef.current.moved = true; }
        setTick(t => t + 1);
        return;
      }
      if (panRef.current) {
        const dx = e.clientX - panRef.current.startX;
        const dy = e.clientY - panRef.current.startY;
        setTransformSync(prev => ({ ...prev, x: panRef.current.startTX + dx, y: panRef.current.startTY + dy }));
      }
    };
    const onUp = (e) => {
      if (dragRef.current) {
        const sim = simRef.current;
        const n = sim?.nodeById[dragRef.current.nodeId];
        if (n) {
          if (!dragRef.current.moved) {
            // Click: navigate
            onNavigate(n.type, n.entityId);
          }
          n.pinned = false;
        }
        dragRef.current = null;
      }
      panRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [getSVGPoint, onNavigate, setTransformSync]);

  const resetLayout = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const sim = simRef.current;
    if (!sim) return;
    seedPositions(sim.nodes, dims.w, dims.h);
    sim.alpha = 1; sim.running = true;
    const tick = () => {
      if (!sim.running) return;
      const { nodes, edges, nodeById } = sim;
      let alpha = sim.alpha;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          const d2 = dx * dx + dy * dy + 1;
          const d = Math.sqrt(d2);
          const s = (-1400 / d2) * alpha;
          const fx = s * dx / d, fy = s * dy / d;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
      }
      const targetDist = 110;
      edges.forEach(({ source, target }) => {
        const a = nodeById[source], b = nodeById[target];
        if (!a || !b) return;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const f = (d - targetDist) * 0.04 * alpha;
        const fx = f * dx / d, fy = f * dy / d;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      });
      const cx = dims.w / 2, cy = dims.h / 2;
      nodes.forEach(n => { n.vx += (cx - n.x) * 0.008 * alpha; n.vy += (cy - n.y) * 0.008 * alpha; });
      nodes.forEach(n => { if (n.pinned) { n.vx = 0; n.vy = 0; return; } n.vx *= 0.82; n.vy *= 0.82; n.x += n.vx; n.y += n.vy; });
      sim.alpha *= 0.992;
      if (sim.alpha < 0.004) sim.running = false;
      setTick(t => t + 1);
      if (sim.running) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [dims]);

  const toggleFilter = useCallback((type) => {
    setFilter(prev => {
      const n = new Set(prev);
      n.has(type) ? n.delete(type) : n.add(type);
      return n;
    });
  }, []);

  // Compute connected node ids for hover highlight
  const connectedIds = useMemo(() => {
    if (!hovered || !simRef.current) return null;
    const ids = new Set([hovered]);
    simRef.current.edges.forEach(({ source, target }) => {
      if (source === hovered) ids.add(target);
      if (target === hovered) ids.add(source);
    });
    return ids;
  }, [hovered, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const sim = simRef.current;
  const { scale, x: tx, y: ty } = transform;
  const labelScale = 1 / scale;

  return (
    <div style={{ display:"flex", flexDirection:"column", flex:1, overflow:"hidden", background:"var(--bg-deep)" }}>

      {/* Controls */}
      <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--border-faint)", display:"flex", gap:6, alignItems:"center", flexWrap:"wrap", flexShrink:0 }}>
        {Object.entries(TYPE_COLORS).map(([type, color]) => {
          const on = filter.has(type);
          const count = (sim?.nodes || []).filter(n => n.type === type).length;
          return (
            <button key={type} onClick={() => toggleFilter(type)} style={{
              ...S.filterChip,
              borderColor: on ? color : "var(--border)",
              color: on ? color : "var(--tag-neutral)",
              background: on ? `color-mix(in srgb, ${color} 15%, transparent)` : "transparent",
            }}>
              {TYPE_META[type].label}{count > 0 ? ` (${count})` : ""}
            </button>
          );
        })}
        <div style={{ flex:1 }} />
        <span style={{ fontSize:11, color:"var(--text-faint)", fontFamily:"var(--font-mono)" }}>
          {sim?.nodes.length ?? 0} nodes · {sim?.edges.length ?? 0} edges
        </span>
        <button onClick={resetLayout} style={{ ...S.ioBtn, fontSize:11 }}>Reset layout</button>
      </div>

      {/* Canvas */}
      <div ref={containerRef} style={{ flex:1, overflow:"hidden", position:"relative" }}>
        {(!sim || sim.nodes.length === 0) && (
          <div style={{ ...S.empty, position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
            No entities with cross-module links yet.<br />
            <span style={{ fontSize:11, marginTop:4, display:"block" }}>Link entities together to see the map populate.</span>
          </div>
        )}
        <svg
          ref={svgRef}
          width="100%" height="100%"
          style={{ display:"block", cursor: dragRef.current ? "grabbing" : "grab" }}
          onMouseDown={handleSVGMouseDown}
          onWheel={handleWheel}
        >
          <g transform={`translate(${tx},${ty}) scale(${scale})`}>
            {/* Edges */}
            {sim?.edges.map(({ source, target }) => {
              const a = sim.nodeById[source], b = sim.nodeById[target];
              if (!a || !b) return null;
              const dim = hovered && !connectedIds?.has(source) && !connectedIds?.has(target);
              return (
                <line key={`${source}~~${target}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke="var(--border)"
                  strokeWidth={0.8 / scale}
                  opacity={dim ? 0.1 : 0.5}
                />
              );
            })}

            {/* Nodes */}
            {sim?.nodes.map(n => {
              const r = 6 + Math.min(n.degree * 1.5, 14);
              const color = nodeColor(n);
              const isHovered = hovered === n.id;
              const dimmed = hovered && !connectedIds?.has(n.id);
              return (
                <g key={n.id}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor:"pointer" }}
                >
                  {/* Glow ring on hover */}
                  {isHovered && (
                    <circle cx={n.x} cy={n.y} r={r + 4 / scale}
                      fill="none" stroke={color} strokeWidth={1.5 / scale} opacity={0.4} />
                  )}
                  <circle
                    cx={n.x} cy={n.y} r={r / scale * scale} // r in data space
                    fill={color}
                    opacity={dimmed ? 0.15 : isHovered ? 1 : 0.85}
                    stroke={isHovered ? "var(--bg-main)" : "none"}
                    strokeWidth={1.5 / scale}
                  />
                  <text
                    x={n.x} y={n.y + r + 10 * labelScale}
                    textAnchor="middle"
                    fontSize={10 * labelScale}
                    fill={dimmed ? "var(--text-faint)" : "var(--text-secondary)"}
                    fontFamily="var(--font-body)"
                    style={{ pointerEvents:"none", userSelect:"none" }}
                  >
                    {n.name.length > 20 ? n.name.slice(0, 18) + "…" : n.name}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Hover tooltip */}
        {hovered && (() => {
          const n = sim?.nodeById[hovered];
          if (!n) return null;
          return (
            <div style={{
              position:"absolute", bottom:16, left:16, pointerEvents:"none",
              background:"var(--bg-panel)", border:"1px solid var(--border)",
              borderRadius:4, padding:"6px 10px", fontSize:12,
            }}>
              <span style={{ fontSize:9, textTransform:"uppercase", letterSpacing:1, color: nodeColor(n), fontFamily:"var(--font-mono)", marginRight:6 }}>{n.type}</span>
              <span style={{ color:"var(--text-primary)", fontWeight:600 }}>{n.name}</span>
              <span style={{ color:"var(--text-dim)", marginLeft:8, fontFamily:"var(--font-mono)", fontSize:10 }}>{n.degree} link{n.degree !== 1 ? "s" : ""}</span>
            </div>
          );
        })()}

        {/* Zoom hint */}
        <div style={{ position:"absolute", bottom:16, right:16, fontSize:10, color:"var(--text-faint)", fontFamily:"var(--font-mono)", pointerEvents:"none" }}>
          scroll to zoom · drag to pan · click node to open
        </div>
      </div>
    </div>
  );
}
