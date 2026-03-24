// DaveAI v7 - status.js //

          setApiStatus('online');
        }

      } catch (e) { console.warn('stats fetch partial error', e); }
    }

    // Updates BOTH analytics panel (an-*) and right-panel stats (rp-*)
    // No mocked values — only called when real API data arrives
    function setStat(field, val, sub) {
      ['an-', 'rp-'].forEach(prefix => {
        const vEl = document.getElementById(prefix + field);
        if (vEl) vEl.textContent = val;
      });
      // update sub-label in analytics panel ana-card .ana-sub (sibling of an-*)
      const anEl = document.getElementById('an-' + field);
      if (anEl && sub) {
        const subEl = anEl.parentElement?.querySelector('.ana-sub');
        if (subEl) subEl.textContent = sub;
      }
    //  REAL-TIME STATUS BAR — polls /api/health every 5s
    //  Shows: brain state · agent roles & states · tool count ·
    //         page count · commit count · last updated clock
    // ══════════════════════════════════════════════════════════
    const SB_SEP = '<span style="color:rgba(255,255,255,.15);margin:0 7px;font-size:10px">·</span>';
    const SB_AGENT_COL = { supervisor: '#D8B4FE', coder: '#93C5FD', qa: '#6EE7B7', asset: '#FCD34D' };

    async function updateStatusBar() {
      try {
        const _sbh = { signal: AbortSignal.timeout(4000), headers: authHeaders() };
        const [hRes, pRes, sRes] = await Promise.allSettled([
          fetch('/api/health', _sbh).then(r => r.ok ? r.json() : null),
          fetch('/api/pages', _sbh).then(r => r.ok ? r.json() : null),
          fetch('/api/status', _sbh).then(r => r.ok ? r.json() : null),
        ]);

        const parts = [];
        const h = hRes.status === 'fulfilled' ? hRes.value : null;
        const p = pRes.status === 'fulfilled' ? pRes.value : null;
        const s = sRes.status === 'fulfilled' ? sRes.value : null;

        // ── Brain status ──
        const ok = h && h.status === 'ok';
        parts.push(`<span style="color:${ok ? '#6EE7B7' : '#F87171'};font-weight:600">${ok ? '● BRAIN OK' : '○ BRAIN OFFLINE'}</span>`);

      updateStatusBar();
      setInterval(updateStatusBar, 5000);
    }

    // ══════════════════════════════════════════════════════════
    //  AGENTS POLLING — GET /api/agents every 5s
    // ══════════════════════════════════════════════════════════
        setApiStatus('online');
      } catch (e) {
        setApiStatus('connecting');
      }
    }

    // Consolidated API status indicator (replaces 3 separate update paths)
    function setApiStatus(state) {
      const dot = document.getElementById('api-dot');
      const lbl = document.getElementById('api-label');
      const bs = document.getElementById('brain-status');
      const colors = { online: '#10b981', error: '#ef4444', connecting: '#f59e0b', offline: '#f59e0b' };
      const col = colors[state] || '#f59e0b';
      if (dot) dot.style.background = col;
      if (lbl) lbl.textContent = state;
      if (bs) { bs.textContent = state === 'online' ? 'ok' : state; bs.style.color = col; }
    }

    // Single source of truth for agent state — avoids circular DOM reads in updateStatusBar()
      // Store in SSOT so updateStatusBar() can read state without DOM dependency
    async function checkApiHealth() {
      try {
        const [hRes, tRes] = await Promise.allSettled([
          fetch('/api/health', { signal: AbortSignal.timeout(3000), headers: authHeaders() }),
          fetch('/api/tools', { signal: AbortSignal.timeout(3000), headers: authHeaders() }),
        ]);
        if (hRes.status === 'fulfilled' && hRes.value.ok) {
          setApiStatus('online');
        } else {
          setApiStatus('error');
        }
        // Wire live tool count into flyout panel footer
        if (tRes.status === 'fulfilled' && tRes.value.ok) {
          const td = await tRes.value.json();
          const toolCountEl = document.getElementById('fp-tool-count');
          if (toolCountEl) toolCountEl.textContent = `${td.total || 0} loaded`;
          // Also update by-role counts if elements exist
          if (td.by_role) {
            Object.entries(td.by_role).forEach(([role, count]) => {
              const el = document.getElementById('fp-tools-' + role);
              if (el) el.textContent = count;
            });
          }
        }
      } catch (e) {
        setApiStatus('offline');
      }
    }

    // ══════════════════════════════════════════════════════════
      checkApiHealth();
      setInterval(checkApiHealth, 30000);
    }

    // ══ CHAT INPUT ENTER HANDLER (keyboard) ══
    function handleChatKey(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); think(); }
    }

    // ══ SHOW AUTH ══ (delegates to main showAuth/signIn above)
    function closeAuth() {
      const ov = document.getElementById('am-ov');
      if (ov) { ov.classList.add('hid'); }
    }
    function doLogin() { authSubmit(); }

    // ══════════════════════════════════════════════════════════
    //  IMMERSIVE PROJECT VIEW SYSTEM
    //  Maximizes preview; edge-hover reveals hidden UI panels
    // ══════════════════════════════════════════════════════════
    let _immersive = false;
    let _edgeTimers = {};

    function getImmersivePref() { return localStorage.getItem('daveai_immersive') !== '0'; }
    function setImmersivePref(on) {
      localStorage.setItem('daveai_immersive', on ? '1' : '0');
      const saved = document.getElementById('stg-immersive-saved');
      if (saved) { saved.classList.add('show'); setTimeout(() => saved.classList.remove('show'), 1500); }
    }
    function getEdgeHoverPref() { return localStorage.getItem('daveai_edgehover') !== '0'; }
    function setEdgeHoverPref(on) {
      localStorage.setItem('daveai_edgehover', on ? '1' : '0');
      _initEdgeZones();
      const saved = document.getElementById('stg-edgehover-saved');
      if (saved) { saved.classList.add('show'); setTimeout(() => saved.classList.remove('show'), 1500); }
    }

    function enterImmersive() {
      if (_immersive) return;
      _immersive = true;
      document.body.classList.add('immersive');
      _initEdgeZones();
      addRichActivity({ msg: 'Entered immersive view', type: 'system', agent: 'System' });
    }

    function exitImmersive() {
      if (!_immersive) return;
      _immersive = false;
      document.body.classList.remove('immersive', 'edge-top', 'edge-bottom', 'edge-left', 'edge-right');
      addRichActivity({ msg: 'Exited immersive view', type: 'system', agent: 'System' });
    }

    function _initEdgeZones() {
      const zones = [
        { id: 'ez-top', cls: 'edge-top' },
        { id: 'ez-bottom', cls: 'edge-bottom' },
        { id: 'ez-left', cls: 'edge-left' },
        { id: 'ez-right', cls: 'edge-right' }
      ];
      zones.forEach(z => {
        const el = document.getElementById(z.id);
        if (!el) return;
        // Remove old listeners by cloning
        const fresh = el.cloneNode(true);
        el.parentNode.replaceChild(fresh, el);

        if (!getEdgeHoverPref()) return;

        fresh.addEventListener('mouseenter', () => {
          _edgeTimers[z.cls] = setTimeout(() => {
            document.body.classList.add(z.cls);
          }, 150);
        });
        fresh.addEventListener('mouseleave', () => {
          clearTimeout(_edgeTimers[z.cls]);
          // Delay hiding so user can interact with the revealed panel
          setTimeout(() => {
            // Only hide if mouse isn't over the revealed panel
            document.body.classList.remove(z.cls);
          }, 600);
        });
      });

      // Keep panel visible while hovering over it
      ['topbar', 'lsb', 'rp', 'chat'].forEach(panelId => {
        const panel = document.getElementById(panelId);
        if (!panel) return;
        panel.addEventListener('mouseenter', () => {
          const cls = panelId === 'topbar' ? 'edge-top' :
            panelId === 'lsb' ? 'edge-left' :
              panelId === 'rp' ? 'edge-right' : 'edge-bottom';
          clearTimeout(_edgeTimers[cls + '_hide']);
          document.body.classList.add(cls);
        });
        panel.addEventListener('mouseleave', () => {
          const cls = panelId === 'topbar' ? 'edge-top' :
            panelId === 'lsb' ? 'edge-left' :
              panelId === 'rp' ? 'edge-right' : 'edge-bottom';
          _edgeTimers[cls + '_hide'] = setTimeout(() => {
            document.body.classList.remove(cls);
          }, 300);
        });
      });
    }

    // Sync settings toggles
    function _syncImmersiveToggles() {
      const cb1 = document.getElementById('stg-immersive-cb');
      const cb2 = document.getElementById('stg-edgehover-cb');
      const cb3 = document.getElementById('stg-demo-cb');
      if (cb1) cb1.checked = getImmersivePref();
      if (cb2) cb2.checked = getEdgeHoverPref();
      if (cb3) cb3.checked = getDemoEnabled();
    }

    // Escape key exits immersive
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && _immersive) { exitImmersive(); e.stopPropagation(); }
    });

    // ══════════════════════════════════════════════════════════
    //  DEMO / SHOWCASE SYSTEM
    //  Admin sets a project as default showcase in Action Window.
    //  Visitors see hero overlay with Play / Create buttons.
    // ══════════════════════════════════════════════════════════
    const DEMO_CAT_ICONS = { web: 'fa-globe', apps: 'fa-mobile-alt', games: 'fa-gamepad', other: 'fa-folder' };
    const DEMO_CAT_LABELS = { web: 'Website', apps: 'App', games: 'Game', other: 'Project' };
    const DEMO_DEFAULT_SUBS = {
      web: 'A live website built and deployed by DaveAI agents.',
      apps: 'An application crafted by the DaveAI agentic pipeline.',
      games: 'A game built entirely by DaveAI agents. Jump in and play!',
      other: 'A project created with DaveAI — explore it now.'
    };

    function getDemoConfig() {
      try { return JSON.parse(localStorage.getItem('daveai_demo') || 'null'); }
      catch { return null; }
    }
    function setDemoConfig(cfg) {
      localStorage.setItem('daveai_demo', JSON.stringify(cfg));
    }

    let _demoMinimized = false;
    let _demoIdleTimer = null;

    function getDemoEnabled() {
      const v = localStorage.getItem('daveai_demo_enabled');
      return v === null ? true : v === 'true';
    }
    function setDemoEnabled(on) {
      localStorage.setItem('daveai_demo_enabled', on ? 'true' : 'false');
    }

    function loadDemoOnStart() {
      if (!getDemoEnabled()) return;
      const cfg = getDemoConfig();
      if (!cfg || !cfg.projectId) return;
      const all = typeof getProjects === 'function' ? getProjects() : [];
      const p = all.find(x => x.id === cfg.projectId);
      if (!p || !p.url) return;
      _showDemoHero(p, cfg);
    }

    // Smart toggle: minimize demo when user starts typing
    function _demoAutoMinimize() {
      if (_demoMinimized) return;
      const hero = document.getElementById('demo-hero');
      if (!hero || !hero.classList.contains('active')) return;
      // Save game progress before minimizing
      _demoSaveProgress();
      hero.style.transition = 'opacity .3s ease, transform .3s ease';
      hero.style.opacity = '0';
      hero.style.transform = 'translateY(-20px)';
      setTimeout(() => {
        hero.classList.remove('active');
        hero.style.opacity = '';
        hero.style.transform = '';
        hero.style.transition = '';
        _demoMinimized = true;
        // Show restore button
        _demoShowRestoreBtn(true);
      }, 300);
    }

    function _demoRestore() {
      if (!getDemoEnabled()) return;
      _demoMinimized = false;
      _demoShowRestoreBtn(false);
      loadDemoOnStart();
    }

    function _demoShowRestoreBtn(show) {
      let btn = document.getElementById('demo-restore-btn');
      if (show && !btn) {
        btn = document.createElement('button');
        btn.id = 'demo-restore-btn';
        btn.innerHTML = '<i class="fas fa-gamepad" style="margin-right:4px"></i>Show Demo';
        btn.style.cssText = 'position:absolute;top:8px;right:8px;z-index:10;font-size:9px;padding:4px 10px;border-radius:5px;background:rgba(147,51,234,.2);border:1px solid rgba(147,51,234,.3);color:#D8B4FE;cursor:pointer;opacity:.7;transition:opacity .2s';
        btn.onmouseover = () => btn.style.opacity = '1';
        btn.onmouseout = () => btn.style.opacity = '.7';
        btn.onclick = _demoRestore;
        const container = document.getElementById('preview-frame')?.parentElement;
        if (container) container.appendChild(btn);
      } else if (!show && btn) {
        btn.remove();
      }
    }

    // ── Game → PostgreSQL postMessage Bridge ──
    window.addEventListener('message', async (e) => {
      if (!e.data || typeof e.data.type !== 'string') return;
      try {
        if (e.data.type === 'daveai-hiscore' && typeof _dbSaveHiScore === 'function') {
          const d = e.data;
          await _dbSaveHiScore(d.playerName, d.score, d.mapId, d.mapName, d.difficulty, d.waves, d.stars, d.mode, d.timeSec);
          addRichActivity({ msg: 'Hi-score saved: ' + d.score + ' (' + d.playerName + ')', type: 'done', agent: 'Game' });
        }
        if (e.data.type === 'daveai-map-progress' && typeof _dbSaveMapProgress === 'function') {
          const d = e.data;
          await _dbSaveMapProgress(d.playerName, d.mapId, d.stars, d.bestScore, d.bestWave, d.completed);
        }
        if (e.data.type === 'daveai-get-leaderboard' && typeof _dbGetLeaderboard === 'function') {
          const d = e.data;
          const lb = await _dbGetLeaderboard(d.limit || 20, d.mapId);
          const frame = document.getElementById('preview-frame');
          if (frame && frame.contentWindow) {
            frame.contentWindow.postMessage({ type: 'daveai-leaderboard', data: lb, mapId: d.mapId }, '*');
          }
        }
      } catch (err) { console.warn('[GameBridge]', err.message); }
    });

    // Auto-save game progress via postMessage to iframe
    function _demoSaveProgress() {
      try {
        const frame = document.getElementById('preview-frame');
        if (frame && frame.contentWindow) {
          frame.contentWindow.postMessage({ type: 'daveai-save-progress' }, '*');
        }
      } catch (e) { /* cross-origin — ignore */ }
    }

    // Wire: minimize on chat input focus/typing
      startStatusBar();        // start real-time status bar (polls /api/health every 5s)
      startClock();            // real-time clock from IP timezone
      startPolling();          // agents + health + stats polling
