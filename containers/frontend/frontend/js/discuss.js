// DaveAI v7 - discuss.js — Multi-Agent Discussion Engine UI
// Wires to: POST /api/discuss/start, GET /api/discuss/{id}/run (SSE), POST /api/discuss/{id}/inject

    // ══ DISCUSS PANEL STATE ═════════════════════════════════════
    let _discActive = null;      // current discussion id
    let _discReader = null;      // active SSE reader
    let _discAgentSel = new Set(['alice', 'charlotte', 'george']); // default agents

    const DISCUSS_AGENTS = [
      { id: 'alice',    name: 'Alice',    role: 'Orchestrator', color: '#D8B4FE', icon: 'fa-crown' },
      { id: 'charlotte',name: 'Charlotte',role: 'Coder',        color: '#93C5FD', icon: 'fa-code' },
      { id: 'george',   name: 'George',   role: 'Reasoning',    color: '#6EE7B7', icon: 'fa-brain' },
      { id: 'sophia',   name: 'Sophia',   role: 'Vision/UX',    color: '#FCD34D', icon: 'fa-eye' },
      { id: 'daniel',   name: 'Daniel',   role: 'Automation',   color: '#fb923c', icon: 'fa-terminal' },
      { id: 'emma',     name: 'Emma',     role: 'Comms/Docs',   color: '#f472b6', icon: 'fa-pen' },
    ];

    // ── Open discuss panel with optional pre-filled topic ─────
    function openDiscussPanel(topic) {
      setRpTab('discuss');
      if (topic) {
        const topicEl = document.getElementById('discuss-topic');
        if (topicEl) { topicEl.value = topic; topicEl.focus(); }
      }
    }

    // ── Render discuss panel HTML ─────────────────────────────
    function renderDiscussPanel() {
      const el = document.getElementById('discuss-panel');
      if (!el) return;

      el.innerHTML = `
        <div style="padding:10px 8px;display:flex;flex-direction:column;gap:8px;height:100%;box-sizing:border-box">

          <!-- Topic input -->
          <div style="display:flex;flex-direction:column;gap:4px">
            <label style="font-size:9px;color:var(--t3);text-transform:uppercase;letter-spacing:.06em">Discussion Topic</label>
            <textarea id="discuss-topic" placeholder="What should the agents discuss? e.g. 'How to add a login system with OAuth'" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:7px 9px;font-size:11px;color:var(--t1);resize:none;height:54px;font-family:inherit" rows="2"></textarea>
          </div>

          <!-- Agent selector -->
          <div>
            <div style="font-size:9px;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Agents</div>
            <div id="discuss-agents" style="display:flex;flex-wrap:wrap;gap:4px">
              ${DISCUSS_AGENTS.map(a => `
                <div class="disc-agent-chip ${_discAgentSel.has(a.id)?'on':''}"
                     data-id="${a.id}" onclick="_discToggleAgent('${a.id}',this)"
                     title="${a.role}"
                     style="display:flex;align-items:center;gap:4px;padding:3px 7px;border-radius:12px;font-size:10px;cursor:pointer;border:1px solid ${a.color}33;color:${a.color};background:${_discAgentSel.has(a.id)?a.color+'22':'transparent'};transition:all .15s">
                  <i class="fas ${a.icon}" style="font-size:8px"></i>${a.name}
                </div>`).join('')}
            </div>
          </div>

          <!-- Controls row -->
          <div style="display:flex;gap:5px">
            <button onclick="_discStart()" style="flex:1;padding:6px;background:linear-gradient(135deg,#7C3AED,#9333EA);border:none;border-radius:6px;color:#fff;font-size:11px;cursor:pointer;font-weight:600">
              <i class="fas fa-comments" style="margin-right:4px;font-size:10px"></i>Start Discussion
            </button>
            <button onclick="_discStop()" style="padding:6px 10px;background:rgba(239,68,68,.2);border:1px solid rgba(239,68,68,.3);border-radius:6px;color:#F87171;font-size:11px;cursor:pointer" title="Stop">
              <i class="fas fa-stop"></i>
            </button>
          </div>

          <!-- Discussion transcript -->
          <div id="discuss-feed" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:4px;min-height:0">
            <div style="color:var(--t3);font-size:10px;text-align:center;padding:16px 0">Start a discussion to see agents collaborate in real-time</div>
          </div>

          <!-- User inject -->
          <div style="display:flex;gap:5px">
            <input id="discuss-inject" placeholder="Inject message into discussion..." style="flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:5px;padding:5px 8px;font-size:10.5px;color:var(--t1)" onkeydown="if(event.key==='Enter')_discInject()">
            <button onclick="_discInject()" style="padding:5px 9px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:5px;color:var(--t2);font-size:10px;cursor:pointer" title="Send">
              <i class="fas fa-paper-plane"></i>
            </button>
          </div>
        </div>`;
    }

    // ── Toggle agent selection ────────────────────────────────
    function _discToggleAgent(id, el) {
      if (_discAgentSel.has(id)) {
        if (_discAgentSel.size <= 2) return; // minimum 2 agents
        _discAgentSel.delete(id);
        el.classList.remove('on');
        const ag = DISCUSS_AGENTS.find(a => a.id === id);
        if (ag) { el.style.background = 'transparent'; }
      } else {
        _discAgentSel.add(id);
        el.classList.add('on');
        const ag = DISCUSS_AGENTS.find(a => a.id === id);
        if (ag) { el.style.background = ag.color + '22'; }
      }
    }

    // ── Append turn bubble ────────────────────────────────────
    function _discAddTurn(turn) {
      const feed = document.getElementById('discuss-feed');
      if (!feed) return;
      const ag = DISCUSS_AGENTS.find(a => a.id === turn.agentId) || { name: turn.agentName || turn.agentId, color: '#94a3b8', icon: 'fa-robot' };
      const empty = feed.querySelector('[style*="Start a discussion"]');
      if (empty) empty.remove();
      const div = document.createElement('div');
      div.style.cssText = 'background:rgba(255,255,255,.04);border-radius:7px;padding:7px 9px;border-left:2px solid ' + ag.color;
      let content = turn.content || '';
      // Strip <thought> tags from display (internal reasoning)
      content = content.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
      div.innerHTML = `<div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">
        <i class="fas ${ag.icon}" style="font-size:9px;color:${ag.color}"></i>
        <span style="font-size:10px;font-weight:600;color:${ag.color}">${ag.name}</span>
        <span style="font-size:8.5px;color:var(--t3);margin-left:auto">${turn.role||''}</span>
      </div>
      <div style="font-size:10.5px;color:var(--t2);line-height:1.5">${escHtml(content).replace(/\n/g,'<br>')}</div>`;
      feed.appendChild(div);
      feed.scrollTop = feed.scrollHeight;
    }

    // ── Start discussion ──────────────────────────────────────
    async function _discStart() {
      const topicEl = document.getElementById('discuss-topic');
      const topic = (topicEl?.value || '').trim();
      if (!topic) { topicEl?.focus(); return; }

      const feed = document.getElementById('discuss-feed');
      if (feed) feed.innerHTML = '<div style="color:var(--t3);font-size:10px;text-align:center;padding:8px">Starting discussion...</div>';

      try {
        // Create discussion
        const createRes = await fetch('/api/discuss/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ topic, agents: Array.from(_discAgentSel), max_turns: 12 })
        });
        if (!createRes.ok) throw new Error('Failed to start: ' + createRes.status);
        const disc = await createRes.json();
        _discActive = disc.id;

        if (feed) feed.innerHTML = '';

        // Add topic header
        const header = document.createElement('div');
        header.style.cssText = 'background:rgba(124,58,237,.15);border:1px solid rgba(124,58,237,.25);border-radius:6px;padding:6px 9px;font-size:10px;color:#D8B4FE;margin-bottom:2px';
        header.innerHTML = '<i class="fas fa-comments" style="margin-right:5px;font-size:9px"></i>' + escHtml(topic);
        if (feed) feed.appendChild(header);

        // Stream the discussion via SSE
        const runRes = await fetch('/api/discuss/' + _discActive + '/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({})
        });
        if (!runRes.ok) throw new Error('Run failed: ' + runRes.status);

        _discReader = runRes.body.getReader();
        const dec = new TextDecoder();

        while (true) {
          const { done, value } = await _discReader.read();
          if (done) break;
          dec.decode(value, { stream: true }).split('\n').forEach(line => {
            if (!line.startsWith('data:')) return;
            const raw = line.slice(5).trim();
            if (raw === '[DONE]') return;
            try {
              const ev = JSON.parse(raw);
              if (ev.type === 'turn_added' && ev.turn) _discAddTurn(ev.turn);
              if (ev.type === 'discussion_completed') {
                const done = document.createElement('div');
                done.style.cssText = 'text-align:center;font-size:9px;color:var(--t3);padding:6px;border-top:1px solid rgba(255,255,255,.06)';
                done.innerHTML = '<i class="fas fa-check-circle" style="color:#6EE7B7;margin-right:4px"></i>Discussion complete';
                if (feed) feed.appendChild(done);
              }
            } catch {}
          });
        }
      } catch (e) {
        if (feed) {
          const err = document.createElement('div');
          err.style.cssText = 'color:#F87171;font-size:10px;padding:8px;text-align:center';
          err.textContent = 'Error: ' + e.message;
          feed.appendChild(err);
        }
      }
    }

    // ── Stop discussion ───────────────────────────────────────
    function _discStop() {
      if (_discReader) { _discReader.cancel(); _discReader = null; }
      _discActive = null;
    }

    // ── Inject user message ───────────────────────────────────
    async function _discInject() {
      if (!_discActive) return;
      const inp = document.getElementById('discuss-inject');
      const content = (inp?.value || '').trim();
      if (!content) return;
      if (inp) inp.value = '';
      try {
        await fetch('/api/discuss/' + _discActive + '/inject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ content })
        });
        _discAddTurn({ agentId: 'user', agentName: 'You', content, role: 'user', color: '#60a5fa', icon: 'fa-user' });
      } catch (e) { console.warn('Inject failed:', e); }
    }
