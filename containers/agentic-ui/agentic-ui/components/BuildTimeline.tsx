"use client";
import { useEffect, useState } from "react";
import { getLog, GitCommit, BuildEntry } from "@/lib/api";
import { GitCommit as GitIcon, Package, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

interface Props {
  poll?: number;
}

export function BuildTimeline({ poll = 15000 }: Props) {
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [builds, setBuilds] = useState<BuildEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const data = await getLog(10);
      setCommits(data.log ?? []);
      setBuilds(data.builds ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, poll);
    return () => clearInterval(id);
  }, [poll]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
          <GitIcon className="w-4 h-4 text-violet-400" /> Build History
        </h3>
        <button
          onClick={refresh}
          className="text-slate-500 hover:text-slate-300 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {builds.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Agent Builds</div>
          {builds.map(b => (
            <div key={b.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-slate-900 border border-slate-800">
              <Package className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="text-slate-400 capitalize shrink-0">{b.agent}</span>
              <span className="text-slate-300 truncate flex-1" title={b.task}>{b.task}</span>
              {b.outcome === "ok" && (
                <a
                  href="https://daveai.tech/"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View deployed site"
                  className="text-[10px] text-violet-500 hover:text-violet-300 shrink-0 ml-auto"
                >
                  View →
                </a>
              )}
              {b.outcome === "ok"
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                : <XCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              }
              <span className="text-slate-600 shrink-0">{new Date(b.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ))}
        </div>
      )}

      {commits.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Git Commits</div>
          {commits.map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-slate-900 border border-slate-800">
              <GitIcon className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span className="text-slate-300 truncate" title={c.message}>{c.message}</span>
                <div className="flex gap-2 text-slate-600">
                  <code className="font-mono text-violet-500 cursor-help" title={`${c.hash} by ${c.author} on ${c.date}`}>{c.hash?.slice(0, 8)}</code>
                  <span>{c.author}</span>
                  <span>{c.date ? new Date(c.date).toLocaleDateString() : ""}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && commits.length === 0 && builds.length === 0 && (
        <div className="text-xs text-slate-600 text-center py-4">No build history yet</div>
      )}
    </div>
  );
}
