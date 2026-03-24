// DaveAI v7 - chat.js //

    //  CHAT — SSE STREAMING PIPELINE
    //  POST /api/stream → text/event-stream → show chunks
    // ══════════════════════════════════════════════════════════
    let activeAgent = 'auto';

    // Action keywords that trigger the full LangGraph agent pipeline.
    // Conversational queries skip directly to the narrator (Alice) for speed.

    // ── Alice Voice Auto-Speak ─────────────────────────────────────────────
    // When Alice responds (voice_id in SSE event), speak her reply via TTS.
    // Respects the dvb-think (Think Aloud) toggle button state.
    let _aliceAudio = null;
    let _lastVoiceId = null;

    async function _aliceSpeak(text, voiceId) {
      if (!voiceId) return;
      // Respect "Think Aloud" toggle: look for active voice button
      const thinkBtn = document.getElementById('dvb-think');
      const thinkLabel = document.getElementById('dvb-think-label');
      const voiceOn = thinkLabel && thinkLabel.textContent.trim() !== 'Silent';
      if (!voiceOn) return;

      // Stop any currently playing Alice audio
      if (_aliceAudio) { try { _aliceAudio.pause(); } catch(e){} _aliceAudio = null; }

      // Clean text for TTS (strip markdown)
      const clean = text
        .replace(/```[\s\S]*?```/g, ' code block ')
        .replace(/<[^>]+>/g, '')
        .replace(/[*_`#~]/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .trim()
        .slice(0, 500);  // limit TTS length

      if (!clean) return;

      // Kokoro voice ID -> Azure Edge TTS voice map
      const _edgeVoiceMap = {
        bf_alice: 'en-GB-MaisieNeural', bf_lily: 'en-GB-SoniaNeural',
        bm_george: 'en-GB-RyanNeural', bm_lewis: 'en-GB-ThomasNeural',
        bf_isabella: 'en-US-JennyNeural', bm_adam: 'en-US-GuyNeural',
      };

      try {
        // Primary: Kokoro neural TTS (local, fast, high quality)
        const r = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: clean, voice: voiceId, speed: 0.95 })
        });
        if (!r.ok) throw new Error('Kokoro ' + r.status);
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        _aliceAudio = new Audio(url);
        _aliceAudio.onended = () => { URL.revokeObjectURL(url); _aliceAudio = null; };
        _aliceAudio.play().catch(() => {});
      } catch(e) {
        // Fallback: Edge TTS (Microsoft free neural voices)
        try {
          const edgeVoice = _edgeVoiceMap[voiceId] || 'en-GB-MaisieNeural';
          const r2 = await fetch('/api/edge-tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: clean, voice: edgeVoice })
          });
          if (!r2.ok) return;
          const blob2 = await r2.blob();
          const url2 = URL.createObjectURL(blob2);
          _aliceAudio = new Audio(url2);
          _aliceAudio.onended = () => { URL.revokeObjectURL(url2); _aliceAudio = null; };
          _aliceAudio.play().catch(() => {});
        } catch(e2) { /* TTS unavailable */ }
      }
    }

    const _ACTION_RE = /\b(build|create|add|make|fix|change|update|edit|deploy|generate|write|delete|remove|install|run|test|push|commit|optimize|refactor|migrate|scaffold|redesign|implement|launch)\b/i;

    async function think() {
      const inp = document.getElementById('pi');
      const msg = (inp?.value || '').trim();
      if (!msg) return;
      inp.value = '';
      inp.style.height = '36px'; // reset textarea height

      // ── Voice slash commands ──────────────────────────────────
      if (msg.startsWith('/voice')) {
        if (typeof dvHandleVoiceCommand === 'function' && dvHandleVoiceCommand(msg)) return;
      }

      // ── Discuss slash command: /discuss <topic> ───────────────
      if (msg.startsWith('/discuss ')) {
        const topic = msg.slice(9).trim();
        if (topic && typeof openDiscussPanel === 'function') { openDiscussPanel(topic); return; }
      }

      // Hide suggestion chips after first send
      const sugs = document.getElementById('sugs');
      if (sugs) sugs.style.display = 'none';

      // Add user bubble
      appendChatBubble('user', msg);
      addToHistory('user', msg);

      // ── Narrator-first routing ───────────────────────────────
      // Short conversational messages bypass the full 6-node LangGraph pipeline
      // and go directly to the narrator agent for instant response.
      const isAction = _ACTION_RE.test(msg) || msg.length > 200;

      if (!isAction) {
        const narBid = 'ai-nar-' + Date.now();
        appendChatBubble('ai', '', narBid);
        setTypingIndicator(true, 'Alice');
        try {
          const narRes = await fetch('/api/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ message: msg, agent: 'narrator', stream: true })
          });
          if (narRes.ok) {
            setTypingIndicator(false);
            const narReader = narRes.body.getReader();
            const narDec = new TextDecoder();
            let narText = '';
            while (true) {
              const { done, value } = await narReader.read();
              if (done) break;
              narDec.decode(value, { stream: true }).split('\n').forEach(line => {
                if (!line.startsWith('data:')) return;
                const raw = line.slice(5).trim();
                if (raw === '[DONE]') return;
                try {
                  const ev = JSON.parse(raw);
                  const t = ev.text || ev.msg || ev.content || ev.delta || '';
                  if (t && ev.type !== 'start') { narText += t; updateChatBubble(narBid, narText); }
                } catch {}
              });
            }
            if (narText) { addToHistory('ai', narText); return; }
          }
        } catch (e) { /* fall through to full pipeline if narrator fails */ }
        setTypingIndicator(false);
        const narEl = document.getElementById(narBid);
        if (narEl) narEl.remove();
      }

      // ── Full agent pipeline ──────────────────────────────────
      const bubbleId = 'ai-' + Date.now();
      appendChatBubble('ai', '', bubbleId);
      setTypingIndicator(true);

      try {
        const res = await fetch('/api/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ message: msg, agent: activeAgent || 'auto', stream: true })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ detail: 'Server error ' + res.status }));
          setTypingIndicator(false);
          updateChatBubble(bubbleId, '⚠ ' + (errData.detail || res.statusText));
          return;
        }

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let fullText = '';
        setTypingIndicator(false);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value, { stream: true });
          chunk.split('\n').forEach(line => {
            if (!line.startsWith('data:')) return;
            const raw = line.slice(5).trim();
            if (raw === '[DONE]') return;
            try {
              const ev = JSON.parse(raw);
              if (ev && ev.voice_id) _lastVoiceId = ev.voice_id;
              const text = ev.text || ev.msg || ev.content || ev.delta || ev.message || '';
              if (text && ev.type !== 'start') { fullText += text; updateChatBubble(bubbleId, fullText); }

              // Agent state updates from SSE pipeline
              if (ev.type === 'agent_update' && ev.agent && ev.state) {
                if (typeof updateAgentUI === 'function') updateAgentUI(ev.agent, ev.state, ev.task || '');
              }
              // Activity feed events from pipeline
              if (ev.type === 'activity' && ev.msg) {
                if (typeof addRichActivity === 'function') {
                  addRichActivity({ msg: ev.msg, type: ev.activity_type || 'system', agent: ev.agent || 'System' });
                }
              }
            } catch {}
          });
        }

        if (fullText) addToHistory('ai', fullText);

      } catch (e) {
        setTypingIndicator(false);
        if (e.name === 'AbortError') return;
        updateChatBubble(bubbleId,
          '⚠ Cloud API unavailable. Enable **Local LLM** in Settings \u2192 Admin \u2192 Local LLM to chat offline.');
      }
    }

    // ══ CHAT BUBBLE HELPERS ══════════════════════════════════
    function appendChatBubble(role, text, id) {
      const feed = document.getElementById('chat-feed'); if (!feed) return;
      feed.style.display = 'flex';
      const div = document.createElement('div');
      div.className = 'cb cb-' + role;
      if (id) div.id = id;
      div.innerHTML = `<div class="cb-inner">${escHtml(text)}</div>`;
      feed.appendChild(div);
      feed.scrollTop = feed.scrollHeight;
      if (role !== 'user' && typeof _gameMirrorResponse === 'function') _gameMirrorResponse(text);
    }
    function updateChatBubble(id, text) {
      const el = document.getElementById(id); if (!el) return;
      const inner = el.querySelector('.cb-inner');
      if (inner) inner.innerHTML = md2html(text);
      const feed = document.getElementById('chat-feed');
      if (feed) feed.scrollTop = feed.scrollHeight;
    }
    function setTypingIndicator(on, agentName) {
      let ti = document.getElementById('typing-ind');
      if (on && !ti) {
        const feed = document.getElementById('chat-feed'); if (!feed) return;
        const agent = agentName || activeAgent || 'Supervisor';
        const agentCls = agent.toLowerCase().slice(0, 2);
        ti = document.createElement('div');
        ti.id = 'typing-ind'; ti.className = 'agent-typing';
        ti.innerHTML = '<span class="agent-typing-name ' + agentCls + '">' + agent + '</span>'
          + '<span style="color:var(--t3)">is thinking</span>'
          + '<div class="typing-dots"><span></span><span></span><span></span></div>';
        feed.style.display = 'flex';
        feed.appendChild(ti);
        feed.scrollTop = feed.scrollHeight;
        const tt = document.getElementById('tt');
        if (tt) tt.innerHTML = '<span class="ta" style="color:var(--sv)">' + agent + ':</span> thinking\u2026';
      } else if (!on && ti) { ti.remove(); }
    }

    // Dynamic suggestion updater based on loaded project
    function updateSuggestions() {
      const sugs = document.getElementById('sugs'); if (!sugs) return;
      const sel = _projSelected;
      const all = typeof getProjects === 'function' ? getProjects() : [];
      const p = sel ? all.find(x => x.id === sel) : null;
      const cat = p ? p.cat : null;
      const SUGGESTIONS = {
        games: ['Add a new tower type', 'Fix the enemy pathfinding', 'Add sound effects', 'Create a new level', 'Add a score multiplier', 'Improve mobile controls', 'Add particle effects'],
        web: ['Make button purple gradient', 'Add dark mode toggle', 'Check mobile layout', 'Add pricing section', 'Optimize for SEO', 'Add contact form', 'Run lighthouse audit'],
        apps: ['Add user authentication', 'Create dashboard layout', 'Add notifications', 'Implement data export', 'Add settings page', 'Create onboarding flow', 'Add search functionality'],
        other: ['Generate documentation', 'Add unit tests', 'Create README', 'Refactor code', 'Add error handling', 'Optimize performance', 'Add logging'],
        _default: ['Make button purple gradient', 'Add dark mode toggle', 'Check mobile layout', 'Generate logo', 'Add pricing section', 'Run lighthouse audit', 'Screenshot the site']
      };
      const list = SUGGESTIONS[cat] || SUGGESTIONS._default;
      sugs.innerHTML = list.map(s => '<div class="sug" onclick="useSug(this)">' + s + '</div>').join('');
    }
    function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function _hlCode(code, lang) {
      const l = (lang || '').toLowerCase();
      const esc = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const safe = esc(code);
      const kw = {
        js:'const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|this|typeof|try|catch|throw|switch|case|default|break|continue|of|in|=>',
        ts:'const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|this|typeof|try|catch|throw|switch|case|default|break|continue|of|in|=>|interface|type|enum|implements|extends|public|private|static|readonly',
        py:'def|return|if|elif|else|for|while|class|import|from|as|try|except|raise|with|lambda|pass|yield|async|await|in|not|and|or|is|None|True|False|self',
        css:'@media|@keyframes|@import|@font-face|!important',html:''};
      const kwSet = kw[l==='javascript'?'js':l==='typescript'||l==='tsx'?'ts':l==='python'?'py':l]||'';
      if(!kwSet) return safe;
      let out=safe;
      out=out.replace(/(["'`])(?:(?!\1|\\).|\\.)*?\1/g,'<span style="color:#a5d6ff">$&</span>');
      out=out.replace(/(\/\/[^\n]*)/g,'<span style="color:#6a9955;font-style:italic">$1</span>');
      out=out.replace(/(#[^\n]*)/g,(m)=>l==='py'||l==='python'?'<span style="color:#6a9955;font-style:italic">'+m+'</span>':m);
      if(kwSet) out=out.replace(new RegExp('\\b('+kwSet+')\\b','g'),'<span style="color:#c586c0;font-weight:600">$1</span>');
      out=out.replace(/\b(\d+\.?\d*)\b/g,'<span style="color:#b5cea8">$1</span>');
      return out;
    }
    function md2html(s) {
      s = s.replace(/(ACTION:\s*file_write\s*\|\s*\{[^}]*"content":\s*").{200,}("\s*\})/g,'$1\u2026[file content truncated]\u2026$2');
      return s.replace(/```(\w*)\n?([\s\S]*?)```/g,(_,lang,code)=>{
        const highlighted=_hlCode(code.trim(),lang);
        const langBadge=lang?'<span style="position:absolute;top:3px;right:32px;font-size:8px;color:rgba(255,255,255,.35);text-transform:uppercase">'+lang+'</span>':'';
        return '<pre style="position:relative;background:rgba(0,0,0,.45);padding:10px 12px;border-radius:6px;font-size:10.5px;overflow-x:auto;margin:6px 0;border:1px solid rgba(255,255,255,.06);line-height:1.5">'
          +langBadge+'<button onclick="navigator.clipboard.writeText(this.parentElement.querySelector(\'code\').textContent);this.textContent=\'Copied!\';setTimeout(()=>this.textContent=\'Copy\',1200)" style="position:absolute;top:3px;right:4px;font-size:8px;padding:2px 6px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:3px;color:rgba(255,255,255,.5);cursor:pointer">Copy</button>'
          +'<code style="font-family:\'Fira Code\',Consolas,monospace">'+highlighted+'</code></pre>';
      }).replace(/`([^`]+)`/g,'<code style="background:rgba(255,255,255,.1);padding:1px 4px;border-radius:3px;font-size:10.5px;font-family:\'Fira Code\',Consolas,monospace">$1</code>')
        .replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/\\n/g,'\n').replace(/\n/g,'<br>');
    }

    // ══ ACTIVITY FEED ══════════════════════════════════════════
    const ACT_ICONS={tool:'fa-bolt',write:'fa-file-pen',done:'fa-check-circle',system:'fa-circle',error:'fa-exclamation-triangle',build:'fa-hammer',deploy:'fa-rocket',test:'fa-flask'};
    const ACT_COLORS={tool:'#FCD34D',write:'#60a5fa',done:'#6EE7B7',system:'#94a3b8',error:'#F87171',build:'#fb923c',deploy:'#f472b6',test:'#a78bfa'};
    function addActivity(msg, type='system') {
      const af=document.getElementById('af'); if(!af) return;
      const icon=ACT_ICONS[type]||'fa-circle';
      const col=ACT_COLORS[type]||'#94a3b8';
      const ts=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      const div=document.createElement('div');
      div.style.cssText='padding:4px 8px;display:flex;align-items:flex-start;gap:6px;border-bottom:1px solid rgba(255,255,255,.04);animation:fadeIn .2s ease';
      div.innerHTML=`<i class="fas ${icon}" style="font-size:9px;color:${col};margin-top:2px;flex-shrink:0"></i>`
        +`<span style="flex:1;font-size:10px;color:var(--t2);line-height:1.4">${escHtml(msg)}</span>`
        +`<span style="font-size:8.5px;color:var(--t3);flex-shrink:0">${ts}</span>`;
      af.appendChild(div);
      while(af.children.length>200) af.firstChild.remove();
      af.scrollTop=af.scrollHeight;
    }

    // ══ HISTORY PANEL ══════════════════════════════════════════
    const HIST_KEY='daveai_chat_history';
    let chatHistory=[];
    try{const saved=localStorage.getItem(HIST_KEY);if(saved)chatHistory=JSON.parse(saved).map(h=>({...h,ts:new Date(h.ts)}));}catch(e){}
    function addToHistory(role,text){
            _aliceSpeak(fullText, _lastVoiceId);
chatHistory.push({role,text,ts:new Date()});
      if(chatHistory.length>100) chatHistory=chatHistory.slice(-100);
      try{localStorage.setItem(HIST_KEY,JSON.stringify(chatHistory));}catch(e){}
      renderHistory();
    }
    function renderHistory(){
      const list=document.getElementById('hist-list');
      const empty=document.getElementById('hist-empty');
      if(!list) return;
      if(!chatHistory.length){if(empty) empty.style.display='block';return;}
      if(empty) empty.style.display='none';
      list.innerHTML=chatHistory.slice(-50).map((h,i)=>{
        const ts=h.ts.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
        const col=h.role==='user'?'#60a5fa':'#94a3b8';
        const clickable=h.role==='user'?'cursor:pointer;':'';
        const onclick=h.role==='user'?`onclick="replayHistory(${i})"`:'';
        return `<div style="padding:4px 10px;border-bottom:1px solid rgba(255,255,255,.04);${clickable}" ${onclick} title="${h.role==='user'?'Click to replay':''}">
      <div style="display:flex;justify-content:space-between;margin-bottom:1px">
        <span style="font-size:9px;color:${col};text-transform:uppercase;letter-spacing:.06em">${h.role}</span>
        <span style="font-size:9px;color:var(--t3)">${ts}</span>
      </div>
      <div style="font-size:10.5px;color:var(--t2);overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${escHtml(h.text)}</div>
    </div>`;
      }).join('');
    }
    function replayHistory(idx){
      const recent=chatHistory.slice(-50);
      const h=recent[idx];
      if(!h||h.role!=='user') return;
      const inp=document.getElementById('pi');
      if(inp){inp.value=h.text;inp.focus();chatInput(inp);}
    }
    function _filterHistory(q){
      const list=document.getElementById('hist-list');
      const empty=document.getElementById('hist-empty');
      if(!list) return;
      const lq=(q||'').toLowerCase();
      const filtered=lq?chatHistory.filter(h=>h.text.toLowerCase().includes(lq)):chatHistory;
      if(!filtered.length){list.innerHTML='';if(empty){empty.style.display='block';empty.textContent=lq?'No matches for "'+q+'"':'No history yet. Start a conversation!';}return;}
      if(empty) empty.style.display='none';
      list.innerHTML=filtered.slice(-50).map((h)=>{
        const ts=h.ts.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
        const col=h.role==='user'?'#60a5fa':'#94a3b8';
        const snippet=lq?h.text.replace(new RegExp('('+lq.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi'),'<mark style="background:#FCD34D33;color:#FCD34D;border-radius:2px">$1</mark>'):escHtml(h.text);
        return '<div style="padding:4px 10px;border-bottom:1px solid rgba(255,255,255,.04)">'
          +'<div style="display:flex;justify-content:space-between;margin-bottom:1px">'
          +'<span style="font-size:9px;color:'+col+';text-transform:uppercase;letter-spacing:.06em">'+h.role+'</span>'
          +'<span style="font-size:9px;color:var(--t3)">'+ts+'</span></div>'
          +'<div style="font-size:10.5px;color:var(--t2);overflow:hidden;white-space:nowrap;text-overflow:ellipsis">'+snippet+'</div></div>';
      }).join('');
    }
    function _exportChat(){
      if(!chatHistory.length){alert('No chat history to export');return;}
      let md='# DaveAI Chat Export\n> Exported: '+new Date().toISOString()+'\n\n';
      chatHistory.forEach(h=>{const ts=h.ts.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});md+='**['+ts+'] '+h.role.toUpperCase()+':** '+h.text+'\n\n';});
      const blob=new Blob([md],{type:'text/markdown'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;a.download='daveai-chat-'+new Date().toISOString().slice(0,10)+'.md';
      a.click();URL.revokeObjectURL(url);
      if(typeof addRichActivity==='function') addRichActivity({msg:'Chat exported ('+chatHistory.length+' messages)',type:'done',agent:'System'});
    }
    function _copyChat(){
      if(!chatHistory.length) return;
      const text=chatHistory.map(h=>{const ts=h.ts.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});return '['+ts+'] '+h.role.toUpperCase()+': '+h.text;}).join('\n');
      navigator.clipboard.writeText(text).then(()=>{if(typeof addRichActivity==='function') addRichActivity({msg:'Chat copied to clipboard',type:'done',agent:'System'});});
    }

    // ══ ACTIVITY CENTER ════════════════════════════════════════
    let actMode='normal';
    const normalActivities=[];
    function setActMode(mode){
      actMode=mode;
      document.querySelectorAll('.act-mode-btn').forEach(b=>{b.classList.toggle('on',b.dataset.mode===mode);});
      renderActivityCenter();
    }
    seedActivity();