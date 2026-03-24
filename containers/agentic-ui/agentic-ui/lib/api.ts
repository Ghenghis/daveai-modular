/**
 * lib/api.ts — typed TypeScript client for all 20+ DaveAI brain endpoints.
 * Base URL read from NEXT_PUBLIC_AGENT_HTTP env var.
 */

declare const process: { env: Record<string, string | undefined> };
const BASE = ((process?.env?.NEXT_PUBLIC_AGENT_HTTP) ?? "https://daveai.tech/api").replace(/\/$/, "");

async function req<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AgentStatus {
  status: "idle" | "working" | "running" | "done" | "error";
  task: string;
  progress: number;
  model: string;
  ts: string;
}

export interface AgentsStatusResponse {
  agents: Record<string, AgentStatus>;
  ts: string;
}

export interface Page {
  id: string;
  site: string;
  name: string;
  path: string;
  template: string;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface Project {
  name: string;
  path: string;
  active: boolean;
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface BuildEntry {
  id: number;
  agent: string;
  task: string;
  outcome: string;
  commit?: string;
  duration_s?: number;
  ts: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  workspace: string;
  public_dir: string;
  tools: number;
  skills_loaded: boolean;
  agents: string[];
  ts: string;
}

export interface ToolEntry {
  name: string;
  description: string;
}

export interface ToolsResponse {
  total: number;
  loaded: number;
  by_role: Record<string, number>;
  tools: ToolEntry[];
}

export interface AnalyticsEvent {
  id: number;
  event: string;
  detail: string;
  ts: string;
}

export interface AdminLoginResponse {
  token: string;
  email: string;
}

// ── Agents ─────────────────────────────────────────────────────────────────────

export const getAgentsStatus = (): Promise<AgentsStatusResponse> =>
  req("GET", "/agents/status");

export const agentStop = (): Promise<{ status: string; streams_closed: number }> =>
  req("POST", "/agent/stop", {});

export const setAgentModel = (role: string, model: string, token: string): Promise<{ status: string; role: string; model: string }> =>
  req("POST", `/agents/${role}/model`, { model }, token);

// ── Admin ──────────────────────────────────────────────────────────────────────

export const adminLogin = (password: string): Promise<AdminLoginResponse> =>
  req("POST", "/admin/login", { password });

export const adminChangePassword = (password: string, token: string): Promise<{ status: string }> =>
  req("POST", "/admin/password", { password }, token);

// ── Vault ─────────────────────────────────────────────────────────────────────

export const getVault = (token: string): Promise<Record<string, string>> =>
  req("GET", "/vault", undefined, token);

export const setVault = (data: Record<string, string>, token: string): Promise<{ status: string }> =>
  req("POST", "/vault", data, token);

// ── Pages ─────────────────────────────────────────────────────────────────────

export const getPages = (site?: string): Promise<{ pages: Page[] }> =>
  req("GET", site ? `/pages?site=${site}` : "/pages?site=main");

export const createPage = (
  name: string, site = "main", template = "blank"
): Promise<Page> =>
  req("POST", "/pages", { name, site, template });

export const updatePage = (
  id: string, data: Partial<Pick<Page, "name">>
): Promise<{ status: string }> =>
  req("PUT", `/pages/${id}`, data);

export const deletePage = (id: string, token: string): Promise<{ status: string }> =>
  req("DELETE", `/pages/${id}`, undefined, token);

// ── Projects ──────────────────────────────────────────────────────────────────

export const getProjects = (): Promise<{ projects: Project[] }> =>
  req("GET", "/projects");

// ── Tools ─────────────────────────────────────────────────────────────────────

export const getTools = (role = "all"): Promise<ToolsResponse> =>
  req("GET", `/tools?role=${role}`);

// ── Git / Build ───────────────────────────────────────────────────────────────

export const getLog = (n = 20): Promise<{ log: GitCommit[]; builds: BuildEntry[] }> =>
  req("GET", `/log?n=${n}`);

export const rollback = (ref: string, token: string): Promise<{ status: string; rolled_back_to: string }> =>
  req("POST", "/rollback", { ref }, token);

// ── System ────────────────────────────────────────────────────────────────────

export const getHealth = (): Promise<HealthResponse> =>
  req("GET", "/health");

export const getStatus = () =>
  req<{ version: string; workspace: string; log: GitCommit[]; agents: Record<string, AgentStatus>; builds: BuildEntry[] }>("GET", "/status");

export const getAnalytics = (token: string): Promise<{ events: AnalyticsEvent[] }> =>
  req("GET", "/analytics", undefined, token);

export interface WatchdogService {
  status: string;
  latency_ms: number;
}

export const getWatchdog = (token: string) =>
  req<{ services: Record<string, WatchdogService> }>("GET", "/watchdog", undefined, token);

// ── Deploy ───────────────────────────────────────────────────────────────────

export interface DeployResult {
  status: string;
  environment: string;
  commit?: string;
  url?: string;
  error?: string;
}

export const deployStaging = (token: string): Promise<DeployResult> =>
  req("POST", "/deploy/staging", {}, token);

export const deployProduction = (token: string): Promise<DeployResult> =>
  req("POST", "/deploy/production", {}, token);

// ── Discussions ──────────────────────────────────────────────────────────────

export interface Discussion {
  id: string;
  title: string;
  status: string;
  participants: string[];
  messages: DiscussionMessage[];
  created_at: string;
}

export interface DiscussionMessage {
  role: string;
  content: string;
  ts: string;
}

export const getDiscussions = (): Promise<{ discussions: Discussion[] }> =>
  req("GET", "/discuss");

export const createDiscussion = (
  title: string, participants: string[], prompt: string,
): Promise<Discussion> =>
  req("POST", "/discuss", { title, participants, prompt });

export const getDiscussion = (id: string): Promise<Discussion> =>
  req("GET", `/discuss/${id}`);

export const replyDiscussion = (
  id: string, role: string, content: string,
): Promise<{ status: string }> =>
  req("POST", `/discuss/${id}/reply`, { role, content });

// ── Memory ───────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  key: string;
  value: string;
  agent?: string;
  ts: string;
}

export const getMemory = (token: string): Promise<{ memories: MemoryEntry[] }> =>
  req("GET", "/memory", undefined, token);

export const saveMemory = (
  key: string, value: string, agent: string, token: string,
): Promise<{ status: string }> =>
  req("POST", "/memory", { key, value, agent }, token);

// ── TTS (edge-tts-server via nginx) ──────────────────────────────────────────

export interface Voice {
  id: string;
  name: string;
  lang: string;
  gender: string;
}

export const getVoices = (): Promise<Voice[]> =>
  req("GET", "/voices");

export const getAgentVoices = (): Promise<Record<string, string>> =>
  req("GET", "/agents/voices");

export async function speakText(text: string, voice?: string): Promise<Blob> {
  const res = await fetch(`${BASE.replace("/api", "")}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: text, voice: voice ?? "en-US-GuyNeural" }),
  });
  if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
  return res.blob();
}

// ── Checkpoint / Budget ──────────────────────────────────────────────────────

export const getCheckpointStatus = (token: string) =>
  req<{ checkpoint: string; status: string; ts: string }>("GET", "/checkpoint/status", undefined, token);

export const getBudgetStatus = (token: string) =>
  req<{ budget: Record<string, unknown>; limits: Record<string, unknown> }>("GET", "/budget/status", undefined, token);
