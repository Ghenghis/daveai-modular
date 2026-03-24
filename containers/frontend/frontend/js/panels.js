// DaveAI v7 - panels.js //

    // ══ PANEL SWITCHING ══
    function setPanel(p) {
      curPanel = p;
      ['preview', 'build', 'analytics', 'admin'].forEach(t => {
        const btn = document.getElementById('pt-' + t); if (btn) btn.classList.toggle('on', t === p);
      });
      ['preview', 'code'].forEach(t => { const ct = document.getElementById('ct-' + t); if (ct) ct.classList.toggle('on', t === p); });
      const bf = document.getElementById('bframe');
      const bp = document.getElementById('build-panel');
      const ap = document.getElementById('analytics-panel');
      const adp = document.getElementById('admin-panel');
      bf.style.display = p === 'preview' || p === 'code' ? 'flex' : 'none';
      bp.classList.toggle('vis', p === 'build');
      ap.classList.toggle('vis', p === 'analytics');
      adp.classList.toggle('vis', p === 'admin');
      if (p === 'build' && typeof _refreshBuildTimeline === 'function') _refreshBuildTimeline();
    }
    function setCtab(t) {
      document.querySelectorAll('.ctab:not(.dev-mode)').forEach(el => el.classList.remove('on'));
      const ct = document.getElementById('ct-' + t); if (ct) ct.classList.add('on');
      setPanel(t);
    }

    // ══ FLY-OUT PANEL ══
    function togglePp(tab) {
      const pp = document.getElementById('pp');
      if (!ppOpen) { ppOpen = true; pp.classList.add('open'); setFpTab(tab || 'pages'); updateSbActive(tab); }
      else if (curFpTab === tab) { ppOpen = false; pp.classList.remove('open'); clearSbActive(); }
      else { setFpTab(tab || 'pages'); updateSbActive(tab); }
    }
    let _ppTimerId = null;
    let _ppTimerStart = 0;
    const PP_AUTO_HIDE_MS = 180000; // 3 minutes

    function closePp() {
      ppOpen = false;
      document.getElementById('pp').classList.remove('open');
      clearSbActive();
      // Show pull-tab when panel closes
      const tab = document.getElementById('pp-pull-tab');
      if (tab) tab.classList.remove('hidden');
      // Clear auto-hide timer
      if (_ppTimerId) { clearInterval(_ppTimerId); _ppTimerId = null; }
      const bar = document.getElementById('pp-timer-bar');
      if (bar) bar.style.width = '0%';
    }

    function openPpWithTimer(fpTab) {
      togglePp(fpTab || curFpTab || 'projects');
      // Hide pull-tab when panel opens
      const tab = document.getElementById('pp-pull-tab');
      if (tab) tab.classList.add('hidden');
      // Start auto-hide countdown (3 min)
      _startPpTimer();
    }

    function _startPpTimer() {
      if (_ppTimerId) clearInterval(_ppTimerId);
      _ppTimerStart = Date.now();
      const bar = document.getElementById('pp-timer-bar');
      if (bar) { bar.style.width = '100%'; bar.style.transition = 'none'; }
      requestAnimationFrame(() => {
        if (bar) { bar.style.transition = 'width ' + (PP_AUTO_HIDE_MS / 1000) + 's linear'; bar.style.width = '0%'; }
      });
      _ppTimerId = setInterval(() => {
        const elapsed = Date.now() - _ppTimerStart;
        if (elapsed >= PP_AUTO_HIDE_MS) {
          closePp();
        }
      }, 1000);
    }

    // Reset timer on any interaction inside the panel
    //  CTRL+K COMMAND PALETTE
    // ══════════════════════════════════════════════════════════
    const _CMD_PALETTE_ITEMS = [
      { label: 'New Page', icon: 'fa-file-alt', action: () => { togglePp('pages'); } },
      { label: 'Open Projects', icon: 'fa-th-large', action: () => { togglePp('projects'); } },
      { label: 'Open Database', icon: 'fa-database', action: () => { togglePp('database'); } },
      { label: 'Open Skills', icon: 'fa-magic', action: () => { togglePp('skills'); } },
      { label: 'Open Tools (113)', icon: 'fa-wrench', action: () => { togglePp('tools'); } },
      { label: 'Open Agents', icon: 'fa-robot', action: () => { togglePp('agents'); } },
      { label: 'Toggle Right Panel', icon: 'fa-columns', action: () => { toggleRp(); } },
      { label: 'Toggle Dark/Light', icon: 'fa-moon', action: () => { if (typeof toggleTheme === 'function') toggleTheme(); } },
      { label: 'Clear Chat', icon: 'fa-trash', action: () => { const f = document.getElementById('chat-feed'); if (f) f.innerHTML = ''; } },
      { label: 'Launch Game', icon: 'fa-gamepad', action: () => { if (typeof launchGame === 'function') launchGame(); } },
      { label: 'Cycle Chat Mode', icon: 'fa-comments', action: () => { dvCycleChatMode(); } },
      { label: 'Toggle Mic', icon: 'fa-microphone', action: () => { toggleMic(); } },
      { label: 'Keyboard Shortcuts', icon: 'fa-keyboard', action: () => { _showShortcuts(); } },
      { label: 'Edit Profile', icon: 'fa-user-pen', action: () => { openProfileModal(); } },
      { label: 'Export Chat', icon: 'fa-download', action: () => { _exportChat(); } },
      { label: 'Build Timeline', icon: 'fa-hammer', action: () => { setPanel('build'); } },
    ];

    function _openCmdPalette() {
      let overlay = document.getElementById('cmd-palette-overlay');
      if (overlay) { overlay.style.display = 'flex'; document.getElementById('cmd-palette-input').value = ''; _filterCmdPalette(''); document.getElementById('cmd-palette-input').focus(); return; }
      overlay = document.createElement('div');
      overlay.id = 'cmd-palette-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;justify-content:center;padding-top:18vh;z-index:99999;backdrop-filter:blur(4px)';
      overlay.onclick = (e) => { if (e.target === overlay) _closeCmdPalette(); };
      const box = document.createElement('div');
      box.style.cssText = 'width:440px;max-height:400px;background:rgba(20,20,35,.97);border:1px solid rgba(99,102,241,.4);border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.6);display:flex;flex-direction:column;overflow:hidden';
      box.innerHTML = '<div style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">'
        + '<i class="fas fa-search" style="color:var(--t3);font-size:11px"></i>'
        + '<input id="cmd-palette-input" type="text" placeholder="Type a command…" style="flex:1;background:none;border:none;color:var(--t1);font-size:13px;outline:none;font-family:inherit" oninput="_filterCmdPalette(this.value)" onkeydown="_cmdPaletteKey(event)">'
        + '<kbd style="font-size:9px;color:var(--t3);background:rgba(255,255,255,.06);padding:2px 6px;border-radius:3px;border:1px solid rgba(255,255,255,.1)">Esc</kbd>'
        + '</div>'
        + '<div id="cmd-palette-list" style="flex:1;overflow-y:auto;padding:4px 0"></div>';
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      _filterCmdPalette('');
      document.getElementById('cmd-palette-input').focus();
    }
    function _closeCmdPalette() {
      const o = document.getElementById('cmd-palette-overlay');
      if (o) o.style.display = 'none';
    }
    let _cmdPaletteIdx = 0;
    function _filterCmdPalette(q) {
      const list = document.getElementById('cmd-palette-list');
      if (!list) return;
      const lq = q.toLowerCase();
      const filtered = _CMD_PALETTE_ITEMS.filter(c => c.label.toLowerCase().includes(lq));
      _cmdPaletteIdx = 0;
      list.innerHTML = filtered.map((c, i) =>
        '<div class="cmd-item' + (i === 0 ? ' active' : '') + '" data-idx="' + i + '" onclick="_runCmdPalette(' + _CMD_PALETTE_ITEMS.indexOf(c) + ')" onmouseenter="_cmdPaletteHover(' + i + ')" style="display:flex;align-items:center;gap:10px;padding:8px 14px;cursor:pointer;font-size:12px;color:var(--t1);transition:background .1s">'
        + '<i class="fas ' + c.icon + '" style="font-size:11px;color:#818cf8;width:16px;text-align:center"></i>'
        + c.label + '</div>'
      ).join('');
      list.querySelectorAll('.cmd-item').forEach(el => {
        el.addEventListener('mouseenter', () => el.style.background = 'rgba(99,102,241,.12)');
        el.addEventListener('mouseleave', function () { if (!this.classList.contains('active')) this.style.background = ''; });
      });
      _updateCmdHighlight(list);
    }
    function _cmdPaletteHover(idx) { _cmdPaletteIdx = idx; _updateCmdHighlight(document.getElementById('cmd-palette-list')); }
    function _updateCmdHighlight(list) {
      if (!list) return;
      list.querySelectorAll('.cmd-item').forEach((el, i) => {
        el.classList.toggle('active', i === _cmdPaletteIdx);
        el.style.background = i === _cmdPaletteIdx ? 'rgba(99,102,241,.12)' : '';
      });
    }
    function _cmdPaletteKey(e) {
      const list = document.getElementById('cmd-palette-list');
      const items = list ? list.querySelectorAll('.cmd-item') : [];
      if (e.key === 'ArrowDown') { e.preventDefault(); _cmdPaletteIdx = Math.min(_cmdPaletteIdx + 1, items.length - 1); _updateCmdHighlight(list); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); _cmdPaletteIdx = Math.max(_cmdPaletteIdx - 1, 0); _updateCmdHighlight(list); }
      else if (e.key === 'Enter') { e.preventDefault(); const active = items[_cmdPaletteIdx]; if (active) active.click(); }
      else if (e.key === 'Escape') { _closeCmdPalette(); }
    }
    function _runCmdPalette(idx) {
      _closeCmdPalette();
      const cmd = _CMD_PALETTE_ITEMS[idx];
      if (cmd && cmd.action) cmd.action();
    }
    // Ctrl+K listener + ? for shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); _openCmdPalette(); }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { _showShortcuts(); }
    });

    // ══════════════════════════════════════════════════════════
    //  KEYBOARD SHORTCUTS HELP PANEL
    // ══════════════════════════════════════════════════════════
    function _showShortcuts() {
      let ov = document.getElementById('shortcuts-ov');
      if (ov) { ov.style.display = 'flex'; return; }
      ov = document.createElement('div');
      ov.id = 'shortcuts-ov';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;justify-content:center;align-items:center;z-index:99999;backdrop-filter:blur(4px)';
      ov.onclick = (e) => { if (e.target === ov) _hideShortcuts(); };
      const shortcuts = [
        ['Ctrl + K', 'Open command palette'],
        ['Ctrl + Enter', 'Send message'],
        ['Ctrl + .', 'Toggle mic'],
        ['Ctrl + Shift + P', 'Open projects panel'],
        ['Ctrl + Shift + T', 'Open tools panel'],
        ['Ctrl + Shift + D', 'Open database panel'],
        ['Ctrl + B', 'Build panel'],
        ['Ctrl + \\', 'Toggle right panel'],
        ['?', 'Show this shortcuts panel'],
        ['Esc', 'Close modals / panels'],
      ];
      const box = document.createElement('div');
      box.style.cssText = 'width:420px;max-height:75vh;background:rgba(18,18,32,.98);border:1px solid rgba(99,102,241,.3);border-radius:14px;box-shadow:0 12px 50px rgba(0,0,0,.7);overflow-y:auto';
      let html = '<div style="padding:18px 22px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">'
        + '<span style="font-size:13px;font-weight:600;color:var(--t1)"><i class="fas fa-keyboard" style="margin-right:8px;color:#818cf8"></i>Keyboard Shortcuts</span>'
        + '<button onclick="_hideShortcuts()" style="background:none;border:none;color:var(--t3);font-size:16px;cursor:pointer">&times;</button></div>'
        + '<div style="padding:12px 22px 18px">';
      shortcuts.forEach(([key, desc]) => {
        html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.04)">'
          + '<span style="font-size:11px;color:var(--t2)">' + desc + '</span>'
          + '<kbd style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:4px;padding:2px 8px;font-size:10px;color:#a5b4fc;font-family:\'Fira Code\',Consolas,monospace;min-width:40px;text-align:center">' + key + '</kbd>'
          + '</div>';
      });
      html += '</div>';
      box.innerHTML = html;
      ov.appendChild(box);
      document.body.appendChild(ov);
    }
    function _hideShortcuts() {
      const ov = document.getElementById('shortcuts-ov');
      if (ov) ov.style.display = 'none';
    }

    // ══════════════════════════════════════════════════════════
    //  BUILD TIMELINE — live from Brain API
    // ══════════════════════════════════════════════════════════
    async function _refreshBuildTimeline() {
      const list = document.getElementById('bt-list');
      if (!list) return;
      try {
        const _ah = { headers: typeof authHeaders === 'function' ? authHeaders() : {} };
        const [logRes, statusRes] = await Promise.allSettled([
          fetch('/api/log', _ah).then(r => r.ok ? r.json() : null),
          fetch('/api/status', _ah).then(r => r.ok ? r.json() : null),
        ]);
        const logs = logRes.status === 'fulfilled' && logRes.value ? (Array.isArray(logRes.value) ? logRes.value : logRes.value.builds || logRes.value.log || []) : [];
        const status = statusRes.status === 'fulfilled' && statusRes.value ? statusRes.value : {};
        const agentColors = { supervisor: 'var(--sv)', coder: 'var(--cd)', qa: 'var(--qa)', asset: 'var(--as)' };
        const statusColors = { pass: '#6EE7B7', fail: '#F87171', build: '#93C5FD', plan: '#D8B4FE', asset: '#FCD34D', deploy: '#f472b6' };
        if (!logs.length) {
          // Show status-based fallback
          const commit = status.commit || status.last_commit || '—';
          const branch = status.branch || 'main';
          list.innerHTML = '<div class="bt-item"><div class="bt-dot" style="background:var(--sv)"></div>'
            + '<div><span class="bt-status">LIVE</span> Branch: ' + escHtml(branch) + '<div class="bt-meta">Commit: ' + escHtml(String(commit).slice(0, 7)) + '</div></div></div>'
            + '<div style="padding:12px;text-align:center;color:var(--t3);font-size:10px">No recent build entries. Start a build via chat!</div>';
          return;
        }
        let html = '';
        logs.slice(0, 20).forEach(entry => {
          const agent = entry.agent || entry.role || 'system';
          const st = (entry.status || entry.type || 'build').toLowerCase();
          const dotColor = agentColors[agent.toLowerCase()] || '#94a3b8';
          const stColor = statusColors[st] || '#93C5FD';
          const stLabel = st.toUpperCase();
          const msg = entry.message || entry.msg || entry.description || entry.task || '—';
          const ts = entry.timestamp || entry.ts || entry.created_at || '';
          const ago = ts ? _timeAgo(new Date(ts)) : '';
          const commit = entry.commit || '';
          html += '<div class="bt-item">'
            + '<div class="bt-dot" style="background:' + dotColor + '"></div>'
            + '<div><span class="bt-status" style="color:' + stColor + '">' + stLabel + '</span> '
            + escHtml(agent) + ' · ' + escHtml(msg.slice(0, 80))
            + '<div class="bt-meta">' + (commit ? '<span class="bt-commit">' + escHtml(commit.slice(0, 7)) + '</span> · ' : '') + ago + '</div>'
            + '</div></div>';
        });
        list.innerHTML = html;
      } catch (e) {
        list.innerHTML = '<div style="padding:12px;text-align:center;color:var(--t3);font-size:10px">Could not load build data: ' + escHtml(e.message) + '</div>';
      }
    }
    function _timeAgo(d) {
      const s = Math.floor((Date.now() - d.getTime()) / 1000);
      if (s < 60) return s + 's ago';
      if (s < 3600) return Math.floor(s / 60) + 'm ago';
      if (s < 86400) return Math.floor(s / 3600) + 'h ago';
      return Math.floor(s / 86400) + 'd ago';
    }

    // ══════════════════════════════════════════════════════════
    //  REAL-TIME STATS — pulls live data from Brain API
    //  No mocked values. All live endpoints confirmed:
    //  /api/pages (page count) · /api/status (commits) · /api/health (uptime) · /api/log (builds)
    // ══════════════════════════════════════════════════════════
    async function fetchStats() {
      try {
        // Parallel fetch from confirmed live endpoints
        const _ah = { headers: authHeaders() };
        const [pagesRes, statusRes, healthRes, logRes] = await Promise.allSettled([
          fetch('/api/pages', _ah).then(r => r.ok ? r.json() : null),
          fetch('/api/status', _ah).then(r => r.ok ? r.json() : null),
          fetch('/api/health', _ah).then(r => r.ok ? r.json() : null),
          fetch('/api/log', _ah).then(r => r.ok ? r.json() : null),
        ]);

        // ── Pages stat ──
        if (pagesRes.status === 'fulfilled' && pagesRes.value) {
          const pages = pagesRes.value;
          const arr = Array.isArray(pages) ? pages : (pages.pages || pages.data || []);
          const total = arr.length;
          const pub = arr.filter(p => p.status === 'published' || p.published === true).length;
          setStat('pages', String(total), `${pub} published`);
        }

        // ── Builds stat ── (/api/log returns build log entries)
        if (logRes.status === 'fulfilled' && logRes.value) {
          const bld = logRes.value;
          const arr = Array.isArray(bld) ? bld : (bld.builds || bld.history || bld.data || bld.entries || []);
          const today = new Date().toDateString();
          const todayBuilds = arr.filter(b => {
            const d = b.created_at || b.timestamp || b.date || '';
            return d && new Date(d).toDateString() === today;
          }).length;
          const displayBuilds = todayBuilds > 0 ? todayBuilds : (bld.count || bld.total || arr.length || 0);
          setStat('builds', String(displayBuilds), 'total logged');
        }

        // ── Commits stat ── (/api/status returns git log output)
        if (statusRes.status === 'fulfilled' && statusRes.value) {
          const s = statusRes.value;
          const logText = s.log || s.git_log || s.output || s.stdout || '';
          const count = String(logText).split('\n').filter(l => l.trim()).length;
          if (count > 0) setStat('commits', String(count), 'recent');
        }

        // ── Uptime stat ──
        if (healthRes.status === 'fulfilled' && healthRes.value) {
          const h = healthRes.value;
          const uptimeSec = h.uptime_seconds || h.uptime || 0;
          let upPct = '—';
          if (uptimeSec > 0) {
            const window30d = 30 * 24 * 3600;
            const pct = Math.min(100, ((Math.min(uptimeSec, window30d) / window30d) * 100)).toFixed(1);
            upPct = pct + '%';
          } else if (h.uptime_pct) { upPct = h.uptime_pct + '%'; }
          setStat('uptime', upPct, '30d avg');
      // update sub-label in right panel .ms (sibling of rp-*)
      const rpEl = document.getElementById('rp-' + field);
      if (rpEl && sub) {
        const msEl = rpEl.parentElement?.querySelector('.ms');
        if (msEl) msEl.textContent = sub;
      }
    }

    // Poll stats every 15 seconds (real-time dashboard)
    function startStatsPolling() {
      fetchStats();
      setInterval(fetchStats, 15000);
    }

    // ══════════════════════════════════════════════════════════
    //  REAL-TIME CLOCK — timezone from user's IP via WorldTimeAPI
    //  Falls back to browser's Intl timezone if API unavailable
    // ══════════════════════════════════════════════════════════
    let clockTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    function startClock() {
      // Resolve timezone from user's IP
      fetch('https://worldtimeapi.org/api/ip', { signal: AbortSignal.timeout(3000) })
        .then(r => r.json())
        .then(d => { if (d && d.timezone) clockTz = d.timezone; })
        .catch(() => { }) // silently fall back to browser timezone
        .finally(() => { tickClock(); setInterval(tickClock, 1000); });
    }

    function tickClock() {
      const el = document.getElementById('tb-clock'); if (!el) return;
      const now = new Date();
      try {
        const fmtr = new Intl.DateTimeFormat('en-GB', {
          timeZone: clockTz, weekday: 'short', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        });
        const p = fmtr.formatToParts(now);
        const g = t => p.find(x => x.type === t)?.value || '';
        const tzShort = clockTz.includes('/') ? clockTz.split('/').pop().replace('_', ' ') : clockTz;
        el.innerHTML = `<i class="fas fa-clock" style="font-size:8px;opacity:.5"></i>`
          + `${g('weekday')} ${g('day')} ${g('month')} `
          + `<b style="color:var(--t1)">${g('hour')}:${g('minute')}:${g('second')}</b>`
          + ` <span style="opacity:.4;font-size:8px">${tzShort}</span>`;
      } catch (e) { el.textContent = now.toLocaleTimeString(); }
    }

    // ══════════════════════════════════════════════════════════
    //  PROMPT SUGGESTIONS BAR — 100 ideas, arrow-scrollable
    // ══════════════════════════════════════════════════════════
    // ══════════════════════════════════════════════════════════
    // Inject mode toggle into right panel header (called from init)
    function buildActivityHeader() {
      const rpHead = document.querySelector('#rp .rph');
      if (!rpHead || rpHead.querySelector('.act-mode-btn')) return;
      const toggle = document.createElement('div');
      toggle.style.cssText = 'display:flex;align-items:center;gap:2px;margin-left:auto;margin-right:4px';
      toggle.innerHTML = `
    <button class="act-mode-btn on" data-mode="normal" onclick="setActMode('normal')"
      style="padding:2px 7px;border-radius:10px;font-size:9px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:var(--t1);cursor:pointer;transition:all .15s">
      <i class="fas fa-eye" style="font-size:8px"></i> Visual
    </button>
    <button class="act-mode-btn" data-mode="coder" onclick="setActMode('coder')"
      style="padding:2px 7px;border-radius:10px;font-size:9px;border:1px solid rgba(255,255,255,.08);background:none;color:var(--t3);cursor:pointer;transition:all .15s">
      <i class="fas fa-terminal" style="font-size:8px"></i> Dev
    </button>`;
      rpHead.appendChild(toggle);
      // style toggle on-state via inline (no new stylesheet)
      document.addEventListener('click', e => {
        if (e.target.classList.contains('act-mode-btn')) {
          e.target.parentElement.querySelectorAll('.act-mode-btn').forEach(b => {
            if (b.classList.contains('on')) {
              b.style.background = 'rgba(255,255,255,.08)';
              b.style.color = 'var(--t1)';
              b.style.borderColor = 'rgba(255,255,255,.15)';
            } else {
              b.style.background = 'none';
              b.style.color = 'var(--t3)';
              b.style.borderColor = 'rgba(255,255,255,.08)';
            }
          });
        }
      });
    }

    // Rich event object fed to both modes
    function addRichActivity(opts) {
      // opts: { msg, type, agent, tool, file, hash, screenshot, step, total }
      const ev = { ...opts, ts: new Date(), id: 'ev' + Date.now() };
      normalActivities.push(ev);
      if (normalActivities.length > 300) normalActivities.shift();
      // always update coder log too
      addActivity(
        (opts.agent ? `[${opts.agent}] ` : '') + (opts.tool ? `${opts.tool}: ` : '') + opts.msg,
        opts.type || 'system'
      );
      // Voice narration for activity events
    // ══ RIGHT PANEL TOGGLE ══
    function toggleRp() {
      rpOpen = !rpOpen;
      const rp = document.getElementById('rp');
      const btn = document.getElementById('rp-tb');
      if (rp) rp.style.display = rpOpen ? 'flex' : 'none';
      if (btn) btn.classList.toggle('on', rpOpen);
    }

    function setRpTab(tab) {
      // HTML ids: rpt-activity / rpt-history for buttons, rp-activity-pane / rp-hist for panes
            const btnMap = { activity: 'rpt-activity', history: 'rpt-history', discuss: 'rpt-discuss' };
      const paneMap = { activity: 'rp-activity-pane', history: 'rp-hist', discuss: 'rp-discuss' };
      ['activity', 'history', 'discuss'].forEach(t => {
        const btn = document.getElementById(btnMap[t]);
        const pane = document.getElementById(paneMap[t]);
        if (btn) btn.classList.toggle('on', t === tab);
        if (pane) pane.style.display = t === tab ? 'flex' : 'none';
      });
    }

    // ══ VOICE MIC — WebSpeech API (primary) + MediaRecorder fallback ══
    let _speechRec = null, micActive = false, _micTimeout = null;
    const _hasWebSpeech = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

    function _initSpeechRec() {
      if (_speechRec) return _speechRec;
      if (!_hasWebSpeech) return null;
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      _speechRec = new SR();
      _speechRec.continuous = true;
      _speechRec.interimResults = true;
      _speechRec.lang = 'en-US';
      _speechRec.maxAlternatives = 1;

      let finalTranscript = '';
      // Reset transcript on each new start
      _speechRec.onstart = () => { finalTranscript = ''; };
      _speechRec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) { finalTranscript += t + ' '; }
          else { interim = t; }
        }
        const inp = document.getElementById('pi');
        if (inp) {
          inp.value = finalTranscript + interim;
          inp.style.height = 'auto';
          inp.style.height = inp.scrollHeight + 'px';
        }
        // Reset auto-stop timeout on each result
        clearTimeout(_micTimeout);
        _micTimeout = setTimeout(() => { if (micActive) toggleMic(); }, 8000);
      };
      _speechRec.onerror = (e) => {
        if (e.error === 'not-allowed') {
          addRichActivity({ msg: 'Microphone permission denied — check browser settings', type: 'error', agent: 'System' });
        } else if (e.error !== 'aborted') {
          addRichActivity({ msg: 'Voice: ' + e.error, type: 'error', agent: 'System' });
        }
        _stopMicUI();
      };
      _speechRec.onend = () => {
        if (micActive) {
          // Auto-restart if user hasn't stopped manually
          try { _speechRec.start(); } catch (e) { _stopMicUI(); }
        }
      };
      return _speechRec;
    }

    function _stopMicUI() {
      micActive = false;
      clearTimeout(_micTimeout);
      const btn = document.getElementById('mic');
      if (btn) { btn.classList.remove('mic-on'); btn.title = 'Voice input'; }
    }

    async function toggleMic() {
      const btn = document.getElementById('mic');
      if (!micActive) {
        // Try WebSpeech API first
        const rec = _initSpeechRec();
        if (rec) {
          try {
            rec.start();
            micActive = true;
            if (btn) { btn.classList.add('mic-on'); btn.title = 'Stop listening (8s auto-stop)'; }
            addRichActivity({ msg: 'Listening... speak now', type: 'system', agent: 'System' });
            // Auto-stop after 30s max as guard rail
            _micTimeout = setTimeout(() => { if (micActive) toggleMic(); }, 30000);
          } catch (e) {
            addRichActivity({ msg: 'Voice recognition failed to start', type: 'error', agent: 'System' });
          }
        } else {
          // Fallback: MediaRecorder → /api/transcribe
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRec = new MediaRecorder(stream);
            const chunks = [];
            mediaRec.ondataavailable = e => chunks.push(e.data);
            mediaRec.onstop = async () => {
              const blob = new Blob(chunks, { type: 'audio/webm' });
              const fd = new FormData(); fd.append('audio', blob, 'voice.webm');
              try {
                const r = await fetch('/api/transcribe', { method: 'POST', body: fd });
                const d = await r.json();
                if (d.text) {
                  const inp = document.getElementById('pi');
                  if (inp) { inp.value += d.text; inp.focus(); }
                }
              } catch (e) { addRichActivity({ msg: 'Voice transcription unavailable', type: 'error', agent: 'System' }); }
              stream.getTracks().forEach(t => t.stop());
              _stopMicUI();
            };
            mediaRec.start();
            micActive = true;
            btn._mediaRec = mediaRec;
            if (btn) { btn.classList.add('mic-on'); btn.title = 'Stop recording'; }
            // Auto-stop after 15s
            _micTimeout = setTimeout(() => { if (micActive) toggleMic(); }, 15000);
          } catch (e) { addRichActivity({ msg: 'Microphone access denied', type: 'error', agent: 'System' }); }
        }
      } else {
        // Stop
        if (_speechRec) { try { _speechRec.stop(); } catch (e) { } }
        const btn2 = document.getElementById('mic');
        if (btn2 && btn2._mediaRec && btn2._mediaRec.state === 'recording') btn2._mediaRec.stop();
        else _stopMicUI();
        micActive = false;
        clearTimeout(_micTimeout);
        if (btn) { btn.classList.remove('mic-on'); btn.title = 'Voice input'; }
        // Auto-send: if there's text in the input, call think()
        const _inp = document.getElementById('pi');
        if (_inp && _inp.value.trim()) {
          setTimeout(() => think(), 250);
        }
      }
    }

    // ══ IMAGE ATTACH ══
    function attachImg() {
      const fi = document.createElement('input');
      fi.type = 'file'; fi.accept = 'image/*';
      fi.onchange = async () => {
        const file = fi.files[0]; if (!file) return;
        const fd = new FormData(); fd.append('image', file);
        try {
          const r = await fetch('/api/upload-image', { method: 'POST', body: fd });
          const d = await r.json();
          if (d.url) {
            const inp = document.getElementById('pi');
            if (inp) inp.value += ' [image: ' + d.url + ']';
            addRichActivity({ msg: `Image attached: ${file.name}`, type: 'system', agent: 'System' });
          }
        } catch (e) { addRichActivity({ msg: 'Image upload unavailable', type: 'error', agent: 'System' }); }
      };
      fi.click();
    }

    // ══ CODE PASTE ══
    function pasteCode() {
      const inp = document.getElementById('pi'); if (!inp) return;
      inp.value += (inp.value ? '\n' : '') + '\`\`\`\n\n\`\`\`';
      const pos = inp.value.lastIndexOf('\n\`\`\`');
      inp.focus(); inp.setSelectionRange(pos, pos);
    }

    // ══ PREVIEW SYSTEM ══
    let currentPreviewUrl = '';

      buildActivityHeader();   // inject Visual/Dev toggle in right panel
      // Right panel tabs and action buttons are wired via inline onclick in HTML

      // Escape closes modals
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
          closeToolModal();
          closeLp();
          closeSettings();
          clearTgt();
        }
      });

      // PSB scrollbar hide style
      const style = document.createElement('style');
      style.textContent = '#psb::-webkit-scrollbar{display:none} .cb{margin:4px 8px} .cb-user .cb-inner{background:rgba(99,102,241,.2);border:1px solid rgba(99,102,241,.3);border-radius:10px 10px 2px 10px;padding:7px 10px;font-size:11px;color:var(--t1);max-width:85%;margin-left:auto} .cb-ai .cb-inner{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:2px 10px 10px 10px;padding:7px 10px;font-size:11px;color:var(--t1);max-width:95%} @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}';
      document.head.appendChild(style);

      // ── Show auth/login FIRST (intro plays AFTER successful login) ──
      _showAuthIfNeeded();

      console.log('[DaveAI v6] Initialised — 113 tools, 4 agents, live status bar');

      // ── PostgreSQL Sync: init DB session ──
      if (typeof _dbTrack === 'function') _dbTrack('page_view', { page: location.pathname });
      if (typeof _dbSyncUser === 'function') _dbSyncUser();

      // ── Session Heartbeat: track active users every 30s ──
      setInterval(() => {
        if (typeof _dbFetch === 'function') {
          _dbFetch('/session/heartbeat', {
            method: 'POST',
            body: JSON.stringify({
              session_id: typeof _dbSessionId !== 'undefined' ? _dbSessionId : 'unknown',
      // ── Dashboard cards: wire analytics + right panel to PostgreSQL ──
      _refreshDashboardCards();
      setInterval(_refreshDashboardCards, 30000);

      // ── Admin Dashboard: auto-refresh if admin ──
    // ── Wire analytics panel + right panel metric cards to PostgreSQL ──
    async function _refreshDashboardCards() {
      const d = await _dbGetDashboard();
      if (!d || !Object.keys(d).length) return;
      // Analytics panel cards (center)
      const anPages = document.getElementById('an-pages');
      const anBuilds = document.getElementById('an-builds');
      const anCommits = document.getElementById('an-commits');
      const anApi = document.getElementById('an-api');
      const anTokens = document.getElementById('an-tokens');
      if (anPages) { anPages.textContent = d.projects || 0; const sub = anPages.nextElementSibling; if (sub) sub.textContent = (d.users || 0) + ' users'; }
      if (anBuilds) { anBuilds.textContent = d.chat_messages || 0; const sub = anBuilds.nextElementSibling; if (sub) sub.textContent = 'messages'; }
      if (anCommits) { anCommits.textContent = d.hiscores || 0; const sub = anCommits.nextElementSibling; if (sub) sub.textContent = 'hi-scores'; }
      if (anApi) { anApi.textContent = d.analytics_events || 0; const sub = anApi.nextElementSibling; if (sub) sub.textContent = 'events'; }
      if (anTokens) { anTokens.textContent = d.game_players || 0; const sub = anTokens.nextElementSibling; if (sub) sub.textContent = 'players'; }
      // Right panel metric cards
      const rpPages = document.getElementById('rp-pages');
      const rpBuilds = document.getElementById('rp-builds');
      const rpCommits = document.getElementById('rp-commits');
      if (rpPages) { rpPages.textContent = d.projects || 0; const sub = rpPages.nextElementSibling; if (sub) sub.textContent = (d.users || 0) + ' users'; }
      if (rpBuilds) { rpBuilds.textContent = d.chat_messages || 0; const sub = rpBuilds.nextElementSibling; if (sub) sub.textContent = 'messages'; }
      if (rpCommits) { rpCommits.textContent = d.hiscores || 0; const sub = rpCommits.nextElementSibling; if (sub) sub.textContent = 'hi-scores'; }
    }

    // ════════════════════════════════════════════
    // ADMIN DASHBOARD — VPS Stats, Users, Services
    // ════════════════════════════════════════════
    function _fmtBytes(b) {
      if (b > 1e9) return (b / 1e9).toFixed(1) + ' GB';
      if (b > 1e6) return (b / 1e6).toFixed(1) + ' MB';
      return (b / 1e3).toFixed(0) + ' KB';
    }
    function _fmtUptime(ms) {
      if (!ms) return '-';
      const s = (Date.now() - ms) / 1000;
      if (s > 86400) return Math.floor(s / 86400) + 'd ' + Math.floor((s % 86400) / 3600) + 'h';
      if (s > 3600) return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
      return Math.floor(s / 60) + 'm';
    }

    async function _loadAdminDashboard() {
