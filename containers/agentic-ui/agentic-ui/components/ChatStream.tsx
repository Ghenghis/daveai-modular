"use client";
import { StreamEvent } from "@/lib/sse";
import { Bot, Wrench, Eye, GitCommit, AlertCircle, CheckCircle2, Cpu, Copy, Check, ExternalLink, Volume2, FileCode, ListChecks } from "lucide-react";
import { useState, useCallback } from "react";
import { speakText } from "@/lib/api";

interface Props {
  events: StreamEvent[];
  tokens: string;
  status: "idle" | "streaming" | "done" | "error";
  error?: string;
  commit?: string;
  plan?: string;
  createdFiles?: string[];
}

// ── Inline code-block renderer (no external deps) ────────────────────────────

interface TextSegment {
  type: "text" | "code";
  content: string;
  lang?: string;
}

function parseCodeBlocks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  // Match ``` fenced blocks with optional language tag
  const pattern = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "code", lang: match[1] || "text", content: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }
  return segments.length ? segments : [{ type: "text", content: text }];
}

// Simple keyword-based syntax colouring (no external lib needed)
const LANG_TOKENS: Record<string, { keywords: string[]; color: string }[]> = {
  js: [
    { keywords: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "import", "export", "from", "async", "await", "new", "typeof", "instanceof", "=>"], color: "text-violet-400" },
    { keywords: ["true", "false", "null", "undefined"], color: "text-amber-400" },
  ],
  ts: [
    { keywords: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "import", "export", "from", "async", "await", "new", "typeof", "interface", "type", "enum", "extends", "implements", "=>"], color: "text-violet-400" },
    { keywords: ["true", "false", "null", "undefined"], color: "text-amber-400" },
  ],
  python: [
    { keywords: ["def", "class", "return", "if", "elif", "else", "for", "while", "import", "from", "as", "try", "except", "finally", "with", "lambda", "yield", "async", "await", "pass", "break", "continue", "raise", "not", "and", "or", "in", "is"], color: "text-violet-400" },
    { keywords: ["True", "False", "None"], color: "text-amber-400" },
  ],
  bash: [
    { keywords: ["echo", "cd", "ls", "mkdir", "rm", "cp", "mv", "git", "npm", "pip", "python3", "curl", "sudo", "export", "if", "fi", "then", "else", "for", "do", "done", "while"], color: "text-emerald-400" },
  ],
};

LANG_TOKENS["javascript"] = LANG_TOKENS["js"];
LANG_TOKENS["typescript"] = LANG_TOKENS["ts"];
LANG_TOKENS["tsx"] = LANG_TOKENS["ts"];
LANG_TOKENS["jsx"] = LANG_TOKENS["js"];
LANG_TOKENS["sh"] = LANG_TOKENS["bash"];
LANG_TOKENS["shell"] = LANG_TOKENS["bash"];
LANG_TOKENS["py"] = LANG_TOKENS["python"];

function highlightLine(line: string, lang: string): React.ReactNode {
  const rules = LANG_TOKENS[lang.toLowerCase()];
  if (!rules) return <span className="text-slate-200">{line}</span>;

  // Escape HTML and wrap keywords
  const parts: React.ReactNode[] = [];
  // Detect strings first (single/double quoted)
  const strPattern = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const tempLine = line;

  // Simple: split on quoted strings, highlight keywords in non-string segments
  strPattern.lastIndex = 0;
  while ((m = strPattern.exec(tempLine)) !== null) {
    if (m.index > last) {
      parts.push(highlightKeywords(tempLine.slice(last, m.index), rules));
    }
    parts.push(<span key={`s${m.index}`} className="text-emerald-300">{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < tempLine.length) {
    parts.push(highlightKeywords(tempLine.slice(last), rules));
  }
  return <>{parts}</>;
}

function highlightKeywords(text: string, rules: { keywords: string[]; color: string }[]): React.ReactNode {
  // Build a regex from all keywords
  const allKw: { kw: string; color: string }[] = [];
  for (const rule of rules) {
    for (const kw of rule.keywords) {
      allKw.push({ kw, color: rule.color });
    }
  }
  if (!allKw.length) return <span className="text-slate-200">{text}</span>;

  const pattern = new RegExp(`\\b(${allKw.map(k => k.kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "g");
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<span key={`t${last}`} className="text-slate-200">{text.slice(last, m.index)}</span>);
    }
    const rule = allKw.find(k => k.kw === m![1]);
    parts.push(<span key={`kw${m.index}`} className={rule?.color ?? "text-slate-200"}>{m[1]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push(<span key={`e${last}`} className="text-slate-200">{text.slice(last)}</span>);
  }
  return <>{parts}</>;
}

// Comment highlighting wrapper
function renderCodeLine(line: string, lang: string, idx: number): React.ReactNode {
  const trimmed = line.trimStart();
  const commentPrefixes: Record<string, string[]> = {
    js: ["//", "/*", "*"], ts: ["//", "/*", "*"], tsx: ["//", "/*", "*"],
    javascript: ["//"], typescript: ["//"],
    python: ["#"], py: ["#"],
    bash: ["#"], sh: ["#"], shell: ["#"],
    css: ["/*", "*"],
  };
  const prefixes = commentPrefixes[lang.toLowerCase()] ?? ["//", "#"];
  const isComment = prefixes.some(p => trimmed.startsWith(p));
  return (
    <div key={idx} className="leading-5">
      {isComment
        ? <span className="text-slate-500 italic">{line}</span>
        : highlightLine(line, lang)
      }
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
      title="Copy code"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CodeBlock({ content, lang }: { content: string; lang: string }) {
  const lines = content.split("\n");
  // Remove trailing empty line if present
  if (lines[lines.length - 1] === "") lines.pop();
  return (
    <div className="my-2 rounded-lg overflow-hidden border border-slate-700 bg-[#0d1117]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/70 border-b border-slate-700">
        <span className="text-[10px] font-mono text-slate-500">{lang || "code"}</span>
        <CopyButton text={content} />
      </div>
      <pre className="px-4 py-3 overflow-x-auto text-xs font-mono leading-5">
        {lines.map((line, i) => renderCodeLine(line, lang, i))}
      </pre>
    </div>
  );
}

function InlineCode({ text }: { text: string }) {
  // Handle single-backtick inline code within a text segment
  const parts: React.ReactNode[] = [];
  const pattern = /`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<span key={`t${last}`}>{text.slice(last, m.index)}</span>);
    }
    parts.push(
      <code key={`c${m.index}`} className="px-1 py-0.5 rounded bg-slate-700 text-violet-300 text-[11px] font-mono">
        {m[1]}
      </code>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<span key={`e${last}`}>{text.slice(last)}</span>);
  return <>{parts}</>;
}

function RichText({ text }: { text: string }) {
  const segments = parseCodeBlocks(text);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "code"
          ? <CodeBlock key={i} content={seg.content} lang={seg.lang ?? ""} />
          : <span key={i} className="whitespace-pre-wrap"><InlineCode text={seg.content} /></span>
      )}
    </>
  );
}

// ── Event row ────────────────────────────────────────────────────────────────

function EventRow({ ev }: { ev: StreamEvent }) {
  const ts = ev.ts ? new Date(ev.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";

  if (ev.type === "token") return null;

  const icons: Record<string, typeof Bot> = {
    step: Bot, action: Wrench, observe: Eye,
    plan: Cpu, tool: Wrench, error: AlertCircle, done: CheckCircle2,
  };
  const Icon = icons[ev.type] ?? Bot;

  const colors: Record<string, string> = {
    step: "text-blue-400",
    action: "text-amber-400",
    observe: "text-slate-400",
    plan: "text-violet-400",
    tool: "text-amber-400",
    error: "text-red-400",
    done: "text-emerald-400",
    start: "text-slate-500",
  };

  const label = ev.agent ? `[${ev.agent}]` : `[${ev.type}]`;
  const msg = ev.msg ?? ev.result ?? "";

  return (
    <div className={`flex gap-2 text-xs py-0.5 ${ev.type === "start" ? "opacity-40" : ""}`}>
      <span className="text-slate-600 shrink-0 w-18 font-mono">{ts}</span>
      <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${colors[ev.type] ?? "text-slate-400"}`} />
      <span className={`font-mono shrink-0 ${colors[ev.type] ?? "text-slate-400"}`}>{label}</span>
      <span className="text-slate-300 break-words min-w-0">{msg}</span>
      {ev.progress !== undefined && ev.progress > 0 && (
        <span className="ml-auto text-slate-600 shrink-0">{ev.progress}%</span>
      )}
    </div>
  );
}

// ── Speak button (TTS) ───────────────────────────────────────────────────────

function SpeakButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  const speak = useCallback(async () => {
    if (speaking) return;
    setSpeaking(true);
    try {
      const blob = await speakText(text);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); setSpeaking(false); };
      audio.onerror = () => { URL.revokeObjectURL(url); setSpeaking(false); };
      await audio.play();
    } catch {
      setSpeaking(false);
    }
  }, [text, speaking]);
  return (
    <button
      onClick={speak}
      className={`flex items-center gap-1 text-[10px] transition-colors ${speaking ? "text-violet-400" : "text-slate-500 hover:text-slate-300"}`}
      title="Read aloud"
    >
      <Volume2 className="w-3 h-3" />
      {speaking ? "Speaking…" : "Listen"}
    </button>
  );
}

// ── Created files list ───────────────────────────────────────────────────────

function CreatedFilesList({ events: evs }: { events: StreamEvent[] }) {
  const files = evs
    .filter((e) => e.type === "action" && e.msg?.startsWith("file_write"))
    .map((e) => {
      const m = e.msg?.match(/file_write\s+(.+)/);
      return m ? m[1].trim() : null;
    })
    .filter(Boolean) as string[];

  if (!files.length) return null;
  return (
    <div className="mt-2 p-2 rounded-lg bg-slate-800/60 border border-slate-700">
      <div className="text-[10px] text-slate-500 mb-1 flex items-center gap-1">
        <FileCode className="w-3 h-3" /> Files created/modified ({files.length})
      </div>
      <div className="flex flex-col gap-0.5">
        {files.map((f, i) => (
          <span key={i} className="text-[11px] font-mono text-slate-400 pl-2">{f}</span>
        ))}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ChatStream({ events, tokens, status, error, commit, plan, createdFiles }: Props) {
  const isEmpty = events.length === 0 && !tokens;

  if (isEmpty && status === "idle") {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-slate-600 text-sm gap-2">
        <Bot className="w-8 h-8 opacity-30" />
        <span>Send a message to start the agent</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {events.map((ev, i) => <EventRow key={i} ev={ev} />)}

      {tokens && (
        <div className="mt-2 p-3 rounded-xl bg-slate-800 border border-slate-700">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1"><Bot className="w-3 h-3" /> Agent response</span>
            <SpeakButton text={tokens.replace(/```[\s\S]*?```/g, "").slice(0, 2000)} />
          </div>
          <div className="text-sm text-slate-100 leading-relaxed">
            <RichText text={tokens} />
          </div>
        </div>
      )}

      {plan && (
        <div className="mt-2 p-2 rounded-lg bg-violet-950/30 border border-violet-800">
          <div className="text-[10px] text-violet-400 mb-1 flex items-center gap-1">
            <ListChecks className="w-3 h-3" /> Agent Plan
          </div>
          <p className="text-xs text-slate-300 whitespace-pre-wrap">{plan}</p>
        </div>
      )}

      <CreatedFilesList events={events} />

      {createdFiles && createdFiles.length > 0 && (
        <div className="mt-2 p-2 rounded-lg bg-slate-800/60 border border-slate-700">
          <div className="text-[10px] text-slate-500 mb-1 flex items-center gap-1">
            <FileCode className="w-3 h-3" /> Build output files ({createdFiles.length})
          </div>
          <div className="flex flex-col gap-0.5">
            {createdFiles.map((f, i) => (
              <span key={i} className="text-[11px] font-mono text-slate-400 pl-2">{f}</span>
            ))}
          </div>
        </div>
      )}

      {status === "error" && error && (
        <div className="flex items-center gap-2 text-red-400 text-xs p-2 mt-1 bg-red-950/30 rounded-lg border border-red-800">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {commit && (
        <div className="flex items-center gap-2 text-emerald-400 text-xs mt-2 flex-wrap">
          <GitCommit className="w-3.5 h-3.5 shrink-0" />
          <span>Deployed:</span>
          <code className="font-mono text-emerald-300">{commit.slice(0, 12)}</code>
          <a
            href="https://daveai.tech/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-violet-400 hover:text-violet-300 transition-colors underline"
          >
            View site <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {status === "streaming" && (
        <div className="flex items-center gap-1.5 text-blue-400 text-xs mt-1 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
          Agent running…
        </div>
      )}
    </div>
  );
}
