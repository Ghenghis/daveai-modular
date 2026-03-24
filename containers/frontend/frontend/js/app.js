// DaveAI v7 - app.js //

    // ══ STATE ══
    const BRAIN = 'https://daveai.tech';
    let curTgt = null, micOn = false, rpOpen = true, ppOpen = false, selLayout = 0;
    let curPanel = 'preview', curFpTab = 'pages', curRpTab = 'activity';
    let curDeviceMode = 'desktop', curToolRole = 'all', toolSearch = '';
    let sessionHistory = [], micRecognition = null, activeToolName = null;
    const pi = document.getElementById('pi');
    const ts = document.getElementById('ts');
    const tt = document.getElementById('tt');
    const tc = document.getElementById('tc');
    const tl = document.getElementById('tl');

    // ══ AUTH ══
    const TOKEN_KEY = 'daveai_token';
    const TOKEN_TS_KEY = 'daveai_token_ts';
    const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

    document.addEventListener('DOMContentLoaded', () => {
      const pp = document.getElementById('pp');
      if (pp) {
        pp.addEventListener('click', () => { if (ppOpen && _ppTimerId) _startPpTimer(); });
        pp.addEventListener('scroll', () => { if (ppOpen && _ppTimerId) _startPpTimer(); }, true);
      }
    });
    function updateSbActive(tab) {
      document.querySelectorAll('#lsb .sb-btn').forEach(b => b.classList.remove('on'));
      const map = { projects: 0, pages: 1, sites: 2, database: 3, tools: 7, agents: 8, skills: 9 };
      const btns = document.querySelectorAll('#lsb .sb-btn');
      if (btns[map[tab] !== undefined ? map[tab] : 0]) btns[map[tab] !== undefined ? map[tab] : 0].classList.add('on');
    }
    function clearSbActive() { document.querySelectorAll('#lsb .sb-btn').forEach(b => b.classList.remove('on')); }
    function setFpTab(t) {
      curFpTab = t;
      ['projects', 'pages', 'sites', 'tools', 'agents', 'database', 'skills'].forEach(n => {
        const tab = document.getElementById('fpt-' + n);
        const pane = document.getElementById('fp-' + n);
        if (tab) tab.classList.toggle('on', n === t);
        const flexTabs = ['tools', 'projects', 'database', 'skills'];
        if (pane) pane.style.display = n === t ? (flexTabs.includes(n) ? 'flex' : 'block') : 'none';
      });
      const titles = { database: 'Database', skills: 'Skills' };
      document.getElementById('pp-title').textContent = titles[t] || (t.charAt(0).toUpperCase() + t.slice(1));
    document.addEventListener('DOMContentLoaded', () => {
      const inp = document.getElementById('pi');
      if (inp) {
        inp.addEventListener('focus', () => {
          clearTimeout(_demoIdleTimer);
          _demoAutoMinimize();
        });
      }
    });

    function _showDemoHero(project, cfg) {
      const hero = document.getElementById('demo-hero');
      if (!hero) return;
      const cat = project.cat || 'other';
      const title = cfg.title || (typeof cleanName === 'function' ? cleanName(project.name) : project.name);
      const sub = cfg.sub || DEMO_DEFAULT_SUBS[cat] || '';

      // Update badge
      const badge = document.getElementById('demo-cat-badge');
      if (badge) {
        badge.className = 'demo-cat-badge ' + cat;
        badge.querySelector('i').className = 'fas ' + (DEMO_CAT_ICONS[cat] || 'fa-folder');
      }
      const catText = document.getElementById('demo-cat-text');
      if (catText) catText.textContent = DEMO_CAT_LABELS[cat] || 'Project';

      // Update content
      const titleEl = document.getElementById('demo-title');
      if (titleEl) titleEl.textContent = title;
      const subEl = document.getElementById('demo-sub');
      if (subEl) subEl.textContent = sub;
      const statusEl = document.getElementById('demo-status');
      if (statusEl) statusEl.textContent = project.status === 'live' ? 'Live' : 'Draft';
      const catLabel = document.getElementById('demo-cat-label');
      if (catLabel) catLabel.textContent = (cat.charAt(0).toUpperCase() + cat.slice(1));

      // Store URL for play action
      hero.dataset.url = project.url;
      hero.dataset.projectId = project.id;

      // Show hero, hide loading
      hero.classList.add('active');
      const loader = document.getElementById('preview-loading');
      if (loader) { loader.style.opacity = '0'; loader.style.pointerEvents = 'none'; }
    }

    function _hideDemoHero() {
      const hero = document.getElementById('demo-hero');
      if (hero) hero.classList.remove('active');
    }

    let _gameMode = false;
    let _gameMiniChatOpen = false;

    function demoPlay() {
      const hero = document.getElementById('demo-hero');
      if (!hero) return;
      const url = hero.dataset.url;
      const pid = hero.dataset.projectId;
      if (!url) return;
      _hideDemoHero();
      _projSelected = pid;
    document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('DOMContentLoaded', () => {
      // ── Session restore: skip auth overlay if valid token exists ──
      if (getToken() && !isTokenExpired()) {
        const ov = document.getElementById('am-ov');
        if (ov) ov.classList.add('hid');
        document.getElementById('ts')?.classList.add('vis');
        _restoreUser();
      }
      // ── Token expiry watchdog: re-show auth overlay if token expires ──
      setInterval(() => {
        if (getToken() && isTokenExpired()) { showAuth(); }
      }, 60000); // check every 60s

      // Restore saved chat history
      renderHistory();

      // Build dynamic UI elements
