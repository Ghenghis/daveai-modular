// DaveAI v7 - voice.js //

      { label: 'Voice Studio', icon: 'fa-microphone-lines', action: () => { openVoiceStudio(); } },
      { label: 'Analytics Panel', icon: 'fa-chart-line', action: () => { setPanel('analytics'); } },
      { label: 'Settings', icon: 'fa-cog', action: () => { openSettings(); } },
      { label: 'Admin Panel', icon: 'fa-shield-halved', action: () => { setPanel('admin'); } },
            if (typeof vsNarrateChat === 'function') vsNarrateChat(localReply, 'DaveAI');
            // Auto-switch: start idle timer to swap back to coding model
            if (typeof _resetIdleTimer === 'function') _resetIdleTimer();
            return;
          }
        } catch (e) { console.warn('[LocalLLM] Falling back to cloud:', e); }
      }

      try {
        // Narrator-first: non-action queries route to narrator (Alice) for instant reply;
        // action keywords (deploy, build, test, etc.) use the full agent pipeline
                if (ev.type === 'start' && typeof vsNarrateBuild === 'function') vsNarrateBuild('Build started. ' + (ev.msg || ''));
              }
              // done event resets agents, loads preview, hides build bar (only in build mode)
              if (ev.type === 'done') {
                  if (typeof vsNarrateBuild === 'function') vsNarrateBuild('Build complete.');
                }
        if (fullText && typeof vsNarrateChat === 'function') vsNarrateChat(fullText, activeAgent);
      } catch (e) {
        setTypingIndicator(false);
        const isNetwork = /fetch|network|failed|502|503|504|timeout|abort/i.test(e.message);
        if (isNetwork) {
          // ── Fallback: try DaveAI API chat when brain/LLM unavailable ──
          try {
            const fbRes = await fetch('/api/db/chat/fallback', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: msg })
            });
            if (fbRes.ok) {
              const fb = await fbRes.json();
              const fbId = 'ai-fb-' + Date.now();
              if (typeof vsNarrateChat === 'function') vsNarrateChat(fb.reply, 'DaveAI');
              addActivity('Fallback response (LLM warming up)', 'done');
              return;
            }
          } catch (fbErr) { console.warn('[Fallback]', fbErr.message); }
          // If fallback also fails, show friendly offline message
          if (typeof vsNarrateError === 'function') vsNarrateError('Error: ' + e.message);
        }
        if (typeof _dbTrack === 'function') _dbTrack('chat_error', { error: e.message, network: isNetwork });
      }
    }

      if (typeof vsNarrateActivity === 'function' && opts.msg) vsNarrateActivity(opts.msg);
      // update visual mode if active
      if (actMode === 'normal') renderActivityCenter();
    }

    function renderActivityCenter() {
      const af = document.getElementById('af'); if (!af) return;
      if (actMode === 'coder') return; // coder mode = already using addActivity's DOM

      // Visual / Normal mode — friendly cards
      const recent = normalActivities.slice(-12).reverse();
      if (!recent.length) {
        af.innerHTML = '<div style="padding:20px;text-align:center;color:var(--t3);font-size:11px"><i class="fas fa-satellite-dish" style="font-size:20px;display:block;margin-bottom:8px;opacity:.3"></i>Waiting for activity…</div>';
        return;
      }
      af.innerHTML = recent.map(ev => {
        const agentColors = { supervisor: '#D8B4FE', coder: '#93C5FD', qa: '#6EE7B7', asset: '#FCD34D' };
        const typeEmoji = { tool: '', write: '', done: '', build: '', deploy: '', test: '', error: '', system: '' };
        const aCol = agentColors[(ev.agent || '').toLowerCase()] || '#94a3b8';
        const emoji = typeEmoji[ev.type] || '💬';
        const tAgo = timeAgo(ev.ts);
        const hasImg = ev.screenshot;

        return `<div style="margin:6px 8px;padding:8px 10px;background:rgba(255,255,255,.04);border-radius:8px;border-left:3px solid ${aCol};animation:fadeIn .25s ease">
      ${hasImg ? `<img src="${ev.screenshot}" style="width:100%;height:70px;object-fit:cover;border-radius:5px;margin-bottom:6px;opacity:.85" onerror="this.style.display='none'">` : ''}
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <div style="width:20px;height:20px;border-radius:50%;background:${aCol}22;border:1px solid ${aCol}55;display:flex;align-items:center;justify-content:center;font-size:8px;color:${aCol};font-weight:700;flex-shrink:0">${(ev.agent || '?').slice(0, 2).toUpperCase()}</div>
        <span style="font-size:10px;color:${aCol};font-weight:600">${ev.agent || 'System'}</span>
        <span style="margin-left:auto;font-size:8.5px;color:var(--t3)">${tAgo}</span>
      </div>
      <div style="font-size:11px;color:var(--t1);line-height:1.4;margin-bottom:${ev.tool || ev.file || ev.hash ? '5px' : '0'}">${friendlyMsg(ev)}</div>
      ${ev.tool ? `<div style="font-size:9px;color:var(--t3);font-family:monospace;background:rgba(0,0,0,.25);padding:2px 6px;border-radius:4px;margin-top:3px">⚡ ${ev.tool}</div>` : ''}
      ${ev.file ? `<div style="font-size:9px;color:#60a5fa;font-family:monospace;margin-top:2px">📄 ${ev.file}</div>` : ''}
      ${ev.hash ? `<div style="font-size:9px;color:var(--t3);font-family:monospace;margin-top:2px">git: <span style="color:#FCD34D">${ev.hash}</span></div>` : ''}
      ${ev.step && ev.total ? `<div style="margin-top:6px"><div style="height:3px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden"><div style="height:100%;width:${Math.round((ev.step / ev.total) * 100)}%;background:${aCol};border-radius:2px;transition:width .5s"></div></div><div style="font-size:8px;color:var(--t3);margin-top:2px">Step ${ev.step} of ${ev.total}</div></div>` : ''}
    </div>`;
      }).join('');
    }

    function friendlyMsg(ev) {
      // Professional plain-language descriptions for Visual mode
      const t = ev.type || 'system';
      const agent = ev.agent || 'Agent';
      const file = ev.file || '';
      const tool = ev.tool || '';
      const msg = ev.msg || '';
      const map = {
        tool: `${agent} is executing <b>${tool}</b>`,
        write: `${agent} has updated <b>${file || msg}</b>`,
        done: `${agent} completed the requested operation`,
        build: `${agent} is compiling and packaging the application`,
        deploy: `${agent} is publishing changes to <b>daveai.tech</b>`,
        test: `${agent} is running automated quality checks`,
        error: `${agent} encountered an issue — reviewing now`,
        system: `${escHtml(msg)}`,
      };
      return map[t] || escHtml(msg);
    }

    function timeAgo(date) {
      const s = Math.floor((Date.now() - date.getTime()) / 1000);
      if (s < 10) return 'just now';
      if (s < 60) return s + 's ago';
      if (s < 3600) return Math.floor(s / 60) + 'm ago';
      return Math.floor(s / 3600) + 'h ago';
    }

    // ══ ADMIN TAB SWITCHING ══
    function setAdmTab(btn, paneId) {
      document.querySelectorAll('.adm-tab').forEach(b => b.classList.remove('on'));
      document.querySelectorAll('.adm-section').forEach(p => p.style.display = 'none');
      btn.classList.add('on');
      const pane = document.getElementById(paneId);
      if (pane) { pane.style.display = 'flex'; }
      if (paneId === 'adm-logs') startLogTail();
    }

    // ══ ADMIN USER MANAGEMENT ══
    function _authHeaders() {
      return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' };
    }

    async function loadAdminUsers() {
      const list = document.getElementById('adm-user-list');
      if (!list) return;
      try {
        const r = await fetch('/api/admin/users', { headers: _authHeaders() });
        if (!r.ok) { list.innerHTML = '<div style="color:#F87171;font-size:10px;padding:8px">Admin access required</div>'; return; }
        const d = await r.json();
        const users = d.users || [];
        if (!users.length) { list.innerHTML = '<div style="color:var(--t3);font-size:10px;padding:8px">No users</div>'; return; }
        list.innerHTML = users.map(u => `
          <div style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:rgba(255,255,255,.03);border-radius:6px;border:1px solid var(--border)">
            <div style="width:24px;height:24px;border-radius:50%;background:${u.role === 'admin' ? 'rgba(147,51,234,.3)' : 'rgba(99,102,241,.2)'};display:flex;align-items:center;justify-content:center;font-size:9px;color:${u.role === 'admin' ? '#D8B4FE' : '#A5B4FC'};flex-shrink:0">
              <i class="fas fa-${u.role === 'admin' ? 'shield-alt' : 'user'}"></i>
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-size:10px;color:var(--t1);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.display_name || u.email}</div>
              <div style="font-size:9px;color:var(--t3)">${u.email} · <span style="color:${u.role === 'admin' ? '#D8B4FE' : '#6EE7B7'}">${u.role}</span></div>
            </div>
            <div style="display:flex;gap:3px;flex-shrink:0">
              <button onclick="adminResetPw(${u.id},'${u.email}')" title="Reset password" style="padding:3px 5px;font-size:8px;border-radius:4px;background:rgba(251,191,36,.1);color:#FCD34D;border:1px solid rgba(251,191,36,.2);cursor:pointer"><i class="fas fa-key"></i></button>
              <button onclick="adminToggleRole(${u.id},'${u.role}','${u.email}')" title="Toggle role" style="padding:3px 5px;font-size:8px;border-radius:4px;background:rgba(147,51,234,.1);color:#D8B4FE;border:1px solid rgba(147,51,234,.2);cursor:pointer"><i class="fas fa-user-cog"></i></button>
              ${u.email !== ADMIN_EMAIL ? `<button onclick="adminDeleteUser(${u.id},'${u.email}')" title="Delete" style="padding:3px 5px;font-size:8px;border-radius:4px;background:rgba(239,68,68,.1);color:#F87171;border:1px solid rgba(239,68,68,.2);cursor:pointer"><i class="fas fa-trash"></i></button>` : ''}
            </div>
          </div>`).join('');
      } catch (e) {
        list.innerHTML = `<div style="color:#F87171;font-size:10px;padding:8px">${e.message}</div>`;
      }
    }

    function showCreateUserForm() {
      const form = document.getElementById('adm-create-user');
      if (form) form.style.display = form.style.display === 'none' ? '' : 'none';
    }

    async function adminCreateUser() {
      const email = document.getElementById('acu-email')?.value || '';
      const name = document.getElementById('acu-name')?.value || '';
      const pass = document.getElementById('acu-pass')?.value || '';
      const role = document.getElementById('acu-role')?.value || 'user';
      if (!email || !pass) return alert('Email and password required');
      try {
        const r = await fetch('/api/admin/users', {
          method: 'POST', headers: _authHeaders(),
          body: JSON.stringify({ email, password: pass, display_name: name, role })
        });
        const d = await r.json();
        if (!r.ok) return alert(d.detail || 'Failed');
        document.getElementById('adm-create-user').style.display = 'none';
        ['acu-email', 'acu-name', 'acu-pass'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        loadAdminUsers();
        addRichActivity({ msg: `Created user ${email} (${role})`, type: 'done', agent: 'Admin' });
      } catch (e) { alert(e.message); }
    }

    async function adminResetPw(uid, email) {
      const newPw = prompt(`New password for ${email} (min 8 chars):`);
      if (!newPw || newPw.length < 8) return alert('Password must be at least 8 characters');
      try {
        const r = await fetch(`/api/admin/users/${uid}/reset-password`, {
          method: 'POST', headers: _authHeaders(),
          body: JSON.stringify({ password: newPw })
        });
        const d = await r.json();
        if (!r.ok) return alert(d.detail || 'Failed');
        addRichActivity({ msg: `Password reset for ${email}`, type: 'done', agent: 'Admin' });
        alert(`Password reset for ${email}`);
      } catch (e) { alert(e.message); }
    }

    async function adminToggleRole(uid, currentRole, email) {
      const newRole = currentRole === 'admin' ? 'user' : 'admin';
      if (!confirm(`Change ${email} from ${currentRole} to ${newRole}?`)) return;
      try {
        const r = await fetch(`/api/admin/users/${uid}/role`, {
          method: 'POST', headers: _authHeaders(),
          body: JSON.stringify({ role: newRole })
        });
        const d = await r.json();
        if (!r.ok) return alert(d.detail || 'Failed');
        loadAdminUsers();
        addRichActivity({ msg: `${email} role → ${newRole}`, type: 'done', agent: 'Admin' });
      } catch (e) { alert(e.message); }
    }

    async function adminDeleteUser(uid, email) {
      if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
      try {
        const r = await fetch(`/api/admin/users/${uid}`, {
          method: 'DELETE', headers: _authHeaders()
        });
        const d = await r.json();
        if (!r.ok) return alert(d.detail || 'Failed');
        loadAdminUsers();
        addRichActivity({ msg: `Deleted user ${email}`, type: 'done', agent: 'Admin' });
      } catch (e) { alert(e.message); }
    }

    let logTailInterval = null;
    let _logService = 'agent-brain';
    function switchLogService(svc) { _logService = svc; _fetchLogs(); }
    async function _fetchLogs() {
      const body = document.getElementById('adm-log-body');
      const status = document.getElementById('adm-log-status');
      try {
        const r = await fetch(_DB_BASE + '/logs/' + _logService);
        if (!r.ok) { if (body) body.innerHTML = '<span style="color:#f87171">Failed to fetch logs (HTTP ' + r.status + ')</span>'; return; }
        const d = await r.json();
        const arr = Array.isArray(d) ? d : (d.entries || d.logs || d.data || []);
        const lines = arr.slice(-30).map(l => typeof l === 'string' ? l : (l.message || l.msg || l.text || JSON.stringify(l)));
        if (body) {
          if (lines.length) { body.innerHTML = lines.map(l => `${escHtml(String(l))}<br>`).join(''); body.scrollTop = body.scrollHeight; }
          else { body.innerHTML = '<span style="opacity:.5">No log lines returned</span>'; }
        }
        if (status) status.textContent = 'Updated ' + new Date().toLocaleTimeString();
      } catch (e) {
        if (body) body.innerHTML = '<span style="color:#f87171">Error: ' + escHtml(e.message) + '</span>';
      }
    }
    async function startLogTail() {
      if (logTailInterval) return;
      _fetchLogs();
      logTailInterval = setInterval(_fetchLogs, 5000);
    }

    //  VOICE STUDIO ENGINE
    //  Full TTS with Kokoro + Web Audio API post-processing,
    //  presets, agent narration, waveform, guard rails
    // ══════════════════════════════════════════════════════════

    // ── Voice Catalog ──
    const VS_VOICES = [
      // British Female
      { id: 'bf_emma', name: 'Emma', accent: 'british', gender: 'female', grade: 'B-', desc: 'Warm and professional' },
      { id: 'bf_isabella', name: 'Isabella', accent: 'british', gender: 'female', grade: 'C', desc: 'Sophisticated and clear' },
      { id: 'bf_alice', name: 'Alice', accent: 'british', gender: 'female', grade: 'D', desc: 'Refined and elegant' },
      { id: 'bf_lily', name: 'Lily', accent: 'british', gender: 'female', grade: 'D', desc: 'Sweet and gentle' },
      // British Male
      { id: 'bm_george', name: 'George', accent: 'british', gender: 'male', grade: 'C', desc: 'Classic British accent' },
      { id: 'bm_fable', name: 'Fable', accent: 'british', gender: 'male', grade: 'C', desc: 'Storytelling and engaging' },
      { id: 'bm_daniel', name: 'Daniel', accent: 'british', gender: 'male', grade: 'D', desc: 'Polished and professional' },
      { id: 'bm_lewis', name: 'Lewis', accent: 'british', gender: 'male', grade: 'D+', desc: 'Modern British accent' },
      // American Female
      { id: 'af_heart', name: 'Heart', accent: 'american', gender: 'female', grade: 'A', desc: 'Premium quality voice' },
      { id: 'af_bella', name: 'Bella', accent: 'american', gender: 'female', grade: 'A-', desc: 'Warm and friendly' },
      { id: 'af_nicole', name: 'Nicole', accent: 'american', gender: 'female', grade: 'B-', desc: 'Professional and articulate' },
      { id: 'af_aoede', name: 'Aoede', accent: 'american', gender: 'female', grade: 'C+', desc: 'Smooth and melodic' },
      { id: 'af_kore', name: 'Kore', accent: 'american', gender: 'female', grade: 'C+', desc: 'Bright and energetic' },
      { id: 'af_sarah', name: 'Sarah', accent: 'american', gender: 'female', grade: 'C+', desc: 'Casual and approachable' },
      { id: 'af_sky', name: 'Sky', accent: 'american', gender: 'female', grade: 'C-', desc: 'Light and airy' },
      { id: 'af_nova', name: 'Nova', accent: 'american', gender: 'female', grade: 'C', desc: 'Modern and dynamic' },
      // American Male
      { id: 'am_fenrir', name: 'Fenrir', accent: 'american', gender: 'male', grade: 'C+', desc: 'Deep and powerful' },
      { id: 'am_michael', name: 'Michael', accent: 'american', gender: 'male', grade: 'C+', desc: 'Warm and trustworthy' },
      { id: 'am_puck', name: 'Puck', accent: 'american', gender: 'male', grade: 'C+', desc: 'Playful and energetic' },
      { id: 'am_eric', name: 'Eric', accent: 'american', gender: 'male', grade: 'D', desc: 'Professional and authoritative' },
      { id: 'am_onyx', name: 'Onyx', accent: 'american', gender: 'male', grade: 'D', desc: 'Rich and sophisticated' },
      { id: 'am_liam', name: 'Liam', accent: 'american', gender: 'male', grade: 'D', desc: 'Friendly and conversational' },
    ];

    // ── Built-in Presets ──
    const VS_BUILTIN_PRESETS = [
      { name: 'DaveAI British Male', voice: 'bm_george', speed: 0.95, pitch: 0, gain: 100, warmth: 55, clarity: 60, reverb: 0, compress: 0, icon: 'male' },
      { name: 'DaveAI British Female', voice: 'bf_emma', speed: 0.95, pitch: 0, gain: 100, warmth: 60, clarity: 55, reverb: 0, compress: 0, icon: 'female' },
      { name: 'Narrator (Deep)', voice: 'am_fenrir', speed: 0.85, pitch: -2, gain: 110, warmth: 70, clarity: 40, reverb: 10, compress: 20, icon: 'male' },
      { name: 'Assistant (Bright)', voice: 'af_heart', speed: 1.0, pitch: 1, gain: 100, warmth: 40, clarity: 65, reverb: 0, compress: 0, icon: 'female' },
      { name: 'Storyteller', voice: 'bm_fable', speed: 0.8, pitch: 0, gain: 105, warmth: 65, clarity: 50, reverb: 15, compress: 10, icon: 'male' },
      { name: 'News Anchor', voice: 'bf_isabella', speed: 1.05, pitch: 0, gain: 100, warmth: 30, clarity: 75, reverb: 0, compress: 30, icon: 'female' },
    ];

    // ── State ──
    let _vsState = null; // loaded from localStorage
    let _vsAudioCtx = null;
    let _vsCurrentAudio = null;
    let _vsPlaying = false;
    let _vsMuted = false;
    let _vsRateTracker = []; // timestamps of recent TTS requests
    let _vsCache = new Map(); // text+voice → { blob, ts }
    let _vsSpeechQueue = [];
    let _vsProcessingQueue = false;
    let _vsWfAnimId = null;
    let _vsAnalyser = null;
    let _vsBrowserVoices = []; // preloaded browser voices, quality-ranked
    let _vsActiveEngine = 'checking'; // 'kokoro' | 'edge' | 'browser' | 'offline'

    function _vsDefaults() {
      return {
        voice: 'bf_emma', speed: 0.95, pitch: 0, gain: 100, warmth: 50, clarity: 50,
        reverb: 0, compress: 0, blend: null, engine: 'kokoro', ttsUrl: '/api/tts',
        format: 'mp3', rateLimit: 10, timeout: 5, maxLen: 800,
        cache: true, fallback: true, queue: true, muted: false,
        agentVoices: { supervisor: 'bf_emma', coder: 'bm_george', qa: 'bf_isabella', asset: 'bm_lewis' },
        narration: { chat: true, build: false, error: true, activity: false, code: false },
        userPresets: []
      };
    }

    function vsLoad() {
      try { _vsState = JSON.parse(localStorage.getItem('daveai_voice_studio') || 'null'); } catch { _vsState = null; }
      if (!_vsState) _vsState = _vsDefaults();
      const def = _vsDefaults();
      for (const k in def) { if (!(k in _vsState)) _vsState[k] = def[k]; }
      if (!_vsState.agentVoices) _vsState.agentVoices = def.agentVoices;
      if (!_vsState.narration) _vsState.narration = def.narration;
      _vsMuted = _vsState.muted || false;
    }
    function vsSave() { localStorage.setItem('daveai_voice_studio', JSON.stringify(_vsState)); }
    vsLoad();

    // ── Browser Voice Preloader — runs once on page load ──
    // Voices load async in most browsers; we must wait for onvoiceschanged
    (function _vsPreloadBrowserVoices() {
      function _loadVoices() {
        const raw = window.speechSynthesis?.getVoices() || [];
        // Quality score: higher = better. Neural/Google/Microsoft voices score highest
        const scored = raw.filter(v => v.lang.startsWith('en')).map(v => {
          let score = 0;
          const n = v.name.toLowerCase();
          // Neural / Natural keywords = high quality
          if (n.includes('neural') || n.includes('natural')) score += 100;
          // Google voices are generally high quality
          if (n.includes('google')) score += 80;
          // Microsoft voices (Edge) are high quality
          if (n.includes('microsoft') || n.includes('zira') || n.includes('david') || n.includes('hazel') || n.includes('libby') || n.includes('ryan') || n.includes('sonia') || n.includes('maisie')) score += 70;
          // Apple voices (macOS/iOS)
          if (n.includes('samantha') || n.includes('daniel') || n.includes('kate') || n.includes('moira') || n.includes('tessa') || n.includes('fiona')) score += 60;
          // Premium voices from any provider
          if (n.includes('premium') || n.includes('enhanced') || n.includes('wavenet') || n.includes('studio')) score += 90;
          // Prefer en-GB for British, en-US for American
          if (v.lang === 'en-GB') score += 10;
          if (v.lang === 'en-US') score += 5;
          // Remote/cloud voices are typically higher quality
          if (!v.localService) score += 15;
          // Female voices tend to be clearer in most TTS engines
          if (n.includes('female') || n.includes('woman')) score += 3;
          return { voice: v, score, name: v.name, lang: v.lang, local: v.localService };
        }).sort((a, b) => b.score - a.score);
        _vsBrowserVoices = scored;
        if (scored.length > 0) {
          console.log('[VoiceStudio] Loaded ' + scored.length + ' English browser voices. Best: ' + scored[0].name + ' (score ' + scored[0].score + ')');
        }
      }
      if (window.speechSynthesis) {
        _loadVoices();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
          window.speechSynthesis.onvoiceschanged = _loadVoices;
        }
        // Force retry after 500ms (some browsers need this)
        setTimeout(_loadVoices, 500);
        setTimeout(_loadVoices, 2000);
      }
    })();

    // ── Smart Voice Matching: Kokoro ID → best browser voice ──
    function _vsBestBrowserVoice(kokoroId) {
      if (_vsBrowserVoices.length === 0) return null;
      const vInfo = VS_VOICES.find(v => v.id === kokoroId);
      if (!vInfo) return _vsBrowserVoices[0]?.voice || null;
      const wantBritish = vInfo.accent === 'british';
      const wantMale = vInfo.gender === 'male';
      // Score each browser voice for how well it matches the desired Kokoro voice
      const candidates = _vsBrowserVoices.map(bv => {
        let matchScore = bv.score; // start with quality score
        const n = bv.name.toLowerCase();
        const isBrit = bv.lang === 'en-GB' || n.includes('british') || n.includes('uk');
        const isUS = bv.lang === 'en-US' || n.includes('american') || n.includes('us');
        const isMale = n.includes('male') || n.includes('david') || n.includes('daniel') || n.includes('george') || n.includes('ryan') || n.includes('james') || n.includes('guy');
        const isFemale = n.includes('female') || n.includes('zira') || n.includes('hazel') || n.includes('libby') || n.includes('samantha') || n.includes('kate') || n.includes('sonia') || n.includes('emma') || n.includes('jenny');
        // Accent match bonus
        if (wantBritish && isBrit) matchScore += 40;
        else if (!wantBritish && isUS) matchScore += 30;
        else if (wantBritish && !isBrit) matchScore -= 20;
        // Gender match bonus
        if (wantMale && isMale) matchScore += 30;
        else if (!wantMale && isFemale) matchScore += 30;
        else if (wantMale && isFemale) matchScore -= 15;
        else if (!wantMale && isMale) matchScore -= 15;
        // Name match bonus (if browser voice name matches Kokoro voice name)
        if (n.includes(vInfo.name.toLowerCase())) matchScore += 50;
        return { ...bv, matchScore };
      }).sort((a, b) => b.matchScore - a.matchScore);
      return candidates[0]?.voice || null;
    }

    // ── Open/Close Studio ──
    function openVoiceStudio() {
      document.getElementById('voice-studio-overlay')?.classList.add('open');
      vsPopulateAll();
      vsCheckEngine();
    }
    function closeVoiceStudio() {
      document.getElementById('voice-studio-overlay')?.classList.remove('open');
      vsStopAudio();
    }

    // ── Tab Switching ──
    function vsTab(t) {
      document.querySelectorAll('.vs-tab').forEach(el => el.classList.toggle('on', el.dataset.vs === t));
      document.querySelectorAll('.vs-pane').forEach(el => el.classList.toggle('on', el.id === 'vs-' + t));
    }

    // ── Voice Filter ──
    function vsFilter(f) {
      document.querySelectorAll('.vs-filter-btn').forEach(b => b.classList.toggle('on', b.dataset.vf === f));
      vsRenderVoiceGrid(f);
    }

    function vsRenderVoiceGrid(filter) {
      const grid = document.getElementById('vs-voice-grid');
      if (!grid) return;
      let voices = VS_VOICES;
      if (filter && filter !== 'all') {
        const [accent, gender] = filter.split('-');
        voices = voices.filter(v => v.accent === accent && v.gender === gender);
      }
      grid.innerHTML = voices.map(v => {
        const sel = _vsState.voice === v.id ? ' selected' : '';
        const gl = v.grade[0].toLowerCase();
        // Quality tier badge: shows which engine will actually serve this voice
        let tierLabel = '', tierColor = '', tierIcon = '';
        if (_vsDiag.kokoroOnline) { tierLabel = 'Neural'; tierColor = '#4ade80'; tierIcon = 'microchip'; }
        else if (_vsDiag.hfOnline) { tierLabel = 'HuggingFace'; tierColor = '#fbbf24'; tierIcon = 'brain'; }
        else if (_vsDiag.edgeOnline) {
          const edgeName = _vsEdgeVoiceMap[v.id] || '—';
          tierLabel = edgeName.replace(/^en-..?-/, '').replace('Neural', ''); tierColor = '#60a5fa'; tierIcon = 'cloud';
        } else if (_vsBrowserVoices.length > 0 || _vsDiag.browserReady) {
          const bv = _vsBestBrowserVoice(v.id);
          const isNeural = bv && /(neural|google|natural|premium)/i.test(bv.name);
          tierLabel = isNeural ? 'Neural' : 'Browser'; tierColor = isNeural ? '#fbbf24' : '#a78bfa'; tierIcon = 'globe';
        } else { tierLabel = 'Offline'; tierColor = '#ef4444'; tierIcon = 'ban'; }
        const tierBadge = '<div style="font-size:7.5px;color:' + tierColor + ';display:flex;align-items:center;gap:3px;margin-top:2px"><i class="fas fa-' + tierIcon + '" style="font-size:7px"></i>' + tierLabel + '</div>';
        return '<div class="vs-voice-card' + sel + '" data-vid="' + v.id + '" onclick="vsSelectVoice(\'' + v.id + '\')">'
          + '<div class="vc-name">' + v.name + ' <span style="font-size:9px;color:var(--t3);font-weight:400">' + v.id + '</span></div>'
          + '<div class="vc-desc">' + v.desc + ' · ' + v.accent + ' ' + v.gender + tierBadge + '</div>'
          + '<div class="vc-grade ' + gl + '">' + v.grade + '</div>'
          + '<button class="vc-preview-btn" onclick="event.stopPropagation();vsQuickPreview(\'' + v.id + '\',this)"><i class="fas fa-play" style="margin-right:3px;font-size:7px"></i>Preview</button>'
          + '</div>';
      }).join('');
    }

    function vsSelectVoice(vid) {
      _vsState.voice = vid;
      vsSave();
      vsRenderVoiceGrid(document.querySelector('.vs-filter-btn.on')?.dataset.vf || 'all');
      // ── Sync voice bar + speak confirmation so user hears the selected voice ──
      if (typeof dvUpdateVoiceBar === 'function') dvUpdateVoiceBar();
      const vInfo = VS_VOICES.find(v => v.id === vid);
      if (vInfo) addRichActivity({ msg: 'Voice selected: ' + vInfo.name + ' (' + vInfo.accent + ' ' + vInfo.gender + ')', type: 'system', agent: 'System' });
    }

    // ── Quick Preview (short sample) ──
    async function vsQuickPreview(vid, btn) {
      if (btn) { btn.classList.add('playing'); btn.innerHTML = '<i class="fas fa-stop" style="margin-right:3px;font-size:7px"></i>Stop'; }
      const text = 'Hello, I am DaveAI.';
      try {
        await vsSpeakRaw(text, vid, _vsState.speed);
      } catch (e) { }
      if (btn) { btn.classList.remove('playing'); btn.innerHTML = '<i class="fas fa-play" style="margin-right:3px;font-size:7px"></i>Preview'; }
    }

    // ── Test Voice (full text) ──
    async function vsTestVoice() {
      const text = document.getElementById('vs-test-text')?.value?.trim();
      if (!text) return;
      const btn = document.getElementById('vs-test-btn');
      if (btn) { btn.classList.add('playing'); btn.innerHTML = '<i class="fas fa-stop"></i> Stop'; btn.disabled = false; }
      const status = document.getElementById('vs-wf-status');
      if (status) status.textContent = 'Generating...';
      try {
        await vsSpeakRaw(text, _vsState.voice, _vsState.speed, 'vs-waveform-canvas');
        if (status) status.textContent = 'Playback complete';
      } catch (e) {
        if (status) status.textContent = 'Error: ' + e.message;
      }
      if (btn) { btn.classList.remove('playing'); btn.innerHTML = '<i class="fas fa-play"></i> Test'; }
    }

    async function vsTestTuned() {
      const text = document.getElementById('vs-tune-text')?.value?.trim();
      if (!text) return;
      try { await vsSpeakProcessed(text); } catch (e) { }
    }

    // ── Slider Updates ──
    function vsSliderUpdate(param, val) {
      const fval = parseFloat(val);
      _vsState[param] = fval;
      const labels = {
        speed: fval.toFixed(2) + 'x', pitch: fval + ' st', gain: fval + '%',
        warmth: fval + '%', clarity: fval + '%', reverb: fval + '%', compress: fval + '%'
      };
      const el = document.getElementById('vs-' + param + '-val');
      if (el) el.textContent = labels[param] || fval;
      vsSave();
    }

    // ── Blend ──
    function vsBlendChanged() {
      const a = document.getElementById('vs-blend-a')?.value;
      const b = document.getElementById('vs-blend-b')?.value;
      const wa = parseInt(document.getElementById('vs-blend-wa')?.value || '2');
      const wb = parseInt(document.getElementById('vs-blend-wb')?.value || '1');
      if (a && b && a !== b) {
        _vsState.blend = a + '(' + wa + ')+' + b + '(' + wb + ')';
      } else {
        _vsState.blend = null;
      }
      vsSave();
    }

    // ══════════════════════════════════════════════════════════
    //  PROFESSIONAL TTS ENGINE — 3-tier fallback with checks
    //  Tier 1: Kokoro/Chatterbox neural TTS (server-side)
    //  Tier 2: Edge TTS API (free Microsoft neural voices)
    //  Tier 3: Browser SpeechSynthesis (quality-ranked neural)
    // ══════════════════════════════════════════════════════════

    // ── Diagnostics: tracks engine health, latency, quality ──
    const _vsDiag = {
      kokoroOnline: false, hfOnline: false, edgeOnline: false, browserReady: false,
      kokoroLatency: -1, hfLatency: -1, edgeLatency: -1,
      bestEngine: 'browser', lastCheck: 0, checks: [],
      neuralVoicesAvailable: 0, totalBrowserVoices: 0,
    };

    // ── Voice interaction log for debugging delays ──
    const _vsVoiceLog = [];
    function _vsLog(event, detail) {
      const entry = { ts: Date.now(), t: performance.now().toFixed(0), event, detail };
      _vsVoiceLog.push(entry);
      if (_vsVoiceLog.length > 200) _vsVoiceLog.shift();
      console.log('[VoiceLog]', entry.event, entry.detail || '');
    }
    // Expose for debugging: window._vsVoiceLog
    window._vsGetVoiceLog = () => _vsVoiceLog.slice(-50);

    // ── Pronunciation fix: "DaveAI" → "Dave, A I" for natural speech ──
    function _vsFixPronunciation(text) {
      return text
        .replace(/DaveAI/gi, 'Dave, A I')
        .replace(/daveai\.tech/gi, 'Dave A I dot tech')
        .replace(/DaveA\.I\./gi, 'Dave, A I')
        // Symbol pronunciation for natural TTS reading
        .replace(/@/g, ' at ')
        .replace(/#/g, ' hash ')
        .replace(/\$/g, ' dollar ')
        .replace(/%/g, ' percent ')
        .replace(/\^/g, ' caret ')
        .replace(/&/g, ' and ')
        .replace(/\|/g, ' pipe ')
        .replace(/\\/g, ' backslash ')
        .replace(/\+/g, ' plus ')
        .replace(/=/g, ' equals ')
        .replace(/~/g, ' tilde ')
        .replace(/`/g, '')
        .replace(/[{}[\]()]/g, '') // strip brackets — not useful spoken
        .replace(/!{2,}/g, '!') // collapse repeated exclamation
        .replace(/\?{2,}/g, '?') // collapse repeated question marks
        .replace(/\s{2,}/g, ' ') // clean up extra spaces from replacements
        .trim();
    }

    // ── Core TTS: Smart fallback chain with checks ──
    async function vsSpeakRaw(text, voice, speed, canvasId) {
      if (_vsMuted) return;
      const _ttsStart = performance.now();
      _vsLog('tts_start', { text: (text || '').slice(0, 60), voice, engine: _vsState.engine });

      // Game mode: show voice indicator
      if (typeof _gameShowVoiceIndicator === 'function') _gameShowVoiceIndicator(true, text.slice(0, 40) + '…');
      // TIER 0: Local voice engine (admin — AllTalk/Kokoro/Chatterbox)
      if (typeof _localVoiceSpeak === 'function' && typeof _getLocalLLM === 'function') {
        const _lvCfg = _getLocalLLM();
        if (_lvCfg.voiceEngine && _lvCfg.voiceEngine !== 'none') {
          try {
            const ok = await _localVoiceSpeak(text);
            if (ok) { _vsActiveEngine = 'local-' + _lvCfg.voiceEngine; _vsLog('tts_done', { engine: _vsActiveEngine, ms: (performance.now() - _ttsStart).toFixed(0) }); return; }
          } catch (e) { console.warn('[LocalVoice] Falling back:', e.message); }
        }
      }
      // CHECK 1: Rate limit guard
      const now = Date.now();
      _vsRateTracker = _vsRateTracker.filter(t => now - t < 60000);
      if (_vsRateTracker.length >= (_vsState.rateLimit || 10)) {
        _vsLog('tts_rate_limited', { count: _vsRateTracker.length });
        throw new Error('Rate limit reached (' + _vsState.rateLimit + '/min). Wait before trying again.');
      }
      _vsRateTracker.push(now);
      // CHECK 2: Text validation + sanitize + pronunciation fix
      if (!text || typeof text !== 'string') throw new Error('No text provided');
      const maxLen = _vsState.maxLen || 500;
      const safeText = _vsFixPronunciation(text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLen));
      if (!safeText) throw new Error('Text empty after sanitization');
      // CHECK 3: Cache lookup
      const cacheKey = voice + '|' + speed + '|' + safeText;
      if (_vsState.cache && _vsCache.has(cacheKey)) {
        const cached = _vsCache.get(cacheKey);
        if (now - cached.ts < 300000) {
          _vsActiveEngine = cached.engine || 'cache';
          return _vsPlayBlob(cached.blob, canvasId);
        }
        _vsCache.delete(cacheKey);
      }
      // CHECK 4: Voice ID validation
      const vInfo = VS_VOICES.find(v => v.id === voice);
      if (!vInfo) console.warn('[VoiceStudio] Unknown voice ID:', voice, '— using default');

      // ── 4-SECOND FAILSAFE: If all tiers take > 4s, trigger friendly fallback ──
      const _failsafeMs = 4000;
      let _failsafeFired = false;
      const _failsafeTimer = setTimeout(() => {
        _failsafeFired = true;
        _vsLog('tts_failsafe', { ms: _failsafeMs, text: safeText.slice(0, 40) });
        // Friendly browser fallback with warm-up message
        const warmupMsg = "Hey! I'm Dave, A I. The main L L M is warming up, give me just a moment!";
        _vsActiveEngine = 'browser';
        _vsTierBrowserSpeak(warmupMsg, voice, speed).catch(() => { });
      }, _failsafeMs);

      try {
        // ── Tier 1: Kokoro / Chatterbox server ──
        const engine = _vsState.engine || 'kokoro';
        if (engine !== 'browser') {
          try {
            _vsLog('tier1_start', { engine });
            const blob = await _vsTierKokoro(safeText, voice, speed, engine);
            if (blob && blob.size > 0) {
              clearTimeout(_failsafeTimer);
              if (_failsafeFired) { vsStopAudio(); }
              _vsActiveEngine = engine;
              _vsLog('tier1_ok', { engine, ms: (performance.now() - _ttsStart).toFixed(0), size: blob.size });
              if (_vsState.cache) _vsCache.set(cacheKey, { blob, ts: Date.now(), engine });
              return _vsPlayBlob(blob, canvasId);
            }
          } catch (e) {
            _vsLog('tier1_fail', { engine, error: e.message, ms: (performance.now() - _ttsStart).toFixed(0) });
            console.warn('[VoiceStudio] Tier 1 (' + engine + ') failed:', e.message);
          }
        }

        // ── Tier 2: HuggingFace Inference API ──
        if (_vsState.fallback !== false && _vsState.hfEnabled === true) {
          try {
            _vsLog('tier2_start', { engine: 'huggingface' });
            const blob = await _vsTierHuggingFace(safeText, voice, speed);
            if (blob && blob.size > 0) {
              clearTimeout(_failsafeTimer);
              if (_failsafeFired) { vsStopAudio(); }
              _vsActiveEngine = 'huggingface';
              _vsLog('tier2_ok', { ms: (performance.now() - _ttsStart).toFixed(0), size: blob.size });
              if (_vsState.cache) _vsCache.set(cacheKey, { blob, ts: Date.now(), engine: 'huggingface' });
              return _vsPlayBlob(blob, canvasId);
            }
          } catch (e) {
            _vsLog('tier2_fail', { error: e.message, ms: (performance.now() - _ttsStart).toFixed(0) });
            console.warn('[VoiceStudio] Tier 2 (HuggingFace) failed:', e.message);
          }
        }

        // ── Tier 3: Edge TTS API ──
        if (_vsState.fallback !== false) {
          try {
            _vsLog('tier3_start', { engine: 'edge' });
            const blob = await _vsTierEdgeTTS(safeText, voice, speed);
            if (blob && blob.size > 0) {
              clearTimeout(_failsafeTimer);
              if (_failsafeFired) { vsStopAudio(); }
              _vsActiveEngine = 'edge';
              _vsLog('tier3_ok', { ms: (performance.now() - _ttsStart).toFixed(0), size: blob.size });
              if (_vsState.cache) _vsCache.set(cacheKey, { blob, ts: Date.now(), engine: 'edge' });
              return _vsPlayBlob(blob, canvasId);
            }
          } catch (e) {
            _vsLog('tier3_fail', { error: e.message, ms: (performance.now() - _ttsStart).toFixed(0) });
            console.warn('[VoiceStudio] Tier 3 (Edge TTS) failed:', e.message);
          }
        }

        // ── Tier 4: Browser SpeechSynthesis (quality-ranked) ──
        clearTimeout(_failsafeTimer);
        if (_failsafeFired) {
          _vsLog('tier4_skip', { reason: 'failsafe already spoke' });
          return; // failsafe already spoke the warm-up message
        }
        _vsActiveEngine = 'browser';
        _vsLog('tier4_start', { engine: 'browser', ms: (performance.now() - _ttsStart).toFixed(0) });
        return _vsTierBrowserSpeak(safeText, voice, speed);
      } catch (outerErr) {
        clearTimeout(_failsafeTimer);
        _vsLog('tts_error', { error: outerErr.message, ms: (performance.now() - _ttsStart).toFixed(0) });
        throw outerErr;
      }
    }

    // ── Tier 1: Kokoro/Chatterbox Server ──
    async function _vsTierKokoro(text, voice, speed, engine) {
      const url = _vsState.ttsUrl || '/api/tts';
      const controller = new AbortController();
      const tout = setTimeout(() => controller.abort(), (_vsState.timeout || 5) * 1000);
      const t0 = performance.now();
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: engine === 'chatterbox' ? 'chatterbox' : 'kokoro',
            input: text,
            voice: voice || _vsState.voice || 'bf_emma',
            speed: speed || _vsState.speed || 1.0,
            response_format: _vsState.format || 'mp3'
          }),
          signal: controller.signal
        });
        clearTimeout(tout);
        _vsDiag.kokoroLatency = Math.round(performance.now() - t0);
        if (!res.ok) throw new Error('Server ' + res.status);
        const blob = await res.blob();
        // CHECK: Validate audio blob is real audio (minimum size check)
        if (blob.size < 100) throw new Error('Response too small (' + blob.size + 'b) — likely empty');
        _vsDiag.kokoroOnline = true;
        return blob;
      } catch (e) {
        clearTimeout(tout);
        _vsDiag.kokoroOnline = false;
        _vsDiag.kokoroLatency = -1;
        throw e;
      }
    }

    // ── Tier 2A: HuggingFace Inference API (free neural TTS from browser) ──
    // No server needed — calls HF models directly. Free tier: ~1000 req/day
    const _vsHfModels = {
      'facebook/mms-tts-eng': { name: 'MMS-TTS English', quality: 'good', speed: 'fast', gender: 'neutral' },
      'espnet/kan-bayashi_ljspeech_vits': { name: 'LJSpeech VITS', quality: 'high', speed: 'medium', gender: 'female' },
      'facebook/mms-tts-fra': { name: 'MMS-TTS French', quality: 'good', speed: 'fast', gender: 'neutral' },
      'suno/bark-small': { name: 'Bark Small', quality: 'very-high', speed: 'slow', gender: 'varies' },
    };

    async function _vsTierHuggingFace(text, voice, speed) {
      const hfModel = _vsState.hfModel || 'facebook/mms-tts-eng';
      const hfToken = _vsState.hfToken || '';
      const url = 'https://api-inference.huggingface.co/models/' + hfModel;
      const headers = { 'Content-Type': 'application/json' };
      if (hfToken) headers['Authorization'] = 'Bearer ' + hfToken;
      const controller = new AbortController();
      const tout = setTimeout(() => controller.abort(), (_vsState.timeout || 8) * 1000);
      const t0 = performance.now();
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ inputs: text }),
          signal: controller.signal
        });
        clearTimeout(tout);
        _vsDiag.hfLatency = Math.round(performance.now() - t0);
        if (res.status === 503) {
          const errData = await res.json().catch(() => ({}));
          throw new Error('Model loading' + (errData.estimated_time ? ' (~' + Math.round(errData.estimated_time) + 's)' : ''));
        }
        if (!res.ok) throw new Error('HF API ' + res.status);
        const blob = await res.blob();
        if (blob.size < 200) throw new Error('HF response too small (' + blob.size + 'b)');
        if (!blob.type.startsWith('audio/')) {
          const txt = await blob.text().catch(() => '');
          if (txt.includes('error')) throw new Error('HF error: ' + txt.slice(0, 100));
          throw new Error('HF returned non-audio: ' + blob.type);
        }
        _vsDiag.hfOnline = true;
        console.log('[VoiceStudio] HuggingFace TTS:', hfModel, _vsDiag.hfLatency + 'ms');
        return blob;
      } catch (e) {
        clearTimeout(tout);
        _vsDiag.hfOnline = false;
        _vsDiag.hfLatency = -1;
        throw e;
      }
    }

    // ── Tier 2B: Edge TTS (free Microsoft neural voices via proxy) ──
    // Maps Kokoro voice IDs to Microsoft Edge TTS neural voice names
    const _vsEdgeVoiceMap = {
      // British Female → en-GB neural voices
      bf_emma: 'en-GB-SoniaNeural', bf_isabella: 'en-GB-LibbyNeural',
      bf_alice: 'en-GB-MaisieNeural', bf_lily: 'en-GB-SoniaNeural',
      // British Male → en-GB neural voices
      bm_george: 'en-GB-RyanNeural', bm_fable: 'en-GB-ThomasNeural',
      bm_daniel: 'en-GB-RyanNeural', bm_lewis: 'en-GB-ThomasNeural',
      // American Female → en-US neural voices
      af_heart: 'en-US-JennyNeural', af_bella: 'en-US-AriaNeural',
      af_nicole: 'en-US-SaraNeural', af_aoede: 'en-US-AriaNeural',
      af_kore: 'en-US-JennyNeural', af_sarah: 'en-US-SaraNeural',
      af_sky: 'en-US-JennyNeural', af_nova: 'en-US-AriaNeural',
      // American Male → en-US neural voices
      am_fenrir: 'en-US-GuyNeural', am_michael: 'en-US-DavisNeural',
      am_puck: 'en-US-JasonNeural', am_eric: 'en-US-DavisNeural',
      am_onyx: 'en-US-GuyNeural', am_liam: 'en-US-JasonNeural',
    };

    async function _vsTierEdgeTTS(text, voice, speed) {
      // Edge TTS needs a proxy endpoint — check if /api/edge-tts is available
      const edgeVoice = _vsEdgeVoiceMap[voice] || 'en-GB-SoniaNeural';
      const edgeUrl = (_vsState.ttsUrl || '/api/tts').replace(/\/tts$/, '/edge-tts');
      const controller = new AbortController();
      const tout = setTimeout(() => controller.abort(), (_vsState.timeout || 5) * 1000);
      const t0 = performance.now();
      try {
        const res = await fetch(edgeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice: edgeVoice, rate: '+' + Math.round(((speed || 1) - 1) * 100) + '%' }),
          signal: controller.signal
        });
        clearTimeout(tout);
        _vsDiag.edgeLatency = Math.round(performance.now() - t0);
        if (!res.ok) throw new Error('Edge TTS ' + res.status);
        const blob = await res.blob();
        if (blob.size < 100) throw new Error('Edge TTS empty response');
        _vsDiag.edgeOnline = true;
        return blob;
      } catch (e) {
        clearTimeout(tout);
        _vsDiag.edgeOnline = false;
        _vsDiag.edgeLatency = -1;
        throw e;
      }
    }

    // ── Tier 3: Browser SpeechSynthesis — quality-ranked neural voices ──
    let _vsBrowserMouthInterval = null;
    function _vsTierBrowserSpeak(text, voice, speed) {
      return new Promise((resolve, reject) => {
        // CHECK: speechSynthesis API exists
        if (!window.speechSynthesis) { reject(new Error('No browser TTS available')); return; }
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = Math.max(0.5, Math.min(2, speed || 1.0));
        u.pitch = Math.max(0.5, Math.min(1.5, 1.0 + ((_vsState.pitch || 0) / 24)));
        u.volume = Math.max(0, Math.min(1, (_vsState.gain || 100) / 100));

        // Smart voice selection using quality-ranked preloaded voices
        const bestVoice = _vsBestBrowserVoice(voice);
        if (bestVoice) {
          u.voice = bestVoice;
          console.log('[VoiceStudio] Browser voice:', bestVoice.name, '(' + bestVoice.lang + ')');
        } else {
          // Emergency fallback: try raw getVoices() if preloader hasn't finished
          const raw = window.speechSynthesis.getVoices();
          const vInfo = VS_VOICES.find(v => v.id === voice);
          // Prefer any voice with "Neural", "Google", or "Natural" in name
          const neural = raw.find(v => v.lang.startsWith('en') && /(neural|google|natural|premium)/i.test(v.name));
          if (neural) { u.voice = neural; }
          else if (vInfo) {
            const accent = vInfo.accent === 'british' ? 'en-GB' : 'en-US';
            const match = raw.find(v => v.lang === accent) || raw.find(v => v.lang.startsWith('en'));
            if (match) u.voice = match;
          }
        }

        _vsDiag.browserReady = true;

        // ── Show speaking overlay for browser TTS (no analyser, simulate mouth) ──
        _dvShowSpeakOverlay(voice);
        _vsPlaying = true;
        // Simulate mouth movement via interval (browser TTS has no audio analyser)
        if (_vsBrowserMouthInterval) clearInterval(_vsBrowserMouthInterval);
        _vsBrowserMouthInterval = setInterval(() => {
          const mouthBar = document.getElementById('dv-mouth-bar');
          if (mouthBar && _vsPlaying) {
            // Pseudo-random mouth movement to simulate speech
            const amp = 0.3 + Math.random() * 0.7;
            const mH = 3 + Math.round(amp * 14);
            const mW = 12 + Math.round(amp * 6);
            const mR = 2 + Math.round(amp * 6);
            mouthBar.style.height = mH + 'px';
            mouthBar.style.width = mW + 'px';
            mouthBar.style.borderRadius = mR + 'px';
          }
        }, 80);

        // Draw a simple pulsing waveform on the overlay canvas
        _vsBrowserDrawSimWaveform(voice);

        u.onend = () => {
          _vsPlaying = false;
          if (_vsBrowserMouthInterval) { clearInterval(_vsBrowserMouthInterval); _vsBrowserMouthInterval = null; }
          _dvHideSpeakOverlay();
          resolve();
        };
        u.onerror = (e) => {
          _vsPlaying = false;
          if (_vsBrowserMouthInterval) { clearInterval(_vsBrowserMouthInterval); _vsBrowserMouthInterval = null; }
          _dvHideSpeakOverlay();
          reject(new Error(e.error || 'Browser TTS error'));
        };
        window.speechSynthesis.speak(u);
      });
    }

    // ── Simulated waveform for browser TTS (no real analyser data) ──
    function _vsBrowserDrawSimWaveform(voiceId) {
      const canvas = document.getElementById('dv-speak-canvas');
      if (!canvas) return;
      const ctx2d = canvas.getContext('2d');
      const gender = _vsGetGender(voiceId);
      const isFemale = gender === 'female';
      const strokeColor = isFemale ? '#F472B6' : '#60A5FA';
      let phase = 0;

      function drawSim() {
        if (!_vsPlaying) return;
        requestAnimationFrame(drawSim);
        const w = canvas.width = canvas.parentElement.clientWidth;
        const h = canvas.height = canvas.parentElement.clientHeight;
        ctx2d.fillStyle = 'rgba(8,6,20,.4)';
        ctx2d.fillRect(0, 0, w, h);
        phase += 0.12;
        // Simulated frequency bars with sine wave modulation
        const barCount = 48;
        const barW = (w - barCount) / barCount;
        for (let i = 0; i < barCount; i++) {
          const val = Math.sin(phase + i * 0.3) * 0.5 + Math.sin(phase * 1.7 + i * 0.5) * 0.3;
          const barH = Math.abs(val) * h * 0.7 + 2;
          const x = i * (barW + 1);
          const y = (h - barH) / 2;
          ctx2d.fillStyle = strokeColor;
          ctx2d.globalAlpha = 0.4 + Math.abs(val) * 0.5;
          ctx2d.fillRect(x, y, barW, barH);
        }
        ctx2d.globalAlpha = 1;
      }
      drawSim();
    }

    // ── Play blob with Web Audio API post-processing ──
    // voiceId param added to track which voice is playing for gender-aware visuals
    let _vsCurrentVoiceId = null;
    async function _vsPlayBlob(blob, canvasId, voiceId) {
      vsStopAudio();
      _vsCurrentVoiceId = voiceId || _vsState.voice;
      if (!_vsAudioCtx) _vsAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = _vsAudioCtx;
      if (ctx.state === 'suspended') await ctx.resume();

      const arrayBuf = await blob.arrayBuffer();
      let audioBuf;
      try {
        audioBuf = await ctx.decodeAudioData(arrayBuf);
      } catch (e) {
        throw new Error('Failed to decode audio: ' + e.message);
      }
      // CHECK: Validate decoded audio
      if (!audioBuf || audioBuf.length === 0) throw new Error('Decoded audio is empty');

      const source = ctx.createBufferSource();
      source.buffer = audioBuf;
      const pitch = _vsState.pitch || 0;
      source.playbackRate.value = Math.pow(2, pitch / 12);

      // Audio processing chain
      let chain = source;

      // Gain
      const gainNode = ctx.createGain();
      gainNode.gain.value = Math.max(0, Math.min(2, (_vsState.gain || 100) / 100));
      chain.connect(gainNode); chain = gainNode;

      // Warmth (low-shelf EQ)
      if (_vsState.warmth !== 50) {
        const warm = ctx.createBiquadFilter();
        warm.type = 'lowshelf'; warm.frequency.value = 300;
        warm.gain.value = Math.max(-15, Math.min(15, ((_vsState.warmth || 50) - 50) * 0.3));
        chain.connect(warm); chain = warm;
      }

      // Clarity/Presence (high-shelf EQ)
      if (_vsState.clarity !== 50) {
        const clar = ctx.createBiquadFilter();
        clar.type = 'highshelf'; clar.frequency.value = 3000;
        clar.gain.value = Math.max(-15, Math.min(15, ((_vsState.clarity || 50) - 50) * 0.3));
        chain.connect(clar); chain = clar;
      }

      // Compression
      if ((_vsState.compress || 0) > 0) {
        const comp = ctx.createDynamicsCompressor();
        const amt = Math.max(0, Math.min(1, (_vsState.compress || 0) / 100));
        comp.threshold.value = -50 + amt * 40;
        comp.ratio.value = 1 + amt * 19;
        comp.attack.value = 0.003;
        comp.release.value = 0.25;
        chain.connect(comp); chain = comp;
      }

      // Analyser for waveform
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      chain.connect(analyser);
      _vsAnalyser = analyser;
      analyser.connect(ctx.destination);

      // Draw waveform on specified canvas (Voice Studio test) with gender colors
      if (canvasId) _vsDrawWaveform(canvasId, analyser, _vsCurrentVoiceId);

      // ── Always show the main speaking overlay with waveform + mouth animation ──
      _vsDrawSpeakOverlay(analyser, _vsCurrentVoiceId);

      _vsPlaying = true;
      source.start(0);
      _vsCurrentAudio = source;

      return new Promise(resolve => {
        source.onended = () => {
          _vsPlaying = false;
          _vsCurrentAudio = null;
          _vsCurrentVoiceId = null;
          _dvHideSpeakOverlay();
          resolve();
        };
      });
    }

    // ── Speak with full post-processing (tuning tab) ──
    async function vsSpeakProcessed(text) {
      const voice = _vsState.blend || _vsState.voice || 'bf_emma';
      return vsSpeakRaw(text, voice, _vsState.speed, 'vs-waveform-tune-canvas');
    }

    function vsStopAudio() {
      if (_vsCurrentAudio) { try { _vsCurrentAudio.stop(); } catch (e) { } _vsCurrentAudio = null; }
      window.speechSynthesis?.cancel();
      _vsPlaying = false;
      _vsCurrentVoiceId = null;
      if (_vsWfAnimId) { cancelAnimationFrame(_vsWfAnimId); _vsWfAnimId = null; }
      if (_vsBrowserMouthInterval) { clearInterval(_vsBrowserMouthInterval); _vsBrowserMouthInterval = null; }
      _dvHideSpeakOverlay();
    }

    // ── Gender detection for current voice ──
    function _vsGetGender(voiceId) {
      const v = VS_VOICES.find(x => x.id === (voiceId || _vsState.voice));
      return v ? v.gender : 'female';
    }
    function _vsGetVoiceName(voiceId) {
      const v = VS_VOICES.find(x => x.id === (voiceId || _vsState.voice));
      return v ? v.name : 'DaveAI';
    }

    // ── Speaking overlay controller: show/hide + update gender styling + dynamic colors ──
    let _dvSpeakOverlayAnimId = null;
    function _dvShowSpeakOverlay(voiceId) {
      const overlay = document.getElementById('dv-speak-overlay');
      if (!overlay) return;
      const gender = _vsGetGender(voiceId);
      const name = _vsGetVoiceName(voiceId);
      // Get dynamic color from settings palette
      const dynColor = (typeof _dvGetWfColor === 'function') ? _dvGetWfColor(voiceId) : (gender === 'female' ? '#F472B6' : '#60A5FA');
      // Update gender classes + apply dynamic color
      const circle = document.getElementById('dv-mouth-circle');
      const bar = document.getElementById('dv-mouth-bar');
      const nameEl = document.getElementById('dv-speak-name');
      const engineEl = document.getElementById('dv-speak-engine');
      if (circle) {
        circle.className = 'dv-mouth-circle ' + gender + ' speaking';
        circle.style.borderColor = dynColor;
        circle.style.boxShadow = '0 0 12px ' + dynColor + '55';
      }
      if (bar) { bar.className = 'dv-mouth-bar ' + gender; bar.style.height = '3px'; bar.style.background = dynColor; }
      if (nameEl) { nameEl.className = 'dv-speak-name ' + gender; nameEl.textContent = name; nameEl.style.color = dynColor; }
      if (engineEl) engineEl.textContent = (_vsActiveEngine || 'neural').toUpperCase();
      overlay.classList.add('active');
    }
    function _dvHideSpeakOverlay() {
      const overlay = document.getElementById('dv-speak-overlay');
      if (overlay) overlay.classList.remove('active');
      const circle = document.getElementById('dv-mouth-circle');
      if (circle) circle.classList.remove('speaking');
      if (_dvSpeakOverlayAnimId) { cancelAnimationFrame(_dvSpeakOverlayAnimId); _dvSpeakOverlayAnimId = null; }
    }

    // ── Waveform Visualizer — dynamic colors from settings + 12 waveform types + mouth sync ──
    let _vsWfPhase = 0;
    function _vsDrawWaveform(canvasId, analyser, voiceId) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      const ctx2d = canvas.getContext('2d');
      const w = canvas.width = canvas.parentElement.clientWidth;
      const h = canvas.height = canvas.parentElement.clientHeight;
      const bufLen = analyser.frequencyBinCount;
      const data = new Uint8Array(bufLen);
      // Use dynamic colors from settings (customizable per gender)
      const color = (typeof _dvGetWfColor === 'function') ? _dvGetWfColor(voiceId) : '#F472B6';

      function draw() {
        if (!_vsPlaying) {
          _vsWfAnimId = null;
          _dvHideSpeakOverlay();
          return;
        }
        _vsWfAnimId = requestAnimationFrame(draw);
        analyser.getByteTimeDomainData(data);
        _vsWfPhase++;

        // ── Calculate amplitude (RMS) for mouth sync ──
        let sum = 0;
        for (let i = 0; i < bufLen; i++) {
          const val = (data[i] - 128) / 128;
          sum += val * val;
        }
        const rms = Math.sqrt(sum / bufLen);
        const amplitude = Math.min(1, rms * 4); // normalized 0-1

        // ── Draw waveform using user-selected type ──
        ctx2d.fillStyle = 'rgba(8,6,20,.35)';
        ctx2d.fillRect(0, 0, w, h);

        if (typeof _dvDrawWfType === 'function') {
          _dvDrawWfType(ctx2d, w, h, data, bufLen, color, amplitude, _vsWfPhase);
        } else {
          // Fallback: classic wave
          ctx2d.shadowBlur = 6 + amplitude * 12;
          ctx2d.shadowColor = color + '4D';
          ctx2d.lineWidth = 1.5 + amplitude * 1.5;
          ctx2d.strokeStyle = color;
          ctx2d.beginPath();
          const sliceW = w / bufLen; let x = 0;
          for (let i = 0; i < bufLen; i++) {
            const v = data[i] / 128.0; const y = v * h / 2;
            if (i === 0) ctx2d.moveTo(x, y); else ctx2d.lineTo(x, y); x += sliceW;
          }
          ctx2d.lineTo(w, h / 2); ctx2d.stroke(); ctx2d.shadowBlur = 0;
        }

        // ── Sync mouth bar to amplitude (1:1 voice tracking) ──
        const mouthBar = document.getElementById('dv-mouth-bar');
        if (mouthBar) {
          const mouthH = 3 + Math.round(amplitude * 14); // 3px closed → 17px open
          const mouthW = 12 + Math.round(amplitude * 6);  // 12px → 18px
          const mouthR = 2 + Math.round(amplitude * 6);   // rounded when open
          mouthBar.style.height = mouthH + 'px';
          mouthBar.style.width = mouthW + 'px';
          mouthBar.style.borderRadius = mouthR + 'px';
        }
      }
      draw();
    }

    // ── Also draw on the main speaking overlay canvas simultaneously ──
    // Uses dynamic colors from settings + user-selected waveform type
    let _dvOverlayPhase = 0;
    function _vsDrawSpeakOverlay(analyser, voiceId) {
      _dvShowSpeakOverlay(voiceId);
      const canvas = document.getElementById('dv-speak-canvas');
      if (!canvas) return;
      const ctx2d = canvas.getContext('2d');
      const bufLen = analyser.frequencyBinCount;
      const data = new Uint8Array(bufLen);
      // Use dynamic colors from settings (hot pink female / blue male, or user-customized)
      const color = (typeof _dvGetWfColor === 'function') ? _dvGetWfColor(voiceId) : '#F472B6';

      function drawOverlay() {
        if (!_vsPlaying) { _dvSpeakOverlayAnimId = null; _dvHideSpeakOverlay(); return; }
        _dvSpeakOverlayAnimId = requestAnimationFrame(drawOverlay);
        const w = canvas.width = canvas.parentElement.clientWidth;
        const h = canvas.height = canvas.parentElement.clientHeight;
        analyser.getByteTimeDomainData(data);
        _dvOverlayPhase++;

        // Background
        ctx2d.fillStyle = 'rgba(8,6,20,.4)';
        ctx2d.fillRect(0, 0, w, h);

        // RMS for glow intensity
        let sum = 0;
        for (let i = 0; i < bufLen; i++) { const val = (data[i] - 128) / 128; sum += val * val; }
        const rms = Math.sqrt(sum / bufLen);
        const amp = Math.min(1, rms * 4);

        // Draw user-selected waveform type with dynamic color
        if (typeof _dvDrawWfType === 'function') {
          _dvDrawWfType(ctx2d, w, h, data, bufLen, color, amp, _dvOverlayPhase);
        } else {
          // Fallback: simple bars
          const barCount = 48, barW = (w - barCount) / barCount, step = Math.floor(bufLen / barCount);
          for (let i = 0; i < barCount; i++) {
            const val = (data[i * step] - 128) / 128;
            const barH = Math.abs(val) * h * 0.9 + 1;
            ctx2d.fillStyle = color; ctx2d.globalAlpha = 0.4 + amp * 0.6;
            ctx2d.fillRect(i * (barW + 1), (h - barH) / 2, barW, barH);
          }
          ctx2d.globalAlpha = 1;
        }

        // Center glow pulse
        if (amp > 0.05) {
          const grad = ctx2d.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.4);
          grad.addColorStop(0, color + Math.round(amp * 38).toString(16).padStart(2, '0'));
          grad.addColorStop(1, 'transparent');
          ctx2d.fillStyle = grad;
          ctx2d.fillRect(0, 0, w, h);
        }
      }
      drawOverlay();
    }

    // ── Populate All UI ──
    function vsPopulateAll() {
      vsRenderVoiceGrid('all');
      _vsPopulateBlendSelects();
      _vsPopulateAgentSelects();
      _vsSyncSliders();
      _vsSyncConfig();
      _vsRenderPresets();
      _vsSyncNarration();
    }

    function _vsPopulateBlendSelects() {
      ['vs-blend-a', 'vs-blend-b'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">— none —</option>' +
          VS_VOICES.map(v => '<option value="' + v.id + '">' + v.name + ' (' + v.id + ')</option>').join('');
      });
    }

    function _vsPopulateAgentSelects() {
      const opts = VS_VOICES.map(v => '<option value="' + v.id + '">' + v.name + ' (' + v.accent + ' ' + v.gender + ')</option>').join('');
      const agents = { supervisor: 'vs-agent-sv', coder: 'vs-agent-cd', qa: 'vs-agent-qa', asset: 'vs-agent-as' };
      for (const [agent, id] of Object.entries(agents)) {
        const sel = document.getElementById(id);
        if (!sel) continue;
        sel.innerHTML = opts;
        sel.value = _vsState.agentVoices?.[agent] || 'bf_emma';
      }
    }

    function _vsSyncSliders() {
      const s = _vsState;
      const map = { speed: s.speed, pitch: s.pitch, gain: s.gain, warmth: s.warmth, clarity: s.clarity, reverb: s.reverb, compress: s.compress };
      for (const [k, v] of Object.entries(map)) {
        const slider = document.getElementById('vs-' + k);
        if (slider) slider.value = v;
        vsSliderUpdate(k, v);
      }
    }

    function _vsSyncConfig() {
      const el = (id) => document.getElementById(id);
      if (el('vs-engine')) el('vs-engine').value = _vsState.engine || 'kokoro';
      if (el('vs-tts-url')) el('vs-tts-url').value = _vsState.ttsUrl || '/api/tts';
      if (el('vs-format')) el('vs-format').value = _vsState.format || 'mp3';
      if (el('vs-hf-enabled')) el('vs-hf-enabled').checked = _vsState.hfEnabled !== false;
      if (el('vs-hf-model')) el('vs-hf-model').value = _vsState.hfModel || 'facebook/mms-tts-eng';
      if (el('vs-hf-token')) el('vs-hf-token').value = _vsState.hfToken || '';
      if (el('vs-rate')) { el('vs-rate').value = _vsState.rateLimit || 10; el('vs-rate-val').textContent = _vsState.rateLimit || 10; }
      if (el('vs-timeout')) { el('vs-timeout').value = _vsState.timeout || 5; el('vs-timeout-val').textContent = _vsState.timeout || 5; }
      if (el('vs-maxlen')) { el('vs-maxlen').value = _vsState.maxLen || 800; el('vs-maxlen-val').textContent = _vsState.maxLen || 800; }
      if (el('vs-cache')) el('vs-cache').checked = _vsState.cache !== false;
      if (el('vs-fallback')) el('vs-fallback').checked = _vsState.fallback !== false;
      if (el('vs-queue')) el('vs-queue').checked = !!_vsState.queue;
    }

    function _vsSyncNarration() {
      const n = _vsState.narration || {};
      const el = (id) => document.getElementById(id);
      if (el('vs-narr-chat')) el('vs-narr-chat').checked = n.chat !== false;
      if (el('vs-narr-build')) el('vs-narr-build').checked = !!n.build;
      if (el('vs-narr-error')) el('vs-narr-error').checked = n.error !== false;
      if (el('vs-narr-activity')) el('vs-narr-activity').checked = !!n.activity;
      if (el('vs-narr-code')) el('vs-narr-code').checked = !!n.code;
    }

    // ── Presets ──
    function _vsRenderPresets() {
      // Built-in
      const builtinEl = document.getElementById('vs-builtin-presets');
      if (builtinEl) {
        builtinEl.innerHTML = VS_BUILTIN_PRESETS.map((p, i) => {
          return '<div class="vs-preset-card" onclick="vsApplyPreset(' + JSON.stringify(p).replace(/"/g, '&quot;') + ')">'
            + '<div class="vp-icon ' + p.icon + '"><i class="fas fa-' + (p.icon === 'male' ? 'mars' : 'venus') + '"></i></div>'
            + '<div class="vp-info"><div class="vp-name">' + p.name + '</div>'
            + '<div class="vp-meta">' + p.voice + ' · ' + p.speed + 'x</div></div>'
            + '<div class="vp-actions"><button onclick="event.stopPropagation();vsPreviewPreset(' + i + ')" title="Preview"><i class="fas fa-play"></i></button></div>'
            + '</div>';
        }).join('');
      }
      // User presets
      const userEl = document.getElementById('vs-user-presets');
      if (userEl) {
        const presets = _vsState.userPresets || [];
        if (presets.length === 0) {
          userEl.innerHTML = '<div style="font-size:10px;color:var(--t3);padding:8px">No saved presets yet. Configure a voice and click Save.</div>';
        } else {
          userEl.innerHTML = presets.map((p, i) => {
            const v = VS_VOICES.find(x => x.id === p.voice);
            const icon = v && v.gender === 'male' ? 'male' : 'female';
            return '<div class="vs-preset-card" onclick="vsApplyPreset(_vsState.userPresets[' + i + '])">'
              + '<div class="vp-icon ' + icon + '"><i class="fas fa-' + (icon === 'male' ? 'mars' : 'venus') + '"></i></div>'
              + '<div class="vp-info"><div class="vp-name">' + escHtml(p.name) + '</div>'
              + '<div class="vp-meta">' + p.voice + ' · ' + (p.speed || 1) + 'x</div></div>'
              + '<div class="vp-actions">'
              + '<button onclick="event.stopPropagation();vsDeleteUserPreset(' + i + ')" title="Delete"><i class="fas fa-trash-alt"></i></button>'
              + '</div></div>';
          }).join('');
        }
      }
    }

    function vsApplyPreset(p) {
      if (!p) return;
      _vsState.voice = p.voice || _vsState.voice;
      _vsState.speed = p.speed ?? _vsState.speed;
      _vsState.pitch = p.pitch ?? _vsState.pitch;
      _vsState.gain = p.gain ?? _vsState.gain;
      _vsState.warmth = p.warmth ?? _vsState.warmth;
      _vsState.clarity = p.clarity ?? _vsState.clarity;
      _vsState.reverb = p.reverb ?? _vsState.reverb;
      _vsState.compress = p.compress ?? _vsState.compress;
      vsSave();
      vsPopulateAll();
      addRichActivity({ msg: 'Voice preset applied: ' + (p.name || p.voice), type: 'system', agent: 'System' });
    }

    function vsPreviewPreset(idx) {
      const p = VS_BUILTIN_PRESETS[idx];
      if (!p) return;
      vsSpeakRaw('Hello, I am DaveAI.', p.voice, p.speed);
    }

    function vsDeleteUserPreset(idx) {
      if (!confirm('Delete this preset?')) return;
      _vsState.userPresets.splice(idx, 1);
      vsSave();
      _vsRenderPresets();
    }

    // ── Save / Export / Import / Share ──
    function vsSaveAll() {
      // Also read config tab values
      _vsState.engine = document.getElementById('vs-engine')?.value || 'kokoro';
      _vsState.ttsUrl = document.getElementById('vs-tts-url')?.value || '/api/tts';
      _vsState.hfEnabled = document.getElementById('vs-hf-enabled')?.checked !== false;
      _vsState.hfModel = document.getElementById('vs-hf-model')?.value || 'facebook/mms-tts-eng';
      _vsState.hfToken = document.getElementById('vs-hf-token')?.value || '';
      _vsState.format = document.getElementById('vs-format')?.value || 'mp3';
      _vsState.rateLimit = parseInt(document.getElementById('vs-rate')?.value || '10');
      _vsState.timeout = parseInt(document.getElementById('vs-timeout')?.value || '5');
      _vsState.maxLen = parseInt(document.getElementById('vs-maxlen')?.value || '800');
      _vsState.cache = document.getElementById('vs-cache')?.checked !== false;
      _vsState.fallback = document.getElementById('vs-fallback')?.checked !== false;
      _vsState.queue = document.getElementById('vs-queue')?.checked || false;

      // Save current as user preset?
      const name = prompt('Save current voice config as preset?\nEnter a name (or Cancel to just save settings):');
      if (name) {
        _vsState.userPresets = _vsState.userPresets || [];
        _vsState.userPresets.push({
          name, voice: _vsState.voice, speed: _vsState.speed, pitch: _vsState.pitch,
          gain: _vsState.gain, warmth: _vsState.warmth, clarity: _vsState.clarity,
          reverb: _vsState.reverb, compress: _vsState.compress, ts: Date.now()
        });
      }
      vsSave();
      _vsRenderPresets();
      addRichActivity({ msg: 'Voice Studio settings saved' + (name ? ' (preset: ' + name + ')' : ''), type: 'system', agent: 'System' });
    }

    function vsExportPreset() {
      const preset = {
        name: 'DaveAI Voice Preset', voice: _vsState.voice, speed: _vsState.speed,
        pitch: _vsState.pitch, gain: _vsState.gain, warmth: _vsState.warmth,
        clarity: _vsState.clarity, reverb: _vsState.reverb, compress: _vsState.compress,
        blend: _vsState.blend
      };
      const json = JSON.stringify(preset, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'daveai-voice-preset.json';
      a.click();
    }

    function vsImportPreset() {
      const fi = document.createElement('input');
      fi.type = 'file'; fi.accept = '.json';
      fi.onchange = async () => {
        const file = fi.files[0]; if (!file) return;
        try {
          const text = await file.text();
          const p = JSON.parse(text);
          if (!p.voice) throw new Error('Invalid preset');
          vsApplyPreset(p);
          _vsState.userPresets = _vsState.userPresets || [];
          _vsState.userPresets.push({ ...p, ts: Date.now() });
          vsSave();
          _vsRenderPresets();
        } catch (e) { alert('Invalid preset file: ' + e.message); }
      };
      fi.click();
    }

    function vsCopyShareLink() {
      const preset = {
        v: _vsState.voice, s: _vsState.speed, p: _vsState.pitch, g: _vsState.gain,
        w: _vsState.warmth, c: _vsState.clarity, r: _vsState.reverb, x: _vsState.compress
      };
      const encoded = btoa(JSON.stringify(preset));
      const url = window.location.origin + '?voicePreset=' + encoded;
      navigator.clipboard.writeText(url).then(() => {
        addRichActivity({ msg: 'Voice preset link copied to clipboard', type: 'system', agent: 'System' });
      }).catch(() => { prompt('Copy this link:', url); });
    }

    function vsResetDefaults() {
      if (!confirm('Reset all Voice Studio settings to defaults?')) return;
      _vsState = _vsDefaults();
      vsSave();
      vsPopulateAll();
    }

    // ── Agent Voice ──
    function vsAgentVoiceChanged(agent, voice) {
      if (!_vsState.agentVoices) _vsState.agentVoices = {};
      _vsState.agentVoices[agent] = voice;
      vsSave();
    }

    function vsNarrChanged() {
      _vsState.narration = {
        chat: document.getElementById('vs-narr-chat')?.checked,
        build: document.getElementById('vs-narr-build')?.checked,
        error: document.getElementById('vs-narr-error')?.checked,
        activity: document.getElementById('vs-narr-activity')?.checked,
        code: document.getElementById('vs-narr-code')?.checked
      };
      vsSave();
    }

    function vsEngineChanged() {
      _vsState.engine = document.getElementById('vs-engine')?.value || 'kokoro';
      vsSave();
      vsCheckEngine();
    }

    // ══════════════════════════════════════════════════════════
    //  PROFESSIONAL DIAGNOSTIC SYSTEM — Checks & Passes
    //  Runs structured validation for each TTS tier, reports
    //  latency, voice quality, availability, and conditions.
    // ══════════════════════════════════════════════════════════
    async function vsCheckEngine() {
      const dot = document.getElementById('vs-status-dot');
      const txt = document.getElementById('vs-status-text');
      if (!dot || !txt) return;
      dot.className = 'vs-dot'; txt.textContent = 'Running diagnostics...';
      _vsDiag.checks = [];
      _vsDiag.lastCheck = Date.now();

      // ── CHECK 1: Web Audio API ──
      const hasAudioCtx = !!(window.AudioContext || window.webkitAudioContext);
      _vsDiag.checks.push({ name: 'Web Audio API', pass: hasAudioCtx, detail: hasAudioCtx ? 'Available' : 'Missing — post-processing disabled' });

      // ── CHECK 2: SpeechSynthesis API + voice count ──
      const hasSynth = !!window.speechSynthesis;
      const neuralCount = _vsBrowserVoices.filter(v => v.score >= 70).length;
      const totalVoices = _vsBrowserVoices.length;
      _vsDiag.neuralVoicesAvailable = neuralCount;
      _vsDiag.totalBrowserVoices = totalVoices;
      _vsDiag.browserReady = hasSynth && totalVoices > 0;
      _vsDiag.checks.push({
        name: 'Browser Voices',
        pass: totalVoices > 0,
        detail: totalVoices + ' English voices loaded' + (neuralCount > 0 ? ' (' + neuralCount + ' neural/premium)' : ' (no neural — quality will be low)')
      });
      if (neuralCount > 0) {
        _vsDiag.checks.push({ name: 'Best Browser Voice', pass: true, detail: _vsBrowserVoices[0].name + ' (score ' + _vsBrowserVoices[0].score + ')' });
      }

      // ── CHECK 3: Kokoro/Chatterbox server health ──
      const engine = _vsState.engine || 'kokoro';
      if (engine !== 'browser') {
        try {
          const baseUrl = _vsState.ttsUrl || '/api/tts';
          const healthUrl = baseUrl.replace(/\/v1\/audio\/speech$/, '/health').replace(/\/tts$/, '/tts/health');
          const t0 = performance.now();
          const r = await fetch(healthUrl, { method: 'GET', signal: AbortSignal.timeout(3000) });
          const lat = Math.round(performance.now() - t0);
          _vsDiag.kokoroLatency = lat;
          _vsDiag.kokoroOnline = r.ok;
          _vsDiag.checks.push({
            name: engine.charAt(0).toUpperCase() + engine.slice(1) + ' Server',
            pass: r.ok,
            detail: r.ok ? 'Online (' + lat + 'ms latency)' : 'Returned ' + r.status
          });
        } catch (e) {
          _vsDiag.kokoroOnline = false;
          _vsDiag.kokoroLatency = -1;
          _vsDiag.checks.push({ name: engine.charAt(0).toUpperCase() + engine.slice(1) + ' Server', pass: false, detail: 'Unreachable — ' + e.message });
        }
      }

      // ── CHECK 4: HuggingFace Inference API ──
      if (_vsState.hfEnabled === true) {
        const hfModel = _vsState.hfModel || 'facebook/mms-tts-eng';
        try {
          const hfHeaders = {};
          if (_vsState.hfToken) hfHeaders['Authorization'] = 'Bearer ' + _vsState.hfToken;
          const t0 = performance.now();
          const r = await fetch('https://api-inference.huggingface.co/models/' + hfModel, {
            method: 'POST',
            headers: { ...hfHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ inputs: 'test' }),
            signal: AbortSignal.timeout(8000)
          });
          const lat = Math.round(performance.now() - t0);
          _vsDiag.hfLatency = lat;
          if (r.status === 503) {
            _vsDiag.hfOnline = false;
            _vsDiag.checks.push({ name: 'HuggingFace TTS', pass: false, detail: 'Model loading (cold start) — try again in ~30s' });
          } else if (r.ok) {
            const blob = await r.blob();
            const isAudio = blob.type.startsWith('audio/') || blob.size > 200;
            _vsDiag.hfOnline = isAudio;
            _vsDiag.checks.push({ name: 'HuggingFace TTS', pass: isAudio, detail: isAudio ? hfModel.split('/')[1] + ' ready (' + lat + 'ms, ' + Math.round(blob.size / 1024) + 'KB)' : 'Non-audio response' });
          } else {
            _vsDiag.hfOnline = false;
            _vsDiag.checks.push({ name: 'HuggingFace TTS', pass: false, detail: 'API returned ' + r.status + (r.status === 401 ? ' — invalid token' : '') });
          }
        } catch (e) {
          _vsDiag.hfOnline = false;
          _vsDiag.hfLatency = -1;
          _vsDiag.checks.push({ name: 'HuggingFace TTS', pass: false, detail: e.name === 'AbortError' ? 'Timeout (model may be loading)' : 'Error: ' + e.message });
        }
      } else {
        _vsDiag.hfOnline = false;
        // Don't add a failed check if HF is intentionally disabled - skip it entirely
      }

      // ── CHECK 5: Edge TTS proxy ──
      try {
        const edgeUrl = (_vsState.ttsUrl || '/api/tts').replace(/\/tts$/, '/edge-tts');
        const t0 = performance.now();
        const r = await fetch(edgeUrl.replace(/edge-tts$/, 'edge-tts/health'), { method: 'GET', signal: AbortSignal.timeout(3000) });
        const lat = Math.round(performance.now() - t0);
        _vsDiag.edgeLatency = lat;
        _vsDiag.edgeOnline = r.ok;
        _vsDiag.checks.push({ name: 'Edge TTS Proxy', pass: r.ok, detail: r.ok ? 'Online (' + lat + 'ms)' : 'Returned ' + r.status });
      } catch (e) {
        _vsDiag.edgeOnline = false;
        _vsDiag.edgeLatency = -1;
        _vsDiag.checks.push({ name: 'Edge TTS Proxy', pass: false, detail: 'Not running — start edge-tts-server.py for neural voices' });
      }

      // ── CHECK 6: Audio output test (AudioContext state) ──
      try {
        const testCtx = new (window.AudioContext || window.webkitAudioContext)();
        const canResume = testCtx.state !== 'closed';
        if (testCtx.state === 'suspended') await testCtx.resume();
        _vsDiag.checks.push({ name: 'Audio Output', pass: canResume, detail: canResume ? 'Ready (state: ' + testCtx.state + ')' : 'AudioContext closed' });
        testCtx.close();
      } catch (e) {
        _vsDiag.checks.push({ name: 'Audio Output', pass: false, detail: 'Error: ' + e.message });
      }

      // ── DETERMINE BEST ENGINE (priority order) ──
      if (_vsDiag.kokoroOnline) _vsDiag.bestEngine = engine;
      else if (_vsDiag.hfOnline) _vsDiag.bestEngine = 'huggingface';
      else if (_vsDiag.edgeOnline) _vsDiag.bestEngine = 'edge';
      else if (_vsDiag.browserReady) _vsDiag.bestEngine = 'browser';
      else _vsDiag.bestEngine = 'offline';

      // ── UPDATE STATUS DISPLAY ──
      const passCount = _vsDiag.checks.filter(c => c.pass).length;
      const totalChecks = _vsDiag.checks.length;
      const qualityTier = _vsDiag.kokoroOnline ? 'Neural (Kokoro)' : _vsDiag.hfOnline ? 'Neural (HuggingFace)' : _vsDiag.edgeOnline ? 'Neural (Edge)' : neuralCount > 0 ? 'Browser Neural' : 'Browser Basic';
      const isGood = _vsDiag.kokoroOnline || _vsDiag.hfOnline || _vsDiag.edgeOnline || neuralCount > 0;

      if (isGood) {
        dot.className = 'vs-dot online';
        txt.textContent = qualityTier + ' — ' + passCount + '/' + totalChecks + ' checks passed';
      } else if (_vsDiag.browserReady) {
        dot.className = 'vs-dot warn';
        txt.textContent = 'Browser voices only (limited quality) — ' + passCount + '/' + totalChecks + ' passed';
      } else {
        dot.className = 'vs-dot offline';
        txt.textContent = 'No TTS available — ' + passCount + '/' + totalChecks + ' passed';
      }

      // ── RENDER DIAGNOSTIC REPORT ──
      _vsRenderDiagnostics();
      return _vsDiag;
    }

    function _vsRenderDiagnostics() {
      const el = document.getElementById('vs-diagnostics');
      if (!el) return;
      const checks = _vsDiag.checks || [];
      el.innerHTML = '<div style="font-size:10px;font-weight:700;color:var(--t2);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px"><i class="fas fa-stethoscope" style="margin-right:4px"></i>System Diagnostics</div>'
        + checks.map(c => {
          const icon = c.pass ? '<i class="fas fa-check-circle" style="color:#4ade80;margin-right:6px"></i>' : '<i class="fas fa-times-circle" style="color:#f87171;margin-right:6px"></i>';
          return '<div style="display:flex;align-items:center;gap:4px;padding:4px 0;font-size:10px;border-bottom:1px solid rgba(255,255,255,.04)">'
            + icon + '<span style="color:var(--t2);font-weight:600;min-width:130px">' + c.name + '</span>'
            + '<span style="color:' + (c.pass ? '#86efac' : '#fca5a5') + '">' + c.detail + '</span></div>';
        }).join('')
        + '<div style="margin-top:8px;font-size:9px;color:var(--t3)">Active engine: <strong style="color:#D8B4FE">' + _vsDiag.bestEngine + '</strong>'
        + ' | Browser voices: ' + _vsDiag.totalBrowserVoices + ' (' + _vsDiag.neuralVoicesAvailable + ' neural)'
        + ' | Last check: ' + new Date(_vsDiag.lastCheck).toLocaleTimeString() + '</div>';
    }

    // ── Public API: Speak with agent voice ──
    let _vsIntroPlaying = false; // exclusive lock: intro video owns audio
    async function daveaiSpeak(text, agent) {
      if (_vsMuted || !text || _vsIntroPlaying) return;
      const voice = _vsState.agentVoices?.[agent] || _vsState.voice || 'bf_emma';
      if (_vsState.queue) {
        _vsSpeechQueue.push({ text, voice });
        if (!_vsProcessingQueue) _vsProcessQueue();
      } else {
        return vsSpeakRaw(text, voice, _vsState.speed);
      }
    }

    async function _vsProcessQueue() {
      _vsProcessingQueue = true;
      while (_vsSpeechQueue.length > 0) {
        const { text, voice } = _vsSpeechQueue.shift();
        try { await vsSpeakRaw(text, voice, _vsState.speed); } catch (e) { }
      }
      _vsProcessingQueue = false;
    }

    // ── Narration Hooks (called from chat/activity systems) ──
    // Strip ALL markdown/formatting to produce clean spoken text
    function _vsStripMarkdown(text) {
      return text
        // Remove code blocks (``` ... ```)
        .replace(/```[\s\S]*?```/g, ' code block omitted ')
        // Remove inline code (`...`)
        .replace(/`([^`]*)`/g, '$1')
        // Remove markdown headers (### Header → Header)
        .replace(/^#{1,6}\s*/gm, '')
        // Remove bold/italic (**text**, *text*, __text__, _text_)
        .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
        .replace(/_{1,3}([^_]+)_{1,3}/g, '$1')
        // Remove markdown links [text](url) → text
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        // Remove markdown images ![alt](url)
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        // Remove markdown list bullets (* item, - item, + item, 1. item)
        .replace(/^[\s]*[-*+]\s+/gm, '')
        .replace(/^[\s]*\d+\.\s+/gm, '')
        // Remove horizontal rules (--- or ***)
        .replace(/^[-*_]{3,}$/gm, '')
        // Remove blockquotes (> text)
        .replace(/^>\s*/gm, '')
        // Remove HTML tags
        .replace(/<[^>]*>/g, '')
        // Remove emoji unicode (common ranges)
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}]/gu, '')
        // Collapse repeated punctuation (!!! → !, ??? → ?)
        .replace(/!{2,}/g, '!')
        .replace(/\?{2,}/g, '?')
        .replace(/\.{4,}/g, '...')
        // Collapse repeated underscores, hashes, etc
        .replace(/[_#]{2,}/g, '')
        // Remove stray special chars that shouldn't be spoken
        .replace(/["""''`~^]/g, '')
        // Clean whitespace
        .replace(/\n{2,}/g, '. ')
        .replace(/\n/g, ', ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    function vsNarrateChat(text, agent) {
      if (!_vsState.narration?.chat || !text) return;
      // Strip thinking prefix (💭 Thinking...) — only speak the final reply
      let clean = text;
      // Remove thinking emoji/prefix
      clean = clean.replace(/^💭\s*Thinking\.{0,3}\s*/i, '');
      // Deduplicate: if the response text appears twice back-to-back, keep only one copy
      if (clean.length > 20) {
        const half = Math.floor(clean.length / 2);
        const first = clean.slice(0, half);
        const second = clean.slice(half);
        if (first === second) clean = first;
      }
      // CRITICAL: Strip ALL markdown formatting before speaking
      clean = _vsStripMarkdown(clean);
      if (!clean) return;
      // thinkAloud toggle: if off (default), skip text that looks like thinking/internal monologue
      if (!_vsState.thinkAloud) {
        // Skip if the entire text is just a thinking indicator
        if (/^(thinking|processing|working|planning)/i.test(clean) && clean.length < 40) return;
      }
      daveaiSpeak(clean, agent || 'supervisor');
    }
    function vsNarrateBuild(text) {
      if (_vsState.narration?.build) daveaiSpeak(_vsStripMarkdown(text), 'coder');
    }
    function vsNarrateError(text) {
      if (_vsState.narration?.error) daveaiSpeak(_vsStripMarkdown(text), 'supervisor');
    }
    function vsNarrateActivity(text) {
      if (_vsSeeding || _vsIntroPlaying) return; // suppress during seed & intro
      if (_vsState.narration?.activity) daveaiSpeak(_vsStripMarkdown(text), 'supervisor');
    }

    // ── Keyboard Shortcuts ──
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'V') { e.preventDefault(); openVoiceStudio(); }
      if (e.ctrlKey && e.shiftKey && e.key === 'M') { e.preventDefault(); _vsMuted = !_vsMuted; _vsState.muted = _vsMuted; vsSave(); addRichActivity({ msg: 'Voice ' + (_vsMuted ? 'muted' : 'unmuted'), type: 'system', agent: 'System' }); }
    });

    // ── Load preset from URL param ──
    (function () {
      try {
        const params = new URLSearchParams(window.location.search);
        const vp = params.get('voicePreset');
        if (vp) {
          const p = JSON.parse(atob(vp));
          if (p.v) { _vsState.voice = p.v; _vsState.speed = p.s; _vsState.pitch = p.p; _vsState.gain = p.g; _vsState.warmth = p.w; _vsState.clarity = p.c; _vsState.reverb = p.r; _vsState.compress = p.x; vsSave(); }
        }
      } catch (e) { }
    })();

    // ══════════════════════════════════════════════════════════
    //  INLINE VOICE CONTROL BAR — Agentic voice interaction
    //  Updates voice bar status, provides quick voice picker,
    //  parses /voice slash commands, auto-reads AI responses.
    // ══════════════════════════════════════════════════════════

    let _dvAutoRead = true;

    function dvUpdateVoiceBar() {
      const dot = document.getElementById('dvb-dot');
      const eng = document.getElementById('dvb-engine');
      const vc = document.getElementById('dvb-voice');
      const muteBtn = document.getElementById('dvb-mute');
      const autoBtn = document.getElementById('dvb-auto');
      if (!dot) return;

      // Engine status dot
      const bestEng = _vsDiag.bestEngine || 'browser';
      const engineLabels = { kokoro: 'Kokoro Neural', chatterbox: 'Chatterbox', huggingface: 'HuggingFace', edge: 'Edge Neural', browser: 'Browser', offline: 'Offline' };
      if (dot) {
        dot.className = 'dvb-dot ' + (_vsDiag.kokoroOnline || _vsDiag.hfOnline || _vsDiag.edgeOnline ? 'on' : _vsDiag.browserReady ? 'warn' : 'off');
      }
      if (eng) eng.textContent = engineLabels[bestEng] || bestEng;

      // Current voice name
      const vInfo = VS_VOICES.find(v => v.id === (_vsState.voice || 'bf_emma'));
      if (vc) vc.textContent = vInfo ? vInfo.name : _vsState.voice;

      // Mute state
      if (muteBtn) {
        muteBtn.innerHTML = _vsMuted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
        muteBtn.classList.toggle('active', !_vsMuted);
      }

      // Auto-read state
      if (autoBtn) {
        autoBtn.classList.toggle('active', _dvAutoRead && !_vsMuted);
      }

      // Think Aloud state
      const thinkBtn = document.getElementById('dvb-think');
      const thinkLabel = document.getElementById('dvb-think-label');
      if (thinkBtn) {
        thinkBtn.classList.toggle('active', !!_vsState.thinkAloud);
        if (thinkLabel) thinkLabel.textContent = _vsState.thinkAloud ? 'Think' : 'Silent';
      }
    }

    function dvToggleMute() {
      _vsMuted = !_vsMuted;
      _vsState.muted = _vsMuted;
      vsSave();
      dvUpdateVoiceBar();
      addRichActivity({ msg: 'Voice ' + (_vsMuted ? 'muted' : 'unmuted'), type: 'system', agent: 'System' });
    }

    function dvToggleAutoRead() {
      _dvAutoRead = !_dvAutoRead;
      dvUpdateVoiceBar();
      addRichActivity({ msg: 'Auto-read ' + (_dvAutoRead ? 'enabled' : 'disabled'), type: 'system', agent: 'System' });
    }

    function dvToggleThinkAloud() {
      _vsState.thinkAloud = !_vsState.thinkAloud;
      vsSave();
      dvUpdateVoiceBar();
      addRichActivity({ msg: 'Think Aloud ' + (_vsState.thinkAloud ? 'ON — voice reads thinking too' : 'OFF — voice only on final reply'), type: 'system', agent: 'System' });
    }

    // ══ 5 VOICE/TEXT CHAT MODES ══
    // 1=Text Only, 2=Voice→Text, 3=Text→Voice, 4=Full Voice, 5=Always Listen
    const _CHAT_MODES = [
      { id: 1, label: 'Text', icon: 'fa-keyboard', voiceIn: false, voiceOut: false, alwaysListen: false },
      { id: 2, label: 'Mic→Text', icon: 'fa-microphone', voiceIn: true, voiceOut: false, alwaysListen: false },
      { id: 3, label: 'Text→Voice', icon: 'fa-volume-up', voiceIn: false, voiceOut: true, alwaysListen: false },
      { id: 4, label: 'Full Voice', icon: 'fa-comments', voiceIn: true, voiceOut: true, alwaysListen: false },
      { id: 5, label: 'Always On', icon: 'fa-satellite-dish', voiceIn: true, voiceOut: true, alwaysListen: true },
    ];
    let _chatModeIdx = parseInt(localStorage.getItem('daveai_chat_mode') || '0');
    function _getChatMode() { return _CHAT_MODES[_chatModeIdx] || _CHAT_MODES[0]; }

    function dvCycleChatMode() {
      _chatModeIdx = (_chatModeIdx + 1) % _CHAT_MODES.length;
      localStorage.setItem('daveai_chat_mode', _chatModeIdx);
      const m = _getChatMode();
      // Apply mode effects
      // Voice output: mute/unmute
      if (m.voiceOut) { _vsMuted = false; _vsState.muted = false; _dvAutoRead = true; }
      else { _dvAutoRead = false; }
      _vsState.narration = _vsState.narration || {};
      _vsState.narration.chat = m.voiceOut;
      vsSave();
      // Voice input: start/stop continuous listening
      if (m.alwaysListen) { _startContinuousListen(); }
      else { _stopContinuousListen(); if (m.voiceIn && !micActive) { /* ready but not auto-start */ } }
      // Update UI
      _dvUpdateChatModeUI();
      dvUpdateVoiceBar();
      addRichActivity({ msg: 'Chat mode → ' + m.label + (m.voiceIn ? ' 🎤' : '') + (m.voiceOut ? ' 🔊' : ''), type: 'system', agent: 'System' });
    }

    function _dvUpdateChatModeUI() {
      const m = _getChatMode();
      const icon = document.getElementById('dvb-chatmode-icon');
      const label = document.getElementById('dvb-chatmode-label');
      const btn = document.getElementById('dvb-chatmode');
      if (icon) { icon.className = 'fas ' + m.icon; }
      if (label) label.textContent = m.label;
      if (btn) btn.title = 'Chat mode: ' + m.label + ' (click to cycle)\nVoice In: ' + (m.voiceIn ? 'ON' : 'OFF') + ' · Voice Out: ' + (m.voiceOut ? 'ON' : 'OFF');
    }

    // ── Continuous Listening (Always-On mode) ──
    let _continuousRec = null;
    let _continuousActive = false;
    function _startContinuousListen() {
      if (_continuousActive) return;
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRec) { addRichActivity({ msg: 'Always-Listen requires SpeechRecognition API (Chrome/Edge)', type: 'error', agent: 'System' }); return; }
      _continuousRec = new SpeechRec();
      _continuousRec.continuous = true;
      _continuousRec.interimResults = false;
      _continuousRec.lang = 'en-US';
      _continuousRec.onresult = (e) => {
        let transcript = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) transcript += e.results[i][0].transcript;
        }
        if (transcript.trim()) {
          const inp = document.getElementById('pi');
          if (inp) { inp.value = transcript.trim(); inp.focus(); }
          // Auto-send in always-listen mode
          setTimeout(() => think(), 300);
        }
      };
      _continuousRec.onerror = (e) => {
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          console.warn('[ContinuousListen]', e.error);
        }
      };
      _continuousRec.onend = () => {
        // Auto-restart if still in always-listen mode
        if (_continuousActive && _getChatMode().alwaysListen) {
          try { _continuousRec.start(); } catch (e) { }
        }
      };
      try { _continuousRec.start(); _continuousActive = true; } catch (e) { }
    }
    function _stopContinuousListen() {
      _continuousActive = false;
      if (_continuousRec) { try { _continuousRec.stop(); } catch (e) { } _continuousRec = null; }
    }

    // Apply saved mode on load
    _dvUpdateChatModeUI();
    // If saved mode has always-listen, start it after a brief delay
    if (_getChatMode().alwaysListen) setTimeout(_startContinuousListen, 2000);
    // If saved mode has voice-out, ensure narration is on
    if (_getChatMode().voiceOut) { _dvAutoRead = true; if (_vsState.narration) _vsState.narration.chat = true; }

    // ── Quick Voice Picker Popup ──
    function dvToggleVoicePicker() {
      const picker = document.getElementById('dv-voice-picker');
      if (!picker) return;
      if (picker.classList.contains('open')) { picker.classList.remove('open'); return; }

      // Render voice list grouped by category
      const groups = [
        { label: 'British Female', filter: v => v.accent === 'british' && v.gender === 'female' },
        { label: 'British Male', filter: v => v.accent === 'british' && v.gender === 'male' },
        { label: 'American Female', filter: v => v.accent === 'american' && v.gender === 'female' },
        { label: 'American Male', filter: v => v.accent === 'american' && v.gender === 'male' },
      ];
      let html = '';
      groups.forEach(g => {
        const voices = VS_VOICES.filter(g.filter);
        if (voices.length === 0) return;
        html += '<div style="font-size:8px;color:var(--t3);text-transform:uppercase;letter-spacing:1px;padding:4px 8px;margin-top:4px">' + g.label + '</div>';
        voices.forEach(v => {
          const sel = _vsState.voice === v.id ? ' selected' : '';
          const gradeColors = { a: '#4ade80', b: '#60a5fa', c: '#fbbf24', d: '#f87171' };
          const gc = gradeColors[v.grade[0].toLowerCase()] || '#94a3b8';
          html += '<div class="dvp-item' + sel + '" onclick="dvPickVoice(\'' + v.id + '\')">'
            + '<span class="dvp-name">' + v.name + '</span>'
            + '<span class="dvp-meta">' + v.id + '</span>'
            + '<span class="dvp-grade" style="background:' + gc + '22;color:' + gc + '">' + v.grade + '</span>'
            + '</div>';
        });
      });
      picker.innerHTML = html;
      picker.classList.add('open');

      // Close on outside click
      setTimeout(() => {
        const close = (e) => { if (!picker.contains(e.target)) { picker.classList.remove('open'); document.removeEventListener('click', close); } };
        document.addEventListener('click', close);
      }, 50);
    }

    function dvPickVoice(vid) {
      _vsState.voice = vid;
      vsSave();
      dvUpdateVoiceBar();
      document.getElementById('dv-voice-picker')?.classList.remove('open');
      // Also update Voice Studio grid if open
      vsRenderVoiceGrid(document.querySelector('.vs-filter-btn.on')?.dataset.vf || 'all');
      const vInfo = VS_VOICES.find(v => v.id === vid);
      addRichActivity({ msg: 'Voice changed to ' + (vInfo ? vInfo.name : vid), type: 'system', agent: 'System' });
    }

    // ── Slash Command Parser: /voice ──
    function dvParseVoiceCommand(text) {
      if (!text || !text.startsWith('/voice')) return null;
      const arg = text.replace(/^\/voice\s*/, '').toLowerCase().trim();
      if (!arg) return { action: 'list' };

      // Match by name, id, or keywords
      const match = VS_VOICES.find(v =>
        v.id.toLowerCase() === arg ||
        v.name.toLowerCase() === arg ||
        v.name.toLowerCase().startsWith(arg)
      );
      if (match) return { action: 'set', voice: match };

      // Match by keyword: male, female, british, american, neural, best
      if (arg === 'male' || arg === 'man') {
        const males = VS_VOICES.filter(v => v.gender === 'male').sort((a, b) => a.grade.localeCompare(b.grade));
        return { action: 'set', voice: males[0] };
      }
      if (arg === 'female' || arg === 'woman') {
        const females = VS_VOICES.filter(v => v.gender === 'female').sort((a, b) => a.grade.localeCompare(b.grade));
        return { action: 'set', voice: females[0] };
      }
      if (arg === 'british' || arg === 'uk') {
        const brits = VS_VOICES.filter(v => v.accent === 'british').sort((a, b) => a.grade.localeCompare(b.grade));
        return { action: 'set', voice: brits[0] };
      }
      if (arg === 'american' || arg === 'us') {
        const ams = VS_VOICES.filter(v => v.accent === 'american').sort((a, b) => a.grade.localeCompare(b.grade));
        return { action: 'set', voice: ams[0] };
      }
      if (arg === 'best') {
        const best = VS_VOICES.sort((a, b) => a.grade.localeCompare(b.grade))[0];
        return { action: 'set', voice: best };
      }
      if (arg === 'mute' || arg === 'off') return { action: 'mute' };
      if (arg === 'unmute' || arg === 'on') return { action: 'unmute' };
      if (arg === 'studio') return { action: 'studio' };
      if (arg === 'test' || arg === 'preview') return { action: 'test' };
      return { action: 'unknown', query: arg };
    }

    function dvHandleVoiceCommand(text) {
      const cmd = dvParseVoiceCommand(text);
      if (!cmd) return false;

      if (cmd.action === 'set' && cmd.voice) {
        dvPickVoice(cmd.voice.id);
        // Show feedback in think strip
        const tt = document.getElementById('tt');
        if (tt) tt.innerHTML = '<span class="ta" style="color:#D8B4FE">Voice:</span> Switched to <strong>' + cmd.voice.name + '</strong> (' + cmd.voice.accent + ' ' + cmd.voice.gender + ', grade ' + cmd.voice.grade + ')';
        // Quick preview
        vsSpeakRaw('Hello, I am ' + cmd.voice.name + '.', cmd.voice.id, _vsState.speed).catch(() => { });
        return true;
      }
      if (cmd.action === 'list') {
        dvToggleVoicePicker();
        return true;
      }
      if (cmd.action === 'mute') { if (!_vsMuted) dvToggleMute(); return true; }
      if (cmd.action === 'unmute') { if (_vsMuted) dvToggleMute(); return true; }
      if (cmd.action === 'studio') { openVoiceStudio(); return true; }
      if (cmd.action === 'test') {
        const v = VS_VOICES.find(x => x.id === _vsState.voice);
        vsSpeakRaw('Hello, I am DaveAI using ' + (v ? v.name : 'default') + ' voice.', _vsState.voice, _vsState.speed).catch(() => { });
        return true;
      }
      if (cmd.action === 'unknown') {
        const tt = document.getElementById('tt');
        if (tt) tt.innerHTML = '<span class="ta" style="color:#D8B4FE">Voice:</span> Unknown voice "' + cmd.query + '". Try: /voice emma, /voice male, /voice british, /voice best, /voice mute';
        return true;
      }
      return false;
    }

    // ── Speaking Indicator — pulses voice bar when TTS is active ──
    const _origVsSpeakRaw = vsSpeakRaw;
    // Wrap to add visual feedback (non-destructive)
    function _dvShowSpeaking(active) {
      const bar = document.getElementById('dv-voice-bar');
      if (bar) bar.classList.toggle('dvb-speaking', active);
    }

    // ── Initialize voice bar on page load ──
    setTimeout(() => {
      dvUpdateVoiceBar();
      // Run a quick background diag to populate the bar
      vsCheckEngine().then(() => dvUpdateVoiceBar()).catch(() => { });
    }, 2000);

    // ══════════════════════════════════════════════════════════
    //  CLEAN NAMING SYSTEM
    //  Admin sees raw filenames with extensions.
    //  Normal users see cleaned names (no extension, no _ or -).
    //  Users can unlock "Show file extensions" in Settings (locked by default).
    // ══════════════════════════════════════════════════════════

    // Known multi-part extensions (order matters — longest first)
    const MULTI_EXTS = ['.tar.gz', '.tar.bz2', '.tar.xz'];

    function cleanName(raw) {
      if (!raw || typeof raw !== 'string') return '';
      let name = raw.trim();
      // Strip known multi-part extensions first
      for (const ext of MULTI_EXTS) {
        if (name.toLowerCase().endsWith(ext)) {
          name = name.slice(0, -ext.length);
          break;
        }
      }
      // Strip single extension (last .xxx up to 10 chars)
      name = name.replace(/\.[a-zA-Z0-9]{1,10}$/, '');
      // Replace underscores and dashes with spaces
      name = name.replace(/[_\-]+/g, ' ');
      // Collapse multiple spaces
      name = name.replace(/\s{2,}/g, ' ').trim();
      // Title-case each word
      name = name.replace(/\b\w/g, c => c.toUpperCase());
      return name;
    }

    function getShowExtensions() {
      // Admin always sees extensions unless they explicitly turned it off
      const stored = localStorage.getItem('daveai_show_ext');
