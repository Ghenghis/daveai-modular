"use client";
/**
 * Sidebar.tsx — Lindo.ai-style collapsible left sidebar
 * Sections: Sites, Pages, Tools, Agents
 */
import { useState, useEffect, useMemo } from "react";
import {
  Globe, FileText, Wrench, Cpu, ChevronRight, ChevronDown,
  RefreshCw, AlertCircle, Loader2, ExternalLink, Gamepad2, MessageSquare, Brain,
} from "lucide-react";
import { getProjects, getPages, getTools, getAgentsStatus } from "@/lib/api";
import type { Project, Page, ToolEntry, AgentStatus } from "@/lib/api";

type SidebarSection = "sites" | "pages" | "tools" | "agents";

interface SidebarProps {
  open: boolean;
  onClose?: () => void;
  onSuggest?: (text: string) => void;
  onPreview?: (url: string) => void;
  pageRefreshKey?: number;
}

function SectionHeader({
  label, icon: Icon, expanded, onToggle, loading, onRefresh,
}: {
  label: string;
  icon: typeof Globe;
  expanded: boolean;
  onToggle: () => void;
  loading?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2.5 cursor-pointer hover:bg-slate-800/50 group" onClick={onToggle}>
      <Icon className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 shrink-0" />
      <span className="flex-1 text-xs font-medium text-slate-400 group-hover:text-slate-200">{label}</span>
      {loading ? (
        <Loader2 className="w-3 h-3 text-slate-600 animate-spin" />
      ) : onRefresh ? (
        <button
          onClick={e => { e.stopPropagation(); onRefresh(); }}
          title="Refresh"
          className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-slate-400 transition-opacity"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      ) : null}
      {expanded
        ? <ChevronDown className="w-3 h-3 text-slate-600" />
        : <ChevronRight className="w-3 h-3 text-slate-600" />
      }
    </div>
  );
}

// ── Sites section ─────────────────────────────────────────────────────────────
function SitesSection({ onSuggest, onPreview, onClose }: { onSuggest?: (t: string) => void; onPreview?: (url: string) => void; onClose?: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const data = await getProjects();
      setProjects(data.projects);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <SectionHeader
        label="Sites" icon={Globe} expanded={expanded}
        onToggle={() => setExpanded(e => !e)}
        loading={loading} onRefresh={load}
      />
      {expanded && (
        <div className="pb-1">
          {error && (
            <div className="mx-3 mb-1 flex items-center gap-1 text-[10px] text-red-400">
              <AlertCircle className="w-3 h-3" /> {error}
            </div>
          )}
          {projects.map(p => (
            <div
              key={p.path}
              role="button"
              tabIndex={0}
              className={`flex items-center gap-2 px-4 py-2 hover:bg-slate-800/60 group ${!p.active ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
              onClick={() => {
                if (!p.active) {
                  onSuggest?.(`Switch to the ${p.name} project`);
                  return;
                }
                const url = "https://daveai.tech/";
                onPreview ? onPreview(url) : window.open(url, "_blank");
                onClose?.();
              }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.currentTarget.click(); } }}
              title={p.path}
            >
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.active ? "bg-emerald-400" : "bg-slate-600"}`} />
              <span className="text-xs text-slate-300 truncate flex-1">{p.name}</span>
              {p.active && <span className="text-[10px] text-emerald-600 shrink-0">active</span>}
              <button
                onClick={(e) => { e.stopPropagation(); window.open("https://daveai.tech/", "_blank"); }}
                className={`text-slate-600 hover:text-slate-400 ${p.active ? "opacity-0 group-hover:opacity-100" : "hidden"}`}
                title="Open in new tab"
              >
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          ))}
          {!loading && projects.length === 0 && !error && (
            <p className="text-[11px] text-slate-700 px-4 py-1">No projects found</p>
          )}
          <button
            onClick={() => onSuggest?.("Create a new website project in /var/www")}
            className="w-full text-left text-[11px] text-violet-500 hover:text-violet-300 px-4 py-2 transition-colors"
          >
            + New site
          </button>
        </div>
      )}
    </div>
  );
}

// ── Pages section ─────────────────────────────────────────────────────────────
function PagesSection({ onSuggest, onPreview, onClose, pageRefreshKey }: { onSuggest?: (t: string) => void; onPreview?: (url: string) => void; onClose?: () => void; pageRefreshKey?: number }) {
  const [expanded, setExpanded] = useState(true);
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const data = await getPages("main");
      setPages(data.pages.slice(0, 20)); // cap at 20 for sidebar
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [pageRefreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <SectionHeader
        label="Pages" icon={FileText} expanded={expanded}
        onToggle={() => setExpanded(e => !e)}
        loading={loading} onRefresh={load}
      />
      {expanded && (
        <div className="pb-1">
          {error && (
            <div className="mx-3 mb-1 flex items-center gap-1 text-[10px] text-red-400">
              <AlertCircle className="w-3 h-3" /> {error}
            </div>
          )}
          {pages.map(page => (
            <div
              key={page.id}
              role="button"
              tabIndex={0}
              className={`flex items-center gap-2 px-4 py-2 hover:bg-slate-800/60 group cursor-pointer transition-colors ${
                selectedId === page.id ? "bg-slate-700/60 border-l-2 border-violet-500" : ""
              }`}
              onClick={() => {
                setSelectedId(page.id);
                const url = `https://daveai.tech${page.path}`;
                onPreview ? onPreview(url) : window.open(url, "_blank");
                onClose?.();
              }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.currentTarget.click(); } }}
            >
              <FileText className="w-3 h-3 text-slate-600 shrink-0" />
              <span className="text-xs text-slate-300 truncate flex-1">{page.name}</span>
              <span className="text-[10px] text-slate-600 shrink-0 font-mono">{page.path}</span>
              <button
                onClick={(e) => { e.stopPropagation(); window.open(`https://daveai.tech${page.path}`, "_blank"); }}
                className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-slate-400"
                title="Open in new tab"
              >
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          ))}
          {!loading && pages.length === 0 && !error && (
            <p className="text-[11px] text-slate-700 px-4 py-1">No pages yet</p>
          )}
          <button
            onClick={() => onSuggest?.("Create a new landing page")}
            className="w-full text-left text-[11px] text-violet-500 hover:text-violet-300 px-4 py-2 transition-colors"
          >
            + New page
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tools section ─────────────────────────────────────────────────────────────
function ToolsSection({ onSuggest }: { onSuggest?: (t: string) => void }) {
  const [expanded, setExpanded] = useState(false); // collapsed by default (long list)
  const [tools, setTools] = useState<ToolEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [role, setRole] = useState("all");
  const [search, setSearch] = useState("");

  const load = async (r = role) => {
    setLoading(true); setError("");
    try {
      const data = await getTools(r);
      setTools(data.tools.slice(0, 30));
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed");
    } finally { setLoading(false); }
  };

  useEffect(() => { if (expanded) load(role); }, [expanded, role]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredTools = useMemo(
    () => tools.filter(tool =>
      !search ||
      tool.name.toLowerCase().includes(search.toLowerCase()) ||
      tool.description.toLowerCase().includes(search.toLowerCase())
    ),
    [tools, search]
  );

  const roles = ["all", "supervisor", "coder", "asset", "qa"];

  return (
    <div>
      <SectionHeader
        label={`Tools${tools.length ? ` (${tools.length})` : ""}`}
        icon={Wrench} expanded={expanded}
        onToggle={() => setExpanded(e => !e)}
        loading={loading}
      />
      {expanded && (
        <div className="pb-1">
          {/* Role filter */}
          <div className="flex flex-wrap gap-1 px-3 pb-2">
            {roles.map(r => (
              <button
                key={r}
                onClick={() => { setRole(r); load(r); }}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  role === r ? "bg-violet-700 text-white" : "bg-slate-800 text-slate-500 hover:text-slate-300"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          {/* Search filter */}
          <div className="px-3 pb-2">
            <input
              type="text"
              placeholder="Search tools…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-2 py-1 text-[11px] bg-slate-800 border border-slate-700 rounded text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-500"
            />
          </div>
          {error && (
            <div className="mx-3 mb-1 flex items-center gap-1 text-[10px] text-red-400">
              <AlertCircle className="w-3 h-3" /> {error}
            </div>
          )}
          {filteredTools.map(tool => (
            <div
              key={tool.name}
              role="button"
              tabIndex={0}
              className="flex items-start gap-2 px-4 py-2 hover:bg-slate-800/60 cursor-pointer group"
              onClick={() => onSuggest?.(`Use the ${tool.name} tool`)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.currentTarget.click(); } }}
            >
              <Wrench className="w-3 h-3 text-slate-700 mt-0.5 shrink-0 group-hover:text-amber-500" />
              <div className="min-w-0">
                <p className="text-[11px] font-mono text-slate-300 group-hover:text-amber-300">{tool.name}</p>
                <p className="text-[10px] text-slate-600 truncate">{tool.description}</p>
              </div>
            </div>
          ))}
          {!loading && filteredTools.length === 0 && !error && (
            <p className="text-[11px] text-slate-700 px-4 py-1">
              {search ? `No tools match "${search}"` : "No tools loaded"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Agents section ────────────────────────────────────────────────────────────
function AgentsInfoSection({ onSuggest }: { onSuggest?: (t: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  const [agents, setAgents] = useState<(AgentStatus & { role: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getAgentsStatus();
        if (!cancelled) {
          const list = Object.entries(data.agents).map(([role, ag]) => ({ role, ...ag }));
          setAgents(list);
        }
      } catch {
        // brain offline — keep showing last data
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div>
      <SectionHeader
        label="Agents" icon={Cpu} expanded={expanded}
        onToggle={() => setExpanded(e => !e)}
      />
      {expanded && (
        <div className="pb-1">
          {loading && agents.length === 0 && (
            <div className="text-[11px] text-slate-600 px-4 py-2">Loading agents…</div>
          )}
          {agents.map(ag => (
            <div key={ag.role} className="flex items-center gap-2 px-4 py-2 text-[11px]">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ag.status === "idle" ? "bg-emerald-500" : ag.status === "working" ? "bg-amber-400" : "bg-slate-600"}`} />
              <span className="text-slate-400 capitalize font-medium w-16">{ag.role}</span>
              <span className="text-slate-600 truncate">{ag.task || ag.status}</span>
            </div>
          ))}
          {!loading && agents.length === 0 && (
            <div className="text-[11px] text-slate-600 px-4 py-2">No agent data — brain offline?</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────
export function Sidebar({ open, onClose, onSuggest, onPreview, pageRefreshKey }: SidebarProps) {
  if (!open) return null;
  return (
    <div className="absolute lg:relative z-30 lg:z-auto top-0 left-0 h-full w-64 shrink-0 bg-slate-950 border-r border-slate-800 flex flex-col overflow-y-auto shadow-2xl lg:shadow-none">
      <div className="py-2 flex flex-col gap-0.5">
        <SitesSection onSuggest={onSuggest} onPreview={onPreview} onClose={onClose} />
        <div className="my-1 border-t border-slate-800/60" />
        <PagesSection onSuggest={onSuggest} onPreview={onPreview} onClose={onClose} pageRefreshKey={pageRefreshKey} />
        <div className="my-1 border-t border-slate-800/60" />
        <ToolsSection onSuggest={onSuggest} />
        <div className="my-1 border-t border-slate-800/60" />
        <AgentsInfoSection onSuggest={onSuggest} />
        <div className="my-1 border-t border-slate-800/60" />
        {/* Quick links: Discussions + Memory */}
        <div className="px-3 py-2 flex flex-col gap-0.5">
          <button
            onClick={() => { onSuggest?.("__panel:discuss"); onClose?.(); }}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-slate-400 hover:bg-slate-900 hover:text-slate-300 transition-colors w-full text-left"
          >
            <MessageSquare className="w-3.5 h-3.5 text-violet-400" />
            Discussions
          </button>
          <button
            onClick={() => { onSuggest?.("__panel:admin"); onClose?.(); }}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-slate-400 hover:bg-slate-900 hover:text-slate-300 transition-colors w-full text-left"
          >
            <Brain className="w-3.5 h-3.5 text-emerald-400" />
            Memory &amp; Admin
          </button>
        </div>
        <div className="my-1 border-t border-slate-800/60" />
        {/* Arcade Games */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-2">
            <Gamepad2 className="w-3.5 h-3.5 text-pink-400" />
            <span>Arcade</span>
          </div>
          <div className="flex flex-col gap-0.5">
            {[
              { name: "Dave's Siege TD", slug: "Daves_Siege_TD" },
              { name: "Asteroid Miner", slug: "asteroid-miner" },
              { name: "Blade Dash", slug: "blade-dash" },
              { name: "Breakout", slug: "breakout" },
              { name: "Flow Fields", slug: "flow-fields" },
              { name: "Retro Racer", slug: "retro-racer" },
              { name: "Space Debris", slug: "space-debris" },
              { name: "Tower Stack", slug: "tower-stack" },
            ].map((g) => (
              <a
                key={g.slug}
                href={`/arcade/${g.slug}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-2 py-1 rounded-md text-[11px] text-slate-500 hover:bg-slate-900 hover:text-slate-300 transition-colors"
              >
                <ExternalLink className="w-3 h-3 opacity-40" />
                {g.name}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
