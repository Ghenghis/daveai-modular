"use client";
import { useEffect, useState, useRef, useCallback, type ComponentType } from "react";
import { getAgentsStatus, setAgentModel, AgentStatus } from "@/lib/api";
import { Cpu, Zap, Image, CheckCircle, Loader2, AlertCircle, ChevronDown } from "lucide-react";

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  supervisor: Cpu,
  coder: Zap,
  asset: Image,
  qa: CheckCircle,
};

const STATUS_COLOR: Record<string, string> = {
  idle: "text-slate-500",
  working: "text-blue-400",
  running: "text-blue-400",
  done: "text-emerald-400",
  error: "text-red-400",
};

const RING_COLOR: Record<string, string> = {
  idle: "border-slate-800",
  working: "border-blue-500/50 shadow-blue-500/20 shadow-sm",
  running: "border-blue-500/50 shadow-blue-500/20 shadow-sm",
  done: "border-emerald-500/50",
  error: "border-red-500/50",
};

// Default model shown when agent is idle (matches brain config)
const DEFAULT_MODEL: Record<string, string> = {
  supervisor: "heavy-coder",
  coder: "heavy-coder",
  asset: "fast-agent",
  qa: "fast-agent",
};

// Available models for selection
const MODEL_OPTIONS = [
  { value: "heavy-coder",        label: "Heavy Coder (LM Studio → Kimi K2.5)" },
  { value: "fast-agent",         label: "Fast Agent (LM Studio → GLM Flash)" },
  { value: "openrouter/moonshotai/kimi-k2.5", label: "Kimi K2.5 (OpenRouter)" },
  { value: "openrouter/z-ai/glm-4.7-flash",  label: "GLM 4.7 Flash (OpenRouter)" },
  { value: "openrouter/openai/gpt-4o-mini",  label: "GPT-4o Mini (OpenRouter)" },
  { value: "openrouter/anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku (OpenRouter)" },
];

interface Props {
  poll?: number;
  slim?: boolean; // compact header mode
}

export function AgentPanel({ poll = 3000, slim = false }: Props) {
  const [agents, setAgents] = useState<Record<string, AgentStatus>>({});
  const [err, setErr] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [modelChanging, setModelChanging] = useState<Record<string, boolean>>({});
  const [modelError, setModelError] = useState<Record<string, string>>({});
  const [modelSuccess, setModelSuccess] = useState<Record<string, string>>({});

  const handleModelChange = useCallback(async (role: string, model: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("daveai_admin_token") ?? "" : "";
    if (!token) {
      setModelError(prev => ({ ...prev, [role]: "Admin login required to change models" }));
      setTimeout(() => setModelError(prev => ({ ...prev, [role]: "" })), 4000);
      return;
    }
    setModelChanging(prev => ({ ...prev, [role]: true }));
    setModelError(prev => ({ ...prev, [role]: "" }));
    try {
      await setAgentModel(role, model, token);
      setModelSuccess(prev => ({ ...prev, [role]: model }));
      setOpenMenu(null);
      setTimeout(() => setModelSuccess(prev => ({ ...prev, [role]: "" })), 2000);
    } catch (e: unknown) {
      setModelError(prev => ({ ...prev, [role]: (e as Error).message ?? "Failed to change model" }));
      setTimeout(() => setModelError(prev => ({ ...prev, [role]: "" })), 4000);
    } finally {
      setModelChanging(prev => ({ ...prev, [role]: false }));
    }
  }, []);

  const failCount = useRef(0);

  useEffect(() => {
    let active = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const data = await getAgentsStatus();
        if (active) { setAgents(data.agents); setErr(null); failCount.current = 0; }
      } catch {
        if (active) {
          failCount.current += 1;
          setErr("Brain offline — showing last known state");
        }
      }
    };

    const schedule = () => {
      const delay = failCount.current >= 3 ? Math.max(poll, 10_000) : poll;
      timerId = setTimeout(async () => {
        if (!active) return;
        await tick();
        if (active) schedule();
      }, delay);
    };

    tick().then(() => { if (active) schedule(); });

    return () => {
      active = false;
      if (timerId !== null) clearTimeout(timerId);
    };
  }, [poll]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (err) {
    return (
      <div className="flex items-center gap-1.5 text-red-400 text-xs px-2 py-1 rounded-lg border border-red-800/50 bg-slate-900">
        <AlertCircle className="w-3 h-3" /> Brain offline
      </div>
    );
  }

  // ── Slim mode: compact pills for the header bar ────────────────────────────
  if (slim) {
    return (
      <div className="flex items-center gap-1.5" ref={menuRef}>
        {["supervisor", "coder", "asset", "qa"].map(role => {
          const ag: AgentStatus = agents[role] ?? { status: "idle", task: "", progress: 0, model: "", ts: "" };
          const Icon = ICONS[role] ?? Cpu;
          const isActive = ag.status === "working" || ag.status === "running";
          const modelLabel = (ag.model || DEFAULT_MODEL[role] || "").split("/").pop() ?? "";

          return (
            <div key={role} className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === role ? null : role)}
                title={ag.task || role}
                className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-medium transition-all ${
                  RING_COLOR[ag.status] ?? "border-slate-800"
                } bg-slate-900/70 hover:bg-slate-800`}
              >
                {isActive
                  ? <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                  : <Icon className={`w-3 h-3 ${STATUS_COLOR[ag.status] ?? "text-slate-500"}`} />
                }
                <span className="text-slate-300 capitalize hidden xl:inline">{role}</span>
                <span className={`${STATUS_COLOR[ag.status] ?? "text-slate-500"} hidden sm:inline`}>
                  {ag.status === "idle" ? "idle" : ag.status}
                </span>
                {modelLabel && (
                  <span className="text-slate-600 hidden xl:inline">· {modelLabel}</span>
                )}
                <ChevronDown className="w-2.5 h-2.5 text-slate-600" />
              </button>

              {/* Model selector dropdown */}
              {openMenu === role && (
                <div className="absolute top-full left-0 mt-1 z-50 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-800">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{role} · Select Model</p>
                  </div>
                  <div className="py-1">
                    {MODEL_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => handleModelChange(role, opt.value)}
                        disabled={modelChanging[role] ?? false}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800 transition-colors disabled:opacity-50 ${
                          (ag.model || DEFAULT_MODEL[role]) === opt.value
                            ? "text-violet-400 font-medium"
                            : "text-slate-400"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="px-3 py-2 border-t border-slate-800">
                    {modelError[role] ? (
                      <p className="text-[10px] text-red-400">{modelError[role]}</p>
                    ) : modelSuccess[role] ? (
                      <p className="text-[10px] text-emerald-400">&#x2713; Switched to {modelSuccess[role].split("/").pop()}</p>
                    ) : (
                      <p className="text-[10px] text-slate-600">Active: <span className="text-slate-400">{ag.model || DEFAULT_MODEL[role]}</span></p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Full card grid mode ───────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" ref={menuRef}>
      {["supervisor", "coder", "asset", "qa"].map(role => {
        const ag: AgentStatus = agents[role] ?? { status: "idle", task: "", progress: 0, model: "", ts: "" };
        const Icon = ICONS[role] ?? Cpu;
        const isActive = ag.status === "working" || ag.status === "running";
        const modelLabel = (ag.model || DEFAULT_MODEL[role] || "").split("/").pop() ?? "";

        return (
          <div
            key={role}
            className={`relative flex flex-col gap-1 rounded-xl border p-2.5 bg-slate-900 transition-all duration-300 ${
              RING_COLOR[ag.status] ?? "border-slate-800"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Icon className={`w-3.5 h-3.5 ${STATUS_COLOR[ag.status] ?? "text-slate-500"}`} />
                <span className="text-xs font-semibold text-slate-200 capitalize">{role}</span>
              </div>
              {isActive && <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />}
            </div>

            {/* Status + model row */}
            <div className="flex items-center justify-between gap-1">
              <span className={`text-[10px] capitalize font-medium ${STATUS_COLOR[ag.status] ?? "text-slate-500"}`}>
                {ag.status}
              </span>
              <button
                onClick={() => setOpenMenu(openMenu === role ? null : role)}
                className="flex items-center gap-0.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                title="Change model"
              >
                {modelLabel}
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
            </div>

            {ag.task && (
              <div className="text-[10px] text-slate-500 truncate">{ag.task}</div>
            )}

            {ag.progress > 0 && ag.progress < 100 && (
              <div className="w-full bg-slate-800 rounded-full h-0.5 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${ag.progress}%` }}
                />
              </div>
            )}

            {/* Model dropdown */}
            {openMenu === role && (
              <div className="absolute top-full left-0 mt-1 z-50 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-800">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{role} · Select Model</p>
                </div>
                <div className="py-1">
                  {MODEL_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => handleModelChange(role, opt.value)}
                      disabled={modelChanging[role] ?? false}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800 transition-colors disabled:opacity-50 ${
                        (ag.model || DEFAULT_MODEL[role]) === opt.value
                          ? "text-violet-400 font-medium"
                          : "text-slate-400"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="px-3 py-2 border-t border-slate-800">
                  {modelError[role] ? (
                    <p className="text-[10px] text-red-400">{modelError[role]}</p>
                  ) : modelSuccess[role] ? (
                    <p className="text-[10px] text-emerald-400">&#x2713; Switched to {modelSuccess[role].split("/").pop()}</p>
                  ) : (
                    <p className="text-[10px] text-slate-600">Active: <span className="text-slate-400">{ag.model || DEFAULT_MODEL[role]}</span></p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
