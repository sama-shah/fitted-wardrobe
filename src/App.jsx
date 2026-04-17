import { useState, useEffect, useRef, useCallback } from "react";
import { Shirt, Layers, Sparkles, Wind, Footprints, Watch, Star, Upload, Camera, Link, ShoppingBag, LayoutGrid } from "lucide-react";
import ReactCrop, { centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

// const SUPABASE_URL = "https://quqqiapwfddwbbjssfmq.supabase.co";
// const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1cXFpYXB3ZmRkd2JianNzZm1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MDk3MjgsImV4cCI6MjA4NzE4NTcyOH0.dtFJSZWeVJmMLBVs9YJbn1WdR0-JfzaUd75iMDJ7hNg";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const REMOVE_BG_KEY = import.meta.env.VITE_REMOVE_BG_KEY;
// ─── Supabase helpers ────────────────────────────────────────────────────────
const sb = {
  async req(path, opts = {}) {
    const token = localStorage.getItem("sb_token");
    const res = await fetch(`${SUPABASE_URL}${path}`, {
      ...opts,
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.headers || {}),
      },
    });
    const text = await res.text();
    try { return { data: JSON.parse(text), ok: res.ok, status: res.status }; }
    catch { return { data: text, ok: res.ok, status: res.status }; }
  },
  async signUp(email, password) {
    return sb.req("/auth/v1/signup", { method: "POST", body: JSON.stringify({ email, password }) });
  },
  async signIn(email, password) {
    const r = await sb.req("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) });
    if (r.ok && r.data.access_token) {
      localStorage.setItem("sb_token", r.data.access_token);
      localStorage.setItem("sb_user", JSON.stringify(r.data.user));
    }
    return r;
  },
  signOut() {
    localStorage.removeItem("sb_token");
    localStorage.removeItem("sb_user");
  },
  getUser() {
    try { return JSON.parse(localStorage.getItem("sb_user")); } catch { return null; }
  },
  async uploadFile(bucket, path, file) {
    const token = localStorage.getItem("sb_token");
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: file,
    });
    return res.ok;
  },
  getPublicUrl(bucket, path) {
    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
  },
  async from(table) {
    return {
      select: async (cols = "*", filters = "") => sb.req(`/rest/v1/${table}?select=${cols}${filters}`),
      insert: async (data) => sb.req(`/rest/v1/${table}`, { method: "POST", body: JSON.stringify(data), headers: { Prefer: "return=representation" } }),
      update: async (data, filters) => sb.req(`/rest/v1/${table}?${filters}`, { method: "PATCH", body: JSON.stringify(data), headers: { Prefer: "return=representation" } }),
      delete: async (filters) => sb.req(`/rest/v1/${table}?${filters}`, { method: "DELETE" }),
    };
  },
  async select(table, cols = "*", filters = "") {
    return sb.req(`/rest/v1/${table}?select=${cols}${filters}`);
  },
  async insert(table, data) {
    return sb.req(`/rest/v1/${table}`, { method: "POST", body: JSON.stringify(data), headers: { Prefer: "return=representation" } });
  },
  async update(table, data, filters) {
    return sb.req(`/rest/v1/${table}?${filters}`, { method: "PATCH", body: JSON.stringify(data), headers: { Prefer: "return=representation" } });
  },
  async delete(table, filters) {
    return sb.req(`/rest/v1/${table}?${filters}`, { method: "DELETE" });
  },
};

// ─── Background removal using @imgly/background-removal ─────────────────────
async function removeBackground(imageFile) {
  return new Promise((resolve, reject) => {
    // Use a canvas-based approach with the image as-is if library unavailable
    // We'll use remove.bg free via imgly CDN loaded dynamically
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.5/dist/background-removal.js";
    script.onload = async () => {
      try {
        const { removeBackground: removeBg } = window.BackgroundRemoval || window["@imgly/background-removal"] || {};
        if (!removeBg) throw new Error("Library not found");
        const blob = await removeBg(imageFile, { publicPath: "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.5/dist/" });
        resolve(blob);
      } catch (e) {
        reject(e);
      }
    };
    script.onerror = () => reject(new Error("Failed to load BG removal library"));
    if (!document.querySelector(`script[src="${script.src}"]`)) {
      document.head.appendChild(script);
    } else {
      script.onload();
    }
  });
}

const CATEGORIES = ["tops", "bottoms", "dresses", "outerwear", "shoes", "accessories", "other"];
const CATEGORY_ICONS = { tops: "tops", bottoms: "bottoms", dresses: "dresses", outerwear: "outerwear", shoes: "shoes", accessories: "accessories", other: "other" };
function CategoryIcon({ category, size = 14, style = {} }) {
  const props = { size, strokeWidth: 1.5, style: { color: "var(--bark)", ...style } };
  switch (category) {
    case "tops": return <Shirt {...props} />;
    case "bottoms": return <Layers {...props} />;
    case "dresses": return <Star {...props} />;
    case "outerwear": return <Wind {...props} />;
    case "shoes": return <Footprints {...props} />;
    case "accessories": return <Watch {...props} />;
    default: return <Sparkles {...props} />;
  }
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const G = `
  @import url('https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500&display=swap');

  @font-face {
    font-family: 'IvarSoft';
    src: url('/fonts/IvarSoftTRIAL-Regular.otf') format('opentype');
    font-weight: 400;
    font-style: normal;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --cream: #f7f3ee;
    --warm: #e8e0d5;
    --stone: #c4b8aa;
    --bark: #8b7355;
    --ink: #2a2118;
    --accent: #c17f4a;
    --soft: #f0e8de;
    --danger: #c0614f;
  }

  body { background: var(--cream); color: var(--ink); font-family: 'Jost', sans-serif; min-height: 100vh; }

  .app { min-height: 100vh; display: flex; flex-direction: column; }

  /* Auth */
  .auth-wrap { min-height: 100vh; display: grid; place-items: center; background: var(--cream); }
  .auth-card { width: 420px; padding: 56px 48px; background: white; border: 1px solid var(--warm); }
  .auth-logo { font-family: 'IvarSoft', serif; font-size: 2.8rem; font-weight: 400; letter-spacing: 0.02em; text-align: center; margin-bottom: 8px; color: var(--ink); }
  .auth-sub { text-align: center; color: var(--stone); font-size: 0.8rem; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 40px; }
  .auth-tabs { display: flex; border-bottom: 1px solid var(--warm); margin-bottom: 32px; }
  .auth-tab { flex: 1; padding: 12px; text-align: center; cursor: pointer; font-size: 0.8rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--stone); border: none; background: none; transition: color 0.2s; }
  .auth-tab.active { color: var(--ink); border-bottom: 2px solid var(--ink); margin-bottom: -1px; }
  .auth-field { margin-bottom: 20px; }
  .auth-field label { display: block; font-size: 0.72rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--stone); margin-bottom: 8px; }
  .auth-field input { width: 100%; padding: 12px 14px; border: 1px solid var(--warm); background: var(--cream); font-family: 'Jost', sans-serif; font-size: 0.9rem; outline: none; transition: border-color 0.2s; }
  .auth-field input:focus { border-color: var(--bark); }
  .btn-primary { width: 100%; padding: 14px; background: var(--ink); color: var(--cream); font-family: 'Jost', sans-serif; font-size: 0.8rem; letter-spacing: 0.15em; text-transform: uppercase; border: none; cursor: pointer; transition: background 0.2s; margin-top: 8px; }
  .btn-primary:hover { background: var(--bark); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .auth-error { color: var(--danger); font-size: 0.82rem; margin-top: 12px; text-align: center; }

  /* Header */
  .header { display: flex; align-items: center; justify-content: space-between; padding: 20px 40px; border-bottom: 1px solid var(--warm); background: white; position: sticky; top: 0; z-index: 100; }
  .logo { font-family: 'IvarSoft', serif; font-size: 1.8rem; font-weight: 400; letter-spacing: 0.02em; color: var(--ink); }
  .nav { display: flex; gap: 4px; }
  .nav-btn { padding: 8px 20px; font-family: 'Jost', sans-serif; font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; border: none; cursor: pointer; background: none; color: var(--stone); transition: color 0.2s; }
  .nav-btn.active, .nav-btn:hover { color: var(--ink); }
  .nav-btn.active { border-bottom: 1.5px solid var(--ink); }
  .sign-out { padding: 8px 16px; font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase; border: 1px solid var(--warm); background: none; cursor: pointer; color: var(--stone); font-family: 'Jost', sans-serif; transition: all 0.2s; }
  .sign-out:hover { border-color: var(--ink); color: var(--ink); }

  /* Main */
  .main { flex: 1; padding: 40px; max-width: 1400px; margin: 0 auto; width: 100%; }

  /* Wardrobe */
  .wardrobe-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
  .page-title { font-family: 'Cormorant Garamond', serif; font-size: 2rem; font-weight: 300; letter-spacing: 0.05em; }
  .upload-btn { display: flex; align-items: center; gap: 8px; padding: 12px 24px; background: var(--ink); color: var(--cream); font-family: 'Jost', sans-serif; font-size: 0.78rem; letter-spacing: 0.12em; text-transform: uppercase; border: none; cursor: pointer; transition: background 0.2s; }
  .upload-btn:hover { background: var(--bark); }

  .category-filter { display: flex; gap: 8px; margin-bottom: 28px; flex-wrap: wrap; }
  .cat-btn { padding: 7px 18px; font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; border: 1px solid var(--warm); background: none; cursor: pointer; font-family: 'Jost', sans-serif; color: var(--stone); transition: all 0.2s; }
  .cat-btn.active, .cat-btn:hover { border-color: var(--ink); color: var(--ink); background: var(--soft); }

  .items-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }
  .item-card { background: white; border: 1px solid var(--warm); cursor: pointer; position: relative; group; transition: transform 0.2s, box-shadow 0.2s; }
  .item-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(42,33,24,0.1); }
  .item-card:hover .item-actions { opacity: 1; }
  .item-img-wrap { aspect-ratio: 3/4; display: flex; align-items: center; justify-content: center; background: var(--soft); overflow: hidden; }
  .item-img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .item-info { padding: 12px 14px; }
  .item-name { font-size: 0.85rem; font-weight: 500; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item-cat { font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--stone); }
  .item-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
  .tag { padding: 2px 8px; background: var(--soft); font-size: 0.68rem; letter-spacing: 0.06em; color: var(--bark); }
  .item-actions { position: absolute; top: 8px; right: 8px; display: flex; gap: 6px; opacity: 0; transition: opacity 0.2s; }
  .icon-btn { width: 30px; height: 30px; border-radius: 50%; background: white; border: 1px solid var(--warm); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.75rem; transition: all 0.2s; }
  .icon-btn:hover { background: var(--ink); color: white; border-color: var(--ink); }
  .icon-btn.danger:hover { background: var(--danger); border-color: var(--danger); }
  .add-to-board-btn { position: absolute; bottom: 0; left: 0; right: 0; padding: 8px; background: var(--ink); color: var(--cream); font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase; text-align: center; opacity: 0; transition: opacity 0.2s; border: none; cursor: pointer; font-family: 'Jost', sans-serif; }
  .item-card:hover .add-to-board-btn { opacity: 1; }

  /* Upload Modal */
  .modal-overlay { position: fixed; inset: 0; background: rgba(42,33,24,0.5); display: flex; align-items: center; justify-content: center; z-index: 200; backdrop-filter: blur(2px); }
  .modal { background: white; width: 520px; max-width: 95vw; max-height: 90vh; overflow-y: auto; }
  .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 28px 32px 20px; border-bottom: 1px solid var(--warm); }
  .modal-title { font-family: 'Cormorant Garamond', serif; font-size: 1.5rem; font-weight: 300; }
  .modal-close { background: none; border: none; cursor: pointer; font-size: 1.2rem; color: var(--stone); padding: 4px 8px; }
  .modal-body { padding: 28px 32px; }
  .drop-zone { border: 2px dashed var(--warm); padding: 48px 24px; text-align: center; cursor: pointer; transition: border-color 0.2s; margin-bottom: 24px; }
  .drop-zone:hover, .drop-zone.drag-over { border-color: var(--bark); background: var(--soft); }
  .drop-zone-icon { font-size: 2.5rem; margin-bottom: 12px; }
  .drop-zone-text { font-size: 0.85rem; color: var(--stone); }
  .preview-img { max-height: 200px; max-width: 100%; object-fit: contain; display: block; margin: 0 auto 16px; }
  .field { margin-bottom: 20px; }
  .field label { display: block; font-size: 0.72rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--stone); margin-bottom: 8px; }
  .field input, .field select { width: 100%; padding: 10px 12px; border: 1px solid var(--warm); background: var(--cream); font-family: 'Jost', sans-serif; font-size: 0.88rem; outline: none; }
  .field input:focus, .field select:focus { border-color: var(--bark); }
  .progress-bar { height: 3px; background: var(--warm); margin-bottom: 16px; overflow: hidden; }
  .progress-fill { height: 100%; background: var(--bark); transition: width 0.3s; }
  .status-text { font-size: 0.8rem; color: var(--stone); text-align: center; margin-bottom: 16px; }

  /* Boards */
  .boards-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
  .boards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px; }
  .board-card { background: white; border: 1px solid var(--warm); cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; position: relative; }
  .board-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(42,33,24,0.1); }
  .board-preview { aspect-ratio: 4/3; background: var(--soft); overflow: hidden; display: flex; align-items: center; justify-content: center; }
  .board-preview img { width: 100%; height: 100%; object-fit: cover; }
  .board-info { padding: 16px 18px; }
  .board-title { font-family: 'Cormorant Garamond', serif; font-size: 1.15rem; font-weight: 400; margin-bottom: 4px; }
  .board-meta { font-size: 0.72rem; color: var(--stone); letter-spacing: 0.06em; }
  .new-board-card { border: 2px dashed var(--warm); display: flex; flex-direction: column; align-items: center; justify-content: center; aspect-ratio: unset; min-height: 200px; gap: 12px; cursor: pointer; transition: all 0.2s; background: none; width: 100%; font-family: 'Jost', sans-serif; }
  .new-board-card:hover { border-color: var(--bark); background: var(--soft); }
  .new-board-icon { font-size: 2rem; }
  .new-board-text { font-size: 0.8rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--stone); }

  /* Canvas Editor */
  .editor-wrap { display: flex; height: calc(100vh - 80px); gap: 0; margin: -40px; }
  .editor-sidebar { width: 260px; background: white; border-right: 1px solid var(--warm); overflow-y: auto; flex-shrink: 0; }
  .editor-sidebar-header { padding: 20px; border-bottom: 1px solid var(--warm); }
  .editor-sidebar-title { font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--stone); }
  .sidebar-items { padding: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .sidebar-item { background: var(--soft); aspect-ratio: 1; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: opacity 0.2s; overflow: hidden; border: 1px solid transparent; }
  .sidebar-item:hover { border-color: var(--bark); }
  .sidebar-item img { max-width: 90%; max-height: 90%; object-fit: contain; }

  .editor-main { flex: 1; display: flex; flex-direction: column; }
  .editor-toolbar { display: flex; align-items: center; gap: 12px; padding: 14px 20px; border-bottom: 1px solid var(--warm); background: white; }
  .editor-board-title { font-family: 'Cormorant Garamond', serif; font-size: 1.2rem; font-weight: 300; border: none; outline: none; background: transparent; flex: 1; }
  .tool-btn { padding: 8px 16px; font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; border: 1px solid var(--warm); background: none; cursor: pointer; font-family: 'Jost', sans-serif; color: var(--stone); transition: all 0.2s; }
  .tool-btn:hover { border-color: var(--ink); color: var(--ink); }
  .tool-btn.primary { background: var(--ink); color: var(--cream); border-color: var(--ink); }
  .tool-btn.primary:hover { background: var(--bark); border-color: var(--bark); }
  .tool-btn.danger { color: var(--danger); }

  .canvas-area { flex: 1; background: repeating-conic-gradient(var(--warm) 0% 25%, var(--cream) 0% 50%) 0 0 / 24px 24px; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; }
  .canvas-board { width: 700px; height: 900px; background: white; position: relative; box-shadow: 0 4px 40px rgba(42,33,24,0.15); }
  .canvas-item { position: absolute; cursor: move; user-select: none; }
  .canvas-item img { display: block; }
  .canvas-item.selected { outline: 2px solid var(--bark); }
  .canvas-item-handles { display: none; }
  .canvas-item.selected .canvas-item-handles { display: block; }
  .resize-handle { position: absolute; bottom: -5px; right: -5px; width: 12px; height: 12px; background: var(--bark); cursor: se-resize; border-radius: 50%; }
  .delete-handle { position: absolute; top: -10px; right: -10px; width: 20px; height: 20px; background: var(--danger); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; cursor: pointer; border: none; }

  /* Share */
  .share-box { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
  .share-url { flex: 1; padding: 8px 12px; border: 1px solid var(--warm); background: var(--soft); font-size: 0.8rem; font-family: 'Jost', sans-serif; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .copy-btn { padding: 8px 14px; font-size: 0.75rem; background: var(--ink); color: var(--cream); border: none; cursor: pointer; font-family: 'Jost', sans-serif; white-space: nowrap; }

  /* Empty states */
  .empty { text-align: center; padding: 80px 20px; color: var(--stone); }
  .empty-icon { font-size: 3rem; margin-bottom: 16px; }
  .empty-text { font-family: 'Cormorant Garamond', serif; font-size: 1.3rem; font-weight: 300; margin-bottom: 8px; color: var(--bark); }
  .empty-sub { font-size: 0.85rem; }

  .toast { position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%); background: var(--ink); color: var(--cream); padding: 12px 24px; font-size: 0.82rem; letter-spacing: 0.08em; z-index: 999; animation: fadeUp 0.3s ease; }
  @keyframes fadeUp { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

  .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid var(--warm); border-top-color: var(--bark); border-radius: 50%; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(sb.getUser());
  const [tab, setTab] = useState("wardrobe"); // wardrobe | boards
  const [toast, setToast] = useState(null);
  const [activeBoard, setActiveBoard] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  if (!user) return (
    <>
      <style>{G}</style>
      <AuthScreen onAuth={(u) => setUser(u)} showToast={showToast} />
      {toast && <div className="toast">{toast}</div>}
    </>
  );

  if (activeBoard) return (
    <>
      <style>{G}</style>
      <BoardEditor board={activeBoard} onClose={() => setActiveBoard(null)} showToast={showToast} />
      {toast && <div className="toast">{toast}</div>}
    </>
  );

  return (
    <>
      <style>{G}</style>
      <div className="app">
        <header className="header">
          <div className="logo">fitted.</div>
          <nav className="nav">
            <button className={`nav-btn ${tab === "wardrobe" ? "active" : ""}`} onClick={() => setTab("wardrobe")}>Wardrobe</button>
            <button className={`nav-btn ${tab === "boards" ? "active" : ""}`} onClick={() => setTab("boards")}>Outfits</button>
          </nav>
          <button className="sign-out" onClick={() => { sb.signOut(); setUser(null); }}>Sign out</button>
        </header>
        <main className="main">
          {tab === "wardrobe" ? (
            <WardrobeTab showToast={showToast} />
          ) : (
            <BoardsTab showToast={showToast} onOpenBoard={setActiveBoard} />
          )}
        </main>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

// ─── Auth ────────────────────────────────────────────────────────────────────
function AuthScreen({ onAuth, showToast }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setLoading(true); setErr("");
    const r = mode === "signin" ? await sb.signIn(email, pass) : await sb.signUp(email, pass);
    setLoading(false);
    if (!r.ok) { setErr(r.data?.msg || r.data?.error_description || "Something went wrong"); return; }
    if (mode === "signup") { showToast("Account created! Please sign in."); setMode("signin"); return; }
    onAuth(sb.getUser());
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">fitted.</div>
        <div className="auth-sub">Your digital wardrobe</div>
        <div className="auth-tabs">
          <button className={`auth-tab ${mode === "signin" ? "active" : ""}`} onClick={() => setMode("signin")}>Sign In</button>
          <button className={`auth-tab ${mode === "signup" ? "active" : ""}`} onClick={() => setMode("signup")}>Create Account</button>
        </div>
        <div className="auth-field">
          <label>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} autoComplete="email" />
        </div>
        <div className="auth-field">
          <label>Password</label>
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
        </div>
        <button className="btn-primary" onClick={submit} disabled={loading}>
          {loading ? "..." : mode === "signin" ? "Sign In" : "Create Account"}
        </button>
        {err && <div className="auth-error">{err}</div>}
      </div>
    </div>
  );
}

// ─── Wardrobe Tab ─────────────────────────────────────────────────────────────
function WardrobeTab({ showToast }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadItems() {
    const user = sb.getUser();
    const r = await sb.select("wardrobe_items", "*", `&user_id=eq.${user.id}&order=created_at.desc`);
    if (r.ok) setItems(r.data);
    setLoading(false);
  }

  useEffect(() => { loadItems(); }, []);

  const filtered = filter === "all" ? items : items.filter(i => i.category === filter);

  async function deleteItem(item) {
    if (!confirm(`Remove "${item.name}" from your wardrobe?`)) return;
    await sb.delete("wardrobe_items", `id=eq.${item.id}`);
    setItems(p => p.filter(i => i.id !== item.id));
    showToast("Item removed");
  }

  return (
    <>
      <div className="wardrobe-header">
        <h1 className="page-title">My Wardrobe <span style={{ color: "var(--stone)", fontSize: "1rem" }}>({items.length} pieces)</span></h1>
        <button className="upload-btn" onClick={() => setUploading(true)}>+ Add Piece</button>
      </div>

      <div className="category-filter">
        <button className={`cat-btn ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>All</button>
        {CATEGORIES.map(c => (
          <button key={c} className={`cat-btn ${filter === c ? "active" : ""}`} onClick={() => setFilter(c)}>
            <CategoryIcon category={c} size={13} style={{ color: "inherit", verticalAlign: "middle", marginRight: 4 }} /> {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "var(--stone)" }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><ShoppingBag size={48} strokeWidth={1} style={{ color: "var(--stone)" }} /></div>
          <div className="empty-text">Your wardrobe is empty</div>
          <div className="empty-sub">Upload your first piece to get started</div>
        </div>
      ) : (
        <div className="items-grid">
          {filtered.map(item => (
            <div key={item.id} className="item-card">
              <div className="item-img-wrap">
                <img className="item-img" src={item.image_url} alt={item.name} />
              </div>
              <div className="item-info">
                <div className="item-name">{item.name}</div>
                <div className="item-cat" style={{ display: "flex", alignItems: "center", gap: 4 }}><CategoryIcon category={item.category} size={12} /> {item.category}</div>
                {item.tags?.length > 0 && (
                  <div className="item-tags">{item.tags.map(t => <span key={t} className="tag">{t}</span>)}</div>
                )}
              </div>
              <div className="item-actions">
                <button className="icon-btn danger" onClick={() => deleteItem(item)} title="Delete">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {uploading && (
        <UploadModal
          onClose={() => setUploading(false)}
          onUploaded={(item) => { setItems(p => [item, ...p]); setUploading(false); showToast("Item added!"); }}
          showToast={showToast}
        />
      )}
    </>
  );
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────
function UploadModal({ onClose, onUploaded, showToast }) {
  // step: "pick" | "crop" | "form"
  const [step, setStep] = useState("pick");
  const [rawSrc, setRawSrc] = useState(null);
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState(null);
  const [processedBlob, setProcessedBlob] = useState(null);
  const [preview, setPreview] = useState(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("tops");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();
  const imgRef = useRef();

  function handleFile(f) {
    if (!f) return;
    setName(f.name.replace(/\.[^/.]+$/, ""));
    setRawSrc(URL.createObjectURL(f));
    setStep("crop");
  }

  function onImageLoad(e) {
    const { width, height } = e.currentTarget;
    const c = centerCrop(makeAspectCrop({ unit: "%", width: 90 }, 3 / 4, width, height), width, height);
    setCrop(c);
  }

  async function getCroppedBlob() {
    const img = imgRef.current;
    const c = completedCrop;
    if (!img || !c || !c.width || !c.height) return null;
    const canvas = document.createElement("canvas");
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    canvas.width = Math.round(c.width * scaleX);
    canvas.height = Math.round(c.height * scaleY);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, c.x * scaleX, c.y * scaleY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    return new Promise(res => canvas.toBlob(res, "image/png"));
  }

  async function confirmCrop() {
    setStep("form");
    setStatus("Removing background...");
    setProgress(20);
    try {
      const cropped = await getCroppedBlob();
      const blobToProcess = cropped || await (await fetch(rawSrc)).blob();
      setProgress(40);
      const form = new FormData();
      form.append("image_file", blobToProcess);
      form.append("size", "auto");
      const res = await fetch("https://api.remove.bg/v1.0/removebg", {
        method: "POST",
        headers: { "X-Api-Key": REMOVE_BG_KEY },
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      setProgress(100);
      setStatus("Background removed ✓");
      setProcessedBlob(blob);
      setPreview(URL.createObjectURL(blob));
    } catch (e) {
      console.error(e);
      setStatus("Could not remove background — will upload cropped image");
      setProgress(100);
      const cropped = await getCroppedBlob();
      if (cropped) { setProcessedBlob(cropped); setPreview(URL.createObjectURL(cropped)); }
      else setPreview(rawSrc);
    }
  }

  async function save() {
    if (!processedBlob && !preview) return;
    setSaving(true);
    setStatus("Uploading...");
    const user = sb.getUser();
    const path = `${user.id}/${Date.now()}.png`;
    const uploadBlob = processedBlob || await (await fetch(preview)).blob();
    const ok = await sb.uploadFile("wardrobe", path, uploadBlob);
    if (!ok) { showToast("Upload failed"); setSaving(false); return; }
    const imageUrl = sb.getPublicUrl("wardrobe", path);
    const tagArr = tags.split(",").map(t => t.trim()).filter(Boolean);
    const r = await sb.insert("wardrobe_items", { user_id: user.id, name: name || "Untitled", category, tags: tagArr, image_url: imageUrl });
    setSaving(false);
    if (r.ok) onUploaded(r.data[0]);
    else showToast("Save failed");
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: step === "crop" ? 680 : 520 }}>
        <div className="modal-header">
          <span className="modal-title">{step === "crop" ? "Crop Image" : "Add New Piece"}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          {step === "pick" && (
            <div
              className={`drop-zone ${dragOver ? "drag-over" : ""}`}
              onClick={() => fileRef.current.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
            >
              <div className="drop-zone-icon"><Camera size={36} strokeWidth={1} style={{ color: "var(--stone)" }} /></div>
              <div className="drop-zone-text">Drop image here or click to upload<br /><small>JPG, PNG, WEBP</small></div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
            </div>
          )}

          {step === "crop" && (
            <div>
              <div style={{ display: "flex", justifyContent: "center", maxHeight: 480, overflow: "hidden", marginBottom: 20, background: "var(--soft)" }}>
                <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)} style={{ maxHeight: 480 }}>
                  <img ref={imgRef} src={rawSrc} onLoad={onImageLoad} style={{ maxHeight: 480, maxWidth: "100%", display: "block" }} alt="crop" />
                </ReactCrop>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <button style={{ flex: 1, padding: "12px", background: "none", border: "1px solid var(--warm)", cursor: "pointer", fontFamily: "Jost, sans-serif", fontSize: "0.78rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--stone)" }}
                  onClick={() => setStep("pick")}>← Back</button>
                <button className="btn-primary" style={{ flex: 2, marginTop: 0 }} onClick={confirmCrop}>
                  Crop & Remove Background
                </button>
              </div>
            </div>
          )}

          {step === "form" && (
            <>
              {preview && <img className="preview-img" src={preview} alt="preview" style={{ background: "repeating-conic-gradient(#ddd 0% 25%, white 0% 50%) 0 0 / 16px 16px" }} />}
              {status && (
                <>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
                  <div className="status-text">{status}</div>
                </>
              )}
              <button style={{ fontSize: "0.75rem", color: "var(--stone)", background: "none", border: "none", cursor: "pointer", marginBottom: "16px" }}
                onClick={() => { setStep("pick"); setRawSrc(null); setPreview(null); setProcessedBlob(null); setStatus(""); setProgress(0); }}>
                ← Choose different image
              </button>

              <div className="field">
                <label>Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. White linen shirt" />
              </div>
              <div className="field">
                <label>Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Tags (comma-separated)</label>
                <input value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. summer, casual, linen" />
              </div>

              <button className="btn-primary" onClick={save} disabled={saving || (!processedBlob && !preview)}>
                {saving ? "Saving..." : "Add to Wardrobe"}
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Boards Tab ───────────────────────────────────────────────────────────────
function BoardsTab({ showToast, onOpenBoard }) {
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadBoards() {
    const user = sb.getUser();
    const r = await sb.select("outfit_boards", "*", `&user_id=eq.${user.id}&order=created_at.desc`);
    if (r.ok) setBoards(r.data);
    setLoading(false);
  }

  useEffect(() => { loadBoards(); }, []);

  async function createBoard() {
    const user = sb.getUser();
    const r = await sb.insert("outfit_boards", { user_id: user.id, title: "Untitled Outfit", canvas_json: { items: [] } });
    if (r.ok) { onOpenBoard(r.data[0]); }
    else showToast("Could not create board");
  }

  async function deleteBoard(board) {
    if (!confirm(`Delete "${board.title}"?`)) return;
    await sb.delete("outfit_boards", `id=eq.${board.id}`);
    setBoards(p => p.filter(b => b.id !== board.id));
    showToast("Board deleted");
  }

  return (
    <>
      <div className="boards-header">
        <h1 className="page-title">My Outfits</h1>
        <button className="upload-btn" onClick={createBoard}>+ New Board</button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "var(--stone)" }}>Loading...</div>
      ) : (
        <div className="boards-grid">
          <button className="new-board-card" onClick={createBoard}>
            <div className="new-board-icon">＋</div>
            <div className="new-board-text">Create new outfit</div>
          </button>
          {boards.map(board => (
            <div key={board.id} className="board-card" onClick={() => onOpenBoard(board)}>
              <div className="board-preview">
                {board.preview_url
                  ? <img src={board.preview_url} alt={board.title} />
                  : <LayoutGrid size={40} strokeWidth={1} style={{ color: "var(--stone)" }} />
                }
              </div>
              <div className="board-info">
                <div className="board-title">{board.title}</div>
                <div className="board-meta">{board.canvas_json?.items?.length || 0} items · {new Date(board.created_at).toLocaleDateString()}</div>
                <div style={{ marginTop: "8px", display: "flex", gap: "8px", alignItems: "center" }}>
                  {board.share_token && (
                    <span style={{ fontSize: "0.7rem", color: "var(--bark)", display: "flex", alignItems: "center", gap: 3 }}><Link size={11} strokeWidth={1.5} /> Shareable</span>
                  )}
                  <button
                    style={{ marginLeft: "auto", fontSize: "0.72rem", color: "var(--danger)", background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}
                    onClick={e => { e.stopPropagation(); deleteBoard(board); }}
                  >Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Board Editor ─────────────────────────────────────────────────────────────
function BoardEditor({ board, onClose, showToast }) {
  const [title, setTitle] = useState(board.title);
  const [canvasItems, setCanvasItems] = useState(board.canvas_json?.items || []);
  const [wardrobeItems, setWardrobeItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [resizing, setResizing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [shareUrl, setShareUrl] = useState(board.share_token ? `${location.origin}?share=${board.share_token}` : null);
  const [copied, setCopied] = useState(false);
  const boardRef = useRef();
  const nextId = useRef(Date.now());

  useEffect(() => {
    const user = sb.getUser();
    sb.select("wardrobe_items", "*", `&user_id=eq.${user.id}`).then(r => {
      if (r.ok) setWardrobeItems(r.data);
    });
  }, []);

  function addItem(wItem) {
    const id = nextId.current++;
    setCanvasItems(p => [...p, { id, imageUrl: wItem.image_url, x: 100 + Math.random() * 200, y: 80 + Math.random() * 100, w: 180, h: 240 }]);
  }

  // Drag logic
  const mouseDownItem = useCallback((e, id) => {
    e.preventDefault();
    const rect = boardRef.current.getBoundingClientRect();
    const item = canvasItems.find(i => i.id === id);
    setSelected(id);
    setDragging({ id, startX: e.clientX - rect.left - item.x, startY: e.clientY - rect.top - item.y });
  }, [canvasItems]);

  const mouseDownResize = useCallback((e, id) => {
    e.preventDefault();
    e.stopPropagation();
    const item = canvasItems.find(i => i.id === id);
    setResizing({ id, startX: e.clientX, startY: e.clientY, startW: item.w, startH: item.h });
  }, [canvasItems]);

  useEffect(() => {
    if (!dragging && !resizing) return;
    const rect = boardRef.current?.getBoundingClientRect();

    const onMove = (e) => {
      if (dragging) {
        const x = Math.max(0, Math.min(700 - 40, e.clientX - rect.left - dragging.startX));
        const y = Math.max(0, Math.min(900 - 40, e.clientY - rect.top - dragging.startY));
        setCanvasItems(p => p.map(i => i.id === dragging.id ? { ...i, x, y } : i));
      }
      if (resizing) {
        const dw = e.clientX - resizing.startX;
        const dh = e.clientY - resizing.startY;
        const w = Math.max(50, resizing.startW + dw);
        const h = Math.max(50, resizing.startH + dh);
        setCanvasItems(p => p.map(i => i.id === resizing.id ? { ...i, w, h } : i));
      }
    };
    const onUp = () => { setDragging(null); setResizing(null); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging, resizing]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selected && document.activeElement.tagName !== "INPUT") {
          setCanvasItems(p => p.filter(i => i.id !== selected));
          setSelected(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  async function save() {
    setSaving(true);
    const user = sb.getUser();
    await sb.update("outfit_boards", { title, canvas_json: { items: canvasItems } }, `id=eq.${board.id}`);
    setSaving(false);
    showToast("Saved!");
  }

  async function saveAsPng() {
    const { default: html2canvas } = await import("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.esm.js");
    const canvas = await html2canvas(boardRef.current, { backgroundColor: "#ffffff", scale: 2 });
    const link = document.createElement("a");
    link.download = `${title || "outfit"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    showToast("Downloaded!");
  }

  async function generateShareLink() {
    const r = await sb.select("outfit_boards", "share_token", `&id=eq.${board.id}`);
    if (r.ok && r.data[0]?.share_token) {
      const url = `${location.origin}?share=${r.data[0].share_token}`;
      setShareUrl(url);
    }
  }

  function copyUrl() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="app">
      <style>{G}</style>
      <div className="editor-wrap">
        {/* Sidebar */}
        <aside className="editor-sidebar">
          <div className="editor-sidebar-header">
            <div className="editor-sidebar-title">Wardrobe</div>
          </div>
          <div className="sidebar-items">
            {wardrobeItems.map(item => (
              <div key={item.id} className="sidebar-item" onClick={() => addItem(item)} title={item.name}>
                <img src={item.image_url} alt={item.name} />
              </div>
            ))}
            {wardrobeItems.length === 0 && (
              <div style={{ gridColumn: "1/-1", padding: "20px", fontSize: "0.8rem", color: "var(--stone)", textAlign: "center" }}>
                No wardrobe items yet
              </div>
            )}
          </div>
        </aside>

        {/* Main editor */}
        <div className="editor-main">
          <div className="editor-toolbar">
            <button className="tool-btn" onClick={onClose}>← Back</button>
            <input className="editor-board-title" value={title} onChange={e => setTitle(e.target.value)} />
            {selected && (
              <button className="tool-btn danger" onClick={() => { setCanvasItems(p => p.filter(i => i.id !== selected)); setSelected(null); }}>
                Remove item
              </button>
            )}
            <button className="tool-btn" onClick={saveAsPng}>⬇ PNG</button>
            <button className="tool-btn" onClick={generateShareLink}>🔗 Share</button>
            <button className="tool-btn primary" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          </div>

          {shareUrl && (
            <div style={{ padding: "10px 20px", background: "var(--soft)", borderBottom: "1px solid var(--warm)", display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--stone)" }}>Share link:</span>
              <div className="share-box" style={{ flex: 1 }}>
                <div className="share-url">{shareUrl}</div>
                <button className="copy-btn" onClick={copyUrl}>{copied ? "Copied!" : "Copy"}</button>
              </div>
            </div>
          )}

          <div className="canvas-area" onClick={() => setSelected(null)}>
            <div ref={boardRef} className="canvas-board">
              {canvasItems.map(item => (
                <div
                  key={item.id}
                  className={`canvas-item ${selected === item.id ? "selected" : ""}`}
                  style={{ left: item.x, top: item.y, width: item.w, height: item.h }}
                  onMouseDown={e => mouseDownItem(e, item.id)}
                  onClick={e => { e.stopPropagation(); setSelected(item.id); }}
                >
                  <img src={item.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} />
                  {selected === item.id && (
                    <div className="canvas-item-handles">
                      <div className="resize-handle" onMouseDown={e => mouseDownResize(e, item.id)} />
                    </div>
                  )}
                </div>
              ))}

              {canvasItems.length === 0 && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--stone)" }}>
                  <div style={{ marginBottom: "12px" }}><Sparkles size={40} strokeWidth={1} style={{ color: "var(--stone)" }} /></div>
                  <div style={{ fontFamily: "Cormorant Garamond, serif", fontSize: "1.2rem", fontWeight: 300 }}>Click items from the sidebar to add them</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}