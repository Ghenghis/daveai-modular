"use client";
import { useState, useEffect, useCallback } from "react";
import {
  MessageSquare, Plus, Send, Users, RefreshCw, Loader2,
} from "lucide-react";
import {
  getDiscussions, createDiscussion, getDiscussion, replyDiscussion,
} from "@/lib/api";
import type { Discussion } from "@/lib/api";

interface Props {
  onSuggest?: (text: string) => void;
}

export function DiscussionPanel({ onSuggest }: Props) {
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Discussion | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  // New discussion form
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newParticipants, setNewParticipants] = useState("supervisor,coder");
  const [newPrompt, setNewPrompt] = useState("");

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getDiscussions();
      setDiscussions(res.discussions ?? []);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to load discussions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const openDiscussion = async (id: string) => {
    try {
      const d = await getDiscussion(id);
      setSelected(d);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to load discussion");
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim() || !newPrompt.trim()) return;
    setSending(true);
    try {
      const d = await createDiscussion(
        newTitle.trim(),
        newParticipants.split(",").map((s) => s.trim()).filter(Boolean),
        newPrompt.trim(),
      );
      setSelected(d);
      setShowNew(false);
      setNewTitle("");
      setNewPrompt("");
      await loadList();
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to create discussion");
    } finally {
      setSending(false);
    }
  };

  const handleReply = async () => {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    try {
      await replyDiscussion(selected.id, "user", replyText.trim());
      setReplyText("");
      await openDiscussion(selected.id);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to reply");
    } finally {
      setSending(false);
    }
  };

  // ── Detail view ──
  if (selected) {
    return (
      <div className="flex flex-col gap-3 h-full">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSelected(null)}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← Back
          </button>
          <span className="text-xs text-slate-400 font-mono">{selected.status}</span>
        </div>
        <h3 className="text-sm font-semibold text-slate-200">{selected.title}</h3>
        <div className="flex items-center gap-1 text-[10px] text-slate-600">
          <Users className="w-3 h-3" />
          {selected.participants?.join(", ")}
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
          {(selected.messages ?? []).map((m, i) => (
            <div
              key={i}
              className={`p-2 rounded-lg text-xs ${
                m.role === "user"
                  ? "bg-violet-900/30 border border-violet-800 ml-8"
                  : "bg-slate-800 border border-slate-700 mr-8"
              }`}
            >
              <span className="font-mono text-slate-500 text-[10px]">{m.role}</span>
              <p className="text-slate-300 mt-0.5 whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-auto">
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleReply()}
            placeholder="Reply…"
            className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-violet-500"
          />
          <button
            onClick={handleReply}
            disabled={sending || !replyText.trim()}
            className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 flex items-center gap-1"
          >
            {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          </button>
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-slate-300 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-violet-400" /> Discussions
        </h3>
        <div className="flex gap-1">
          <button onClick={loadList} className="p-1 rounded hover:bg-slate-800 transition-colors" title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setShowNew(!showNew)}
            className="p-1 rounded hover:bg-slate-800 transition-colors"
            title="New discussion"
          >
            <Plus className="w-3.5 h-3.5 text-slate-500" />
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {showNew && (
        <div className="flex flex-col gap-2 p-3 bg-slate-900 border border-slate-800 rounded-xl">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Discussion title"
            className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-violet-500"
          />
          <input
            type="text"
            value={newParticipants}
            onChange={(e) => setNewParticipants(e.target.value)}
            placeholder="Participants (comma-separated)"
            className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-violet-500"
          />
          <textarea
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            placeholder="Opening prompt…"
            rows={3}
            className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-violet-500 resize-none"
          />
          <button
            onClick={handleCreate}
            disabled={sending || !newTitle.trim() || !newPrompt.trim()}
            className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 flex items-center gap-1 self-end"
          >
            {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Create
          </button>
        </div>
      )}

      {loading && !discussions.length && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading…
        </div>
      )}

      {!loading && !discussions.length && !showNew && (
        <p className="text-xs text-slate-600 text-center py-4">No discussions yet. Click + to start one.</p>
      )}

      <div className="flex flex-col gap-1">
        {discussions.map((d) => (
          <button
            key={d.id}
            onClick={() => openDiscussion(d.id)}
            className="flex items-center gap-2 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg hover:border-violet-600 transition-colors text-left"
          >
            <MessageSquare className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-300 truncate">{d.title}</p>
              <p className="text-[10px] text-slate-600">
                {d.participants?.join(", ")} · {d.messages?.length ?? 0} messages
              </p>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              d.status === "active" ? "bg-emerald-900/40 text-emerald-400" : "bg-slate-800 text-slate-500"
            }`}>
              {d.status}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
