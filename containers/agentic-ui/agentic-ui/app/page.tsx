"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useStream } from "@/lib/sse";
import type { StreamState } from "@/lib/sse";
import { AgentPanel } from "@/components/AgentPanel";
import { ChatStream } from "@/components/ChatStream";
import { BuildTimeline } from "@/components/BuildTimeline";
import { AdminPanel } from "@/components/AdminPanel";
import { DiscussionPanel } from "@/components/DiscussionPanel";
import { Sidebar } from "@/components/Sidebar";
import { Send, StopCircle, Settings, GitBranch, Cpu, RotateCcw, BarChart2, History, X, PanelLeftOpen, PanelLeftClose, Mic, MicOff, Monitor, ExternalLink, Loader2, AlertCircle, MessageSquare } from "lucide-react";
import { agentStop, getHealth } from "@/lib/api";
import type { HealthResponse } from "@/lib/api";

const HISTORY_KEY = "daveai_history";
const MAX_HISTORY = 20; // max stored conversations

interface HistoryEntry {
  id: string;
  ts: string;
  prompt: string;
  events: StreamState["events"];
  tokens: string;
  commit?: string;
}

function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch { return []; }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(-MAX_HISTORY)));
  } catch { /* quota exceeded — skip */ }
}

const SUGGESTIONS = [
  "Add a dark hero section with animated gradient",
  "Build a contact form with email validation",
  "Create a portfolio grid with hover effects",
  "Redesign the navbar -- sticky + glassmorphism",
  "Add smooth scroll animations to all sections",
  "Add a live clock widget to the footer",
];

type Panel = "chat" | "build" | "discuss" | "analytics" | "admin" | "preview";

export default function Home() {
  const { state, send, stop, reset } = useStream();
  const [input, setInput] = useState("");
  const [panel, setPanel] = useState<Panel>("chat");
  const panelRef = useRef<Panel>("chat"); // tracks current panel without stale closures
  const [previewUrl, setPreviewUrl] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [historyViewBanner, setHistoryViewBanner] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState("");
  const [pageRefreshKey, setPageRefreshKey] = useState(0);
  const refreshPages = useCallback(() => setPageRefreshKey(k => k + 1), []);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const startVoice = useCallback(() => {
    const SR = (window as typeof window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition
      || (window as typeof window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0][0].transcript;
      setInput(prev => prev ? `${prev} ${text}` : text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, []);

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  // Keep panelRef in sync so stale-closure effects can read the current panel
  useEffect(() => { panelRef.current = panel; }, [panel]);

  useEffect(() => {
    if (panel !== "analytics") return;
    setHealthLoading(true);
    setHealthError("");
    getHealth()
      .then(setHealthData)
      .catch((e: unknown) => setHealthError((e as Error).message ?? "Health check failed"))
      .finally(() => setHealthLoading(false));
  }, [panel]);

  // Analytics auto-refresh: poll every 30s while the analytics tab is open
  useEffect(() => {
    if (panel !== "analytics") return;
    const id = setInterval(() => {
      getHealth()
        .then(setHealthData)
        .catch(() => {}); // silent refresh — errors shown on initial load only
    }, 30_000);
    return () => clearInterval(id);
  }, [panel]);

  // Load history from localStorage on mount
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Persist completed conversations to localStorage
  useEffect(() => {
    if (state.status === "done" && state.events.length > 0 && currentPrompt) {
      const entry: HistoryEntry = {
        id: Date.now().toString(36),
        ts: new Date().toISOString(),
        prompt: currentPrompt,
        events: state.events,
        tokens: state.tokens,
        commit: state.commit,
      };
      setHistory(prev => {
        const next = [...prev.filter(e => e.prompt !== currentPrompt), entry];
        saveHistory(next);
        return next;
      });
      // Always auto-switch to preview when build finishes so user sees result immediately
      const url = state.preview_url;
      if (url && url.length > 0) {
        setPreviewUrl(url);
      }
      setPanel("preview");
    }
  }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.events, state.tokens]);

  // Reset preview loading/error state when the preview URL changes; timeout after 10s
  useEffect(() => {
    if (!previewUrl) { setPreviewLoading(false); setPreviewError(""); return; }
    setPreviewLoading(true);
    setPreviewError("");
    const timer = setTimeout(() => setPreviewLoading(false), 10_000);
    return () => clearTimeout(timer);
  }, [previewUrl]);

  const submit = () => {
    if (!input.trim() || state.status === "streaming") return;
    setCurrentPrompt(input.trim());
    send(input.trim());
    setInput("");
    setPanel("chat");
    setShowHistory(false);
  };

  const restoreHistory = useCallback((entry: HistoryEntry) => {
    // We can only show — not re-stream — past sessions
    reset();
    setShowHistory(false);
    setPanel("chat");
    // Display a read-only notice by setting currentPrompt only (no re-send)
    setCurrentPrompt(entry.prompt);
    setInput(entry.prompt);
    setHistoryViewBanner(true);
  }, [reset]);

  return (
    <div className="h-screen bg-[#030712] flex flex-col relative overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 border-b border-slate-800/60 bg-slate-900/50 backdrop-blur sticky top-0 z-10 gap-2">
        <div className="flex items-center gap-2 shrink-0">
          {/* Sidebar toggle */}
          <button
            onClick={() => setShowSidebar(s => !s)}
            title={showSidebar ? "Hide sidebar" : "Show sidebar"}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showSidebar
              ? <PanelLeftClose className="w-4 h-4" />
              : <PanelLeftOpen className="w-4 h-4" />
            }
          </button>
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-xs font-bold">D</div>
          <span className="font-semibold text-slate-100 text-sm hidden sm:inline">DaveAI</span>
        </div>

        {/* Agent status pills — slim mode in header */}
        <div className="flex-1 flex items-center justify-center overflow-x-auto">
          <AgentPanel poll={3000} slim />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {(["chat","build","discuss","analytics","admin","preview"] as Panel[]).map(p => {
            const Icon = p === "chat" ? Cpu
              : p === "build" ? GitBranch
              : p === "discuss" ? MessageSquare
              : p === "analytics" ? BarChart2
              : p === "preview" ? Monitor
              : Settings;
            return (
              <button
                key={p}
                onClick={() => setPanel(p)}
                title={p.charAt(0).toUpperCase() + p.slice(1)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  panel === p ? "bg-slate-700 text-slate-100" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="capitalize hidden sm:inline">{p}</span>
              </button>
            );
          })}
          {/* History toggle */}
          <button
            onClick={() => setShowHistory(h => !h)}
            title="Conversation history"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ml-1 ${
              showHistory ? "bg-slate-700 text-slate-100" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            {history.length > 0 && (
              <span className="bg-violet-600 text-white rounded-full px-1 text-[10px] leading-none py-0.5">
                {history.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* History drawer */}
      {showHistory && (
        <div className="absolute top-[56px] right-0 z-30 w-[min(320px,calc(100vw-16px))] max-h-[70vh] bg-slate-900 border border-slate-700 rounded-bl-xl overflow-y-auto shadow-2xl">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 sticky top-0 bg-slate-900">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-violet-400" />
              Conversation History
            </span>
            <button onClick={() => setShowHistory(false)} className="text-slate-500 hover:text-slate-300">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-slate-600 px-4 py-6 text-center">No past conversations yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-slate-800">
              {[...history].reverse().map(entry => (
                <button
                  key={entry.id}
                  onClick={() => restoreHistory(entry)}
                  className="text-left px-4 py-3 hover:bg-slate-800 transition-colors group"
                >
                  <p className="text-xs text-slate-300 font-medium truncate group-hover:text-violet-300">{entry.prompt}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-slate-600">
                      {new Date(entry.ts).toLocaleDateString()} {new Date(entry.ts).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}
                    </span>
                    {entry.commit && (
                      <span className="text-[10px] font-mono text-emerald-600 truncate">
                        {entry.commit.slice(0, 7)}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          {history.length > 0 && (
            <div className="px-4 py-2 border-t border-slate-800">
              <button
                onClick={() => {
                  if (!confirm("Clear all conversation history? This cannot be undone.")) return;
                  setHistory([]);
                  saveHistory([]);
                }}
                className="text-[10px] text-slate-600 hover:text-red-400 transition-colors"
              >
                Clear all history
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar
          open={showSidebar}
          onClose={() => setShowSidebar(false)}
          onSuggest={(text) => {
            if (text.startsWith("__panel:")) {
              const p = text.replace("__panel:", "") as Panel;
              setPanel(p);
              setShowSidebar(false);
            } else {
              setInput(text);
              setPanel("chat");
            }
          }}
          onPreview={(url) => { setPreviewUrl(url); setPanel("preview"); setShowSidebar(false); }}
          pageRefreshKey={pageRefreshKey}
        />
        {showSidebar && (
          <div
            className="lg:hidden absolute inset-0 bg-black/40 z-20"
            onClick={() => setShowSidebar(false)}
            aria-hidden="true"
          />
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          <main className={`flex-1 overflow-y-auto ${panel === "preview" ? "" : "px-4 py-4"}`}>
        {panel === "chat" && (
          <div className="max-w-3xl mx-auto pb-4">
            {historyViewBanner && (
              <div className="flex items-center justify-between gap-2 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-400 mb-3">
                <span>📜 Viewing past conversation — send a message to start fresh</span>
                <button onClick={() => setHistoryViewBanner(false)} className="text-slate-600 hover:text-slate-400 flex-shrink-0">✕</button>
              </div>
            )}
            {(state.status === "idle" && state.events.length === 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-6">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="text-left text-xs px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:border-violet-700 hover:text-slate-200 transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <ChatStream events={state.events} tokens={state.tokens} status={state.status} error={state.error} commit={state.commit} plan={state.plan} createdFiles={state.created_files} />
            <div ref={bottomRef} />
            {state.status === "done" && (
              <button
                onClick={() => { reset(); setCurrentPrompt(""); setHistoryViewBanner(false); }}
                className="mt-4 flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" /> New conversation
              </button>
            )}
          </div>
        )}
        {panel === "build" && (
          <div className="max-w-2xl mx-auto">
            <BuildTimeline poll={15000} />
          </div>
        )}
        {panel === "analytics" && (
          <div className="max-w-2xl mx-auto">
            <div className="flex flex-col gap-4">
              <h2 className="text-slate-300 font-semibold flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-violet-400" />
                System Analytics
              </h2>
              {healthLoading && (
                <p className="text-xs text-slate-500 italic mb-2">Loading health data…</p>
              )}
              {healthError && (
                <p className="text-xs text-red-400 mb-2">{healthError}</p>
              )}
              {healthData && (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-center">
                    <div className="text-lg font-bold text-violet-400">{healthData.tools}</div>
                    <div className="text-[10px] text-slate-500">Tools loaded</div>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-center">
                    <div className="text-lg font-bold text-emerald-400">{healthData.agents.length}</div>
                    <div className="text-[10px] text-slate-500">Agents active</div>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-center">
                    <div className={`text-lg font-bold ${healthData.status === "ok" ? "text-emerald-400" : "text-red-400"}`}>
                      {healthData.status}
                    </div>
                    <div className="text-[10px] text-slate-500">Brain status</div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3">
                <a
                  href="https://daveai.tech/api/health"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-400 hover:border-violet-700 transition-colors"
                >
                  <span className="text-violet-400 font-mono">/api/health</span> — System health check (tools, agents, version)
                </a>
                <a
                  href="https://daveai.tech/api/status"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-400 hover:border-violet-700 transition-colors"
                >
                  <span className="text-violet-400 font-mono">/api/status</span> — Full system status with build history
                </a>
                <a
                  href="https://daveai.tech/api/tools"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-400 hover:border-violet-700 transition-colors"
                >
                  <span className="text-violet-400 font-mono">/api/tools</span> — All loaded agent skills by role
                </a>
              </div>
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                <p className="text-xs text-slate-500">
                  Detailed analytics, watchdog metrics, and rollback controls require admin authentication.{" "}
                  <button
                    onClick={() => setPanel("admin")}
                    className="text-violet-400 underline hover:text-violet-300"
                  >
                    Login in Admin panel
                  </button>{" "}
                  to view full metrics.
                </p>
              </div>
            </div>
          </div>
        )}
        {panel === "discuss" && (
          <div className="max-w-2xl mx-auto">
            <DiscussionPanel onSuggest={(text) => { setInput(text); setPanel("chat"); }} />
          </div>
        )}
        {panel === "admin" && (
          <div className="max-w-2xl mx-auto">
            <AdminPanel onPagesChanged={refreshPages} />
          </div>
        )}
        {panel === "preview" && (
          <div className="flex flex-col h-full relative">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/80 border-b border-slate-800 shrink-0">
              <Monitor className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-xs text-slate-400 truncate flex-1 font-mono">
                {previewUrl || "No page selected"}
              </span>
              {previewUrl && (
                <button
                  onClick={() => window.open(previewUrl, "_blank")}
                  className="text-slate-500 hover:text-slate-300 transition-colors"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setPanel("chat")}
                className="text-slate-500 hover:text-slate-300 transition-colors text-xs ml-2"
                title="Back to chat"
              >
                ← Chat
              </button>
            </div>
            {!previewUrl ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-600">
                <Monitor className="w-10 h-10 opacity-30" />
                <p className="text-sm">Build something or pick a page from the sidebar to preview it here.</p>
              </div>
            ) : (
              <>
                {previewLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 z-10 pointer-events-none" style={{ top: "41px" }}>
                    <div className="flex items-center gap-2 text-slate-400 text-xs">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading preview…
                    </div>
                  </div>
                )}
                {previewError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950" style={{ top: "41px" }}>
                    <div className="flex flex-col items-center gap-2 text-slate-400 text-sm max-w-xs text-center">
                      <AlertCircle className="w-8 h-8 text-red-400 opacity-60" />
                      <p>{previewError}</p>
                      <button
                        onClick={() => { setPreviewError(""); setPreviewLoading(true); }}
                        className="text-xs text-violet-400 hover:text-violet-300 underline mt-1"
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                )}
                <iframe
                  src={previewUrl}
                  className="flex-1 w-full border-0 bg-white min-h-0"
                  title="Site preview"
                  sandbox="allow-scripts allow-forms allow-same-origin"
                  onLoad={() => setPreviewLoading(false)}
                  onError={() => { setPreviewLoading(false); setPreviewError("Failed to load preview — the page may be unreachable."); }}
                />
              </>
            )}
          </div>
        )}
          </main>

          <div className="sticky bottom-0 bg-[#030712]/90 backdrop-blur border-t border-slate-800/60 px-4 py-3">
            <div className="max-w-3xl mx-auto px-1 pb-0.5">
              <p className="text-[10px] text-slate-700">Enter to send · Shift+Enter for new line</p>
            </div>
            <div className="max-w-3xl mx-auto flex gap-2 items-end">
              <textarea
                rows={1}
                placeholder="Tell DaveAI what to build..."
                value={input}
                maxLength={10000}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
                }}
                disabled={state.status === "streaming"}
                className="flex-1 resize-none px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-violet-600 disabled:opacity-50 max-h-40 overflow-y-auto"
              />
              <button
                onClick={listening ? stopVoice : startVoice}
                disabled={state.status === "streaming"}
                title={listening ? "Stop recording" : "Voice input"}
                className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5 disabled:opacity-40 ${listening ? "bg-red-600 hover:bg-red-500 animate-pulse" : "bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200"}`}
              >
                {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              {state.status === "streaming" ? (
                <button
                  onClick={() => { stop(); agentStop().catch(() => {}); }}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-500 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5"
                >
                  <StopCircle className="w-4 h-4" /> Stop
                </button>
              ) : (
                <button onClick={submit} disabled={!input.trim()} className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5">
                  <Send className="w-4 h-4" /> Send
                </button>
              )}
            </div>
          </div>
        </div>{/* end flex-1 flex flex-col */}
      </div>{/* end flex (sidebar + content) */}
    </div>
  );
}
