// DaveAI v7 - tools.js //

      if (t === 'tools') renderTools();
      if (t === 'projects') renderProjects();
      if (t === 'database') _renderDbPanel();
      if (t === 'skills') _renderSkillsPanel();
    }

    // ══════════════════════════════════════════════════════════
    //  TOOLS REGISTRY — 113 tools / 12 categories
    // ══════════════════════════════════════════════════════════
    const CATS = [
      { id: 'fs', name: 'File System', icon: 'fa-folder', color: '#4ade80' },
      { id: 'git', name: 'Git', icon: 'fa-code-branch', color: '#60a5fa' },
      { id: 'zc', name: 'ZeroClaw', icon: 'fa-bolt', color: '#f472b6' },
      { id: 'build', name: 'Build & Deploy', icon: 'fa-rocket', color: '#fb923c' },
      { id: 'qa', name: 'QA & Testing', icon: 'fa-flask', color: '#a78bfa' },
      { id: 'qual', name: 'Code Quality', icon: 'fa-shield-halved', color: '#34d399' },
      { id: 'web', name: 'Web & Assets', icon: 'fa-image', color: '#fbbf24' },
      { id: 'ai', name: 'AI & Vision', icon: 'fa-brain', color: '#e879f9' },
      { id: 'comp', name: 'Components', icon: 'fa-puzzle-piece', color: '#38bdf8' },
      { id: 'infra', name: 'Infrastructure', icon: 'fa-server', color: '#94a3b8' },
      { id: 'comm', name: 'Communications', icon: 'fa-satellite-dish', color: '#f87171' },
      { id: 'db', name: 'DB/SEO/Security', icon: 'fa-database', color: '#fde68a' },
    ];

    const TOOLS = [
      // ── File System ──
      { n: 'shell_run', d: 'Execute shell commands on VPS', cat: 'fs', a: 'coder', ic: 'fa-terminal' },
      { n: 'file_write', d: 'Write content to any file path', cat: 'fs', a: 'coder', ic: 'fa-file-pen' },
      { n: 'file_read', d: 'Read file contents from disk', cat: 'fs', a: 'coder', ic: 'fa-file-lines' },
      { n: 'directory_list', d: 'List directory tree structure', cat: 'fs', a: 'coder', ic: 'fa-folder-open' },
      { n: 'file_delete', d: 'Permanently delete a file', cat: 'fs', a: 'coder', ic: 'fa-trash' },
      { n: 'file_move', d: 'Move or rename a file', cat: 'fs', a: 'coder', ic: 'fa-arrows-up-down' },
      { n: 'grep_workspace', d: 'Pattern search across all files', cat: 'fs', a: 'coder', ic: 'fa-magnifying-glass' },
      { n: 'workspace_reset', d: 'Reset workspace to clean state', cat: 'fs', a: 'supervisor', ic: 'fa-rotate-left' },
      { n: 'input_sanitize', d: 'Sanitize and validate user input', cat: 'fs', a: 'coder', ic: 'fa-broom' },
      // ── Git ──
      { n: 'git_status_tool', d: 'Show current git status', cat: 'git', a: 'coder', ic: 'fa-circle-info' },
      { n: 'git_diff', d: 'Show uncommitted changes', cat: 'git', a: 'coder', ic: 'fa-code-compare' },
      { n: 'git_push', d: 'Push commits to remote origin', cat: 'git', a: 'coder', ic: 'fa-upload' },
      { n: 'git_commit', d: 'Stage and commit changes', cat: 'git', a: 'coder', ic: 'fa-check' },
      { n: 'git_pull', d: 'Pull latest from remote', cat: 'git', a: 'coder', ic: 'fa-download' },
      { n: 'git_branch', d: 'Create or switch branches', cat: 'git', a: 'coder', ic: 'fa-code-branch' },
      { n: 'git_merge', d: 'Merge feature branch to main', cat: 'git', a: 'supervisor', ic: 'fa-code-merge' },
      { n: 'gitlab_clone', d: 'Clone a GitLab repository', cat: 'git', a: 'supervisor', ic: 'fa-clone' },
      { n: 'gitlab_list_projects', d: 'List all GitLab projects', cat: 'git', a: 'supervisor', ic: 'fa-list' },
      { n: 'git_log', d: 'Show full commit history', cat: 'git', a: 'coder', ic: 'fa-timeline' },
      { n: 'git_reset', d: 'Hard reset HEAD to commit', cat: 'git', a: 'supervisor', ic: 'fa-arrow-rotate-left' },
      { n: 'git_cherry_pick', d: 'Cherry-pick specific commits', cat: 'git', a: 'supervisor', ic: 'fa-hand-pointer' },
      { n: 'git_blame', d: 'Line-by-line authorship view', cat: 'git', a: 'coder', ic: 'fa-user-secret' },
      // ── ZeroClaw ──
      { n: 'zeroclaw_new_site', d: 'Scaffold a new ZeroClaw site', cat: 'zc', a: 'supervisor', ic: 'fa-plus' },
      { n: 'zeroclaw_deploy', d: 'Deploy built files to ZeroClaw', cat: 'zc', a: 'coder', ic: 'fa-paper-plane' },
      { n: 'zeroclaw_list_sites', d: 'List all managed sites', cat: 'zc', a: 'supervisor', ic: 'fa-list' },
      { n: 'zeroclaw_delete_site', d: 'Remove a ZeroClaw site', cat: 'zc', a: 'supervisor', ic: 'fa-trash-can' },
      { n: 'zeroclaw_env_set', d: 'Set environment variable on site', cat: 'zc', a: 'supervisor', ic: 'fa-gear' },
      { n: 'zeroclaw_preview', d: 'Open site preview URL', cat: 'zc', a: 'qa', ic: 'fa-eye' },
      { n: 'zeroclaw_logs', d: 'Stream live ZeroClaw site logs', cat: 'zc', a: 'qa', ic: 'fa-scroll' },
      // ── Build & Deploy ──
      { n: 'npm_install', d: 'Install all npm dependencies', cat: 'build', a: 'coder', ic: 'fa-box' },
      { n: 'npm_run', d: 'Execute npm script by name', cat: 'build', a: 'coder', ic: 'fa-play' },
      { n: 'npm_build', d: 'Build production bundle', cat: 'build', a: 'coder', ic: 'fa-hammer' },
      { n: 'npm_install_pkg', d: 'Add a specific npm package', cat: 'build', a: 'coder', ic: 'fa-plus-square' },
      { n: 'npm_uninstall_pkg', d: 'Remove a specific npm package', cat: 'build', a: 'coder', ic: 'fa-minus-square' },
      { n: 'next_analyze', d: 'Analyze Next.js bundle sizes', cat: 'build', a: 'qa', ic: 'fa-chart-bar' },
      { n: 'pm2_status', d: 'List all PM2 process statuses', cat: 'build', a: 'supervisor', ic: 'fa-circle-dot' },
      { n: 'pm2_save', d: 'Save PM2 process list to disk', cat: 'build', a: 'supervisor', ic: 'fa-floppy-disk' },
      { n: 'pm2_delete', d: 'Delete a PM2 named process', cat: 'build', a: 'supervisor', ic: 'fa-xmark' },
      { n: 'pm2_reload', d: 'Zero-downtime reload PM2 process', cat: 'build', a: 'supervisor', ic: 'fa-rotate' },
      { n: 'huggingface_download', d: 'Download model from HuggingFace', cat: 'build', a: 'ai', ic: 'fa-robot' },
      { n: 'deploy_sftp', d: 'Deploy files to server via SFTP', cat: 'build', a: 'supervisor', ic: 'fa-cloud-arrow-up' },
      // ── QA & Testing ──
      { n: 'playwright_click_test', d: 'Run Playwright E2E tests', cat: 'qa', a: 'qa', ic: 'fa-vial' },
      { n: 'html_validate', d: 'Validate HTML markup', cat: 'qa', a: 'qa', ic: 'fa-code' },
      { n: 'css_lint', d: 'Lint CSS for errors and style', cat: 'qa', a: 'qa', ic: 'fa-paintbrush' },
      { n: 'sitemap_check', d: 'Validate sitemap.xml structure', cat: 'qa', a: 'qa', ic: 'fa-sitemap' },
      { n: 'screenshot_diff', d: 'Visual regression screenshot diff', cat: 'qa', a: 'qa', ic: 'fa-images' },
      { n: 'lighthouse_audit', d: 'Lighthouse perf/a11y/SEO audit', cat: 'qa', a: 'qa', ic: 'fa-gauge' },
      { n: 'a11y_check', d: 'WCAG accessibility compliance', cat: 'qa', a: 'qa', ic: 'fa-universal-access' },
      { n: 'perf_test', d: 'Load test with k6 or wrk', cat: 'qa', a: 'qa', ic: 'fa-bolt' },
      { n: 'link_check', d: 'Crawl and check for broken links', cat: 'qa', a: 'qa', ic: 'fa-link' },
      // ── Code Quality ──
      { n: 'eslint_fix', d: 'Auto-fix ESLint violations', cat: 'qual', a: 'coder', ic: 'fa-wrench' },
      { n: 'prettier_format', d: 'Format codebase with Prettier', cat: 'qual', a: 'coder', ic: 'fa-align-left' },
      { n: 'typescript_check', d: 'Full TypeScript type check', cat: 'qual', a: 'coder', ic: 'fa-spell-check' },
      { n: 'secret_scan', d: 'Detect exposed secrets in repo', cat: 'qual', a: 'supervisor', ic: 'fa-key' },
      { n: 'security_audit', d: 'npm audit security vulnerabilities', cat: 'qual', a: 'supervisor', ic: 'fa-shield-halved' },
      // ── Web & Assets ──
      { n: 'font_download', d: 'Download Google Font to project', cat: 'web', a: 'asset', ic: 'fa-font' },
      { n: 'unsplash_search', d: 'Search Unsplash for free images', cat: 'web', a: 'asset', ic: 'fa-camera' },
      { n: 'image_resize', d: 'Resize images to target dimensions', cat: 'web', a: 'asset', ic: 'fa-crop' },
      { n: 'sprite_generate', d: 'Bundle images into CSS sprite', cat: 'web', a: 'asset', ic: 'fa-table-cells' },
      { n: 'favicon_generate', d: 'Generate full favicon set (ico/png)', cat: 'web', a: 'asset', ic: 'fa-star' },
      { n: 'svg_optimize', d: 'Minify SVG with SVGO', cat: 'web', a: 'asset', ic: 'fa-vector-square' },
      { n: 'css_purge', d: 'Remove unused Tailwind/CSS classes', cat: 'web', a: 'coder', ic: 'fa-scissors' },
      { n: 'image_compress', d: 'Lossless image compression', cat: 'web', a: 'asset', ic: 'fa-compress' },
      { n: 'cdn_upload', d: 'Push static assets to CDN', cat: 'web', a: 'asset', ic: 'fa-cloud-arrow-up' },
      // ── AI & Vision ──
      { n: 'llm_fix_code', d: 'LLM-powered code error fixing', cat: 'ai', a: 'coder', ic: 'fa-wand-magic-sparkles' },
      { n: 'llm_write_test', d: 'Generate unit tests via LLM', cat: 'ai', a: 'qa', ic: 'fa-flask-vial' },
      { n: 'llm_tailwind_suggest', d: 'LLM Tailwind class suggestions', cat: 'ai', a: 'asset', ic: 'fa-palette' },
      { n: 'image_generate', d: 'Generate images with DALL-E/SD', cat: 'ai', a: 'asset', ic: 'fa-image' },
      { n: 'vision_analyze', d: 'Analyze screenshot with vision LLM', cat: 'ai', a: 'supervisor', ic: 'fa-eye' },
      { n: 'llm_generate_copy', d: 'AI marketing copy generation', cat: 'ai', a: 'asset', ic: 'fa-pen-fancy' },
      { n: 'llm_seo_meta', d: 'Generate SEO meta tags with LLM', cat: 'ai', a: 'asset', ic: 'fa-tags' },
      { n: 'llm_accessibility', d: 'AI accessibility recommendations', cat: 'ai', a: 'qa', ic: 'fa-universal-access' },
      { n: 'llm_review_pr', d: 'AI code review and PR analysis', cat: 'ai', a: 'supervisor', ic: 'fa-code-pull-request' },
      { n: 'llm_component_gen', d: 'Generate UI component from spec', cat: 'ai', a: 'coder', ic: 'fa-puzzle-piece' },
      // ── Components ──
      { n: 'component_scaffold', d: 'Scaffold React component + test', cat: 'comp', a: 'coder', ic: 'fa-cube' },
      { n: 'storybook_add', d: 'Add component story to Storybook', cat: 'comp', a: 'coder', ic: 'fa-book' },
      { n: 'tailwind_component', d: 'Build Tailwind CSS component', cat: 'comp', a: 'asset', ic: 'fa-wind' },
      { n: 'ui_extract', d: 'Extract component from HTML page', cat: 'comp', a: 'asset', ic: 'fa-scissors' },
      { n: 'figma_import', d: 'Import Figma design to code', cat: 'comp', a: 'asset', ic: 'fa-pen-ruler' },
      // ── Infrastructure ──
      { n: 'port_check', d: 'Check if TCP port is open', cat: 'infra', a: 'supervisor', ic: 'fa-ethernet' },
      { n: 'dns_lookup', d: 'DNS resolution for domain', cat: 'infra', a: 'supervisor', ic: 'fa-globe' },
      { n: 'log_tail', d: 'Tail system/app log file', cat: 'infra', a: 'supervisor', ic: 'fa-terminal' },
      { n: 'service_restart', d: 'Restart a Linux systemd service', cat: 'infra', a: 'supervisor', ic: 'fa-arrows-rotate' },
      { n: 'tailscale_status', d: 'Check Tailscale VPN mesh status', cat: 'infra', a: 'supervisor', ic: 'fa-network-wired' },
      { n: 'system_info', d: 'CPU / RAM / disk usage stats', cat: 'infra', a: 'supervisor', ic: 'fa-microchip' },
      { n: 'cron_add', d: 'Add a cron job schedule', cat: 'infra', a: 'supervisor', ic: 'fa-clock' },
      { n: 'cron_list', d: 'List all active cron jobs', cat: 'infra', a: 'supervisor', ic: 'fa-list' },
      { n: 'archive_create', d: 'Create tar.gz or zip archive', cat: 'infra', a: 'coder', ic: 'fa-file-zipper' },
      { n: 'archive_extract', d: 'Extract tar/zip archive', cat: 'infra', a: 'coder', ic: 'fa-box-open' },
      { n: 'backup_db', d: 'Snapshot database to backup file', cat: 'infra', a: 'supervisor', ic: 'fa-database' },
      { n: 'restore_db', d: 'Restore database from snapshot', cat: 'infra', a: 'supervisor', ic: 'fa-upload' },
      { n: 'ssl_check', d: 'Verify SSL cert expiry and chain', cat: 'infra', a: 'supervisor', ic: 'fa-lock' },
      { n: 'firewall_status', d: 'Inspect ufw/iptables firewall', cat: 'infra', a: 'supervisor', ic: 'fa-shield' },
      { n: 'nginx_reload', d: 'Reload nginx without downtime', cat: 'infra', a: 'supervisor', ic: 'fa-server' },
      { n: 'docker_ps', d: 'List running Docker containers', cat: 'infra', a: 'supervisor', ic: 'fa-box' },
      { n: 'docker_build', d: 'Build a Docker image from Dockerfile', cat: 'infra', a: 'coder', ic: 'fa-hammer' },
      { n: 'docker_push', d: 'Push Docker image to registry', cat: 'infra', a: 'coder', ic: 'fa-cloud-arrow-up' },
      { n: 'env_validate', d: 'Validate all .env variables exist', cat: 'infra', a: 'supervisor', ic: 'fa-circle-check' },
      { n: 'health_check', d: 'Ping all service health endpoints', cat: 'infra', a: 'qa', ic: 'fa-heart-pulse' },
      { n: 'cert_renew', d: 'Renew Let\'s Encrypt certificate', cat: 'infra', a: 'supervisor', ic: 'fa-certificate' },
      // ── Communications ──
      { n: 'slack_send', d: 'Post message to Slack channel', cat: 'comm', a: 'supervisor', ic: 'fa-comment' },
      { n: 'discord_send', d: 'Send Discord webhook message', cat: 'comm', a: 'supervisor', ic: 'fa-comment-dots' },
      { n: 'email_send', d: 'Send transactional email', cat: 'comm', a: 'supervisor', ic: 'fa-envelope' },
      { n: 'webhook_trigger', d: 'Fire HTTP webhook to endpoint', cat: 'comm', a: 'coder', ic: 'fa-anchor' },
      { n: 'notify_team', d: 'Broadcast team notification', cat: 'comm', a: 'supervisor', ic: 'fa-bell' },
      // ── DB / SEO / Security ──
      { n: 'db_query', d: 'Execute parameterized DB query', cat: 'db', a: 'coder', ic: 'fa-database' },
      { n: 'db_backup', d: 'Full database backup snapshot', cat: 'db', a: 'supervisor', ic: 'fa-cloud' },
      { n: 'sitemap_generate', d: 'Generate and write sitemap.xml', cat: 'db', a: 'asset', ic: 'fa-sitemap' },
      { n: 'robots_write', d: 'Create/update robots.txt rules', cat: 'db', a: 'asset', ic: 'fa-robot' },
      { n: 'meta_audit', d: 'Audit all page meta tags', cat: 'db', a: 'qa', ic: 'fa-tags' },
      { n: 'redirect_check', d: 'Verify URL redirect chains', cat: 'db', a: 'qa', ic: 'fa-right-left' },
      { n: 'rate_limit_test', d: 'Test API endpoint rate limiting', cat: 'db', a: 'qa', ic: 'fa-gauge-high' },
      { n: 'xss_scan', d: 'Scan pages for XSS vulnerabilities', cat: 'db', a: 'supervisor', ic: 'fa-bug' },
    ];

    // active role filter
    let toolRole = 'all', toolQuery = '';

    // ══ RENDER TOOLS ══
    function renderTools() {
      const q = toolQuery.toLowerCase();
      const role = toolRole;
      const list = document.getElementById('tools-list');
      if (!list) return;
      let html = '';
      CATS.forEach(cat => {
        const matches = TOOLS.filter(t => t.cat === cat.id
          && (role === 'all' || t.a === role)
          && (q === '' || t.n.includes(q) || t.d.toLowerCase().includes(q)));
        if (!matches.length) return;
        html += `<div class="tool-cat-hdr" style="padding:5px 12px 3px;font-size:9px;color:${cat.color};text-transform:uppercase;letter-spacing:.08em;display:flex;align-items:center;gap:5px;background:rgba(0,0,0,.15)">
      <i class="fas ${cat.icon}" style="font-size:9px"></i>${cat.name}
      <span style="margin-left:auto;opacity:.5">${matches.length}</span></div>`;
        matches.forEach(t => {
          const roleCol = { supervisor: '#D8B4FE', coder: '#93C5FD', qa: '#6EE7B7', asset: '#FCD34D', ai: '#F9A8D4' }[t.a] || '#94a3b8';
          html += `<div class="tool-item" onclick="openToolModal('${t.n}')" style="padding:6px 12px;display:flex;align-items:center;gap:8px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);transition:background .12s">
        <i class="fas ${t.ic}" style="font-size:10px;color:${cat.color};width:12px;flex-shrink:0"></i>
        <div style="flex:1;min-width:0"><div style="font-size:10.5px;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.n}</div>
        <div style="font-size:9px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.d}</div></div>
        <span style="font-size:8px;color:${roleCol};background:${roleCol}18;padding:1px 5px;border-radius:3px;flex-shrink:0">${t.a}</span>
        <button onclick="event.stopPropagation();openToolModal('${t.n}')" style="flex-shrink:0;padding:2px 7px;background:rgba(255,255,255,.06);border:1px solid var(--border);border-radius:4px;color:var(--t2);font-size:9px;cursor:pointer">▶ Run</button>
      </div>`;
        });
      });
      if (!html) html = '<div style="padding:20px;text-align:center;color:var(--t3);font-size:11px">No tools match</div>';
      list.innerHTML = html;
      // hover style
      list.querySelectorAll('.tool-item').forEach(el => {
        el.addEventListener('mouseenter', () => el.style.background = 'rgba(255,255,255,.04)');
        el.addEventListener('mouseleave', () => el.style.background = '');
      });
    }
    function filterTools() { toolQuery = document.getElementById('tool-search-inp').value; renderTools(); }
    function setToolRole(btn, role) {
      toolRole = role;
      document.querySelectorAll('.trb').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      renderTools();
    }

    // ══ TOOL MODAL ══
    let activeTool = null;
    function openToolModal(name) {
      activeTool = name;
      const t = TOOLS.find(x => x.n === name);
      if (!t) return;
      const cat = CATS.find(c => c.id === t.cat);
      const roleShort = { supervisor: 'sv', coder: 'cd', qa: 'qa', asset: 'as' };
      // Map to actual HTML ids: tm-title, tm-badge, tm-body, tm-params, tm-run-btn
      const titleEl = document.getElementById('tm-title');
      const badgeEl = document.getElementById('tm-badge');
      const bodyEl = document.getElementById('tm-body');
      const paramsEl = document.getElementById('tm-params');
      const runBtn = document.getElementById('tm-run-btn');
      if (titleEl) titleEl.textContent = t.n + ' — ' + t.d;
      if (badgeEl) { badgeEl.textContent = t.a + ' · ' + (cat ? cat.name : '—'); badgeEl.className = 'tm-badge tb-' + (roleShort[t.a] || 'cd'); }
      if (paramsEl) paramsEl.value = '{}';
      if (bodyEl) bodyEl.textContent = 'Waiting for output…';
      if (runBtn) { runBtn.disabled = false; runBtn.innerHTML = '<i class="fas fa-play" style="font-size:9px"></i> Run'; }
      document.getElementById('tool-modal').classList.add('open');
    }
    function closeToolModal() { document.getElementById('tool-modal').classList.remove('open'); activeTool = null; }

    async function runToolApi() {
      if (!activeTool) return;
      let params = {};
      try { params = JSON.parse(document.getElementById('tm-params').value || '{}'); } catch (e) { alert('Invalid JSON params'); return; }
      const btn = document.getElementById('tm-run-btn');
      btn.disabled = true; btn.textContent = '⏳ Running…';
      const out = document.getElementById('tm-body');
      if (out) out.textContent = 'Calling tool…';
      try {
        // Route known tools to dedicated brain API endpoints (sync JSON — not SSE)
        const TOOL_ROUTES = {
          shell_run:      '/api/tools/shell/run',
          file_write:     '/api/tools/file/write',
          file_read:      '/api/tools/file/read',
          directory_list: '/api/tools/file/list',
          file_list:      '/api/tools/file/list',
        };
        const ep = TOOL_ROUTES[activeTool];
        if (ep) {
          // Direct tool endpoint — returns JSON
          const r = await fetch(ep, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(params)
          });
          const d = await r.json();
          if (out) out.textContent = typeof d.result === 'string' ? d.result
                                   : typeof d.output === 'string' ? d.output
                                   : JSON.stringify(d, null, 2);
        } else {
          // Unknown tool — route through Alice via chat pipeline
          if (out) out.textContent = 'Routing to Alice — response in chat feed below…';
          const inp = document.getElementById('pi');
          if (inp) {
            inp.value = ('Run tool ' + activeTool + (Object.keys(params).length ? ' with: ' + JSON.stringify(params) : '')).trim();
            if (typeof think === 'function') think();
          }
        }
        addActivity('Ran tool: ' + activeTool, 'tool');
      } catch (e) { if (out) out.textContent = 'Error: ' + e.message; }
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-play" style="font-size:9px"></i> Run Again';
    }

    // ══════════════════════════════════════════════════════════
    //  DATABASE PANEL — live table stats from PostgreSQL
    // ══════════════════════════════════════════════════════════
    const _DB_TABLES = [
      { name: 'users', icon: 'fa-users', color: '#D8B4FE' },
      { name: 'chat_messages', icon: 'fa-comments', color: '#93C5FD' },
      { name: 'projects', icon: 'fa-folder', color: '#6EE7B7' },
      { name: 'analytics_events', icon: 'fa-chart-bar', color: '#FCD34D' },
      { name: 'game_players', icon: 'fa-gamepad', color: '#F9A8D4' },
      { name: 'game_hiscores', icon: 'fa-trophy', color: '#fb923c' },
      { name: 'game_map_progress', icon: 'fa-map', color: '#38bdf8' },
    ];
    async function _renderDbPanel() {
      const list = document.getElementById('db-tables-list');
      if (!list) return;
      list.innerHTML = '<div style="font-size:10px;color:var(--t3)">Loading…</div>';
      const dash = await (typeof _dbGetDashboard === 'function' ? _dbGetDashboard() : Promise.resolve(null));
      let html = '';
      _DB_TABLES.forEach(t => {
        const countKey = t.name === 'chat_messages' ? 'chat_messages' : t.name === 'game_hiscores' ? 'hiscores' : t.name === 'game_players' ? 'game_players' : t.name === 'analytics_events' ? 'analytics_events' : t.name;
        const count = dash ? (dash[countKey] || 0) : '—';
        html += '<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:rgba(255,255,255,.03);border-radius:5px;cursor:default">';
        html += '<i class="fas ' + t.icon + '" style="font-size:10px;color:' + t.color + ';width:14px;text-align:center"></i>';
        html += '<span style="flex:1;font-size:10.5px;color:var(--t1)">' + t.name + '</span>';
        html += '<span style="font-size:10px;font-weight:600;color:' + t.color + '">' + count + '</span>';
        html += '</div>';
      });
      list.innerHTML = html;
    }
    async function _dbRunQuery() {
      const inp = document.getElementById('db-query-inp');
      const out = document.getElementById('db-query-result');
      if (!inp || !out) return;
      const sql = inp.value.trim();
      if (!sql) { out.textContent = 'Enter a SQL query'; return; }
      out.textContent = 'Running…';
      try {
        const r = await fetch('/api/db/query', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql })
        });
        if (!r.ok) { out.textContent = 'Error: HTTP ' + r.status; return; }
        const d = await r.json();
        out.textContent = JSON.stringify(d, null, 2);
      } catch (e) { out.textContent = 'Error: ' + e.message; }
    }

    // ══════════════════════════════════════════════════════════
    //  SKILLS PANEL — agent capabilities catalog
    // ══════════════════════════════════════════════════════════
    const _SKILLS = [
      { name: 'Web Builder', desc: 'Generate full-page HTML/CSS/JS from description', agent: 'coder', icon: 'fa-globe', color: '#60a5fa' },
      { name: 'Component Gen', desc: 'Create reusable UI components (React, Vue, etc.)', agent: 'coder', icon: 'fa-puzzle-piece', color: '#38bdf8' },
      { name: 'Code Review', desc: 'Analyze code for bugs, style, and performance', agent: 'qa', icon: 'fa-magnifying-glass', color: '#6EE7B7' },
      { name: 'Unit Testing', desc: 'Auto-generate test suites for functions', agent: 'qa', icon: 'fa-flask', color: '#a78bfa' },
      { name: 'API Builder', desc: 'Scaffold REST/GraphQL endpoints', agent: 'coder', icon: 'fa-server', color: '#fb923c' },
      { name: 'Image Gen', desc: 'Generate images via AI models (DALL-E, SD)', agent: 'asset', icon: 'fa-image', color: '#F9A8D4' },
      { name: 'Logo Design', desc: 'Create SVG logos from text prompts', agent: 'asset', icon: 'fa-pen-nib', color: '#FCD34D' },
      { name: 'SEO Audit', desc: 'Analyze page for SEO best practices', agent: 'qa', icon: 'fa-search', color: '#34d399' },
      { name: 'Deploy', desc: 'Build and deploy to VPS or cloud hosting', agent: 'supervisor', icon: 'fa-rocket', color: '#D8B4FE' },
      { name: 'DB Migration', desc: 'Generate and run database schema changes', agent: 'coder', icon: 'fa-database', color: '#fde68a' },
      { name: 'Voice Narrate', desc: 'Read content aloud with selected TTS voice', agent: 'supervisor', icon: 'fa-volume-up', color: '#93C5FD' },
      { name: 'Game Builder', desc: 'Scaffold HTML5 games with Canvas/Phaser', agent: 'coder', icon: 'fa-gamepad', color: '#f472b6' },
    ];
    function _renderSkillsPanel() {
      const list = document.getElementById('skills-list');
      if (!list) return;
      const roleCol = { supervisor: '#D8B4FE', coder: '#93C5FD', qa: '#6EE7B7', asset: '#FCD34D' };
      let html = '';
      _SKILLS.forEach(s => {
        const rc = roleCol[s.agent] || '#94a3b8';
        html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(255,255,255,.03);border-radius:5px;cursor:pointer;transition:background .12s" onmouseenter="this.style.background=\'rgba(255,255,255,.07)\'" onmouseleave="this.style.background=\'rgba(255,255,255,.03)\'" onclick="useSug(\'' + s.name + ': \')" title="Click to use">';
        html += '<i class="fas ' + s.icon + '" style="font-size:11px;color:' + s.color + ';width:16px;text-align:center"></i>';
        html += '<div style="flex:1;min-width:0"><div style="font-size:10.5px;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + s.name + '</div>';
        html += '<div style="font-size:9px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + s.desc + '</div></div>';
        html += '<span style="font-size:8px;color:' + rc + ';background:' + rc + '18;padding:1px 5px;border-radius:3px;flex-shrink:0">' + s.agent + '</span>';
        html += '</div>';
      });
      list.innerHTML = html;
    }

    // ══════════════════════════════════════════════════════════
