// DaveAI v7 - agents.js //

        // ── Agent states (read from agentStates SSOT — no circular DOM read) ──
        if (h && h.agents && h.agents.length) {
          h.agents.forEach(role => {
            const col = SB_AGENT_COL[role] || '#aaa';
            const task = (agentStates[role] && agentStates[role].task) || 'ready';
            parts.push(`<span style="color:${col}">${role.toUpperCase()} <span style="color:rgba(255,255,255,.3)">→</span> ${task}</span>`);
          });
        }

        // ── Tool count ──
        if (h && h.tools) parts.push(`<span style="color:rgba(255,255,255,.45)">${h.tools} TOOLS</span>`);

        // ── Pages ──
        if (p) {
          const arr = Array.isArray(p) ? p : (p.pages || []);
          if (arr.length) parts.push(`<span style="color:rgba(255,255,255,.45)">${arr.length} PAGES</span>`);
        }

        // ── Commits ──
        if (s) {
          const logText = s.log || s.git_log || s.output || s.stdout || '';
          const count = String(logText).split('\n').filter(l => l.trim()).length;
          if (count > 0) parts.push(`<span style="color:rgba(255,255,255,.45)">${count} COMMITS</span>`);
        }

        const ticker = document.getElementById('sb-ticker');
        if (ticker) ticker.innerHTML = parts.join(SB_SEP);

        // ── Dot colour ──
        const dot = document.getElementById('sb-dot');
        if (dot) dot.style.background = ok ? '#6EE7B7' : '#F87171';

        // ── Timestamp ──
        const ts = document.getElementById('sb-ts');
        if (ts) {
          const now = new Date();
          ts.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
      } catch (e) {
        const ts = document.getElementById('sb-ts');
        if (ts) ts.textContent = 'error';
      }
    }

    function startStatusBar() {
    async function fetchAgents() {
      try {
        // /api/agents/status returns {supervisor:{status,task,progress,model,ts}, coder:{...}, ...}
        const r = await fetch('/api/agents/status', { signal: AbortSignal.timeout(4000), headers: authHeaders() });
        if (!r.ok) throw new Error('agents ' + r.status);
        const data = await r.json();
        // data is {role: {status, task, progress, model, ts}, ...}
        const allRoles = ['supervisor', 'coder', 'qa', 'asset'];
        if (typeof data === 'object') {
          allRoles.forEach(role => {
            const info = data[role];
            if (info && typeof info === 'object') {
              updateAgentUI(role, info);
            } else {
              updateAgentUI(role, { state: 'idle', task: 'ready' });
            }
          });
        }
        // mark API online
    const agentStates = {};  // { supervisor: {state, task, model}, coder: {...}, ... }

    function updateAgentUI(role, info) {
      const shortMap = { supervisor: 'sv', coder: 'cd', 'qa agent': 'qa', qa: 'qa', asset: 'as' };
      const short = shortMap[role.toLowerCase()] || role.slice(0, 2);
      const state = (info.state || info.status || 'idle').toLowerCase();
      const task = info.task || info.current_task || 'ready';
      agentStates[role.toLowerCase()] = { state, task, model: info.model || '' };
              if (ev.agent) updateAgentUI(ev.agent, { state: ev.phase || 'working', task: (ev.msg || msg).slice(0, 30) });
              // supervisor attribution bar
              if (ev.type === 'plan' || (ev.agent === 'supervisor' && ev.msg)) {
                const tt = document.getElementById('tt');
                if (tt) tt.textContent = ev.msg || text;
              }
              if (ev.tool_call) addActivity(`Tool: ${ev.tool_call}`, 'tool');
              if (ev.file_written) {
                isBuildMode = true; // File writing means we're in build mode
                addActivity(`Wrote: ${ev.file_written}`, 'write');
                // Auto-set preview URL for HTML files, then refresh
                if (!currentPreviewUrl && ev.file_written.endsWith('.html')) {
                ['supervisor', 'coder', 'qa', 'asset'].forEach(r => updateAgentUI(r, { state: 'idle', task: 'ready' }));
                // Only show build complete notifications if we were actually building
                if (isBuildMode) {
                  if (bst) { bstText.textContent = 'Complete'; setTimeout(() => { bst.style.display = 'none'; }, 2000); }
      fetchAgents();
      startStatsPolling();
      // agent status every 5s
      setInterval(fetchAgents, 5000);
      // health every 30s
