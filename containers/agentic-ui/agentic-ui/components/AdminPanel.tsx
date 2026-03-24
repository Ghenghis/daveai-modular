"use client";
import { useState } from "react";
import {
  adminLogin, adminChangePassword, getVault, setVault,
  getPages, createPage, deletePage,
  getAnalytics, getWatchdog, rollback,
  deployStaging, deployProduction,
  getMemory, saveMemory,
  getCheckpointStatus, getBudgetStatus,
} from "@/lib/api";
import type { AnalyticsEvent, Page, DeployResult, MemoryEntry } from "@/lib/api";
import {
  Lock, Key, FileText, Save, Trash2, Plus, Eye, EyeOff, LogIn,
  Activity, AlertCircle, CheckCircle, RefreshCw, RotateCcw,
  Rocket, Globe, Loader2, Brain, DollarSign, Bookmark,
} from "lucide-react";

type Tab = "vault" | "pages" | "deploy" | "analytics" | "memory" | "password";

interface AdminPanelProps {
  onPagesChanged?: () => void;
}

export function AdminPanel({ onPagesChanged }: AdminPanelProps) {
  const [token, setToken]   = useState("");
  const [pw, setPw]         = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [tab, setTab]       = useState<Tab>("vault");

  const [vault, setVaultData]   = useState<Record<string, string>>({});
  const [pages, setPagesData]   = useState<Page[]>([]);
  const [vaultDirty, setVaultDirty] = useState(false);
  const [newPage, setNewPage]   = useState({ name: "", site: "main", template: "blank" });
  const [newPw, setNewPw]       = useState("");
  const [showVals, setShowVals] = useState<Record<string, boolean>>({});
  const [msg, setMsg]           = useState("");

  // Analytics state
  const [analyticsData, setAnalyticsData] = useState<AnalyticsEvent[]>([]);
  const [watchdogData, setWatchdogData]   = useState<Record<string, { status: string; latency_ms: number; failures?: number }> | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Deploy state
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);

  // Memory state
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [memLoading, setMemLoading] = useState(false);
  const [newMemKey, setNewMemKey] = useState("");
  const [newMemVal, setNewMemVal] = useState("");

  // Vault new key state
  const [newVaultKey, setNewVaultKey] = useState("");
  const [newVaultVal, setNewVaultVal] = useState("");

  // Checkpoint / Budget state
  const [checkpoint, setCheckpoint] = useState<{ checkpoint: string; status: string; ts: string } | null>(null);
  const [budget, setBudget] = useState<{ budget: Record<string, unknown>; limits: Record<string, unknown> } | null>(null);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const login = async () => {
    setLoginErr("");
    try {
      const r = await adminLogin(pw);
      setToken(r.token);
      if (typeof window !== "undefined") {
        localStorage.setItem("daveai_admin_token", r.token);
      }
      loadVault(r.token);
      loadPages("main");
    } catch (e: unknown) {
      setLoginErr((e as Error).message ?? "Invalid password");
    }
  };

  const loadVault = async (t: string) => {
    try { setVaultData(await getVault(t)); } catch (e: unknown) {
      flash(`Failed: ${(e as Error).message ?? "Unknown error"}`);
    }
  };

  const loadPages = async (site = "main") => {
    try { const r = await getPages(site); setPagesData(r.pages); } catch (e: unknown) {
      flash(`Failed: ${(e as Error).message ?? "Unknown error"}`);
    }
  };

  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const [a, w] = await Promise.all([
        getAnalytics(token),
        getWatchdog(token),
      ]);
      setAnalyticsData(a.events ?? []);
      setWatchdogData(w.services ?? null);
    } catch (e: unknown) {
      flash(`Analytics error: ${(e as Error).message ?? "Unknown error"}`);
    }
    // Load checkpoint/budget (non-blocking)
    try {
      const [cp, bg] = await Promise.all([
        getCheckpointStatus(token).catch(() => null),
        getBudgetStatus(token).catch(() => null),
      ]);
      if (cp) setCheckpoint(cp);
      if (bg) setBudget(bg);
    } catch { /* silent */ }
    setAnalyticsLoading(false);
  };

  const loadMemory = async () => {
    setMemLoading(true);
    try {
      const r = await getMemory(token);
      setMemories(r.memories ?? []);
    } catch (e: unknown) {
      flash(`Memory error: ${(e as Error).message ?? "Unknown error"}`);
    } finally {
      setMemLoading(false);
    }
  };

  const handleSaveMemory = async () => {
    if (!newMemKey.trim() || !newMemVal.trim()) return;
    try {
      await saveMemory(newMemKey.trim(), newMemVal.trim(), "user", token);
      setNewMemKey("");
      setNewMemVal("");
      flash("Memory saved");
      loadMemory();
    } catch (e: unknown) {
      flash(`Failed: ${(e as Error).message ?? "Unknown error"}`);
    }
  };

  const addVaultKey = () => {
    if (!newVaultKey.trim()) return;
    setVaultData(prev => ({ ...prev, [newVaultKey.trim()]: newVaultVal }));
    setVaultDirty(true);
    setNewVaultKey("");
    setNewVaultVal("");
  };

  const saveVault = async () => {
    try { await setVault(vault, token); setVaultDirty(false); flash("Vault saved"); } catch (e: unknown) {
      flash(`Failed: ${(e as Error).message ?? "Unknown error"}`);
    }
  };

  const addPage = async () => {
    if (!newPage.name) return;
    try {
      await createPage(newPage.name, newPage.site, newPage.template);
      setNewPage({ name: "", site: "main", template: "blank" });
      loadPages();
      onPagesChanged?.(); // notify sidebar
      flash("Page created");
    } catch (e: unknown) {
      flash(`Failed: ${(e as Error).message ?? "Unknown error"}`);
    }
  };

  const removePage = async (id: string) => {
    if (!token) { flash("Not authenticated"); return; }
    if (!confirm("Delete this page?")) return;
    try {
      await deletePage(id, token);
      loadPages();
      onPagesChanged?.(); // notify sidebar
      flash("Page deleted");
    } catch (e: unknown) {
      flash(`Failed: ${(e as Error).message ?? "Unknown error"}`);
    }
  };

  const changePw = async () => {
    if (newPw.length < 8) { flash("Password must be 8+ chars"); return; }
    try { await adminChangePassword(newPw, token); setNewPw(""); flash("Password changed"); } catch (e: unknown) {
      flash(`Failed: ${(e as Error).message ?? "Unknown error"}`);
    }
  };

  const doRollback = async () => {
    if (!confirm("Rollback workspace to previous git commit? This is irreversible.")) return;
    try {
      await rollback("HEAD~1", token);
      flash("Rolled back to HEAD~1 ✓");
    } catch (e: unknown) {
      flash(`Rollback failed: ${(e as Error).message ?? "Unknown error"}`);
    }
  };

  if (!token) {
    return (
      <div className="flex flex-col gap-4 max-w-xs mx-auto mt-8">
        <div className="flex items-center gap-2 text-slate-300">
          <Lock className="w-5 h-5 text-violet-400" />
          <h2 className="text-lg font-semibold">Admin Login</h2>
        </div>
        <input
          type="password"
          placeholder="Admin password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === "Enter" && login()}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-violet-500"
        />
        {loginErr && <p className="text-red-400 text-xs">{loginErr}</p>}
        <button
          onClick={login}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition-colors"
        >
          <LogIn className="w-4 h-4" /> Login
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {msg && (
        <div className="text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-800 px-3 py-1.5 rounded-lg">
          {msg}
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-800 pb-0.5 flex-wrap">
        {(["vault", "pages", "deploy", "analytics", "memory", "password"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              if (t === "pages") loadPages();
              if (t === "analytics") loadAnalytics();
              if (t === "memory") loadMemory();
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg capitalize transition-colors ${
              tab === t ? "text-violet-300 border-b-2 border-violet-500" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "vault" && (
        <div className="flex flex-col gap-2">
          {Object.entries(vault).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="text-xs text-slate-400 w-36 shrink-0">{k}</span>
              <div className="relative flex-1">
                <input
                  type={showVals[k] ? "text" : "password"}
                  value={v}
                  onChange={e => { setVaultData(prev => ({ ...prev, [k]: e.target.value })); setVaultDirty(true); }}
                  className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-violet-500 pr-7"
                />
                <button
                  onClick={() => setShowVals(p => ({ ...p, [k]: !p[k] }))}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showVals[k] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              </div>
            </div>
          ))}
          {Object.keys(vault).length === 0 && !newVaultKey && (
            <div className="text-xs text-slate-600 py-4 text-center">
              No vault keys configured. Add a key below or ask the agent.
            </div>
          )}
          {/* Add new vault key */}
          <div className="flex items-center gap-2 mt-1">
            <input
              type="text"
              placeholder="New key name"
              value={newVaultKey}
              onChange={e => setNewVaultKey(e.target.value)}
              className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-violet-500 w-36"
            />
            <input
              type="text"
              placeholder="Value"
              value={newVaultVal}
              onChange={e => setNewVaultVal(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addVaultKey()}
              className="flex-1 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-violet-500"
            />
            <button
              onClick={addVaultKey}
              disabled={!newVaultKey.trim()}
              className="px-2 py-1 bg-violet-600 hover:bg-violet-500 rounded text-xs flex items-center gap-1 transition-colors disabled:opacity-40"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
          {vaultDirty && (
            <button
              onClick={saveVault}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-xs font-medium self-start mt-1 transition-colors"
            >
              <Save className="w-3.5 h-3.5" /> Save Vault
            </button>
          )}
        </div>
      )}

      {tab === "pages" && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              placeholder="Page name"
              value={newPage.name}
              onChange={e => setNewPage(p => ({ ...p, name: e.target.value }))}
              className="flex-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-violet-500"
            />
            <select
              value={newPage.site}
              onChange={e => setNewPage(p => ({ ...p, site: e.target.value }))}
              className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none"
            >
              <option>main</option>
              <option>blog</option>
            </select>
            <button
              onClick={addPage}
              className="px-2 py-1.5 bg-violet-600 hover:bg-violet-500 rounded text-xs flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
          {pages.map(p => (
            <div key={p.id} className="flex items-center gap-2 p-2 bg-slate-900 border border-slate-800 rounded-lg">
              <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="text-xs text-slate-300 flex-1">{p.name}</span>
              <span className="text-xs text-slate-600">{p.path}</span>
              <button onClick={() => removePage(p.id)} className="text-red-500 hover:text-red-400">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {pages.length === 0 && (
            <div className="text-xs text-slate-600 text-center py-2">No pages yet</div>
          )}
        </div>
      )}

      {tab === "analytics" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-violet-400" /> System Watchdog
            </h3>
            <button
              onClick={loadAnalytics}
              disabled={analyticsLoading}
              className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-slate-200 border border-slate-700 rounded transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${analyticsLoading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>

          {/* Watchdog service cards */}
          {watchdogData ? (
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(watchdogData).map(([svc, info]) => (
                <div
                  key={svc}
                  className={`p-2 rounded-lg border text-xs flex flex-col gap-0.5 ${
                    info.status === "ok"
                      ? "bg-emerald-950/30 border-emerald-800"
                      : "bg-red-950/30 border-red-800"
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {info.status === "ok"
                      ? <CheckCircle className="w-3 h-3 text-emerald-400" />
                      : <AlertCircle className="w-3 h-3 text-red-400" />
                    }
                    <span className="font-medium text-slate-300 truncate">{svc}</span>
                  </div>
                  <span className="text-slate-500">{info.latency_ms}ms</span>
                  {(info.failures ?? 0) > 0 && (
                    <span className="text-red-400 text-[10px]">{info.failures} fail{info.failures === 1 ? "" : "s"}</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic">
              {analyticsLoading ? "Loading watchdog..." : "No watchdog data yet — click Refresh"}
            </div>
          )}

          {/* Checkpoint / Budget cards */}
          {(checkpoint || budget) && (
            <div className="grid grid-cols-2 gap-2">
              {checkpoint && (
                <div className="p-2 rounded-lg border border-slate-700 bg-slate-900 text-xs">
                  <div className="flex items-center gap-1 text-slate-400 mb-1">
                    <Bookmark className="w-3 h-3 text-violet-400" /> Checkpoint
                  </div>
                  <p className="text-slate-300 font-mono text-[10px] truncate">{checkpoint.checkpoint}</p>
                  <p className="text-slate-500 text-[10px]">{checkpoint.status}</p>
                </div>
              )}
              {budget && (
                <div className="p-2 rounded-lg border border-slate-700 bg-slate-900 text-xs">
                  <div className="flex items-center gap-1 text-slate-400 mb-1">
                    <DollarSign className="w-3 h-3 text-emerald-400" /> Budget
                  </div>
                  {Object.entries(budget.budget).map(([k, v]) => (
                    <p key={k} className="text-[10px] text-slate-400">
                      <span className="text-slate-500">{k}:</span> {String(v)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Analytics events */}
          <h3 className="text-xs font-medium text-slate-300 flex items-center gap-1.5 mt-1">
            <Activity className="w-3.5 h-3.5 text-violet-400" /> Recent Events
          </h3>
          {analyticsData.length > 0 ? (
            <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
              {analyticsData.slice(0, 20).map((ev, i) => (
                <div key={i} className="flex gap-2 text-xs py-1 border-b border-slate-800/50">
                  <span className="text-slate-600 font-mono shrink-0">
                    {new Date(ev.ts).toLocaleTimeString()}
                  </span>
                  <span className="text-violet-400 font-mono shrink-0 w-24 truncate">{ev.event}</span>
                  <span className="text-slate-400 truncate">{ev.detail}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic">
              {analyticsLoading ? "Loading events..." : "No events yet — click Refresh"}
            </div>
          )}
        </div>
      )}

      {tab === "deploy" && (
        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-medium text-slate-300 flex items-center gap-2">
            <Rocket className="w-4 h-4 text-violet-400" /> Deploy to VPS
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={async () => {
                setDeploying(true); setDeployResult(null);
                try {
                  const r = await deployStaging(token);
                  setDeployResult(r);
                } catch (e: unknown) {
                  setDeployResult({ status: "error", environment: "staging", error: (e as Error).message });
                } finally { setDeploying(false); }
              }}
              disabled={deploying}
              className="flex flex-col items-center gap-2 p-4 bg-slate-900 border border-slate-800 rounded-xl hover:border-violet-600 transition-colors disabled:opacity-40"
            >
              <Globe className="w-6 h-6 text-amber-400" />
              <span className="text-xs font-medium text-slate-300">Deploy Staging</span>
              <span className="text-[10px] text-slate-600">Preview before going live</span>
            </button>
            <button
              onClick={async () => {
                setDeploying(true); setDeployResult(null);
                try {
                  const r = await deployProduction(token);
                  setDeployResult(r);
                } catch (e: unknown) {
                  setDeployResult({ status: "error", environment: "production", error: (e as Error).message });
                } finally { setDeploying(false); }
              }}
              disabled={deploying}
              className="flex flex-col items-center gap-2 p-4 bg-slate-900 border border-slate-800 rounded-xl hover:border-emerald-600 transition-colors disabled:opacity-40"
            >
              <Rocket className="w-6 h-6 text-emerald-400" />
              <span className="text-xs font-medium text-slate-300">Deploy Production</span>
              <span className="text-[10px] text-slate-600">Push live to daveai.tech</span>
            </button>
          </div>
          {deploying && (
            <div className="flex items-center gap-2 text-xs text-blue-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Deploying…
            </div>
          )}
          {deployResult && (
            <div className={`p-3 rounded-lg border text-xs ${
              deployResult.status === "error"
                ? "bg-red-950/30 border-red-800 text-red-400"
                : "bg-emerald-950/30 border-emerald-800 text-emerald-400"
            }`}>
              <p className="font-medium">{deployResult.environment}: {deployResult.status}</p>
              {deployResult.commit && <p className="text-slate-500 mt-1">Commit: {deployResult.commit}</p>}
              {deployResult.url && (
                <a href={deployResult.url} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 underline mt-1 inline-block">
                  {deployResult.url}
                </a>
              )}
              {deployResult.error && <p className="mt-1">{deployResult.error}</p>}
            </div>
          )}
          {/* Rollback */}
          <div className="border-t border-slate-800 pt-3">
            <button
              onClick={doRollback}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/40 border border-red-800 hover:bg-red-900/70 rounded-lg text-xs font-medium text-red-400 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Rollback to HEAD~1
            </button>
            <p className="text-xs text-slate-600 mt-1">Reverts the workspace to the previous git commit.</p>
          </div>
        </div>
      )}

      {tab === "memory" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5 text-violet-400" /> Agent Memory
            </h3>
            <button
              onClick={loadMemory}
              disabled={memLoading}
              className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-slate-200 border border-slate-700 rounded transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${memLoading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>

          {/* Add new memory */}
          <div className="flex flex-col gap-2 p-3 bg-slate-900 border border-slate-800 rounded-xl">
            <input
              type="text"
              placeholder="Memory key"
              value={newMemKey}
              onChange={e => setNewMemKey(e.target.value)}
              className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-violet-500"
            />
            <textarea
              placeholder="Memory value…"
              value={newMemVal}
              onChange={e => setNewMemVal(e.target.value)}
              rows={2}
              className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-violet-500 resize-none"
            />
            <button
              onClick={handleSaveMemory}
              disabled={!newMemKey.trim() || !newMemVal.trim()}
              className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 flex items-center gap-1 self-end"
            >
              <Save className="w-3 h-3" /> Save
            </button>
          </div>

          {/* Memory list */}
          {memLoading && memories.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading…
            </div>
          )}
          {!memLoading && memories.length === 0 && (
            <p className="text-xs text-slate-600 text-center py-4">No memories stored yet.</p>
          )}
          <div className="flex flex-col gap-1">
            {memories.map((m, i) => (
              <div key={i} className="p-2 bg-slate-900 border border-slate-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-violet-400 font-mono">{m.key}</span>
                  <span className="text-[10px] text-slate-600">{m.agent} · {m.ts ? new Date(m.ts).toLocaleString() : ""}</span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5 whitespace-pre-wrap">{m.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "password" && (
        <div className="flex flex-col gap-3 max-w-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <Key className="w-4 h-4" />
            <span className="text-xs">Change admin password</span>
          </div>
          <input
            type="password"
            placeholder="New password (8+ chars)"
            value={newPw}
            onChange={e => setNewPw(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-violet-500"
          />
          <button
            onClick={changePw}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-xs font-medium self-start transition-colors"
          >
            <Save className="w-3.5 h-3.5" /> Update Password
          </button>
        </div>
      )}
    </div>
  );
}
