"use client";
/**
 * lib/sse.ts — useStream() hook consuming structured v1 SSE events from /stream.
 */
import { useRef, useState, useCallback } from "react";

declare const process: { env: Record<string, string | undefined> };
const BASE = ((process?.env?.NEXT_PUBLIC_AGENT_HTTP) ?? "https://daveai.tech/api").replace(/\/$/, "");

// ── Event types emitted by brain_events.py ────────────────────────────────────

export type EventType =
  | "start" | "end" | "step" | "action" | "token"
  | "tool" | "observe" | "plan" | "error" | "ping" | "done";

export interface StreamEvent {
  type: EventType;
  seq?: number;
  span?: string;
  agent?: string;
  msg?: string;
  progress?: number;
  tool?: string;
  args?: Record<string, unknown>;
  result?: string;
  token?: string;
  ts?: string;
  id?: string;
  commit?: string;
  plan?: string;
  preview_url?: string;
  created_files?: string[];
}

export interface StreamState {
  events: StreamEvent[];
  tokens: string;        // accumulated token stream
  progress: number;
  status: "idle" | "streaming" | "done" | "error";
  error?: string;
  commit?: string;
  plan?: string;
  preview_url?: string;
  created_files?: string[];
}

const INIT: StreamState = {
  events: [], tokens: "", progress: 0, status: "idle",
};

export function useStream() {
  const [state, setState] = useState<StreamState>(INIT);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async (message: string) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Activity-based timeout: resets on every received event.
    // If no data arrives for 120s, assume backend hung.
    let timeoutId: ReturnType<typeof setTimeout> = undefined as unknown as ReturnType<typeof setTimeout>;
    const resetTimeout = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        ctrl.abort();
        setState((s: StreamState) => ({
          ...s, status: "error",
          error: "No response from agent for 2 minutes",
        }));
      }, 120_000); // 2 minutes — matches nginx proxy_read_timeout
    };
    resetTimeout();

    let cleanClose = false;
    setState({ ...INIT, status: "streaming" });

    try {
      const res = await fetch(`${BASE}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        setState((s: StreamState) => ({ ...s, status: "error", error: `HTTP ${res.status}` }));
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += dec.decode(value, { stream: true });
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? "";

        for (const line of lines) {
          const cleanLine = line.replace(/\r$/, "");
          if (!cleanLine.startsWith("data: ")) continue;
          const raw = cleanLine.slice(6).trim();
          if (!raw) continue;

          let ev: StreamEvent;
          try { ev = JSON.parse(raw); } catch { continue; }
          resetTimeout();

          setState((s: StreamState) => {
            const next: StreamState = {
              ...s,
              events: [...s.events, ev],
              progress: ev.progress ?? s.progress,
            };

            if (ev.type === "token" && ev.token) {
              next.tokens = s.tokens + ev.token;
            }
            if (ev.type === "end" || ev.type === "done") {
              cleanClose = true;
              next.status = "done";
              next.commit = ev.commit ?? s.commit;
              next.plan = ev.plan ?? s.plan;
              next.preview_url = ev.preview_url ?? s.preview_url;
              next.created_files = ev.created_files ?? s.created_files;
            }
            if (ev.type === "error") {
              next.status = "error";
              next.error = ev.msg ?? "Unknown error";
            }

            return next;
          });
        }
      }

      clearTimeout(timeoutId);
      setState((s: StreamState) => s.status === "streaming"
        ? {
            ...s,
            status: cleanClose ? "done" : "error",
            error: cleanClose ? s.error : "Stream ended unexpectedly — the build may have timed out or the connection dropped.",
          }
        : s
      );
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if ((err as Error)?.name === "AbortError") return;
      setState((s: StreamState) => ({
        ...s, status: "error",
        error: (err as Error)?.message ?? "Connection error",
      }));
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setState(s => ({ ...s, status: "idle" }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INIT);
  }, []);

  return { state, send, stop, reset };
}
