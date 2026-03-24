// DaveAI v7 - canvas.js //

    // ══ LAYOUTS ══
    const layouts = [
      { n: 'Horizons', c: ['#9333EA', '#0A0D18', '#2563EB'] }, { n: 'Nova', c: ['#EC4899', '#130B1A', '#F97316'] },
      { n: 'Terminal', c: ['#10B981', '#061009', '#22D3EE'] }, { n: 'Canvas', c: ['#F59E0B', '#12100A', '#EF4444'] },
      { n: 'Studio', c: ['#6366F1', '#0A0A1A', '#A78BFA'] }, { n: 'Zen', c: ['#64748B', '#0E1216', '#94A3B8'] },
      { n: 'Spectra', c: ['#F472B6', '#0D0812', '#818CF8'] }, { n: 'Mosaic', c: ['#34D399', '#06120A', '#FB923C'] },
      { n: 'Momentum', c: ['#38BDF8', '#06101A', '#6EE7B7'] }, { n: 'Chronicle', c: ['#FDE68A', '#120F04', '#D97706'] },
      { n: 'Matrix', c: ['#4ADE80', '#040C04', '#22C55E'] }, { n: 'Cosmos', c: ['#C084FC', '#09041A', '#818CF8'] },
    ];
    function openLp() {
      document.getElementById('lgrid').innerHTML = layouts.map((l, i) => `
    <div class="lcard${i === selLayout ? ' sel' : ''}" onclick="selLp(${i})" id="lc${i}">
      <div class="lthumb" style="background:${l.c[1]}">
        <div class="lti">
          <div class="lt-bar" style="background:${l.c[0]};opacity:.45"></div>
          <div class="lt-body">
            <div class="lt-c" style="background:${l.c[0]};opacity:.2;flex:1"></div>
            <div class="lt-c" style="background:${l.c[2]};opacity:.15;flex:4"></div>
            <div class="lt-c" style="background:${l.c[0]};opacity:.2;flex:1.5"></div>
          </div>
          <div style="height:16px;padding:3px 4px;display:flex;gap:2px;align-items:center">
            <div style="height:6px;border-radius:2px;background:${l.c[0]};opacity:.2;flex:1"></div>
            <div style="width:12px;height:12px;border-radius:50%;background:${l.c[2]};opacity:.25"></div>
          </div>
        </div>
      </div>
      <div class="lname">${l.n}</div>
    </div>`).join('');
      document.getElementById('lp-ov').classList.remove('hid');
    }
    function selLp(i) { selLayout = i; localStorage.setItem('daveai_layout', i); document.querySelectorAll('.lcard').forEach((c, j) => c.classList.toggle('sel', j === i)); }
    function closeLp() { document.getElementById('ln').textContent = layouts[selLayout].n; document.getElementById('lp-ov').classList.add('hid'); }
    // Restore saved layout
    (function restoreLayout() { const s = parseInt(localStorage.getItem('daveai_layout'), 10); if (!isNaN(s) && s >= 0 && s < layouts.length) { selLayout = s; const ln = document.getElementById('ln'); if (ln) ln.textContent = layouts[s].n; } })();

    // ══ DEVICE MODES ══
    const DEVICE_WIDTHS = { desktop: '100%', tablet: '768px', android: '412px', mobile: '375px' };
    const DEVICE_LABELS = { desktop: 'Desktop 1280px+', tablet: 'Tablet 768px', android: 'Android 412px', mobile: 'Mobile 375px' };
    function setDeviceMode(mode) {
      curDeviceMode = mode;
      const main = document.getElementById('main');
      main.className = 'dm-' + mode;
      // topbar device buttons
      ['desktop', 'tablet', 'android', 'mobile'].forEach(m => {
        const tb = document.getElementById('dm-' + m);
        const ct = document.getElementById('ct-' + m);
        const sb = document.getElementById('dsb-' + m);
        if (tb) tb.classList.toggle('on', m === mode);
        if (ct) ct.classList.toggle('on', m === mode);
        if (sb) sb.classList.toggle('on', m === mode);
      });
      // label
      const lbl = document.getElementById('dm-label');
      if (mode === 'desktop') { lbl.style.display = 'none'; }
      else { lbl.style.display = 'flex'; lbl.innerHTML = `<i class="fas fa-ruler" style="font-size:8px"></i> ${DEVICE_WIDTHS[mode]}`; }
      // bframe chrome visibility
      const chrome = document.querySelector('.frame-chrome');
      if (chrome) chrome.style.display = mode !== 'desktop' ? 'flex' : 'none';
    }

                  setPreviewUrl('https://daveai.tech/' + ev.file_written);
                } else {
                  setTimeout(refreshPreview, 1500);
                }
              }
              if (ev.preview_url) {
                isBuildMode = true; // Preview URL means we're building
                setPreviewUrl(ev.preview_url);
              }
              // Detect build mode from event indicators
              if (ev.tool_call || ev.file_written || ev.preview_url || ev.created_files) {
                isBuildMode = true;
              }
              // Build status bar updates (only in build mode)
              const bst = document.getElementById('bst');
              const bstText = document.getElementById('bst-text');
              if ((ev.type === 'start' || ev.type === 'step') && isBuildMode) {
                if (bst) bst.style.display = '';
                if (bstText) bstText.textContent = ev.msg || 'Working…';
                if (ev.preview_url) setPreviewUrl(ev.preview_url);
                else if (ev.created_files) {
                  const html = ev.created_files.find(f => f.endsWith('.html'));
                  if (html) setPreviewUrl('https://daveai.tech/' + html);
                }
              }
            } catch (e) { }
          });
        }
        addToHistory('ai', fullText);
    function refreshPreview() {
      if (!currentPreviewUrl) return; // no preview loaded yet
      const frame = document.getElementById('preview-frame');
      const loader = document.getElementById('preview-loading');
      if (loader) { loader.style.opacity = '1'; loader.style.pointerEvents = ''; }
      if (frame) {
        frame.src = currentPreviewUrl + (currentPreviewUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
      }
      addRichActivity({ msg: 'Preview refreshed', type: 'system', agent: 'System' });
    }

    function setPreviewUrl(url) {
      currentPreviewUrl = url;
      const frame = document.getElementById('preview-frame');
      const loader = document.getElementById('preview-loading');
      const urlBar = document.querySelector('.burl');
      if (loader) { loader.style.opacity = '1'; loader.style.pointerEvents = ''; }
      if (frame) frame.src = url;
      if (urlBar) urlBar.innerHTML = '<i class="fas fa-lock" style="font-size:9px;color:#059669"></i> ' + url.replace(/^https?:\/\//, '').split('/').slice(0, 2).join('/');
    }

    // Hide loading overlay when iframe finishes loading a real URL (not about:blank)
    (function initPreviewFrame() {
      const frame = document.getElementById('preview-frame');
      if (frame) {
        frame.addEventListener('load', () => {
          if (!currentPreviewUrl) return; // keep overlay visible for about:blank
          const loader = document.getElementById('preview-loading');
          if (loader) { loader.style.opacity = '0'; loader.style.pointerEvents = 'none'; }
        });
      }
    })();

    // ══ TARGET / ELEMENT SELECTION ══
    let curTarget = null;
    function target(el, elId) {
      if (curTarget) curTarget.classList.remove('sel');
      curTarget = el;
      el.classList.add('sel');
      // #tc is the target chip (display:none → .on shows it), #tl is the label span
      const tcEl = document.getElementById('tc');
      const tlEl = document.getElementById('tl');
      if (tlEl) tlEl.textContent = elId;
      if (tcEl) tcEl.classList.add('on');
      const inp = document.getElementById('pi');
      if (inp) inp.placeholder = `Editing: ${elId} — describe the change…`;
    }
    function clearTgt() {
      if (curTarget) { curTarget.classList.remove('sel'); curTarget = null; }
      const tcEl = document.getElementById('tc');
      if (tcEl) tcEl.classList.remove('on');
      const inp = document.getElementById('pi');
      if (inp) inp.placeholder = 'Describe what you want to build or change…';
    }

    // ══ SUGGESTION CHIPS ══
    function useSug(el) {
      const inp = document.getElementById('pi');
      if (inp) { inp.value = el.textContent.trim(); inp.focus(); }
    }
    function applyChanges() {
      const inp = document.getElementById('pi');
      const tgt = curTarget ? curTarget.id : 'page';
      if (inp && inp.value.trim()) {
        if (curTarget) inp.value = `[target:${tgt}] ${inp.value.trim()}`;
        think();
        clearTgt();
      }
    }

    // ══ CHAT INPUT AUTO-RESIZE ══
    function chatKeydown(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); think(); }
    }
    function chatInput(el) {
      el.style.height = '36px';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }

    // ══ AUTH HELPERS ══
    function toggleDd() { const dd = document.getElementById('dd'); if (dd) dd.classList.toggle('open'); }
    document.addEventListener('click', e => { const dd = document.getElementById('dd'); if (dd && !e.target.closest('.avatar') && !e.target.closest('.dropdown')) dd.classList.remove('open'); });

    // ══ LAYOUT PICKER — (primary openLp/closeLp/selLp defined above near LAYOUTS array) ══
    function pickLayout(name) {
      document.getElementById('ln').textContent = name;
      closeLp();
      addRichActivity({ msg: `Layout changed to ${name}`, type: 'system', agent: 'System' });
    }

    // ══ SEED INITIAL ACTIVITY ══
    let _vsSeeding = false; // suppress ALL voice narration during seed
    function seedActivity() {
      _vsSeeding = true;
      const events = [
        { msg: 'Session started — brain online', type: 'system', agent: 'Supervisor' },
        // Alice's expanded welcome message — visual only, NOT narrated (intro handles greeting)
        { msg: "Hello, I'm Alice, your AI assistant from DaveAI. I'm here to help you build websites, games, and applications with my team of four specialized agents. Together, we offer real-time preview across desktop, tablet, and mobile devices... voice-guided workflows with natural British and American voices... and over one hundred sixteen integrated tools. We handle everything from code generation and quality assurance, to analytics, database management, and one-click deployment. Let's create something amazing together!", type: 'system', agent: 'Supervisor' },
        { msg: '116 tools registered across 12 categories', type: 'system', agent: 'Supervisor' },
        { msg: 'Created layout.tsx with Tailwind base', type: 'write', agent: 'Coder', file: 'layout.tsx', hash: 'c9b3c41' },
        { msg: 'Generated gradient background asset', type: 'write', agent: 'Asset', file: 'bg-gradient.svg' },
        { msg: 'Routed "add hero section" to Coder', type: 'system', agent: 'Supervisor' },
        { msg: 'Scaffolded Hero.tsx component', type: 'write', agent: 'Coder', file: 'Hero.tsx', hash: 'a3f91b2' },
        { msg: 'Contrast ratios — all pass', type: 'done', agent: 'QA' },
      ];
      // stagger seed entries to look like a real timeline
      events.forEach((ev, i) => setTimeout(() => addRichActivity(ev), i * 180));
      // clear seeding flag after all events fire (last event at 7*180 = 1260ms + buffer)
      setTimeout(() => { _vsSeeding = false; }, events.length * 180 + 200);
    }

    // ══ POLLING COORDINATOR ══
    function startPolling() {
      setPreviewUrl(url);
      renderProjects();
      // Enter game mode — keeps chat accessible with floating controls
      _enterGameMode();
      addRichActivity({ msg: 'Game launched — chat + voice still active! Use the floating controls.', type: 'done', agent: 'System' });
      // Greet with voice
      if (!_vsMuted && typeof vsSpeakRaw === 'function') {
        setTimeout(() => vsSpeakRaw("Game loaded! I'm here if you need anything. Just type or speak.", _vsState.voice, _vsState.speed), 1000);
      }
    }

    function demoCreate() {
      _hideDemoHero();
      _exitGameMode();
      // Reset preview to blank
      currentPreviewUrl = '';
      const frame = document.getElementById('preview-frame');
      if (frame) frame.src = 'about:blank';
      const loader = document.getElementById('preview-loading');
      if (loader) { loader.style.opacity = '1'; loader.style.pointerEvents = ''; }
      // Focus chat input
      const inp = document.getElementById('pi');
      if (inp) { inp.focus(); inp.placeholder = 'What would you like to build? Describe your idea...'; }
      addRichActivity({ msg: 'Showcase dismissed — ready to create', type: 'system', agent: 'System' });
    }

    // ══════════════════════════════════════════════════════════
    //  GAME MODE — seamless chat + game + voice experience
    //  Game plays in preview, chat stays usable, voice narrates
    // ══════════════════════════════════════════════════════════

    function _enterGameMode() {
      _gameMode = true;
      const bar = document.getElementById('game-ctrl-bar');
      if (bar) bar.classList.add('active');
      _syncGameVoiceBtn();
    }

    function _exitGameMode() {
      _gameMode = false;
      const bar = document.getElementById('game-ctrl-bar');
      if (bar) bar.classList.remove('active');
      const vi = document.getElementById('game-voice-indicator');
      if (vi) vi.classList.remove('active');
      const mc = document.getElementById('mini-chat');
      if (mc) mc.classList.remove('active');
      _gameMiniChatOpen = false;
      if (_immersive) exitImmersive();
    }

    // Game control bar actions
    function gameToggleVoice() {
      _vsMuted = !_vsMuted;
      if (_vsState) { _vsState.muted = _vsMuted; vsSave(); }
      _syncGameVoiceBtn();
      const msg = _vsMuted ? 'Voice muted' : 'Voice enabled';
      addRichActivity({ msg: msg, type: 'system', agent: 'System' });
      if (!_vsMuted && typeof vsSpeakRaw === 'function') {
        vsSpeakRaw("Voice is back on!", _vsState.voice, _vsState.speed);
      }
    }

    function _syncGameVoiceBtn() {
      const btn = document.getElementById('gcb-voice');
      if (!btn) return;
      const icon = btn.querySelector('i');
      if (icon) icon.className = _vsMuted ? 'fas fa-volume-xmark' : 'fas fa-volume-high';
      btn.style.color = _vsMuted ? '#FCA5A5' : '';
    }

    function gameFullscreen() {
      enterImmersive();
      // In immersive game mode, show mini-chat toggle hint
      if (!_gameMiniChatOpen) {
        addRichActivity({ msg: 'Fullscreen game — press Esc to exit, or use floating chat', type: 'system', agent: 'System' });
      }
    }

    function gameMinimize() {
      _demoSaveProgress();
      _exitGameMode();
      // Reset to demo hero
      _demoMinimized = false;
      loadDemoOnStart();
      addRichActivity({ msg: 'Game minimized — progress saved', type: 'system', agent: 'System' });
    }

    // Mini-chat for immersive game mode
    function gameToggleMiniChat() {
      _gameMiniChatOpen = !_gameMiniChatOpen;
      const mc = document.getElementById('mini-chat');
      if (mc) mc.classList.toggle('active', _gameMiniChatOpen);
      if (_gameMiniChatOpen) {
        const inp = document.getElementById('mc-input');
        if (inp) setTimeout(() => inp.focus(), 100);
      }
    }

    function mcSend() {
      const inp = document.getElementById('mc-input');
      if (!inp || !inp.value.trim()) return;
      const text = inp.value.trim();
      inp.value = '';
      // Show user message in mini-chat
      _mcAddMsg(text, true);
      // Mirror to main chat
      const mainInp = document.getElementById('pi');
      if (mainInp) { mainInp.value = text; }
      think();
      // Auto-respond acknowledgment
      setTimeout(() => _mcAddMsg('Processing...', false), 300);
    }

    function _mcAddMsg(text, isUser) {
      const container = document.getElementById('mc-messages');
      if (!container) return;
      const div = document.createElement('div');
      div.className = 'mc-msg' + (isUser ? ' mc-user' : '');
      div.textContent = text;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
      // Cap at 50 messages
      while (container.children.length > 50) container.removeChild(container.firstChild);
    }

    // Show voice indicator during TTS in game mode
    function _gameShowVoiceIndicator(speaking, text) {
      if (!_gameMode) return;
      const vi = document.getElementById('game-voice-indicator');
      if (!vi) return;
      vi.classList.toggle('active', speaking);
      const label = document.getElementById('gvi-text');
      if (label && speaking) label.textContent = text || 'DaveAI speaking…';
    }

    // Mirror chat responses to mini-chat when in game mode
    function _gameMirrorResponse(text) {
      if (_gameMode && _gameMiniChatOpen) {
        _mcAddMsg(text, false);
      }
    }

    // Admin: apply demo config from settings
    function applyDemo() {
      const sel = document.getElementById('demo-project-select');
      if (!sel || !sel.value) return;
      const cfg = {
        projectId: sel.value,
        title: (document.getElementById('demo-custom-title')?.value || '').trim() || null,
        sub: (document.getElementById('demo-custom-sub')?.value || '').trim() || null
      };
      setDemoConfig(cfg);
      // Show it immediately
      const all = getProjects();
      const p = all.find(x => x.id === cfg.projectId);
      if (p && p.url) _showDemoHero(p, cfg);
      const saved = document.getElementById('stg-demo-saved');
      if (saved) { saved.classList.add('show'); setTimeout(() => saved.classList.remove('show'), 1500); }
      addRichActivity({ msg: 'Admin set showcase: ' + (p ? p.name : cfg.projectId), type: 'system', agent: 'System' });
    }

    function clearDemo() {
      localStorage.removeItem('daveai_demo');
      _hideDemoHero();
      const sel = document.getElementById('demo-project-select');
      if (sel) sel.value = '';
      const saved = document.getElementById('stg-demo-saved');
      if (saved) { saved.classList.add('show'); setTimeout(() => saved.classList.remove('show'), 1500); }
      addRichActivity({ msg: 'Admin cleared showcase demo', type: 'system', agent: 'System' });
    }

    // Admin: edit showcase title/subtitle inline
    function demoAdminEdit() {
      const titleEl = document.getElementById('demo-title');
      const subEl = document.getElementById('demo-sub');
      if (!titleEl) return;
      const newTitle = prompt('Showcase title:', titleEl.textContent || '');
      if (newTitle === null) return;
      const newSub = prompt('Showcase subtitle:', subEl?.textContent || '');
      if (newSub === null) return;
      const cfg = getDemoConfig() || {};
      cfg.title = newTitle.trim() || cfg.title;
      cfg.sub = newSub.trim() || cfg.sub;
      setDemoConfig(cfg);
      if (titleEl) titleEl.textContent = cfg.title;
      if (subEl) subEl.textContent = cfg.sub;
      addRichActivity({ msg: 'Admin edited showcase: ' + cfg.title, type: 'system', agent: 'System' });
    }

    // Admin: swap to a different project as showcase
    function demoAdminSwap() {
      const all = getProjects().filter(p => p.url);
      if (all.length === 0) { alert('No projects with URLs available'); return; }
      const cfg = getDemoConfig() || {};
      const currentId = cfg.projectId;
      // Cycle to next project
      const idx = all.findIndex(p => p.id === currentId);
      const next = all[(idx + 1) % all.length];
      cfg.projectId = next.id;
      cfg.title = typeof cleanName === 'function' ? cleanName(next.name) : next.name;
      cfg.sub = DEMO_DEFAULT_SUBS[next.cat] || '';
      setDemoConfig(cfg);
      _showDemoHero(next, cfg);
      addRichActivity({ msg: 'Admin swapped showcase to: ' + next.name, type: 'system', agent: 'System' });
    }

    function demoSelectChanged() {
      const sel = document.getElementById('demo-project-select');
      if (!sel || !sel.value) return;
      const all = getProjects();
      const p = all.find(x => x.id === sel.value);
      if (!p) return;
      const titleInp = document.getElementById('demo-custom-title');
      const subInp = document.getElementById('demo-custom-sub');
      if (titleInp && !titleInp.value) titleInp.value = typeof cleanName === 'function' ? cleanName(p.name) : p.name;
      if (subInp && !subInp.value) subInp.value = DEMO_DEFAULT_SUBS[p.cat] || '';
    }

    function _syncDemoEditor() {
      const sel = document.getElementById('demo-project-select');
      const section = document.getElementById('stg-demo-section');
      if (!sel) return;
      // Only show for admin
      setPreviewUrl(p.url);
      renderProjects();
      addRichActivity({ msg: 'Loaded project: ' + p.name, type: 'system', agent: 'System' });
      // Update suggestions based on project category
      updateSuggestions();
      // Close fly-out so preview is visible
      closePp();
      // Auto-enter immersive if setting is on
      if (getImmersivePref()) {
        setTimeout(enterImmersive, 300);
      }
    }

    function delProject(id) {
      if (!confirm('Remove this project from the list?')) return;
      const all = getProjects().filter(p => p.id !== id);
      saveProjects(all);
      if (_projSelected === id) _projSelected = null;
      renderProjects();
    }

    function showProjForm() {
      document.getElementById('proj-form').style.display = '';
      document.getElementById('proj-add-btn').style.display = 'none';
      document.getElementById('proj-inp-name').focus();
    }
    function hideProjForm() {
      document.getElementById('proj-form').style.display = 'none';
      document.getElementById('proj-add-btn').style.display = '';
      document.getElementById('proj-inp-name').value = '';
      document.getElementById('proj-inp-url').value = '';
    }

    function saveNewProject() {
      const name = document.getElementById('proj-inp-name').value.trim();
      const url = document.getElementById('proj-inp-url').value.trim();
      if (!name) { document.getElementById('proj-inp-name').focus(); return; }
      const all = getProjects();
      all.push({
        id: 'p' + Date.now(),
        name: name,
        url: url || '',
        cat: _projCat,
        status: 'draft',
        ts: Date.now()
      });
      saveProjects(all);
      hideProjForm();
      renderProjects();
      addRichActivity({ msg: 'Added project: ' + name + ' (' + _projCat + ')', type: 'system', agent: 'System' });
      // Persist to PostgreSQL
      if (typeof _dbSaveProject === 'function') _dbSaveProject(name, url || '', _projCat, 'draft');
    }

    // Initialize projects on load
    seedProjects();
    // Load demo/showcase if configured
    loadDemoOnStart();

    // ══════════════════════════════════════════════════════════
      // Apply the selected device mode to the app
      if (typeof setDeviceMode === 'function') {
        setDeviceMode(deviceMode || 'desktop');
      }
      console.log('[Intro] User chose device:', deviceMode);
      const splash = document.getElementById('intro-splash');
      const muteBtn = document.getElementById('intro-mute');
      const muteIcon = document.getElementById('intro-mute-icon');
      const skipBtn = document.getElementById('intro-skip');
      const prompt = document.getElementById('intro-unmute-prompt');
      const volControl = document.getElementById('intro-vol-control');
      // Hide splash
      if (splash) splash.style.display = 'none';
      // Show controls
      if (skipBtn) skipBtn.style.display = '';
      if (volControl) volControl.style.display = 'flex';
      vid.addEventListener('ended', dismissIntro, { once: true });
      // Play with sound — inside click handler so browser allows it
      vid.muted = false;
      vid.volume = getIntroVol() / 100;
      try {
        await vid.play();
        if (muteBtn) muteBtn.style.display = '';
        if (muteIcon) muteIcon.className = 'fas fa-volume-up';
        if (prompt) prompt.style.display = 'none';
        console.log('[Intro] Playing WITH audio (user-initiated, mode:', deviceMode + ')');
      } catch (e) {
        vid.muted = true;
        vid.play().catch(() => { });
        if (prompt) prompt.style.display = '';
        if (muteBtn) muteBtn.style.display = 'none';
        console.log('[Intro] Fallback muted:', e.message);
      }
    }

    function introUnmute() {
      const vid = document.getElementById('intro-video');
      if (vid) { vid.muted = false; vid.volume = getIntroVol() / 100; }
      const prompt = document.getElementById('intro-unmute-prompt');
      const muteBtn = document.getElementById('intro-mute');
      const icon = document.getElementById('intro-mute-icon');
      if (prompt) prompt.style.display = 'none';
      if (muteBtn) muteBtn.style.display = '';
      if (icon) icon.className = 'fas fa-volume-up';
    }

    function introToggleMute() {
      const vid = document.getElementById('intro-video');
      const icon = document.getElementById('intro-mute-icon');
      if (!vid) return;
      vid.muted = !vid.muted;
      if (icon) icon.className = vid.muted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
    }

    function introSetVolume(val) {
      const vid = document.getElementById('intro-video');
      const label = document.getElementById('intro-vol-label');
      if (vid) {
        vid.volume = val / 100;
        if (vid.muted && val > 0) vid.muted = false;
      }
      if (label) label.textContent = val + '%';
      localStorage.setItem('daveai_intro_vol', val);
    }

    function dismissIntro() {
      const ov = document.getElementById('intro-ov');
      if (!ov || ov.classList.contains('hid')) return;
      ov.classList.add('fade-out');
      const vid = document.getElementById('intro-video');
      const volControl = document.getElementById('intro-vol-control');
      if (vid) { vid.pause(); vid.removeAttribute('src'); vid.load(); }
      if (volControl) volControl.style.display = 'none';
      setTimeout(() => {
        ov.classList.add('hid'); ov.classList.remove('fade-out');
        // Intro finished — release audio lock, TTS can speak again
        _vsIntroPlaying = false;
      }, 600);
    }

    function skipIntro() { dismissIntro(); }

    // ══ PROFILE MODAL ══
    function openProfileModal() {
      const dd = document.getElementById('dd');
      if (dd) dd.style.display = 'none';
      let ov = document.getElementById('profile-ov');
      if (!ov) {
        ov = document.createElement('div');
        ov.id = 'profile-ov';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;justify-content:center;align-items:center;z-index:99998;backdrop-filter:blur(4px)';
        ov.onclick = (e) => { if (e.target === ov) closeProfileModal(); };
        const box = document.createElement('div');
        box.id = 'profile-box';
        box.style.cssText = 'width:400px;max-height:80vh;background:rgba(18,18,32,.98);border:1px solid rgba(99,102,241,.35);border-radius:14px;box-shadow:0 12px 50px rgba(0,0,0,.7);overflow-y:auto;padding:0';
        ov.appendChild(box);
        document.body.appendChild(ov);
      }
      ov.style.display = 'flex';
      _renderProfileContent();
    }
    function closeProfileModal() {
      const ov = document.getElementById('profile-ov');
      if (ov) ov.style.display = 'none';
    }
    function _renderProfileContent() {
      const box = document.getElementById('profile-box');
      if (!box) return;
      const user = typeof currentUser !== 'undefined' ? currentUser : null;
      const name = user?.name || user?.username || localStorage.getItem('daveai_user_name') || 'User';
      const email = user?.email || localStorage.getItem('daveai_user_email') || '';
      const role = user?.role || (typeof isAdmin !== 'undefined' && isAdmin ? 'admin' : 'user');
      const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'U';
      const joined = user?.created || localStorage.getItem('daveai_user_created') || new Date().toISOString();
      const joinedDate = new Date(joined).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      box.innerHTML = ''
        + '<div style="padding:20px 24px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">'
        + '<span style="font-size:14px;font-weight:600;color:var(--t1)">Edit Profile</span>'
        + '<button onclick="closeProfileModal()" style="background:none;border:none;color:var(--t3);font-size:16px;cursor:pointer;padding:2px 6px">&times;</button>'
        + '</div>'
        + '<div style="padding:24px;display:flex;flex-direction:column;align-items:center;gap:16px">'
        + '<div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#fff;letter-spacing:1px;box-shadow:0 4px 20px rgba(99,102,241,.4)">' + initials + '</div>'
        + '<span style="font-size:9px;color:var(--t3);background:rgba(99,102,241,.15);padding:2px 10px;border-radius:10px;text-transform:uppercase;letter-spacing:.06em">' + role + '</span>'
        + '<span style="font-size:9px;color:var(--t3)">Joined ' + joinedDate + '</span>'
        + '</div>'
        + '<div style="padding:0 24px 20px;display:flex;flex-direction:column;gap:12px">'
        + '<label style="font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.06em">Display Name</label>'
        + '<input id="prof-name" type="text" value="' + escHtml(name) + '" style="background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--t1);font-size:12px;outline:none;font-family:inherit" placeholder="Your name">'
        + '<label style="font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.06em">Email</label>'
        + '<input id="prof-email" type="email" value="' + escHtml(email) + '" style="background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--t1);font-size:12px;outline:none;font-family:inherit" placeholder="your@email.com">'
        + '<div style="display:flex;gap:8px;margin-top:8px">'
        + '<button onclick="_saveProfile()" style="flex:1;padding:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;border-radius:6px;color:#fff;font-size:11px;font-weight:600;cursor:pointer;transition:opacity .15s">Save Changes</button>'
        + '<button onclick="closeProfileModal()" style="padding:8px 16px;background:rgba(255,255,255,.06);border:1px solid var(--border);border-radius:6px;color:var(--t2);font-size:11px;cursor:pointer">Cancel</button>'
        + '</div>'
        + '<div id="prof-status" style="font-size:10px;text-align:center;min-height:16px;transition:opacity .3s"></div>'
        + '</div>';
    }
    async function _saveProfile() {
      const nameInp = document.getElementById('prof-name');
      const emailInp = document.getElementById('prof-email');
      const status = document.getElementById('prof-status');
      if (!nameInp || !emailInp) return;
      const name = nameInp.value.trim();
      const email = emailInp.value.trim();
      if (!name) { if (status) { status.style.color = '#F87171'; status.textContent = 'Name is required'; } return; }
      if (status) { status.style.color = 'var(--t3)'; status.textContent = 'Saving…'; }
      // Update localStorage
      localStorage.setItem('daveai_user_name', name);
      localStorage.setItem('daveai_user_email', email);
      // Update avatar initials
      const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'U';
      const av = document.querySelector('.avatar');
      if (av) av.textContent = initials;
      // Try to update on server
      try {
        const username = typeof currentUser !== 'undefined' && currentUser?.username ? currentUser.username : name;
        await fetch('/api/db/users/' + encodeURIComponent(username), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_name: name, email })
        });
      } catch { /* offline — local-only save is fine */ }
      if (typeof currentUser !== 'undefined' && currentUser) { currentUser.name = name; currentUser.email = email; }
      if (status) { status.style.color = '#6EE7B7'; status.textContent = 'Profile saved!'; setTimeout(() => { status.textContent = ''; }, 2000); }
      addRichActivity({ msg: 'Profile updated: ' + name, type: 'system', agent: 'System' });
    }

    // ══ SETTINGS MODAL ══
    function openSettings() {
      const ov = document.getElementById('settings-ov');
      if (ov) ov.classList.remove('hid');
      // Close dropdown if open
      const dd = document.getElementById('dd');
      if (dd) dd.style.display = 'none';
      refreshSettingsUI();
    }

    function closeSettings() {
      const ov = document.getElementById('settings-ov');
      if (ov) ov.classList.add('hid');
    }

    function refreshSettingsUI() {
      const pref = getIntroPref();
      document.querySelectorAll('#stg-intro-opts .stg-opt').forEach(el => {
        el.classList.toggle('active', el.dataset.val === pref);
      });
      const vol = getIntroVol();
      const slider = document.getElementById('stg-intro-vol');
      const label = document.getElementById('stg-vol-label');
      if (slider) slider.value = vol;
      if (label) label.textContent = vol + '%';
      // Sync file extensions toggle state
      _syncExtToggle();
      // Sync immersive view toggles
      _syncImmersiveToggles();
      // Sync demo editor
      _syncDemoEditor();
      // Sync voice toggle
      const vcb = document.getElementById('stg-voice-cb');
      if (vcb && typeof _vsMuted !== 'undefined') vcb.checked = !_vsMuted;
    }

    function setIntroPref(val) {
      localStorage.setItem('daveai_intro_pref', val);
      refreshSettingsUI();
      const saved = document.getElementById('stg-intro-saved');
      if (saved) { saved.classList.add('show'); setTimeout(() => saved.classList.remove('show'), 1500); }
    }

    function setIntroVol(val) {
      localStorage.setItem('daveai_intro_vol', val);
      const label = document.getElementById('stg-vol-label');
      if (label) label.textContent = val + '%';
    }

    // ══════════════════════════════════════════════════════════
    //  INITIALISATION
    // ══════════════════════════════════════════════════════════
      setDeviceMode('desktop');// default device mode

      // Wire auth form Enter key
      ['am-email', 'am-pass', 'am-pass2', 'am-name'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); authSubmit(); } });
      });

      // Wire chat input
      const chatInp = document.getElementById('pi');
      if (chatInp) {
        chatInp.addEventListener('input', () => {
          // auto-show chat feed when user starts typing
          const feed = document.getElementById('chat-feed');
          if (feed && chatInp.value) feed.style.display = 'flex';
        });
      }

