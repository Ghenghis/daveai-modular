// DaveAI v7 - state.js //

    let _currentUser = null;  // { user_id, email, role, display_name }

    function setAuthMode(mode) {
      _authMode = mode;
      const nameField = document.getElementById('af-name');
      const pass2Field = document.getElementById('af-pass2');
      const submitBtn = document.getElementById('am-submit');
      const toggle = document.getElementById('am-toggle');
      const tabIn = document.getElementById('tab-signin');
      const tabUp = document.getElementById('tab-signup');
      const errEl = document.getElementById('am-err');
      if (errEl) errEl.style.display = 'none';
      if (mode === 'signup') {
        if (nameField) nameField.style.display = '';
        if (pass2Field) pass2Field.style.display = '';
        if (submitBtn) submitBtn.textContent = 'Create Account';
        if (toggle) toggle.innerHTML = 'Already have an account? <a href="#" onclick="setAuthMode(\'signin\');return false" style="color:#D8B4FE">Sign In</a>';
        if (tabIn) tabIn.classList.remove('on');
        if (tabUp) tabUp.classList.add('on');
      } else {
        if (nameField) nameField.style.display = 'none';
        if (pass2Field) pass2Field.style.display = 'none';
        if (submitBtn) submitBtn.textContent = 'Sign In';
        if (toggle) toggle.innerHTML = 'Don\'t have an account? <a href="#" onclick="setAuthMode(\'signup\');return false" style="color:#D8B4FE">Sign Up</a>';
        if (tabIn) tabIn.classList.add('on');
        if (tabUp) tabUp.classList.remove('on');
      }
    }

      _currentUser = {
        email: data?.email || '',
        role: data?.role || 'user',
        display_name: data?.display_name || data?.email?.split('@')[0] || 'User',
        user_id: data?.user_id || 0
      };
      localStorage.setItem('daveai_user', JSON.stringify(_currentUser));
      const ov = document.getElementById('am-ov');
      if (ov) {
        ov.style.pointerEvents = 'none'; ov.style.opacity = 0; ov.style.transition = 'opacity .18s';
        setTimeout(() => { ov.classList.add('hid'); clearTgt(); }, 180);
      }
      document.getElementById('ts')?.classList.add('vis');
      // Show identity in avatar area
      const avatarName = document.querySelector('.avatar-name');
      if (avatarName) avatarName.textContent = _currentUser.display_name;
      // Show/hide admin features
      _applyRole(_currentUser.role);
      const roleLabel = _currentUser.role === 'admin' ? 'Admin / DaveAI' : _currentUser.display_name;
      addRichActivity({ msg: `Signed in as ${roleLabel}`, type: 'done', agent: 'System' });
      // ── Play intro video AFTER successful login ──
      // Cancel ALL queued/playing TTS first — intro video owns audio exclusively
      vsStopAudio();
      _vsSpeechQueue.length = 0;
      _vsProcessingQueue = false;
      setTimeout(() => { if (typeof playIntro === 'function') playIntro(); }, 200);
    }

    function _applyRole(role) {
      // Show admin-only UI elements
      document.querySelectorAll('[data-admin]').forEach(el => {
        if (role === 'admin') {
          // Use flex for elements that need it (admin bars), block/inline for others
          el.style.display = el.id === 'demo-admin-bar' ? 'flex' : '';
        } else {
          el.style.display = 'none';
        }
      });
      // Add admin badge to topbar
      const badge = document.getElementById('admin-badge');
      if (badge) badge.style.display = role === 'admin' ? 'inline-flex' : 'none';
      // Re-sync extension toggle lock state and re-render projects with correct naming
      _syncExtToggle();
      if (typeof renderProjects === 'function') renderProjects();
    }

    function _restoreUser() {
      try {
        const stored = localStorage.getItem('daveai_user');
        if (stored) {
          _currentUser = JSON.parse(stored);
          const avatarName = document.querySelector('.avatar-name');
          if (avatarName) avatarName.textContent = _currentUser.display_name || 'User';
          _applyRole(_currentUser.role || 'user');
        }
      } catch (e) { /* ignore */ }
    }

    function showAuth() {
      clearToken();
      localStorage.removeItem('daveai_user');
      _currentUser = null;
      const ov = document.getElementById('am-ov');
      if (ov) { ov.classList.remove('hid'); ov.style.opacity = 1; ov.style.pointerEvents = ''; }
    }

      const _isAdmin = _currentUser && _currentUser.role === 'admin';
      if (_isAdmin && _llmCfg.enabled && typeof _localLLMChat === 'function') {
        try {
          // Auto-switch: ensure story model is loaded before chat
          if (_llmCfg.autoSwitch && typeof _switchToStoryModel === 'function') {
            await _switchToStoryModel();
          }
      const isAdmin = _currentUser && _currentUser.role === 'admin';
      if (section) section.style.display = isAdmin ? '' : 'none';
      // Populate select with all projects that have URLs
      const all = getProjects();
      const cfg = getDemoConfig();
      sel.innerHTML = '<option value="">— No showcase (disabled) —</option>';
      all.filter(p => p.url).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name + ' (' + p.cat + ')' + (p.status === 'live' ? ' ✓' : '');
        if (cfg && cfg.projectId === p.id) opt.selected = true;
        sel.appendChild(opt);
      });
      // Fill custom fields
      const titleInp = document.getElementById('demo-custom-title');
      const subInp = document.getElementById('demo-custom-sub');
      if (cfg) {
        if (titleInp) titleInp.value = cfg.title || '';
        if (subInp) subInp.value = cfg.sub || '';
      }
    }

    // ══════════════════════════════════════════════════════════
      if (_currentUser && _currentUser.role === 'admin') {
        return stored === null ? true : stored === '1';
      }
      // Normal users: off by default, only on if explicitly enabled AND unlocked
      return stored === '1';
    }

    function setShowExtensions(on) {
      localStorage.setItem('daveai_show_ext', on ? '1' : '0');
      // Flash saved indicator
      const saved = document.getElementById('stg-ext-saved');
      if (saved) { saved.classList.add('show'); setTimeout(() => saved.classList.remove('show'), 1500); }
      // Re-render projects with new display mode
      renderProjects();
    }

    function displayName(raw) {
      if (getShowExtensions()) return raw || '';
      return cleanName(raw);
    }

    // Sync the Settings toggle when opening settings
    function _syncExtToggle() {
      const cb = document.getElementById('stg-ext-cb');
      const toggle = document.getElementById('stg-ext-toggle');
      const lock = document.getElementById('stg-ext-lock');
      if (!cb) return;
      const isAdmin = _currentUser && _currentUser.role === 'admin';
      cb.checked = getShowExtensions();
      // Unlock for admin, lock for users unless explicitly allowed
      if (isAdmin) {
        if (toggle) toggle.classList.remove('stg-locked');
        if (lock) lock.style.display = 'none';
      } else {
        // Users: locked by default — check if admin has unlocked for this user
        const unlocked = localStorage.getItem('daveai_ext_unlocked') === '1';
        if (toggle) toggle.classList.toggle('stg-locked', !unlocked);
        if (lock) lock.style.display = unlocked ? 'none' : '';
      }
    }

    // ══════════════════════════════════════════════════════════
    //  PROJECTS SYSTEM — Web / Apps / Games / Other
    // ══════════════════════════════════════════════════════════
    const PROJ_CATS = ['web', 'apps', 'games', 'other'];
    const PROJ_ICONS = { web: 'fa-globe', apps: 'fa-mobile-alt', games: 'fa-gamepad', other: 'fa-folder' };
    let _projCat = 'web';
    let _projSelected = null;

    function getProjects() {
      try { return JSON.parse(localStorage.getItem('daveai_projects') || '[]'); }
      catch { return []; }
    }
    function saveProjects(list) { localStorage.setItem('daveai_projects', JSON.stringify(list)); }

    function seedProjects() {
      const REQUIRED = [
        { id: 'p1', name: 'DaveAI Website', url: 'https://daveai.tech/', cat: 'web', status: 'live', ts: Date.now() },
        { id: 'p2', name: 'landing_page.html', url: 'https://daveai.tech/landing.html', cat: 'web', status: 'draft', ts: Date.now() },
        { id: 'p3', name: 'my-cool-app.zip', url: '', cat: 'apps', status: 'draft', ts: Date.now() },
        { id: 'p4', name: 'Daves_Siege_TD', url: 'https://daveai.tech/games/daves-siege-td/index.html', cat: 'games', status: 'live', ts: Date.now() },
        { id: 'p5', name: 'project-assets_backup.zip', url: '', cat: 'other', status: 'draft', ts: Date.now() },
      ];
      const existing = getProjects();
      if (existing.length === 0) {
        saveProjects(REQUIRED);
      } else {
        let changed = false;
        REQUIRED.forEach(req => {
          const found = existing.find(p => p.id === req.id);
          if (!found) {
            existing.push(req);
            changed = true;
          } else {
            // Fix URL/cat if they changed (e.g. game URL updated)
            if (req.url && found.url !== req.url) { found.url = req.url; changed = true; }
            if (req.cat && found.cat !== req.cat) { found.cat = req.cat; changed = true; }
            if (req.status && found.status !== req.status) { found.status = req.status; changed = true; }
          }
        });
        if (changed) saveProjects(existing);
      }
      // Auto-configure showcase if not set — default to Dave's Siege TD
      if (!getDemoConfig()) {
        setDemoConfig({ projectId: 'p4', title: "Dave's Siege TD", sub: "Experience our latest tower defense game — built entirely by DaveAI agents. Defend your castle with strategic tower placement!" });
      }
    }

    function setProjCat(cat) {
      _projCat = cat;
      document.querySelectorAll('.proj-cat').forEach(el => el.classList.toggle('on', el.dataset.cat === cat));
      renderProjects();
    }

    function renderProjects() {
      const all = getProjects();
      const list = document.getElementById('proj-list');
      if (!list) return;

      // Update category counts
      PROJ_CATS.forEach(c => {
        const el = document.getElementById('pcat-c-' + c);
        if (el) el.textContent = all.filter(p => p.cat === c).length;
      });

      const filtered = all.filter(p => p.cat === _projCat);
      if (filtered.length === 0) {
        const catLabel = _projCat.charAt(0).toUpperCase() + _projCat.slice(1);
        list.innerHTML = '<div class="proj-empty"><i class="fas ' + PROJ_ICONS[_projCat] + '"></i>No ' + catLabel + ' projects yet.<br>Click "+ Add project" below to get started.</div>';
        return;
      }

      list.innerHTML = filtered.map(p => {
        const isOn = _projSelected === p.id ? ' on' : '';
        const badge = p.status === 'live'
          ? '<span class="proj-badge live">live</span>'
          : '<span class="proj-badge draft">draft</span>';
        const shown = displayName(p.name);
        return '<div class="proj-item' + isOn + '" onclick="loadProject(\'' + p.id + '\')" title="' + escHtml(p.name) + (p.url ? '\n' + p.url : '') + '">'
          + '<div class="proj-icon ' + p.cat + '"><i class="fas ' + PROJ_ICONS[p.cat] + '"></i></div>'
          + '<div class="proj-meta"><div class="proj-name">' + escHtml(shown) + '</div>'
          + '<div class="proj-url">' + escHtml(p.url || 'No URL') + '</div></div>'
          + badge
          + '<button class="proj-del" onclick="event.stopPropagation();delProject(\'' + p.id + '\')" title="Remove"><i class="fas fa-trash-alt"></i></button>'
          + '</div>';
      }).join('');
    }

    function loadProject(id) {
      const all = getProjects();
      const p = all.find(x => x.id === id);
      if (!p || !p.url) return;
      _projSelected = id;
              username: _currentUser?.name || 'anonymous',
              role: _currentUser?.role || 'guest',
              page: location.pathname,
              user_id: localStorage.getItem('_dbUserId') || null
            })
          });
        }
      }, 30000);

      if (_currentUser && _currentUser.role === 'admin') {
        _loadAdminDashboard();
        setInterval(_loadAdminDashboard, 15000);
      }
    });

    // ════════════════════════════════════════════
    // PostgreSQL API Client — syncs to /api/db/*
    // ════════════════════════════════════════════
    const _DB_BASE = '/api/db';
    let _dbSessionId = null;
    try { _dbSessionId = sessionStorage.getItem('_dbSid'); } catch (e) { }
    if (!_dbSessionId) {
      _dbSessionId = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2));
      try { sessionStorage.setItem('_dbSid', _dbSessionId); } catch (e) { }
    }

    async function _dbFetch(path, opts = {}) {
      try {
        const r = await fetch(_DB_BASE + path, {
          headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
          ...opts
        });
        if (!r.ok) return null;
        return await r.json();
      } catch (e) {
        console.warn('[DB]', path, e.message);
        return null;
      }
    }

    // ── Track analytics event (fire-and-forget) ──
    function _dbTrack(eventType, eventData = {}) {
      const uid = _currentUser?.id || null;
      _dbFetch('/analytics', {
        method: 'POST',
        body: JSON.stringify({
          user_id: uid, session_id: _dbSessionId,
          event_type: eventType, event_data: eventData,
          page: location.pathname
        })
      });
    }

    // ── Sync current user to PostgreSQL ──
    async function _dbSyncUser() {
      if (!_currentUser || !_currentUser.name) return;
      const existing = await _dbFetch('/users/' + encodeURIComponent(_currentUser.name));
      if (existing) {
        // Update last login
        _dbFetch('/users/' + encodeURIComponent(_currentUser.name) + '/login', { method: 'POST' });
        _currentUser._dbId = existing.id;
        localStorage.setItem('_dbUserId', existing.id);
      } else {
        // Create new user
        const created = await _dbFetch('/users', {
          method: 'POST',
          body: JSON.stringify({
            username: _currentUser.name,
            role: _currentUser.role || 'user',
            settings: { theme: 'dark', voice: 'emma' }
          })
        });
        if (created) {
          _currentUser._dbId = created.id;
          localStorage.setItem('_dbUserId', created.id);
        }
      }
    }

    // ── Save chat message to PostgreSQL ──
    function _dbSaveChat(role, content, agent, model) {
      const uid = localStorage.getItem('_dbUserId') || null;
      _dbFetch('/chat', {
        method: 'POST',
        body: JSON.stringify({
          user_id: uid, session_id: _dbSessionId,
          role: role, content: content.slice(0, 5000),
          agent: agent || 'supervisor', model: model || null
        })
      });
    }

    // ── Save project to PostgreSQL ──
    async function _dbSaveProject(name, url, category, status) {
      const uid = localStorage.getItem('_dbUserId') || null;
      return await _dbFetch('/projects', {
        method: 'POST',
        body: JSON.stringify({ user_id: uid, name, url, category, status })
      });
    }

    // ── Game: save hi-score ──
    async function _dbSaveHiScore(playerName, score, mapId, mapName, difficulty, waves, stars, mode, timeSec) {
      // Ensure player exists
      let player = await _dbFetch('/game/players/' + encodeURIComponent(playerName));
      if (!player) {
        const uid = localStorage.getItem('_dbUserId') || null;
        player = await _dbFetch('/game/players', {
          method: 'POST',
          body: JSON.stringify({ user_id: uid, player_name: playerName })
        });
      }
      if (!player) return null;
      return await _dbFetch('/game/hiscores', {
        method: 'POST',
        body: JSON.stringify({
          player_id: player.id, player_name: playerName,
          score, map_id: mapId, map_name: mapName, difficulty,
          waves_survived: waves, stars, play_mode: mode || 'classic',
          time_seconds: timeSec
        })
      });
    }

    // ── Game: get leaderboard ──
    async function _dbGetLeaderboard(limit = 20, mapId) {
      const q = mapId ? '?map_id=' + mapId + '&limit=' + limit : '?limit=' + limit;
      return await _dbFetch('/game/hiscores' + q) || [];
    }

    // ── Game: save map progress ──
    async function _dbSaveMapProgress(playerName, mapId, stars, bestScore, bestWave, completed) {
      let player = await _dbFetch('/game/players/' + encodeURIComponent(playerName));
      if (!player) return null;
      return await _dbFetch('/game/progress', {
        method: 'POST',
        body: JSON.stringify({
          player_id: player.id, map_id: mapId,
          stars, best_score: bestScore, best_wave: bestWave, completed
        })
      });
    }

    // ── Dashboard stats ──
    async function _dbGetDashboard() {
      return await _dbFetch('/dashboard') || {};
    }

      if (!_currentUser || _currentUser.role !== 'admin') return;
      const [vps, sessions, dash] = await Promise.all([
        _dbFetch('/vps-stats'),
        _dbFetch('/sessions/active'),
        _dbFetch('/dashboard'),
      ]);

      // Find or create the admin stats container
      let el = document.getElementById('admin-vps-dash');
      if (!el) {
        // Insert into the admin panel if it exists, otherwise create floating panel
        const adminPanel = document.querySelector('.settings-admin, #admin-panel, [data-tab="admin"]');
        el = document.createElement('div');
        el.id = 'admin-vps-dash';
        el.style.cssText = 'position:fixed;bottom:40px;right:8px;width:340px;max-height:80vh;overflow-y:auto;background:rgba(15,15,25,.95);border:1px solid rgba(99,102,241,.4);border-radius:12px;padding:12px;font-size:11px;color:#ccc;z-index:9999;backdrop-filter:blur(12px);box-shadow:0 4px 24px rgba(0,0,0,.5);';
        document.body.appendChild(el);
      }

      if (!vps && !sessions && !dash) {
        el.innerHTML = '<div style="color:#f87171">⚠ Dashboard API unavailable</div>';
        return;
      }

      let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
      html += '<span style="font-weight:700;font-size:13px;color:#818cf8">⚡ Admin Dashboard</span>';
      html += '<span style="font-size:9px;opacity:.6">auto-refresh 15s</span>';
      html += '</div>';

      if (vps) {
        // VPS Stats bars
        const bars = [
          { label: 'CPU', pct: vps.cpu?.percent || 0, color: vps.cpu?.percent > 80 ? '#f87171' : '#34d399' },
