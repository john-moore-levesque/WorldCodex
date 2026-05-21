import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Routes, Route, NavLink, Navigate, useNavigate } from "react-router-dom";
import { CognitoIdentityClient, GetIdCommand, GetCredentialsForIdentityCommand } from "@aws-sdk/client-cognito-identity";
import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-browser";
import ContentMapModule from "./ContentMapModule";
import LoreModule from "./LoreModule";
import OverviewModule from "./OverviewModule";
import TimelineModule from "./TimelineModule";
import SpeciesModule from "./SpeciesModule";
import FactionsModule from "./FactionsModule";
import TechnologyModule from "./TechnologyModule";
import LocationsModule from "./LocationsModule";
import CharactersModule from "./CharactersModule";
import StoriesModule from "./StoriesModule";
import { S, findDuplicateIds, entitySlug } from "./shared.jsx";

// ─── Theme Definitions ───────────────────────────────────────
const THEMES = {
  "sci-fi-dark": {
    label: "Sci-Fi Dark", family: "scifi",
    fonts: {
      heading: "'Chakra Petch', sans-serif",
      body:    "'Chakra Petch', sans-serif",
      mono:    "'IBM Plex Mono', monospace",
    },
    vars: {
      "--bg-deep":     "#14171c",
      "--bg-main":     "#1c2027",
      "--bg-panel":    "#232830",
      "--bg-input":    "#0c0f13",
      "--bg-hover":    "#2a3140",
      "--bg-selected": "#2e3a4c",

      "--text-primary":   "#eef3f9",
      "--text-body":      "#c6cfdb",
      "--text-secondary": "#8a96a4",
      "--text-muted":     "#6a7280",
      "--text-dim":       "#525a66",
      "--text-faint":     "#3d434d",
      "--text-dimmer":    "#2a2f38",

      "--border":        "#3a4250",
      "--border-subtle": "#2a3038",
      "--border-faint":  "#1f242c",

      "--accent":         "#5cc7e8",
      "--accent-bg":      "#5cc7e818",
      "--accent-purple":  "#b975ec",

      "--danger":         "#e85a4a",
      "--danger-border":  "#5a2520",
      "--danger-bg":      "#5a252018",
      "--success":        "#7fc04a",
      "--warning":        "#f5a623",

      "--overlay":        "rgba(8,11,16,0.88)",
      "--tag-neutral":    "#6a7280",

      "--cat-political":       "#ecd14a",
      "--cat-technology":      "#4ec6e8",
      "--cat-military":        "#e85a4a",
      "--cat-exploration":     "#7fc04a",
      "--cat-science":         "#b975ec",
      "--cat-cultural":        "#f5a623",

      "--cat-political-soft":   "#ecd14a22",
      "--cat-technology-soft":  "#4ec6e822",
      "--cat-military-soft":    "#e85a4a22",
      "--cat-exploration-soft": "#7fc04a22",
      "--cat-science-soft":     "#b975ec22",
      "--cat-cultural-soft":    "#f5a62322",

      "--tech-propulsion":    "#2eb8a8",
      "--tech-comms":         "#6c7cf0",
      "--tech-energy":        "#f57a23",
      "--tech-weapons":       "#e83a5a",
      "--tech-starships":     "#5cc7e8",
      "--tech-materials":     "#a8c850",

      "--tech-propulsion-soft": "#2eb8a822",
      "--tech-comms-soft":      "#6c7cf022",
      "--tech-energy-soft":     "#f57a2322",
      "--tech-weapons-soft":    "#e83a5a22",
      "--tech-starships-soft":  "#5cc7e822",
      "--tech-materials-soft":  "#a8c85022",

      "--phosphor":      "#ffb74a",
      "--phosphor-soft": "#ffb74a30",
      "--well":          "#0c0f13",
      "--edge-hi":       "rgba(255,255,255,0.05)",
      "--edge-lo":       "rgba(0,0,0,0.55)",
    },
  },
  "sci-fi-light": {
    label: "Sci-Fi Light", family: "scifi",
    fonts: {
      heading: "'Space Grotesk', system-ui, sans-serif",
      body:    "'IBM Plex Sans', system-ui, sans-serif",
      mono:    "'JetBrains Mono', ui-monospace, monospace",
    },
    vars: {
      "--bg-deep":     "#f4f6f9",
      "--bg-main":     "#fbfcfd",
      "--bg-panel":    "#eef2f6",
      "--bg-input":    "#e4eaf0",
      "--bg-hover":    "#e6ecf2",
      "--bg-selected": "#d8e4f1",

      "--text-primary":   "#0b1220",
      "--text-body":      "#1f2a3d",
      "--text-secondary": "#475569",
      "--text-muted":     "#6b7a8f",
      "--text-dim":       "#94a2b6",
      "--text-faint":     "#b7c1cf",
      "--text-dimmer":    "#d6dde6",

      "--border":         "#b7c1cf",
      "--border-subtle":  "#d6dde6",
      "--border-faint":   "#e6ebf1",

      "--accent":         "#1a4cff",
      "--accent-bg":      "#e1e8ff",
      "--accent-purple":  "#7c3aed",

      "--danger":         "#b91c1c",
      "--danger-border":  "#e8a8a8",
      "--danger-bg":      "#fbdada",
      "--success":        "#047857",
      "--warning":        "#b45309",

      "--overlay":        "rgba(11,18,32,0.35)",
      "--tag-neutral":    "#6b7a8f",

      "--cat-political":       "#b45309",
      "--cat-technology":      "#1a4cff",
      "--cat-military":        "#b91c1c",
      "--cat-exploration":     "#0e7490",
      "--cat-science":              "#7c3aed",
      "--cat-cultural":        "#be185d",

      "--cat-political-soft":   "#fbe6c2",
      "--cat-technology-soft":  "#dde4ff",
      "--cat-military-soft":    "#fbdada",
      "--cat-exploration-soft": "#cfe6ec",
      "--cat-science-soft":          "#e8dcff",
      "--cat-cultural-soft":    "#fcdce8",

      "--tech-propulsion":    "#0d9488",
      "--tech-comms":         "#4f46e5",
      "--tech-energy":        "#ea580c",
      "--tech-weapons":       "#9f1239",
      "--tech-starships":     "#1d4ed8",
      "--tech-materials":     "#047857",

      "--tech-propulsion-soft": "#cdf0eb",
      "--tech-comms-soft":      "#e0deff",
      "--tech-energy-soft":     "#fde4d2",
      "--tech-weapons-soft":    "#fbd9e0",
      "--tech-starships-soft":  "#dde7ff",
      "--tech-materials-soft":  "#d1f0e1",
    },
  },
  "high-fantasy-light": {
    label: "High Fantasy", family: "fantasy",
    fonts: { heading: "'Cinzel', serif", body: "'Crimson Pro', serif", mono: "'Fira Code', monospace" },
    vars: {
      "--bg-deep":"#f0e8d8","--bg-main":"#faf6ee","--bg-panel":"#f5efe4","--bg-input":"#faf6ee",
      "--bg-hover":"#ede4d2","--bg-selected":"#e6dbc6",
      "--text-primary":"#2c1e0e","--text-body":"#4a3828","--text-secondary":"#6b5540",
      "--text-muted":"#8a7560","--text-dim":"#a09080","--text-faint":"#b8a898","--text-dimmer":"#c8b8a8",
      "--border":"#c4ae90","--border-subtle":"#d8c8b0","--border-faint":"#e8dcc8",
      "--accent":"#8b4513","--accent-bg":"#8b451318","--accent-purple":"#6a3078",
      "--danger":"#a52a2a","--danger-border":"#d4a0a0","--danger-bg":"#f8e8e8",
      "--success":"#3a6a30","--warning":"#a07820",
      "--overlay":"rgba(30,20,10,0.5)","--tag-neutral":"#8a7a68",
      "--cat-political":   "#e8c547",
      "--cat-technology":  "#47b8e8",
      "--cat-military":    "#e85747",
      "--cat-exploration": "#47e89b",
      "--cat-science":          "#c47be8",
      "--cat-cultural":    "#e8a247",
      "--cat-political-soft":   "#f2e4b8",
      "--cat-technology-soft":  "#d4ebf8",
      "--cat-military-soft":    "#f4d4d0",
      "--cat-exploration-soft": "#d4f0e0",
      "--cat-science-soft":          "#ead8f0",
      "--cat-cultural-soft":    "#f4e0c8",
      "--tech-propulsion":    "#3a8a90",
      "--tech-comms":         "#4a4e9a",
      "--tech-energy":        "#c46820",
      "--tech-weapons":       "#8a2a2a",
      "--tech-starships":     "#5a78a0",
      "--tech-materials":     "#4a7038",
      "--tech-propulsion-soft": "#d4ebed",
      "--tech-comms-soft":      "#dadcee",
      "--tech-energy-soft":     "#f4dec8",
      "--tech-weapons-soft":    "#ecd0d0",
      "--tech-starships-soft":  "#dde2ec",
      "--tech-materials-soft":  "#d6e2cc",
    },
  },
  "hearthwood": {
    label: "Hearthwood", family: "fantasy",
    fonts: {
      heading: "'Cormorant Garamond', 'Cinzel', serif",
      body:    "'EB Garamond', Georgia, serif",
      mono:    "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
    },
    vars: {
      "--bg-deep":     "#15110a",
      "--bg-main":     "#1d1810",
      "--bg-panel":    "#221c12",
      "--bg-input":    "#1a150d",
      "--bg-hover":    "#2b2317",
      "--bg-selected": "#342916",

      "--text-primary":   "#f3e7cd",
      "--text-body":      "#ddcfac",
      "--text-secondary": "#b8a883",
      "--text-muted":     "#8a7c5b",
      "--text-dim":       "#6c5f44",
      "--text-faint":     "#4e4530",
      "--text-dimmer":    "#3a3322",

      "--border":         "#4e4530",
      "--border-subtle":  "#3a3322",
      "--border-faint":   "#2c2618",

      "--accent":         "#8aae64",
      "--accent-bg":      "#2e3a1d",
      "--accent-purple":  "#a878c8",

      "--danger":         "#c54a3a",
      "--danger-border":  "#5a2018",
      "--danger-bg":      "#3a1a15",
      "--success":        "#8aae64",
      "--warning":        "#e0a553",

      "--overlay":        "rgba(8,5,2,0.7)",
      "--tag-neutral":    "#8a7c5b",

      "--cat-political":       "#d8a942",
      "--cat-technology":      "#c47a3c",
      "--cat-military":        "#c24a3a",
      "--cat-exploration":     "#8aae64",
      "--cat-science":              "#a878c8",
      "--cat-cultural":        "#d77b8c",

      "--cat-political-soft":   "#3a2c12",
      "--cat-technology-soft":  "#341e0f",
      "--cat-military-soft":    "#341510",
      "--cat-exploration-soft": "#2e3a1d",
      "--cat-science-soft":          "#2e1f37",
      "--cat-cultural-soft":    "#3a1d23",

      "--tech-propulsion":    "#5a9aa6",
      "--tech-comms":         "#7a82c0",
      "--tech-energy":        "#e09548",
      "--tech-weapons":       "#a03a2e",
      "--tech-starships":     "#94a8c2",
      "--tech-materials":     "#6e8a52",

      "--tech-propulsion-soft": "#1d2a2e",
      "--tech-comms-soft":      "#1f2235",
      "--tech-energy-soft":     "#321f10",
      "--tech-weapons-soft":    "#2d1410",
      "--tech-starships-soft":  "#1f242e",
      "--tech-materials-soft":  "#1f2a17",
    },
  },
};

// ─── Constants ───────────────────────────────────────────────
const MODULES = [
  { id: "overview", label: "Overview", icon: "◉" },
  { id: "timeline", label: "Timeline", icon: "⟐" },
  { id: "species", label: "Species", icon: "◈" },
  { id: "factions", label: "Factions", icon: "⚑" },
  { id: "technology", label: "Technology", icon: "⚙" },
  { id: "locations", label: "Locations", icon: "◎" },
  { id: "lore", label: "Lore", icon: "✦" },
  { id: "characters", label: "Characters", icon: "⚇" },
  { id: "stories", label: "Stories", icon: "◊" },
  { id: "content-map", label: "Content Map", icon: "⬡", clientOnly: true },
];
const API_MODULES = MODULES.filter(m => !m.clientOnly);

const STORAGE_KEYS = { theme: "codex-theme" };

function getContrastText(hex) {
  if (!hex || hex.length < 7) return "#fff";
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return r*0.299+g*0.587+b*0.114 > 160 ? "#111" : "#fff";
}

// ─── Theme CSS ───────────────────────────────────────────────
const FONT_CSS = `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=Chakra+Petch:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&family=JetBrains+Mono:wght@400;500;600&family=Cinzel:wght@400;600;700&family=Crimson+Pro:wght@400;600;700&family=Fira+Code:wght@400;500&family=Cormorant+Garamond:wght@400;500;600;700&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap');`;
const BASE_CSS = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  ::-webkit-scrollbar{width:6px}
  ::-webkit-scrollbar-track{background:var(--bg-deep)}
  ::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
  input:focus,textarea:focus,select:focus,button:focus-visible{outline:1px solid var(--accent);outline-offset:1px}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
  [draggable]{user-select:none}
  [data-theme-family="fantasy"] .md-body > p:first-of-type::first-letter {
    font-family: var(--font-heading);
    font-size: 2.6em;
    font-weight: 600;
    color: var(--accent);
    float: left;
    line-height: 0.9;
    padding: 0.18em 0.32em 0 0;
  }

  /* ── Sci-Fi Dark · Console · physical-hardware surfacing ── */
  [data-theme="sci-fi-dark"] {
    background:
      repeating-linear-gradient(90deg,
        rgba(255,255,255,0.012) 0 1px,
        transparent 1px 3px),
      var(--bg-deep);
  }
  [data-theme="sci-fi-dark"] input,
  [data-theme="sci-fi-dark"] textarea,
  [data-theme="sci-fi-dark"] select {
    background: var(--well);
    border: 1px solid #000;
    border-radius: 2px;
    box-shadow:
      inset 0 1px 3px rgba(0,0,0,0.7),
      inset 0 -1px 0 var(--edge-hi);
  }
  [data-theme="sci-fi-dark"] input:focus,
  [data-theme="sci-fi-dark"] textarea:focus,
  [data-theme="sci-fi-dark"] select:focus {
    outline: none;
    color: var(--accent);
    box-shadow:
      inset 0 1px 3px rgba(0,0,0,0.7),
      0 0 0 1px var(--accent);
  }
  [data-theme="sci-fi-dark"] button {
    background: linear-gradient(180deg, #3a4250, #232830);
    border: 1px solid #000;
    border-radius: 2px;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.1),
      inset 0 -2px 0 rgba(0,0,0,0.4),
      0 1px 0 rgba(0,0,0,0.5);
  }
  [data-theme="sci-fi-dark"] button[style*="--accent"][style*="background"],
  [data-theme="sci-fi-dark"] button[style*="background: var(--accent)"] {
    background: linear-gradient(180deg, #ffd070, var(--phosphor) 55%, #cc8a20);
    color: rgba(0,0,0,0.82);
    text-shadow: 0 1px 0 rgba(255,255,255,0.2);
    border-color: #000;
  }
  [data-theme="sci-fi-dark"] > nav {
    box-shadow:
      inset 0 1px 0 var(--edge-hi),
      inset -1px 0 0 var(--edge-hi);
  }
  [data-theme="sci-fi-dark"] ::-webkit-scrollbar-thumb {
    box-shadow:
      inset 0 1px 0 var(--edge-hi),
      inset 0 -1px 0 rgba(0,0,0,0.6);
  }
`;

// ─── API Client (SigV4 + Cognito) ───────────────────────────
const API_URL = (import.meta.env?.VITE_API_URL ?? "").replace(/\/+$/, "");
if (!API_URL) {
  console.warn("VITE_API_URL is not set — copy .env.example to .env and fill in your API Gateway URL.");
}
const AWS_REGION = import.meta.env?.VITE_AWS_REGION ?? "us-east-1";
const IDENTITY_POOL_ID = import.meta.env?.VITE_COGNITO_IDENTITY_POOL_ID;
const USER_POOL_ID = import.meta.env?.VITE_COGNITO_USER_POOL_ID;
const CLIENT_ID = import.meta.env?.VITE_COGNITO_CLIENT_ID;
const COGNITO_DOMAIN = import.meta.env?.VITE_COGNITO_DOMAIN;
const REDIRECT_URI = window.location.origin;

let _creds = null, _credExpiry = 0, _tokenPromise = null;

function getStoredToken() {
  try {
    const token = sessionStorage.getItem("codex_id_token");
    if (!token) return null;
    const { exp } = JSON.parse(atob(token.split(".")[1]));
    if (exp * 1000 < Date.now()) { sessionStorage.removeItem("codex_id_token"); return null; }
    return token;
  } catch { return null; }
}
function storeToken(token) {
  try { sessionStorage.setItem("codex_id_token", token); } catch {}
}

async function ensureIdToken() {
  const stored = getStoredToken();
  if (stored) return stored;
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) {
    // prompt=none: if Cognito session cookie still alive, returns a fresh code immediately.
    // If that fails Cognito returns ?error=login_required — then we do a normal interactive login.
    const silent = !params.get("error");
    window.location.href =
      `https://${COGNITO_DOMAIN}/oauth2/authorize` +
      `?client_id=${CLIENT_ID}&response_type=code&scope=openid` +
      (silent ? "&prompt=none" : "") +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    return null;
  }
  // Single-use code — deduplicate concurrent callers into one exchange
  if (_tokenPromise) return _tokenPromise;
  _tokenPromise = (async () => {
    try {
      const res = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: CLIENT_ID,
          code,
          redirect_uri: REDIRECT_URI,
        }),
      });
      const json = await res.json();
      window.history.replaceState({}, "", window.location.pathname);
      if (!json.id_token) throw new Error(`token exchange failed: ${json.error ?? res.status}`);
      storeToken(json.id_token);
      return json.id_token;
    } finally {
      _tokenPromise = null;
    }
  })();
  return _tokenPromise;
}

async function getCredentials() {
  if (_creds && Date.now() < _credExpiry) return _creds;
  const idToken = await ensureIdToken();
  if (!idToken) return null;
  const client = new CognitoIdentityClient({ region: AWS_REGION });
  const { IdentityId } = await client.send(new GetIdCommand({
    IdentityPoolId: IDENTITY_POOL_ID,
    Logins: { [`cognito-idp.${AWS_REGION}.amazonaws.com/${USER_POOL_ID}`]: idToken },
  }));
  const { Credentials: C } = await client.send(new GetCredentialsForIdentityCommand({
    IdentityId,
    Logins: { [`cognito-idp.${AWS_REGION}.amazonaws.com/${USER_POOL_ID}`]: idToken },
  }));
  _creds = { accessKeyId: C.AccessKeyId, secretAccessKey: C.SecretKey, sessionToken: C.SessionToken };
  _credExpiry = new Date(C.Expiration).getTime() - 60_000;
  return _creds;
}

async function signedFetch(url, init = {}) {
  const creds = await getCredentials();
  if (!creds) throw new Error("auth:redirecting");
  const parsed = new URL(url);
  const signed = await new SignatureV4({
    credentials: creds, region: AWS_REGION, service: "execute-api", sha256: Sha256,
  }).sign({
    method: init.method ?? "GET",
    hostname: parsed.hostname,
    path: parsed.pathname + parsed.search,
    headers: { host: parsed.hostname, "content-type": "application/json", ...init.headers },
    body: init.body,
  });
  return fetch(url, { method: signed.method, headers: signed.headers, body: init.body });
}

async function apiLoad(module) {
  const res = await signedFetch(`${API_URL}/${module}`);
  if (res.status === 404) return { data: null, version: null };
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await signedFetch(`${API_URL}/${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

async function apiSave(module, body) {
  const res = await signedFetch(`${API_URL}/${module}`, {
    method: "PUT",
    body: JSON.stringify({ ...body, expectedVersion: body.expectedVersion ?? null }),
  });
  const data = await res.json();
  if (res.status === 409) return { conflict: true, ...data };
  if (res.status === 422) return { duplicates: true, module, ...data };
  if (!res.ok) throw new Error(data.message ?? `API ${res.status}`);
  return data;
}

// ─── Local Storage Helpers ───────────────────────────────────
function localLoad(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } }
function localSave(key, data) { try { localStorage.setItem(key, JSON.stringify(data)); } catch {} }

// ─── Shared UI Components ────────────────────────────────────

function StatusBadge({ status, lastSaved, onClick }) {
  const colors = { idle:"var(--text-dim)", saving:"var(--warning)", saved:"var(--success)", error:"var(--danger)", offline:"var(--danger)", local:"var(--text-dim)" };
  const labels = { idle:"Connected", saving:"Saving…", saved:"Saved", error:"Error", offline:"Offline", local:"Local Only" };
  const c = colors[status] || "var(--text-dim)";
  return (
    <button onClick={onClick} style={{ ...S.ioBtn, borderColor: c, color: c, display:"flex", alignItems:"center", gap:6 }}>
      <span style={{ width:6,height:6,borderRadius:"50%",background:c,flexShrink:0 }} />
      <span>{labels[status]||status}</span>
      {lastSaved && status !== "local" && <span style={{ fontSize:9,opacity:0.7 }}>{lastSaved}</span>}
    </button>
  );
}

function ThemeSelector({ current, onChange, fonts }) {
  return (
    <select value={current} onChange={e => onChange(e.target.value)} style={{ ...S.select, width: "auto", minWidth: 120, fontFamily: fonts.body, fontSize: 12 }}>
      {Object.entries(THEMES).map(([id, t]) => <option key={id} value={id}>{t.label}</option>)}
    </select>
  );
}

function ConflictModal({ storedVersion, onReload, onOverwrite, onClose }) {
  return (
    <div style={S.overlay}><div style={{ ...S.modal, maxWidth: 440 }}>
      <div style={S.modalHeader}><span style={{ ...S.modalHeaderDecor, background:"linear-gradient(180deg,var(--danger),var(--warning))" }} /><h2 style={S.modalTitle}>Version Conflict</h2><button style={S.closeBtn} onClick={onClose}>✕</button></div>
      <div style={S.modalBody}>
        <p style={{ fontSize:13,color:"var(--text-body)",lineHeight:1.6,marginBottom:12 }}>The data on the server has been modified since you last loaded it (server version: {storedVersion}). Your local changes haven't been saved yet.</p>
        <p style={{ fontSize:12,color:"var(--text-muted)",fontFamily:"var(--font-mono)",lineHeight:1.5 }}>You can reload the server version (discarding local changes) or force-overwrite with your current data.</p>
      </div>
      <div style={S.modalFooter}><button style={S.deleteBtn} onClick={onOverwrite}>Overwrite Server</button><div style={{flex:1}} /><button style={S.cancelBtn} onClick={onClose}>Cancel</button><button style={S.saveBtn} onClick={onReload}>Reload From Server</button></div>
    </div></div>
  );
}

// ─── Main App ────────────────────────────────────────────────
export default function Codex() {
  // ── State ──
  const [theme, setTheme] = useState(() => {
    const saved = localLoad(STORAGE_KEYS.theme);
    if (saved === "grimdark") { localSave(STORAGE_KEYS.theme, "hearthwood"); return "hearthwood"; }
    return saved || "sci-fi-dark";
  });
  const navigate = useNavigate();

  // Data per module
  const [overview, setOverview] = useState({ title: "", subtitle: "", body: "", notes: "", tags: [] });
  const [events, setEvents] = useState([]);
  const [eras, setEras] = useState([]);
  const [species, setSpecies] = useState([]);
  const [factions, setFactions] = useState([]);
  const [technology, setTechnology] = useState([]);
  const [locations, setLocations] = useState([]);
  const [lore, setLore] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [stories, setStories] = useState([]);

  // API state per module
  const [versions, setVersions] = useState({});
  const [apiStatus, setApiStatus] = useState(() => IDENTITY_POOL_ID ? "idle" : "local");
  const [lastSaved, setLastSaved] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const saveTimeoutRef = useRef(null);
  const savingRef = useRef(false);
  const initialLoadRef = useRef(true);
  const useApi = !!IDENTITY_POOL_ID;
  const worldName = (() => { try { return import.meta.env?.VITE_WORLD_NAME || null; } catch { return null; } })();
  const t = THEMES[theme];

  // ── All data aggregated for cross-module linking ──
  const allData = useMemo(() => ({ events, species, factions, technology, locations, lore, characters, stories }), [events, species, factions, technology, locations, lore, characters, stories]);

  // ── Theme persistence ──
  useEffect(() => { localSave(STORAGE_KEYS.theme, theme); }, [theme]);

  // ── Load all modules ──
  useEffect(() => {
    (async () => {
      if (useApi) {
        try {
          const results = await Promise.all(API_MODULES.map(m => apiLoad(m.id)));
          const v = {};
          results.forEach((r, i) => {
            const mod = API_MODULES[i].id;
            v[mod] = r.version;
            if (mod === "overview") setOverview(r.overview || { title: "", subtitle: "", body: "", notes: "", tags: [] });
            else if (mod === "timeline") { setEvents(r.events || []); setEras(r.eras || []); }
            else if (mod === "species") setSpecies(r.species || []);
            else if (mod === "factions") setFactions(r.factions || []);
            else if (mod === "technology") setTechnology(r.technology || []);
            else if (mod === "locations") setLocations(r.locations || []);
            else if (mod === "lore") setLore(r.lore || []);
            else if (mod === "characters") setCharacters(r.characters || []);
            else if (mod === "stories") setStories(r.stories || []);
          });
          setVersions(v);
          setApiStatus("idle");
        } catch (e) {
          setApiStatus("offline");
          setApiError(e.message);
          // Fall back to localStorage
          setOverview(localLoad("codex-overview") || { title: "", subtitle: "", body: "", notes: "", tags: [] });
          setEvents(localLoad("codex-events") || []);
          setEras(localLoad("codex-eras") || []);
          setSpecies(localLoad("codex-species") || []);
          setFactions(localLoad("codex-factions") || []);
          setTechnology(localLoad("codex-technology") || []);
          setLocations(localLoad("codex-locations") || []);
          setLore(localLoad("codex-lore") || []);
          setCharacters(localLoad("codex-characters") || []);
          setStories(localLoad("codex-stories") || []);
        }
      } else {
        setOverview(localLoad("codex-overview") || { title: "", subtitle: "", body: "", notes: "", tags: [] });
        setEvents(localLoad("codex-events") || []);
        setEras(localLoad("codex-eras") || []);
        setSpecies(localLoad("codex-species") || []);
        setFactions(localLoad("codex-factions") || []);
        setTechnology(localLoad("codex-technology") || []);
        setLocations(localLoad("codex-locations") || []);
        setLore(localLoad("codex-lore") || []);
        setCharacters(localLoad("codex-characters") || []);
        setStories(localLoad("codex-stories") || []);
      }
      setLoaded(true);
      // Skip the first auto-save cycle triggered by setting initial state
      setTimeout(() => { initialLoadRef.current = false; }, 100);
    })();
  }, []);

  // ── Auto-save ──
  useEffect(() => {
    if (!loaded) return;
    // Always save locally
    localSave("codex-overview", overview);
    localSave("codex-events", events); localSave("codex-eras", eras);
    localSave("codex-species", species); localSave("codex-factions", factions);
    localSave("codex-technology", technology); localSave("codex-locations", locations);
    localSave("codex-lore", lore);
    localSave("codex-characters", characters); localSave("codex-stories", stories);

    if (!useApi || conflict || initialLoadRef.current) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (savingRef.current) return;
      savingRef.current = true;
      setApiStatus("saving"); setApiError(null);
      try {
        // Save all modules
        const saves = [
          apiSave("overview", { overview, expectedVersion: versions.overview }),
          apiSave("timeline", { events, eras, expectedVersion: versions.timeline }),
          apiSave("species", { species, expectedVersion: versions.species }),
          apiSave("factions", { factions, expectedVersion: versions.factions }),
          apiSave("technology", { technology, expectedVersion: versions.technology }),
          apiSave("locations", { locations, expectedVersion: versions.locations }),
          apiSave("lore", { lore, expectedVersion: versions.lore }),
          apiSave("characters", { characters, expectedVersion: versions.characters }),
          apiSave("stories", { stories, expectedVersion: versions.stories }),
        ];
        const results = await Promise.all(saves);
        const hasConflict = results.find(r => r.conflict);
        const hasDuplicates = results.find(r => r.duplicates);
        if (hasDuplicates) {
          setApiStatus("error");
          setApiError(`Duplicate or missing entity IDs in ${hasDuplicates.module}. Save aborted to prevent data corruption.`);
          console.error("Duplicate ID problems:", hasDuplicates.problems);
        } else if (hasConflict) { setConflict(hasConflict); setApiStatus("error"); }
        else {
          const v = { ...versions };
          API_MODULES.forEach((m, i) => { v[m.id] = results[i].version; });
          setVersions(v);
          setLastSaved(new Date().toLocaleTimeString());
          setApiStatus("saved");
          setTimeout(() => setApiStatus("idle"), 2000);
        }
      } catch (e) { setApiStatus("error"); setApiError(e.message); }
      finally { savingRef.current = false; }
    }, 1500);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [overview, events, eras, species, factions, technology, locations, lore, characters, stories, loaded, conflict]);

  // ── CRUD helpers ──
  const saveEntity = (setter, entity) => setter(prev => { const idx = prev.findIndex(e => e.id === entity.id); if (idx >= 0) { const n = [...prev]; n[idx] = entity; return n; } return [...prev, entity]; });
  const deleteEntity = (setter, id) => setter(prev => prev.filter(e => e.id !== id));

  // ── Navigation handler for cross-module links ──
  // type comes from crossModuleLinks ({ type, id }); maps to a URL module path.
  // We resolve the entity to a slug so cross-module nav produces readable URLs.
  // Falls back to the raw id if the entity isn't loaded.
  const handleNavigate = useCallback((type, id) => {
    const moduleMap = { event:"timeline", faction:"factions", species:"species", tech:"technology", location:"locations", lore:"lore", character:"characters", story:"stories" };
    const dataMap = { timeline: events, factions, species, technology, locations, lore, characters, stories };
    const mod = moduleMap[type];
    if (!mod) return;
    if (!id) { navigate(`/${mod}`); return; }
    const entity = (dataMap[mod] || []).find(e => e.id === id);
    navigate(`/${mod}/${entity ? entitySlug(entity) : id}`);
  }, [navigate, events, factions, species, technology, locations, lore, characters, stories]);

  // ── Conflict handlers ──
  const handleConflictReload = async () => { try { const results = await Promise.all(API_MODULES.map(m => apiLoad(m.id))); const v = {}; results.forEach((r,i) => { const mod = API_MODULES[i].id; v[mod] = r.version; if (mod==="overview")setOverview(r.overview||{title:"",subtitle:"",body:"",notes:"",tags:[]}); else if(mod==="timeline"){setEvents(r.events||[]);setEras(r.eras||[]);} else if(mod==="species")setSpecies(r.species||[]); else if(mod==="factions")setFactions(r.factions||[]); else if(mod==="technology")setTechnology(r.technology||[]); else if(mod==="locations")setLocations(r.locations||[]); else if(mod==="lore")setLore(r.lore||[]); else if(mod==="characters")setCharacters(r.characters||[]); else if(mod==="stories")setStories(r.stories||[]); }); setVersions(v); setConflict(null); setApiStatus("idle"); } catch(e) { setApiError(e.message); } };
  const handleConflictOverwrite = async () => {
    // Pre-flight: refuse to overwrite the server with local data that has duplicate IDs.
    // This is the corruption vector we want closed.
    const problems = findDuplicateIds({ events, eras, species, factions, technology, locations, lore, characters, stories });
    if (problems.length) {
      setApiError(`Refusing to overwrite: local data has duplicate or missing IDs in ${problems.map(p => p.key).join(", ")}. Reload from server instead, or run the repair script.`);
      console.error("Local duplicate IDs detected, overwrite aborted:", problems);
      return;
    }
    try {
      const fresh = await Promise.all(API_MODULES.map(m => apiLoad(m.id)));
      const v = {}; fresh.forEach((r,i) => { v[API_MODULES[i].id] = r.version; });
      const saves = [
        apiSave("overview",{overview,expectedVersion:v.overview}),
        apiSave("timeline",{events,eras,expectedVersion:v.timeline}),
        apiSave("species",{species,expectedVersion:v.species}),
        apiSave("factions",{factions,expectedVersion:v.factions}),
        apiSave("technology",{technology,expectedVersion:v.technology}),
        apiSave("locations",{locations,expectedVersion:v.locations}),
        apiSave("lore",{lore,expectedVersion:v.lore}),
        apiSave("characters",{characters,expectedVersion:v.characters}),
        apiSave("stories",{stories,expectedVersion:v.stories}),
      ];
      const results = await Promise.all(saves);
      const dupResult = results.find(r => r.duplicates);
      if (dupResult) {
        setApiError(`Server rejected save: duplicate IDs in ${dupResult.module}. Overwrite aborted.`);
        console.error("Server rejected:", dupResult.problems);
        return;
      }
      const nv = {}; API_MODULES.forEach((m,i) => { nv[m.id] = results[i].version; });
      setVersions(nv); setConflict(null); setLastSaved(new Date().toLocaleTimeString());
      setApiStatus("saved"); setTimeout(() => setApiStatus("idle"), 2000);
    } catch(e) { setApiError(e.message); }
  };

  // ── Theme CSS vars ──
  const themeStyle = {};
  Object.entries(t.vars).forEach(([k, v]) => { themeStyle[k] = v; });
  themeStyle["--font-heading"] = t.fonts.heading;
  themeStyle["--font-body"] = t.fonts.body;
  themeStyle["--font-mono"] = t.fonts.mono;

  if (!loaded) return (
    <div style={{ ...themeStyle, display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:"var(--bg-deep)",fontFamily:t.fonts.body }}>
      <div style={{ width:32,height:32,border:"3px solid var(--border)",borderTopColor:"var(--accent)",borderRadius:"50%",animation:"spin 0.8s linear infinite" }} />
      <span style={{ color:"var(--accent)",marginTop:12 }}>Loading Codex…</span>
    </div>
  );

  return (
    <div data-theme-family={t.family} style={{ ...themeStyle, fontFamily: t.fonts.body, background: "var(--bg-deep)", height: "100vh", overflow: "hidden", color: "var(--text-body)", display: "flex" }}>
      <style>{FONT_CSS}{BASE_CSS}</style>

      {/* ── Sidebar ── */}
      <nav style={{ width:220, minWidth:220, background:"var(--bg-panel)", borderRight:"1px solid var(--border-subtle)", display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Logo (links to overview) */}
        <NavLink
          to="/overview"
          style={{
            textDecoration: "none",
            display: "block",
            padding: "22px 18px 18px",
            borderBottom: "1px solid var(--border-faint)",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--bg-hover)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
          {theme === "hearthwood" ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: t.fonts.mono, fontSize: 9, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--warning)" }}>— A Worldbuilder's Index —</span>
              <span style={{ fontFamily: t.fonts.heading, fontWeight: 600, fontSize: 28, letterSpacing: "0.06em", color: "var(--text-primary)", lineHeight: 1 }}>Codex</span>
              <span style={{ position: "relative", width: 90, height: 1, background: "var(--text-muted)", display: "block" }}>
                <span style={{ position: "absolute", top: -2, left: "50%", transform: "translateX(-50%)", width: 5, height: 5, background: "var(--text-muted)", borderRadius: "50%" }}/>
              </span>
              <span style={{ fontFamily: t.fonts.mono, fontSize: 9, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--warning)" }}>Volume the First</span>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", fontFamily: t.fonts.heading, fontWeight: 600, fontSize: 22, letterSpacing: "0.06em", color: "var(--text-primary)", lineHeight: 1 }}>
                <span style={{ color: "var(--accent)", fontWeight: 500, paddingRight: 4 }}>[</span>
                <span>CODEX</span>
                <span style={{ color: "var(--accent)", fontWeight: 500, paddingLeft: 4 }}>]</span>
              </div>
              <div style={{ marginTop: 6, fontFamily: t.fonts.mono, fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                Worldbuilding Index
              </div>
            </>
          )}
          {worldName && (
            <div style={{
              marginTop: 14,
              paddingTop: 10,
              borderTop: "1px solid var(--border-faint)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}>
              <span style={{ fontFamily: t.fonts.mono, fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.14em", textTransform: "uppercase" }}>World</span>
              <span style={{ fontFamily: t.fonts.heading, fontSize: 14, fontWeight: 600, color: "var(--accent)", letterSpacing: "0.04em" }}>{worldName}</span>
            </div>
          )}
        </NavLink>

        {/* Module nav — NavLink derives active state from the URL */}
        <div style={{ flex:1, padding:"8px 0" }}>
          {MODULES.map(m => (
            <NavLink
              key={m.id}
              to={`/${m.id}`}
              style={({ isActive }) => ({
                display:"flex", alignItems:"center", gap:10, width:"100%", padding:"10px 16px",
                border:"none", textDecoration:"none",
                background: isActive ? "var(--bg-selected)" : "transparent",
                color: isActive ? "var(--accent)" : "var(--text-muted)",
                fontFamily: t.fonts.heading, fontSize:13, fontWeight: isActive ? 700 : 400,
                cursor:"pointer", textAlign:"left", letterSpacing:0.5,
                borderLeft: isActive ? "3px solid var(--accent)" : "3px solid transparent",
                boxSizing: "border-box",
              })}
              onMouseEnter={e => { if (!e.currentTarget.style.background.includes("selected")) e.currentTarget.dataset.hover = "1"; }}
            >
              <span style={{ fontSize:16, opacity:0.7 }}>{m.icon}</span>
              {m.label}
            </NavLink>
          ))}
        </div>

        {/* Bottom controls */}
        <div style={{ padding:"12px 16px", borderTop:"1px solid var(--border-faint)", display:"flex", flexDirection:"column", gap:8 }}>
          <ThemeSelector current={theme} onChange={setTheme} fonts={t.fonts} />
          <StatusBadge status={apiStatus} lastSaved={lastSaved} onClick={null} />
          {apiError && <span style={{ fontSize:9, color:"var(--danger)", fontFamily:t.fonts.mono, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={apiError}>{apiError}</span>}
        </div>
      </nav>

      {/* ── Main content ── */}
      <main style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <Routes>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OverviewModule overview={overview} onChange={setOverview} allData={allData} onNavigate={mod => navigate(`/${mod}`)} />} />
          <Route path="/timeline" element={<TimelineModule events={events} eras={eras} factions={factions} characters={characters} onSaveEvent={ev => saveEntity(setEvents, ev)} onDeleteEvent={id => deleteEntity(setEvents, id)} onSaveEras={setEras} allData={allData} onNavigate={handleNavigate} apiPost={apiPost} />} />
          <Route path="/timeline/:id" element={<TimelineModule events={events} eras={eras} factions={factions} characters={characters} onSaveEvent={ev => saveEntity(setEvents, ev)} onDeleteEvent={id => deleteEntity(setEvents, id)} onSaveEras={setEras} allData={allData} onNavigate={handleNavigate} apiPost={apiPost} />} />
          {[null, "/:id"].map(suffix => (
            <Route key={`species${suffix||""}`} path={`/species${suffix||""}`} element={
              <SpeciesModule species={species} onSave={e => saveEntity(setSpecies, e)} onDelete={id => deleteEntity(setSpecies, id)} allData={allData} onNavigate={handleNavigate} apiPost={apiPost} />
            } />
          ))}
          <Route path="/factions" element={<FactionsModule factions={factions} species={species} onSave={e => saveEntity(setFactions, e)} onDelete={id => deleteEntity(setFactions, id)} allData={allData} onNavigate={handleNavigate} apiPost={apiPost} />} />
          <Route path="/factions/:id" element={<FactionsModule factions={factions} species={species} onSave={e => saveEntity(setFactions, e)} onDelete={id => deleteEntity(setFactions, id)} allData={allData} onNavigate={handleNavigate} apiPost={apiPost} />} />
          <Route path="/technology" element={<TechnologyModule technology={technology} onSave={e => saveEntity(setTechnology, e)} onDelete={id => deleteEntity(setTechnology, id)} allData={allData} onNavigate={handleNavigate} apiPost={apiPost} />} />
          <Route path="/technology/:id" element={<TechnologyModule technology={technology} onSave={e => saveEntity(setTechnology, e)} onDelete={id => deleteEntity(setTechnology, id)} allData={allData} onNavigate={handleNavigate} apiPost={apiPost} />} />
          <Route path="/lore" element={<LoreModule lore={lore} onSave={e => saveEntity(setLore, e)} onDelete={id => deleteEntity(setLore, id)} allData={allData} onNavigate={handleNavigate} apiPost={apiPost} />} />
          <Route path="/lore/:id" element={<LoreModule lore={lore} onSave={e => saveEntity(setLore, e)} onDelete={id => deleteEntity(setLore, id)} allData={allData} onNavigate={handleNavigate} apiPost={apiPost} />} />
          <Route path="/locations" element={<LocationsModule locations={locations} onSave={e => saveEntity(setLocations, e)} onDelete={id => deleteEntity(setLocations, id)} allData={allData} onNavigate={handleNavigate} apiPost={apiPost} />} />
          <Route path="/locations/:id" element={<LocationsModule locations={locations} onSave={e => saveEntity(setLocations, e)} onDelete={id => deleteEntity(setLocations, id)} allData={allData} onNavigate={handleNavigate} apiPost={apiPost} />} />
          <Route path="/characters" element={<CharactersModule characters={characters} species={species} factions={factions} stories={stories} onSave={e => saveEntity(setCharacters, e)} onDelete={id => deleteEntity(setCharacters, id)} allData={allData} onNavigate={handleNavigate} apiPost={apiPost} />} />
          <Route path="/characters/:id" element={<CharactersModule characters={characters} species={species} factions={factions} stories={stories} onSave={e => saveEntity(setCharacters, e)} onDelete={id => deleteEntity(setCharacters, id)} allData={allData} onNavigate={handleNavigate} apiPost={apiPost} />} />
          <Route path="/stories" element={<StoriesModule stories={stories} onSave={e => saveEntity(setStories, e)} onDelete={id => deleteEntity(setStories, id)} allData={allData} onNavigate={handleNavigate} apiPost={apiPost} />} />
          <Route path="/stories/:id" element={<StoriesModule stories={stories} onSave={e => saveEntity(setStories, e)} onDelete={id => deleteEntity(setStories, id)} allData={allData} onNavigate={handleNavigate} apiPost={apiPost} />} />
          <Route path="/content-map" element={<ContentMapModule allData={allData} onNavigate={handleNavigate} />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </main>

      {/* ── Modals ── */}
      {conflict && <ConflictModal storedVersion={conflict.storedVersion} onReload={handleConflictReload} onOverwrite={handleConflictOverwrite} onClose={() => setConflict(null)} />}
    </div>
  );
}
