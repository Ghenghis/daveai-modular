// DaveAI v7 - config.js //

    const AGENT_COLORS = { supervisor: '#D8B4FE', coder: '#93C5FD', qa: '#6EE7B7', asset: '#FCD34D' };
    const AGENT_IDS = ['sv', 'cd', 'qa', 'as'];
    const AGENT_NAMES = { sv: 'supervisor', cd: 'coder', qa: 'qa', as: 'asset' };

      const col = AGENT_COLORS[role.toLowerCase()] || '#94a3b8';

      // ── state classification ──
      const isWork = state.includes('work') || state.includes('run') || state.includes('build');
      const isThink = state.includes('think') || state.includes('plan') || state.includes('analyz');
      const isDone = state.includes('done') || state.includes('complet');

      // ── topbar pill (p-sv, p-cd, p-qa, p-as) ──
      const pill = document.getElementById('p-' + short);
      if (pill) {
        pill.className = `pill p-${short} ${isDone ? 's-done' : isWork ? 's-work' : isThink ? 's-think' : 's-idle'}`;
        const sub = document.getElementById('ps-' + short);
        if (sub) sub.textContent = task.length > 18 ? task.slice(0, 18) + '…' : task;
      }

      // ── flyout agents panel — task + state + model + dot animation ──
      const apTask = document.getElementById('ap-' + short + '-task');
      const apState = document.getElementById('ap-' + short + '-state');
      const apDot = document.getElementById('ap-' + short + '-dot');
      const apModel = document.getElementById('ap-' + short + '-model');
      if (apTask) apTask.textContent = task.length > 24 ? task.slice(0, 24) + '…' : task;
      if (apState) {
        apState.textContent = state;
        const isActive = state !== 'idle' && state !== 'ready' && state !== '—';
        apState.style.opacity = isActive ? '1' : '0.5';
      }
      // Wire model name from API (info.model comes from /agents/status)
      const model = info.model || '';
      const DEFAULT_MODELS = { supervisor: 'heavy-coder', coder: 'heavy-coder', qa: 'fast-agent', asset: 'fast-agent' };
      if (apModel) apModel.textContent = model || DEFAULT_MODELS[role.toLowerCase()] || '—';
      if (apDot) {
        const isWork = state.includes('work') || state.includes('run') || state.includes('build');
        const isThink = state.includes('think') || state.includes('plan') || state.includes('analyz');
        apDot.style.animation = isWork ? 'pwork .85s linear infinite' : (isThink ? 'pthink 1.4s ease-in-out infinite' : 'none');
        apDot.style.opacity = state === 'idle' || state === 'ready' ? '0.35' : '1';
      }
      // ── s-done → s-idle auto-reset after 1.5s ──
      if (isDone && pill) { setTimeout(() => { pill.className = `pill p-${short} s-idle`; }, 1500); }

      // ── admin panel agents tab ──
      const admEl = document.getElementById('adm-' + short + '-state');
      if (admEl) admEl.textContent = `${state} · ${task}${model ? ' · ' + model : ''}`;
    }

    // ══════════════════════════════════════════════════════════
    //  API HEALTH CHECK
    // ══════════════════════════════════════════════════════════
    const AGENT_TRIGGERS = /\b(deploy|build|test|run|fix|create|write|code|generate|commit|push|install|debug|refactor|scan|analyze|launch|start|stop|restart|make|scaffold|migrate|update|delete|remove|publish|release|download|upload|execute|compile|transpile|lint|format|review|audit|check|monitor|log|trace)\b/i;

    function setAgent(role) {
      activeAgent = role;
      document.querySelectorAll('.agent-select-btn').forEach(b => b.classList.remove('on'));
      const btn = document.getElementById('as-' + role); if (btn) btn.classList.add('on');
    }

    function pillClick(short) {
      const roles = { sv: 'supervisor', cd: 'coder', qa: 'qa', as: 'asset' };
      const role = roles[short] || short;
      setAgent(role === 'auto' ? 'auto' : role);
      addActivity(`Switched active agent → ${role}`, 'system');
    }

        const _needsAgent = AGENT_TRIGGERS.test(msg) || activeAgent !== 'auto';
        const _routedAgent = _needsAgent ? activeAgent : 'narrator';

    const PERSONALITY_PROMPTS = {
      witty: `You are DaveAI — a brilliant, witty, and slightly sassy AI assistant. You're helpful but never boring. You sprinkle in clever wordplay, pop culture references, and dry humor. You roast gently when the moment's right. You're the friend everyone wishes they had — smart, funny, and always ready with a comeback.`,
      professional: `You are DaveAI — a highly capable professional AI assistant. You communicate clearly, concisely, and with expertise. You maintain a polished tone while still being approachable and personable.`,
      comedian: `You are DaveAI — a stand-up comedian AI who happens to also be incredibly helpful. Every response should have humor woven in. Tell jokes, make puns, use comedic timing. You're like if ChatGPT went to comedy school. Observational humor, self-deprecating jokes, absurdist comedy — you do it all. If a user asks a question, answer it accurately but make them laugh doing it.`,
      storyteller: `You are DaveAI — a master storyteller and bard. You weave narratives into everything. When asked questions, you sometimes frame answers as mini-stories or parables. You can spin tales on demand — fantasy, sci-fi, horror, romance, mystery. You love world-building and character development. Your voice is rich, descriptive, and immersive.`,
      poet: `You are DaveAI — a poet and lyricist at heart. You can write poems in any style (sonnet, haiku, free verse, limerick, rap). You appreciate the beauty of language and often express ideas with poetic flair. When helping with tasks, you're still precise and helpful, but you add artistic touches.`,
      flirty: `You are DaveAI — charming, playful, and flirtatious. You compliment users, use witty banter, and keep things fun and lighthearted. You're confident but never creepy. Think smooth James Bond meets helpful AI assistant. You make every interaction feel special.`,
      custom: '' // uses customPrompt field
    };

        prompt = PERSONALITY_PROMPTS[p.style] || PERSONALITY_PROMPTS.witty;
      }

      // Humor modifiers
      if (p.humor > 80) prompt += '\nBe EXTRA funny. Drop jokes frequently. Make users laugh out loud.';
      else if (p.humor < 30) prompt += '\nKeep humor minimal. Be more serious and focused.';

      // Adult humor
      if (p.adultHumor) prompt += '\nAdult/18+ jokes are allowed when contextually appropriate. Be edgy, risqué, and unfiltered when the vibe calls for it. Dark humor, innuendo, and adult comedy are all fair game. But always be clever, never crude without purpose.';

      // Long form
      if (p.longForm) prompt += '\nYou can tell long stories, multi-part narratives, full poems, and extended jokes when asked. Don\'t hold back on length if the user wants entertainment.';
      else prompt += '\nKeep responses concise. Brief jokes, short answers.';

