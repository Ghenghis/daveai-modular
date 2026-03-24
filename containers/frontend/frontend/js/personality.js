// DaveAI v7 - personality.js //

      if (typeof _addToMemory === 'function') _addToMemory('user', msg);
      setTypingIndicator(true);

      // Close any previous stream
      if (chatEs) { chatEs.close(); chatEs = null; }

      // ── Try Local LLM first (admin only) ──
      const _llmCfg = typeof _getLocalLLM === 'function' ? _getLocalLLM() : { enabled: false };
          const sysPrompt = typeof buildPersonalityPrompt === 'function' ? buildPersonalityPrompt() : '';
          const localReply = await _localLLMChat(msg, sysPrompt);
          if (localReply) {
            setTypingIndicator(false);
            const bid = 'ai-local-' + Date.now();
            if (typeof _addToMemory === 'function') _addToMemory('ai', localReply);
            addActivity('Local LLM response', 'done');
        // Build personality-aware request
        const _personalityPrompt = typeof buildPersonalityPrompt === 'function' ? buildPersonalityPrompt() : '';
        const _ssePayload = { message: msg, agent: _routedAgent, stream: true, system_prompt: _personalityPrompt };
        const _sseHeaders = { 'Content-Type': 'application/json', ...authHeaders() };
        // ── SSE auto-reconnect with exponential backoff (3 retries: 1s, 2s, 4s) ──
        let res = null;
        const _SSE_MAX_RETRIES = 3;
        for (let _sseAttempt = 0; _sseAttempt <= _SSE_MAX_RETRIES; _sseAttempt++) {
          try {
            res = await fetch('/api/stream', { method: 'POST', headers: _sseHeaders, body: JSON.stringify(_ssePayload) });
            if (res.ok) break;
            throw new Error('Chat API ' + res.status);
          } catch (_sseErr) {
            if (_sseAttempt < _SSE_MAX_RETRIES) {
              const _backoff = Math.pow(2, _sseAttempt) * 1000;
              addActivity('Stream failed, retrying in ' + (_backoff / 1000) + 's... (' + (_sseAttempt + 1) + '/' + _SSE_MAX_RETRIES + ')', 'system');
              await new Promise(r => setTimeout(r, _backoff));
            } else { throw _sseErr; }
          }
        }
        if (!res || !res.ok) throw new Error('Chat API unavailable after ' + _SSE_MAX_RETRIES + ' retries');

        if (typeof _addToMemory === 'function') _addToMemory('ai', fullText);
        // ── Save both user + AI messages to PostgreSQL ──
        if (typeof _dbSaveChat === 'function') { _dbSaveChat('user', msg, activeAgent); _dbSaveChat('ai', fullText, activeAgent); }
        if (typeof _dbTrack === 'function') _dbTrack('chat_send', { agent: activeAgent, chars: fullText.length });
        addActivity('Response complete', 'done');
        // Voice narration: read agent response aloud
              if (typeof _addToMemory === 'function') _addToMemory('ai', fb.reply);
              if (typeof _dbSaveChat === 'function') { _dbSaveChat('user', msg); _dbSaveChat('ai', fb.reply, 'fallback'); }
    //  AI PERSONALITY & MEMORY BRAIN
    // ══════════════════════════════════════════════════════════

    const _PERSONALITY_KEY = 'daveai_personality';
    const _MEMORY_KEY = 'daveai_memory';
    const _LLM_KEY = 'daveai_local_llm';
    const _REFRESH_KEY = 'daveai_auto_refresh';

    // ── Default personality config ──
    const _DEFAULT_PERSONALITY = {
      style: 'witty',
      humor: 70,
      adultHumor: false,
      longForm: true,
      memoryEnabled: true,
      memorySize: 100,
      customPrompt: ''
    };

    function _getPersonality() {
      try { return { ..._DEFAULT_PERSONALITY, ...JSON.parse(localStorage.getItem(_PERSONALITY_KEY) || '{}') }; }
      catch { return { ..._DEFAULT_PERSONALITY }; }
    }

    function _savePersonality() {
      const p = {
        style: document.getElementById('stg-personality')?.value || 'witty',
        humor: parseInt(document.getElementById('stg-humor')?.value || '70'),
        adultHumor: document.getElementById('stg-adult-humor')?.checked || false,
        longForm: document.getElementById('stg-long-form')?.checked || true,
        memoryEnabled: document.getElementById('stg-memory')?.checked || true,
        memorySize: parseInt(document.getElementById('stg-mem-size')?.value || '100'),
        customPrompt: document.getElementById('stg-custom-prompt')?.value || ''
      };
      localStorage.setItem(_PERSONALITY_KEY, JSON.stringify(p));
      // Update display values
      const hv = document.getElementById('stg-humor-val');
      if (hv) hv.textContent = p.humor + '%';
      const mv = document.getElementById('stg-mem-size-val');
      if (mv) mv.textContent = p.memorySize;
    }

    function _syncPersonalityUI() {
      const p = _getPersonality();
      const el = (id) => document.getElementById(id);
      if (el('stg-personality')) el('stg-personality').value = p.style;
      if (el('stg-humor')) { el('stg-humor').value = p.humor; }
      if (el('stg-humor-val')) el('stg-humor-val').textContent = p.humor + '%';
      if (el('stg-adult-humor')) el('stg-adult-humor').checked = p.adultHumor;
      if (el('stg-long-form')) el('stg-long-form').checked = p.longForm;
      if (el('stg-memory')) el('stg-memory').checked = p.memoryEnabled;
      if (el('stg-mem-size')) el('stg-mem-size').value = p.memorySize;
      if (el('stg-mem-size-val')) el('stg-mem-size-val').textContent = p.memorySize;
      if (el('stg-custom-prompt')) el('stg-custom-prompt').value = p.customPrompt;
    }

    // ── Personality prompt builder ──
    function buildPersonalityPrompt() {
      const p = _getPersonality();
      let prompt = '';

      // Base personality
      if (p.style === 'custom' && p.customPrompt) {
        prompt = p.customPrompt;
      } else {
      // Memory context
      if (p.memoryEnabled) {
        const mem = _getMemoryContext();
        if (mem) prompt += '\n\n[MEMORY — things you remember about this user]:\n' + mem;
      }

      return prompt;
    }

    // ── Memory / Brain System ──
    function _getMemoryStore() {
      try { return JSON.parse(localStorage.getItem(_MEMORY_KEY) || '{"conversations":[],"facts":[],"preferences":{}}'); }
      catch { return { conversations: [], facts: [], preferences: {} }; }
    }

    function _saveMemoryStore(store) {
      const p = _getPersonality();
      // Trim conversations to max size
      if (store.conversations.length > p.memorySize) {
        store.conversations = store.conversations.slice(-p.memorySize);
      }
      // Trim facts to 200
      if (store.facts.length > 200) store.facts = store.facts.slice(-200);
      localStorage.setItem(_MEMORY_KEY, JSON.stringify(store));
    }

    function _addToMemory(role, text) {
      const p = _getPersonality();
      if (!p.memoryEnabled) return;
      const store = _getMemoryStore();
      store.conversations.push({
        role: role,
        text: text.slice(0, 500), // cap per entry
        ts: Date.now()
      });
      // Auto-extract facts from user messages
      if (role === 'user') {
        const lower = text.toLowerCase();
        // Detect preferences
        if (lower.includes('my name is ') || lower.includes('i\'m called ')) {
          const match = text.match(/(?:my name is|i'm called)\s+(\w+)/i);
          if (match) { store.preferences.userName = match[1]; store.facts.push('User\'s name is ' + match[1]); }
        }
        if (lower.includes('i like ') || lower.includes('i love ')) {
          const match = text.match(/i (?:like|love)\s+(.{3,40})/i);
          if (match) store.facts.push('User likes: ' + match[1]);
        }
        if (lower.includes('i hate ') || lower.includes('i don\'t like ')) {
          const match = text.match(/i (?:hate|don't like)\s+(.{3,40})/i);
          if (match) store.facts.push('User dislikes: ' + match[1]);
        }
        if (lower.includes('favorite') || lower.includes('favourite')) {
          store.facts.push('User mentioned favorite: ' + text.slice(0, 80));
        }
      }
      _saveMemoryStore(store);
    }

    function _getMemoryContext() {
      const store = _getMemoryStore();
      let ctx = '';
      // User preferences
      if (store.preferences.userName) ctx += '- User\'s name: ' + store.preferences.userName + '\n';
      // Recent facts (last 10)
      const recentFacts = [...new Set(store.facts)].slice(-10);
      if (recentFacts.length) ctx += recentFacts.map(f => '- ' + f).join('\n') + '\n';
      // Recent conversation summary (last 6 exchanges)
      const recent = store.conversations.slice(-12);
      if (recent.length) {
        ctx += '- Recent conversation:\n';
        recent.forEach(c => ctx += '  ' + (c.role === 'user' ? 'User' : 'DaveAI') + ': ' + c.text.slice(0, 100) + '\n');
      }
      return ctx || null;
    }

    function _clearMemory() {
      if (!confirm('Clear all DaveAI memory? This removes conversation history and learned facts.')) return;
      localStorage.removeItem(_MEMORY_KEY);
      addRichActivity({ msg: 'AI memory cleared', type: 'system', agent: 'System' });
    }

    function _exportMemory() {
      const store = _getMemoryStore();
      const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'daveai-memory-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
    }

    // ══════════════════════════════════════════════════════════
    //  LOCAL LLM (LM Studio) — Admin Only
    // ══════════════════════════════════════════════════════════

    const _DEFAULT_LLM = {
      enabled: false,
      url: 'http://localhost:1234',
      chatModel: 'qwen3-30b-a3b-2507',
      chatModelCustom: '',
      autoSwitch: false,
      autoLoadModels: false,
      codingModel: 'qwen3-coder-30b-a3b',
      idleTimeout: 120,
      voiceEngine: 'none',
      voiceUrl: 'http://localhost:7851',
      voiceName: 'female_01.wav',
      temperature: 0.8,
      maxTokens: 2048
    };

    const _VOICE_ENGINE_URLS = {
      alltalk: 'http://localhost:7851',
      kokoro: 'http://localhost:8880',
      chatterbox: 'http://localhost:8003',
      'lmstudio-tts': 'http://localhost:1234',
      'custom-tts': 'http://localhost:5000'
    };

    // Auto-switch state
    let _switchIdleTimer = null;
    let _currentLoadedMode = 'unknown'; // 'story' | 'coding' | 'unknown'
    let _modelSwitching = false;

    function _getLocalLLM() {
      try { return { ..._DEFAULT_LLM, ...JSON.parse(localStorage.getItem(_LLM_KEY) || '{}') }; }
      catch { return { ..._DEFAULT_LLM }; }
    }

    function _saveLocalLLM() {
      const el = (id) => document.getElementById(id);
      const voiceEngine = el('stg-local-voice-engine')?.value || 'none';
      const idleVal = parseInt(el('stg-idle-timeout')?.value || '120');
      const cfg = {
        enabled: el('stg-local-llm')?.checked || false,
        url: el('stg-lm-url')?.value || 'http://localhost:1234',
        chatModel: el('stg-lm-chat-model')?.value || 'qwen3-30b-a3b-2507',
        chatModelCustom: el('stg-lm-chat-model-custom')?.value || '',
        autoSwitch: el('stg-auto-switch')?.checked || false,
        autoLoadModels: el('stg-autoload-models')?.checked || false,
        codingModel: el('stg-lm-coding-model')?.value || 'qwen3-coder-30b-a3b',
        idleTimeout: idleVal,
        voiceEngine: voiceEngine,
        voiceUrl: el('stg-local-voice-url')?.value || _VOICE_ENGINE_URLS[voiceEngine] || 'http://localhost:7851',
        voiceName: el('stg-local-voice-name')?.value || 'female_01.wav',
        temperature: parseInt(el('stg-lm-temp')?.value || '80') / 100,
        maxTokens: parseInt(el('stg-lm-tokens')?.value || '2048')
      };
      localStorage.setItem(_LLM_KEY, JSON.stringify(cfg));
      const tv = el('stg-lm-temp-val');
      if (tv) tv.textContent = cfg.temperature.toFixed(1);
      const tkv = el('stg-lm-tokens-val');
      if (tkv) tkv.textContent = cfg.maxTokens;
      const itv = el('stg-idle-timeout-val');
      if (itv) itv.textContent = idleVal < 60 ? idleVal + 's' : Math.round(idleVal / 60) + ' min';
      // Auto-update voice URL when engine changes
      if (voiceEngine !== 'none' && voiceEngine !== 'custom-tts') {
        const urlInput = el('stg-local-voice-url');
        if (urlInput && _VOICE_ENGINE_URLS[voiceEngine]) urlInput.value = _VOICE_ENGINE_URLS[voiceEngine];
      }
    }

    function _syncLocalLLMUI() {
      const cfg = _getLocalLLM();
      const el = (id) => document.getElementById(id);
      if (el('stg-local-llm')) el('stg-local-llm').checked = cfg.enabled;
      if (el('stg-lm-url')) el('stg-lm-url').value = cfg.url;
      if (el('stg-lm-chat-model')) el('stg-lm-chat-model').value = cfg.chatModel;
      if (el('stg-lm-chat-model-custom')) el('stg-lm-chat-model-custom').value = cfg.chatModelCustom || '';
      if (el('stg-auto-switch')) el('stg-auto-switch').checked = cfg.autoSwitch || false;
      if (el('stg-autoload-models')) el('stg-autoload-models').checked = cfg.autoLoadModels || false;
      if (el('stg-lm-coding-model')) el('stg-lm-coding-model').value = cfg.codingModel || 'qwen3-coder-30b-a3b';
      if (el('stg-idle-timeout')) el('stg-idle-timeout').value = cfg.idleTimeout || 120;
      const itv = el('stg-idle-timeout-val');
      if (itv) { const v = cfg.idleTimeout || 120; itv.textContent = v < 60 ? v + 's' : Math.round(v / 60) + ' min'; }
      if (el('stg-local-voice-engine')) el('stg-local-voice-engine').value = cfg.voiceEngine || 'none';
      if (el('stg-local-voice-url')) el('stg-local-voice-url').value = cfg.voiceUrl || 'http://localhost:7851';
      if (el('stg-local-voice-name')) el('stg-local-voice-name').value = cfg.voiceName || 'female_01.wav';
      if (el('stg-lm-temp')) el('stg-lm-temp').value = Math.round(cfg.temperature * 100);
      if (el('stg-lm-temp-val')) el('stg-lm-temp-val').textContent = cfg.temperature.toFixed(1);
      if (el('stg-lm-tokens')) el('stg-lm-tokens').value = cfg.maxTokens;
      if (el('stg-lm-tokens-val')) el('stg-lm-tokens-val').textContent = cfg.maxTokens;
    }

    // ── LM Studio Model Load/Unload API ──
    function _updateSwitchStatus(msg, color) {
      const s = document.getElementById('stg-switch-status');
      if (s) { s.textContent = msg; s.style.color = color || 'var(--t3)'; }
    }

    async function _lmLoadModel(modelId) {
      const cfg = _getLocalLLM();
      if (_modelSwitching) return false;
      _modelSwitching = true;
      _updateSwitchStatus('Loading ' + modelId.split('/').pop() + '...', '#FCD34D');
      try {
        // LM Studio API: POST /lmstudio/v1/model/load (or /v1/models for compatible)
        const res = await fetch(cfg.url + '/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelId,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
            temperature: 0
          }),
          signal: AbortSignal.timeout(120000)
        });
        if (res.ok) {
          _updateSwitchStatus('✅ ' + modelId.split('/').pop() + ' loaded', '#6EE7B7');
          _modelSwitching = false;
          return true;
        }
        throw new Error('HTTP ' + res.status);
      } catch (e) {
        _updateSwitchStatus('⚠️ Load failed: ' + e.message, '#FCA5A5');
        _modelSwitching = false;
        return false;
      }
    }

    async function _switchToStoryModel() {
      const cfg = _getLocalLLM();
      if (!cfg.autoSwitch || !cfg.enabled) return;
      if (_currentLoadedMode === 'story') return;
      const model = cfg.chatModelCustom || cfg.chatModel || 'qwen3-30b-a3b-2507';
      console.log('[AutoSwitch] Loading story model:', model);
      const ok = await _lmLoadModel(model);
      if (ok) _currentLoadedMode = 'story';
    }

    async function _switchToCodingModel() {
      const cfg = _getLocalLLM();
      if (!cfg.autoSwitch || !cfg.enabled) return;
      if (_currentLoadedMode === 'coding') return;
      const model = cfg.codingModel || 'qwen3-coder-30b-a3b';
      console.log('[AutoSwitch] Idle detected — loading coding model:', model);
      const ok = await _lmLoadModel(model);
      if (ok) _currentLoadedMode = 'coding';
    }

    function _resetIdleTimer() {
      const cfg = _getLocalLLM();
      if (!cfg.autoSwitch || !cfg.enabled) return;
      if (_switchIdleTimer) clearTimeout(_switchIdleTimer);
      _switchIdleTimer = setTimeout(() => {
        _switchToCodingModel();
      }, (cfg.idleTimeout || 120) * 1000);
    }

    function _downloadSOTAModel() {
      // Open LM Studio deep link to download the SOTA model
      const deepLink = 'lmstudio://models/qwen/qwen3-30b-a3b-2507';
      window.open(deepLink, '_blank');
      _updateSwitchStatus('Opening LM Studio to download Qwen3-30B-A3B-2507...', '#93C5FD');
      // Also show fallback instructions
      const status = document.getElementById('stg-lm-status');
      if (status) {
        status.innerHTML = '<strong>Download in LM Studio:</strong><br>' +
          '1. Open LM Studio app<br>' +
          '2. Search: <code>qwen3-30b-a3b-2507</code><br>' +
          '3. Download Q4_K_M (~18GB) for RTX 3090 Ti<br>' +
          '4. Also get: <code>qwen3-coder-30b-a3b</code> for coding<br>' +
          '<br>Both are MOE: 30B brain, 3B active = instant speed!';
        status.style.color = '#93C5FD';
      }
    }

    // Local voice test + speak functions
    async function _testLocalVoice() {
      const cfg = _getLocalLLM();
      const status = document.getElementById('stg-local-voice-status');
      if (cfg.voiceEngine === 'none') { if (status) status.textContent = 'No local voice engine selected'; return; }
      if (status) { status.textContent = 'Testing...'; status.style.color = '#FCD34D'; }
      try {
        await _localVoiceSpeak('Hello! I am DaveAI, your witty and slightly sassy assistant. How can I make you laugh today?');
        if (status) { status.textContent = '✅ Voice working!'; status.style.color = '#6EE7B7'; }
      } catch (e) {
        if (status) { status.textContent = '❌ ' + e.message; status.style.color = '#FCA5A5'; }
      }
    }

    async function _localVoiceSpeak(text) {
      const cfg = _getLocalLLM();
      if (!cfg.voiceEngine || cfg.voiceEngine === 'none') return false;
      const url = cfg.voiceUrl;
      const voice = cfg.voiceName;

      if (cfg.voiceEngine === 'alltalk') {
        // AllTalk TTS API — POST /api/tts-generate
        const form = new FormData();
        form.append('text_input', text);
        form.append('text_filtering', 'standard');
        form.append('character_voice_gen', voice);
        form.append('narrator_enabled', 'false');
        form.append('narrator_voice_gen', voice);
        form.append('text_not_inside', 'character');
        form.append('language', 'en');
        form.append('output_file_name', 'daveai_tts');
        form.append('output_file_timestamp', 'true');
        form.append('autoplay', 'true');
        form.append('autoplay_volume', '0.8');
        const res = await fetch(url + '/api/tts-generate', { method: 'POST', body: form, signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error('AllTalk ' + res.status);
        const data = await res.json();
        if (data.output_file_url) {
          const audio = new Audio(url + data.output_file_url);
          audio.play();
        }
        return true;
      }

      if (cfg.voiceEngine === 'kokoro') {
        // Kokoro — OpenAI-compatible /v1/audio/speech
        const res = await fetch(url + '/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'kokoro', input: text, voice: voice, response_format: 'mp3' }),
          signal: AbortSignal.timeout(30000)
        });
        if (!res.ok) throw new Error('Kokoro ' + res.status);
        const blob = await res.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audio.play();
        return true;
      }

      if (cfg.voiceEngine === 'chatterbox') {
        // Chatterbox TTS Server — OpenAI-compatible
        const res = await fetch(url + '/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'chatterbox', input: text, voice: voice, response_format: 'wav' }),
          signal: AbortSignal.timeout(60000)
        });
        if (!res.ok) throw new Error('Chatterbox ' + res.status);
        const blob = await res.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audio.play();
        return true;
      }

      if (cfg.voiceEngine === 'lmstudio-tts') {
        // LM Studio with OuteTTS/Chatterbox GGUF loaded
        const res = await fetch(cfg.url + '/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'tts', input: text, voice: voice }),
          signal: AbortSignal.timeout(30000)
        });
        if (!res.ok) throw new Error('LM Studio TTS ' + res.status);
        const blob = await res.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audio.play();
        return true;
      }

      if (cfg.voiceEngine === 'custom-tts') {
        // Generic OpenAI-compatible TTS
        const res = await fetch(url + '/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: text, voice: voice }),
          signal: AbortSignal.timeout(30000)
        });
        if (!res.ok) throw new Error('Custom TTS ' + res.status);
        const blob = await res.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audio.play();
        return true;
      }

      return false;
    }

    async function _testLocalLLM() {
      const cfg = _getLocalLLM();
      const status = document.getElementById('stg-lm-status');
      if (status) status.textContent = 'Testing...';
      if (status) status.style.color = '#FCD34D';
      try {
        const res = await fetch(cfg.url + '/v1/models', { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const models = data.data || [];
        if (status) {
          status.textContent = '✅ Connected — ' + models.length + ' model(s) loaded';
          status.style.color = '#6EE7B7';
        }
        // Auto-fill first model if empty (only if auto-load is enabled)
        if (models.length > 0 && !document.getElementById('stg-lm-chat-model')?.value) {
          const cfg = _getLocalLLM();
          if (cfg.autoLoadModels) {
            // Filter for models with 14B+ parameters and sufficient context
            const filteredModels = models.filter(m => {
              const name = m.id.toLowerCase();
              const hasLargeParams = name.includes('14b') || name.includes('20b') || name.includes('30b') || name.includes('32b') || name.includes('70b') || name.includes('72b');
              const hasGoodContext = name.includes('100k') || name.includes('128k') || name.includes('80k') || name.includes('64k');
              return hasLargeParams && (hasGoodContext || !name.includes('7b'));
            });
            const selectedModel = filteredModels.length > 0 ? filteredModels[0].id : models[0].id;
            document.getElementById('stg-lm-chat-model').value = selectedModel;
            _saveLocalLLM();
            console.log('[AutoLoad] Selected model:', selectedModel);
          }
        }
      } catch (e) {
        if (status) { status.textContent = '❌ Failed: ' + e.message; status.style.color = '#FCA5A5'; }
      }
    }

    async function _loadLMModels() {
      const cfg = _getLocalLLM();
      const status = document.getElementById('stg-lm-status');
      try {
        const res = await fetch(cfg.url + '/v1/models', { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        const models = (data.data || []).map(m => m.id);
        if (status) {
          status.innerHTML = '<strong>Models:</strong><br>' + (models.length ? models.map(m => '• ' + m).join('<br>') : 'No models loaded');
          status.style.color = '#D8B4FE';
        }
      } catch (e) {
        if (status) { status.textContent = '❌ ' + e.message; status.style.color = '#FCA5A5'; }
      }
    }

    // Send chat to local LM Studio (OpenAI-compatible API)
    async function _localLLMChat(userMsg, systemPrompt) {
      const cfg = _getLocalLLM();
      if (!cfg.enabled || !cfg.url) return null;
      try {
        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMsg }
        ];
        // Add memory context as assistant preamble
        const mem = _getMemoryContext();
        if (mem) messages.splice(1, 0, { role: 'system', content: '[Memory context]\n' + mem });

        const _resolvedModel = cfg.chatModelCustom || cfg.chatModel || 'local-model';
        const res = await fetch(cfg.url + '/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: _resolvedModel,
            messages: messages,
            temperature: cfg.temperature,
            max_tokens: cfg.maxTokens,
            stream: false
          }),
          signal: AbortSignal.timeout(60000)
        });
        if (!res.ok) throw new Error('LM Studio ' + res.status);
        const data = await res.json();
        return data.choices?.[0]?.message?.content || null;
      } catch (e) {
        console.warn('[LocalLLM] Error:', e);
        return null;
      }
    }

    // ══════════════════════════════════════════════════════════
    //  AUTO-REFRESH PROJECTS
    // ══════════════════════════════════════════════════════════

    let _refreshTimerId = null;
    const _LAST_REFRESH_KEY = 'daveai_last_refresh';

    function _getAutoRefreshCfg() {
      try { return JSON.parse(localStorage.getItem(_REFRESH_KEY) || '{"enabled":true,"interval":7200000}'); }
      catch { return { enabled: true, interval: 7200000 }; }
    }

    function _saveAutoRefresh() {
      const cfg = {
        enabled: document.getElementById('stg-auto-refresh')?.checked ?? true,
        interval: parseInt(document.getElementById('stg-refresh-interval')?.value || '7200000')
      };
      localStorage.setItem(_REFRESH_KEY, JSON.stringify(cfg));
      _scheduleRefresh();
    }

    function _syncAutoRefreshUI() {
      const cfg = _getAutoRefreshCfg();
      const el = (id) => document.getElementById(id);
      if (el('stg-auto-refresh')) el('stg-auto-refresh').checked = cfg.enabled;
      if (el('stg-refresh-interval')) el('stg-refresh-interval').value = cfg.interval;
      _updateRefreshStatus();
    }

    function _updateRefreshStatus() {
      const last = parseInt(localStorage.getItem(_LAST_REFRESH_KEY) || '0');
      const el = document.getElementById('stg-refresh-status');
      if (!el) return;
      if (!last) { el.textContent = 'Never refreshed'; return; }
      const ago = Date.now() - last;
      if (ago < 60000) el.textContent = 'Just now';
      else if (ago < 3600000) el.textContent = Math.floor(ago / 60000) + 'm ago';
      else el.textContent = Math.floor(ago / 3600000) + 'h ago';
    }

    async function _refreshProjects() {
      const now = Date.now();
      localStorage.setItem(_LAST_REFRESH_KEY, String(now));
      _updateRefreshStatus();

      // 1. Re-run seedProjects to ensure required projects exist and are up-to-date
      seedProjects();

      // 2. Scan the server for new projects/games via API
      try {
        // Check games directory for new games
        const gamesRes = await fetch('/games/', { signal: AbortSignal.timeout(5000) });
        if (gamesRes.ok) {
          const html = await gamesRes.text();
          // Parse directory listing for game folders
          const links = html.match(/href="([^"]+)\/"/g) || [];
          const gameFolders = links.map(l => l.match(/href="([^"]+)\//)?.[1]).filter(Boolean);

          const existing = getProjects();
          let changed = false;
          gameFolders.forEach(folder => {
            if (folder === '.' || folder === '..') return;
            const hasIt = existing.find(p => p.url && p.url.includes('/games/' + folder + '/'));
            if (!hasIt) {
              const name = folder.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              existing.push({
                id: 'auto-' + folder,
                name: name,
                url: 'https://daveai.tech/games/' + folder + '/index.html',
                cat: 'games',
                status: 'live',
                ts: now,
                autoDiscovered: true
              });
              changed = true;
              addRichActivity({ msg: 'Auto-discovered game: ' + name, type: 'done', agent: 'System' });
            }
          });
          if (changed) saveProjects(existing);
        }
      } catch (e) { /* server scan failed — that's ok, local seed still ran */ }

      // 3. Check for web project changes by pinging known URLs
      const existing = getProjects();
      let anyChange = false;
      for (const p of existing) {
        if (!p.url || p.status === 'archived') continue;
        try {
          const r = await fetch(p.url, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
          const wasLive = p.status === 'live';
          const isLive = r.ok;
          if (wasLive !== isLive) {
            p.status = isLive ? 'live' : 'draft';
            anyChange = true;
          }
        } catch { /* offline — mark as draft */
          if (p.status === 'live') { p.status = 'draft'; anyChange = true; }
        }
      }
      if (anyChange) { saveProjects(existing); renderProjects(); }
      renderProjects(); // always re-render to update counts
    }

    function _manualRefreshProjects() {
      const btn = document.querySelector('[onclick="_manualRefreshProjects()"]');
      if (btn) btn.textContent = 'Refreshing...';
      _refreshProjects().then(() => {
        if (btn) btn.innerHTML = '<i class="fas fa-sync" style="margin-right:3px"></i>Refresh Now';
        addRichActivity({ msg: 'Projects refreshed — counts updated', type: 'done', agent: 'System' });
      });
    }

    function _scheduleRefresh() {
      if (_refreshTimerId) { clearInterval(_refreshTimerId); _refreshTimerId = null; }
      const cfg = _getAutoRefreshCfg();
      if (!cfg.enabled) return;
      // Check if enough time has passed since last refresh
      const last = parseInt(localStorage.getItem(_LAST_REFRESH_KEY) || '0');
      const elapsed = Date.now() - last;
      if (elapsed >= cfg.interval) {
        // Overdue — refresh now (but delayed to not block page load)
        setTimeout(_refreshProjects, 5000);
      }
      _refreshTimerId = setInterval(_refreshProjects, cfg.interval);
    }

    // ── Initialize all new systems on load ──
      _syncPersonalityUI();
      _syncLocalLLMUI();
      _syncAutoRefreshUI();
      _scheduleRefresh();
    });

    // ══════════════════════════════════════════════════════════
    //  INTRO VIDEO SYSTEM
    // ══════════════════════════════════════════════════════════
    const INTRO_MANIFEST_URL = '/intros/manifest.json';
    let _introManifest = null;

    function getIntroPref() { return localStorage.getItem('daveai_intro_pref') || 'random'; }
    function getIntroVol() { return parseInt(localStorage.getItem('daveai_intro_vol') || '60', 10); }

    async function loadIntroManifest() {
      try {
        const r = await fetch(INTRO_MANIFEST_URL, { cache: 'no-cache' });
        if (!r.ok) return null;
        _introManifest = await r.json();
        return _introManifest;
      } catch (e) { console.warn('[Intro] Manifest load failed:', e); return null; }
    }

    function pickIntroVideo(manifest, pref) {
      if (!manifest || !manifest.intros || manifest.intros.length === 0) return null;
      let pool = manifest.intros;
      if (pref === 'male') pool = pool.filter(v => v.gender === 'male');
      else if (pref === 'female') pool = pool.filter(v => v.gender === 'female');
      else if (pref === 'random') {
        // Use manifest default if available, otherwise pick randomly
        if (manifest.default) {
          const def = pool.find(v => v.file === manifest.default);
          if (def) return def;
        }
      }
      if (pool.length === 0) pool = manifest.intros;
      return pool[Math.floor(Math.random() * pool.length)];
    }

    function detectDeviceType() {
      const w = window.innerWidth;
      const ua = navigator.userAgent.toLowerCase();
      const isMobile = /android|iphone|ipod/.test(ua) || (w <= 600);
      const isTablet = /ipad|tablet/.test(ua) || (/android/.test(ua) && w > 600) || (w > 600 && w <= 1024);
      if (isMobile) return 'mobile';
      if (isTablet) return 'tablet';
      return 'desktop';
    }

    function _showAuthIfNeeded() {
      if (!getToken() || isTokenExpired()) {
        const authOv = document.getElementById('am-ov');
        if (authOv) { authOv.classList.remove('hid'); authOv.style.opacity = 1; authOv.style.pointerEvents = ''; }
      }
    }

    async function playIntro() {
      const pref = getIntroPref();
      if (pref === 'off') { return; }
      const manifest = await loadIntroManifest();
      const pick = pickIntroVideo(manifest, pref);
      if (!pick) { return; }
      const ov = document.getElementById('intro-ov');
      const vid = document.getElementById('intro-video');
      if (!ov || !vid) return;
      // Preload video but don't play yet — show device chooser
      vid.src = pick.file;
      vid.preload = 'auto';
      vid.volume = getIntroVol() / 100;
      vid.muted = false;
      ov.classList.remove('hid');
      // Show splash, hide controls until user picks device
      const splash = document.getElementById('intro-splash');
      const muteBtn = document.getElementById('intro-mute');
      const skipBtn = document.getElementById('intro-skip');
      if (splash) splash.style.display = '';
      if (muteBtn) muteBtn.style.display = 'none';
      if (skipBtn) skipBtn.style.display = 'none';
      // Auto-detect and highlight recommended device
      const detected = detectDeviceType();
      ['desktop', 'tablet', 'mobile'].forEach(d => {
        const el = document.getElementById('dc-' + d);
        if (el) el.classList.toggle('recommended', d === detected);
      });
      console.log('[Intro] Device chooser shown, detected:', detected, 'video:', pick.file);
    }

    // Called when user picks a device — user interaction guarantees unmuted playback
    async function introStart(deviceMode) {
      const vid = document.getElementById('intro-video');
      if (!vid) return;
      // Exclusive audio lock — suppress ALL TTS while intro plays
      _vsIntroPlaying = true;
      vsStopAudio();
      _vsSpeechQueue.length = 0;
          { label: 'RAM', pct: vps.memory?.percent || 0, color: vps.memory?.percent > 85 ? '#f87171' : '#60a5fa' },
          { label: 'Disk', pct: vps.disk?.percent || 0, color: vps.disk?.percent > 90 ? '#f87171' : '#a78bfa' },
        ];
        html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px">';
        bars.forEach(b => {
          html += '<div style="background:rgba(255,255,255,.05);border-radius:6px;padding:4px 6px">';
          html += '<div style="font-size:9px;opacity:.7">' + b.label + '</div>';
          html += '<div style="font-size:14px;font-weight:700;color:' + b.color + '">' + b.pct + '%</div>';
          html += '<div style="height:3px;background:rgba(255,255,255,.1);border-radius:2px;margin-top:2px"><div style="height:100%;width:' + Math.min(b.pct, 100) + '%;background:' + b.color + ';border-radius:2px"></div></div>';
          html += '</div>';
        });
        html += '</div>';

        // System info
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px;font-size:10px">';
        html += '<div><span style="opacity:.6">OS:</span> ' + (vps.os || 'Ubuntu') + '</div>';
        html += '<div><span style="opacity:.6">Kernel:</span> ' + (vps.kernel || '-') + '</div>';
        html += '<div><span style="opacity:.6">Uptime:</span> ' + (vps.uptime || '-') + '</div>';
        html += '<div><span style="opacity:.6">Load:</span> ' + (vps.load ? vps.load['1m'] + ' / ' + vps.load['5m'] + ' / ' + vps.load['15m'] : '-') + '</div>';
        html += '<div><span style="opacity:.6">RAM:</span> ' + _fmtBytes(vps.memory?.used || 0) + ' / ' + _fmtBytes(vps.memory?.total || 0) + '</div>';
        html += '<div><span style="opacity:.6">Disk:</span> ' + _fmtBytes(vps.disk?.used || 0) + ' / ' + _fmtBytes(vps.disk?.total || 0) + '</div>';
        html += '<div><span style="opacity:.6">PostgreSQL:</span> <span style="color:' + (vps.postgresql === 'active' ? '#34d399' : '#f87171') + '">' + (vps.postgresql || 'unknown') + '</span></div>';
        html += '<div><span style="opacity:.6">Cores:</span> ' + (vps.cpu?.cores || '-') + '</div>';
        html += '</div>';

        // PM2 Services
        if (vps.services && vps.services.length) {
          html += '<div style="font-weight:600;margin-bottom:4px;color:#818cf8;font-size:10px">Services</div>';
          html += '<div style="display:grid;gap:2px;margin-bottom:8px">';
          vps.services.forEach(s => {
            const sc = s.status === 'online' ? '#34d399' : s.status === 'stopped' ? '#6b7280' : '#f87171';
            html += '<div style="display:flex;justify-content:space-between;padding:2px 4px;background:rgba(255,255,255,.03);border-radius:4px;font-size:10px">';
            html += '<span style="color:' + sc + '">● ' + s.name + '</span>';
            html += '<span style="opacity:.7">' + s.memory_mb + 'MB · ' + _fmtUptime(s.uptime_ms) + ' · ↻' + s.restarts + '</span>';
            html += '</div>';
          });
          html += '</div>';
        }
      }

      // Active Sessions
      if (sessions) {
        html += '<div style="font-weight:600;margin-bottom:4px;color:#818cf8;font-size:10px">Online Users (' + sessions.count + ')</div>';
        if (sessions.sessions && sessions.sessions.length) {
          html += '<div style="display:grid;gap:2px;margin-bottom:8px">';
          sessions.sessions.forEach(s => {
            const rc = s.role === 'admin' ? '#f59e0b' : '#60a5fa';
            html += '<div style="display:flex;justify-content:space-between;padding:2px 4px;background:rgba(255,255,255,.03);border-radius:4px;font-size:10px">';
            html += '<span style="color:' + rc + '">👤 ' + s.username + '</span>';
            html += '<span style="opacity:.7">' + s.duration_human + ' · ' + s.page + ' · ' + s.ip + '</span>';
            html += '</div>';
          });
          html += '</div>';
        } else {
          html += '<div style="font-size:10px;opacity:.5;margin-bottom:8px">No active sessions</div>';
        }
      }

      // DB Stats
      if (dash) {
        html += '<div style="font-weight:600;margin-bottom:4px;color:#818cf8;font-size:10px">Database</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;font-size:10px">';
        const stats = [
          { l: 'Users', v: dash.users || 0 }, { l: 'Chats', v: dash.chat_messages || 0 },
          { l: 'Projects', v: dash.projects || 0 }, { l: 'Players', v: dash.game_players || 0 },
          { l: 'Hi-Scores', v: dash.hiscores || 0 }, { l: 'Events', v: dash.analytics_events || 0 },
        ];
        stats.forEach(s => {
          html += '<div style="text-align:center;background:rgba(255,255,255,.03);border-radius:4px;padding:3px">';
          html += '<div style="font-size:14px;font-weight:700;color:#e0e7ff">' + s.v + '</div>';
          html += '<div style="font-size:8px;opacity:.6">' + s.l + '</div></div>';
        });
        html += '</div>';
      }

      // Collapse toggle
      html += '<div style="text-align:center;margin-top:6px"><button onclick="this.parentElement.parentElement.style.display=\'none\'" style="background:none;border:1px solid rgba(255,255,255,.1);color:#999;font-size:9px;padding:2px 12px;border-radius:4px;cursor:pointer">Hide</button></div>';

      el.innerHTML = html;
    }

    // ══════════════════════════════════════════════════════════
    //  WAVEFORM COLOR SYSTEM — 16 Neon Colors + Custom Picker
    // ══════════════════════════════════════════════════════════
    const _DV_NEON_COLORS = [
      { name: 'Hot Pink', hex: '#FF69B4' }, { name: 'Neon Pink', hex: '#FF1493' },
      { name: 'Magenta', hex: '#FF00FF' }, { name: 'Electric Purple', hex: '#BF00FF' },
      { name: 'Neon Purple', hex: '#9D00FF' }, { name: 'Violet', hex: '#7C3AED' },
      { name: 'Neon Blue', hex: '#60A5FA' }, { name: 'Cyan', hex: '#00E5FF' },
      { name: 'Electric Blue', hex: '#0080FF' }, { name: 'Aqua', hex: '#00FFCC' },
      { name: 'Neon Green', hex: '#39FF14' }, { name: 'Lime', hex: '#CCFF00' },
      { name: 'Neon Yellow', hex: '#FFF700' }, { name: 'Neon Orange', hex: '#FF6600' },
      { name: 'Neon Red', hex: '#FF073A' }, { name: 'White Ice', hex: '#E0E7FF' },
    ];

    const _DV_WF_KEY = 'daveai_wf_settings';
    let _dvWfSettings = { femaleColor: '#FF69B4', maleColor: '#60A5FA', wfType: 'bars' };

    function _dvLoadWfSettings() {
      try { Object.assign(_dvWfSettings, JSON.parse(localStorage.getItem(_DV_WF_KEY) || '{}')); } catch (e) { }
    }
    function _dvSaveWfSettings() {
      localStorage.setItem(_DV_WF_KEY, JSON.stringify(_dvWfSettings));
    }

    function _dvSetWfColor(gender, hex) {
      if (gender === 'female') _dvWfSettings.femaleColor = hex;
      else _dvWfSettings.maleColor = hex;
      _dvSaveWfSettings();
      _dvRenderColorGrids();
    }

    function _dvSetWfType(type) {
      _dvWfSettings.wfType = type;
      _dvSaveWfSettings();
      _dvRenderWfTypeGrid();
    }

    // Get dynamic waveform color for current voice
    function _dvGetWfColor(voiceId) {
      const gender = typeof _vsGetGender === 'function' ? _vsGetGender(voiceId) : 'female';
      return gender === 'female' ? _dvWfSettings.femaleColor : _dvWfSettings.maleColor;
    }
    function _dvGetWfGlow(voiceId) {
      const c = _dvGetWfColor(voiceId);
      return c + '44'; // 26% alpha
    }

    function _dvRenderColorGrids() {
      ['female', 'male'].forEach(g => {
        const el = document.getElementById('wf-color-' + g + '-grid');
        if (!el) return;
        const cur = g === 'female' ? _dvWfSettings.femaleColor : _dvWfSettings.maleColor;
        el.innerHTML = _DV_NEON_COLORS.map(c => {
          const sel = c.hex.toLowerCase() === cur.toLowerCase() ? ' selected' : '';
          return '<div class="wf-color-swatch' + sel + '" style="background:' + c.hex + ';color:' + c.hex + '" title="' + c.name + '" onclick="_dvSetWfColor(\'' + g + '\',\'' + c.hex + '\')"></div>';
        }).join('');
        const picker = document.getElementById('wf-color-' + g + '-custom');
        if (picker) picker.value = cur;
      });
    }

    // ══════════════════════════════════════════════════════════
    //  12 SOTA WAVEFORM VISUALIZATION TYPES — 2026
    // ══════════════════════════════════════════════════════════
    const _DV_WF_TYPES = [
      { id: 'bars', name: 'Frequency Bars', icon: 'fas fa-chart-bar' },
      { id: 'wave', name: 'Classic Wave', icon: 'fas fa-wave-square' },
      { id: 'mirror', name: 'Mirror Wave', icon: 'fas fa-arrows-alt-v' },
      { id: 'circle', name: 'Circular', icon: 'fas fa-circle-notch' },
      { id: 'radial', name: 'Radial Burst', icon: 'fas fa-sun' },
      { id: 'particles', name: 'Particle Flow', icon: 'fas fa-atom' },
      { id: 'spectrum', name: 'Spectrum', icon: 'fas fa-rainbow' },
      { id: 'blob', name: 'Organic Blob', icon: 'fas fa-cloud' },
      { id: 'terrain', name: 'Terrain', icon: 'fas fa-mountain' },
      { id: 'dots', name: 'Dancing Dots', icon: 'fas fa-braille' },
      { id: 'rings', name: 'Concentric Rings', icon: 'fas fa-bullseye' },
      { id: 'flame', name: 'Flame Wave', icon: 'fas fa-fire' },
    ];

    function _dvRenderWfTypeGrid() {
      const el = document.getElementById('wf-type-grid');
      if (!el) return;
      el.innerHTML = _DV_WF_TYPES.map(t => {
        const sel = _dvWfSettings.wfType === t.id ? ' selected' : '';
        return '<div class="wf-type-card' + sel + '" onclick="_dvSetWfType(\'' + t.id + '\')">'
          + '<i class="' + t.icon + '"></i>' + t.name + '</div>';
      }).join('');
    }

    // ── Master waveform renderer: dispatches to chosen type ──
    function _dvDrawWfType(ctx, w, h, data, bufLen, color, amp, phase) {
      const type = _dvWfSettings.wfType || 'bars';
      switch (type) {
        case 'bars': _wfBars(ctx, w, h, data, bufLen, color, amp); break;
        case 'wave': _wfWave(ctx, w, h, data, bufLen, color, amp); break;
        case 'mirror': _wfMirror(ctx, w, h, data, bufLen, color, amp); break;
        case 'circle': _wfCircle(ctx, w, h, data, bufLen, color, amp, phase); break;
        case 'radial': _wfRadial(ctx, w, h, data, bufLen, color, amp, phase); break;
        case 'particles': _wfParticles(ctx, w, h, data, bufLen, color, amp, phase); break;
        case 'spectrum': _wfSpectrum(ctx, w, h, data, bufLen, color, amp); break;
        case 'blob': _wfBlob(ctx, w, h, data, bufLen, color, amp, phase); break;
        case 'terrain': _wfTerrain(ctx, w, h, data, bufLen, color, amp); break;
        case 'dots': _wfDots(ctx, w, h, data, bufLen, color, amp, phase); break;
        case 'rings': _wfRings(ctx, w, h, data, bufLen, color, amp, phase); break;
        case 'flame': _wfFlame(ctx, w, h, data, bufLen, color, amp, phase); break;
        default: _wfBars(ctx, w, h, data, bufLen, color, amp);
      }
    }

    // ── Type 1: Frequency Bars ──
    function _wfBars(ctx, w, h, data, bufLen, color, amp) {
      const n = 48, bw = (w - n) / n, step = Math.floor(bufLen / n);
      for (let i = 0; i < n; i++) {
        const v = Math.abs((data[i * step] - 128) / 128);
        const bh = v * h * 0.9 + 1, x = i * (bw + 1), y = (h - bh) / 2;
        ctx.fillStyle = color; ctx.globalAlpha = 0.4 + amp * 0.6;
        ctx.fillRect(x, y, bw, bh);
      }
      ctx.globalAlpha = 1;
    }

    // ── Type 2: Classic Wave ──
    function _wfWave(ctx, w, h, data, bufLen, color, amp) {
      ctx.lineWidth = 1.5 + amp * 2; ctx.strokeStyle = color;
      ctx.shadowBlur = 6 + amp * 10; ctx.shadowColor = color;
      ctx.beginPath();
      const sw = w / bufLen; let x = 0;
      for (let i = 0; i < bufLen; i++) { const v = data[i] / 128; const y = v * h / 2; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); x += sw; }
      ctx.lineTo(w, h / 2); ctx.stroke(); ctx.shadowBlur = 0;
    }

    // ── Type 3: Mirror Wave ──
    function _wfMirror(ctx, w, h, data, bufLen, color, amp) {
      ctx.lineWidth = 1.5 + amp; ctx.strokeStyle = color;
      ctx.shadowBlur = 4 + amp * 8; ctx.shadowColor = color;
      // Top half
      ctx.beginPath();
      const sw = w / bufLen; let x = 0;
      for (let i = 0; i < bufLen; i++) { const v = Math.abs((data[i] - 128) / 128) * amp * 2; const y = h / 2 - v * h / 2.5; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); x += sw; }
      ctx.stroke();
      // Bottom half (mirrored)
      ctx.beginPath(); x = 0;
      for (let i = 0; i < bufLen; i++) { const v = Math.abs((data[i] - 128) / 128) * amp * 2; const y = h / 2 + v * h / 2.5; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); x += sw; }
      ctx.stroke(); ctx.shadowBlur = 0;
    }

    // ── Type 4: Circular ──
    function _wfCircle(ctx, w, h, data, bufLen, color, amp, phase) {
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.3;
      ctx.strokeStyle = color; ctx.lineWidth = 1.5 + amp;
      ctx.shadowBlur = 8 + amp * 12; ctx.shadowColor = color;
      ctx.beginPath();
      for (let i = 0; i <= bufLen; i++) {
        const a = (i / bufLen) * Math.PI * 2 - Math.PI / 2;
        const v = 1 + ((data[i % bufLen] - 128) / 128) * amp * 0.6;
        const px = cx + Math.cos(a) * r * v, py = cy + Math.sin(a) * r * v;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.stroke(); ctx.shadowBlur = 0;
    }

    // ── Type 5: Radial Burst ──
    function _wfRadial(ctx, w, h, data, bufLen, color, amp, phase) {
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.15;
      const n = 32, step = Math.floor(bufLen / n);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (phase || 0) * 0.02;
        const v = Math.abs((data[i * step] - 128) / 128) * amp;
        const len = r + v * Math.min(w, h) * 0.35;
        ctx.strokeStyle = color; ctx.globalAlpha = 0.5 + v * 0.5; ctx.lineWidth = 2 + v * 2;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ── Type 6: Particle Flow ──
    let _wfParts = [];
    function _wfParticles(ctx, w, h, data, bufLen, color, amp, phase) {
      if (_wfParts.length < 80 && amp > 0.05) {
        for (let i = 0; i < 3; i++) _wfParts.push({ x: Math.random() * w, y: h, vx: (Math.random() - 0.5) * 2, vy: -1 - Math.random() * 3 * amp, life: 40 + Math.random() * 30, age: 0 });
      }
      _wfParts = _wfParts.filter(p => {
        p.age++; p.x += p.vx; p.y += p.vy; p.vy += 0.02;
        const a = 1 - p.age / p.life;
        if (a <= 0) return false;
        ctx.fillStyle = color; ctx.globalAlpha = a * 0.8;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2 + amp * 3 * a, 0, Math.PI * 2); ctx.fill();
        return true;
      });
      ctx.globalAlpha = 1;
    }

    // ── Type 7: Spectrum (gradient bars) ──
    function _wfSpectrum(ctx, w, h, data, bufLen, color, amp) {
      const n = 64, bw = w / n;
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(i * bufLen / n);
        const v = Math.abs((data[idx] - 128) / 128);
        const bh = v * h * 0.85 + 1;
        const hue = (i / n) * 120; // color shift across spectrum
        ctx.fillStyle = 'hsl(' + (hue + parseFloat(color.replace('#', '0x')) % 360) + ',80%,60%)';
        ctx.globalAlpha = 0.4 + v * 0.6;
        ctx.fillRect(i * bw, (h - bh) / 2, bw - 1, bh);
      }
      ctx.globalAlpha = 1;
    }

    // ── Type 8: Organic Blob ──
    function _wfBlob(ctx, w, h, data, bufLen, color, amp, phase) {
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.25;
      const pts = 24;
      ctx.fillStyle = color; ctx.globalAlpha = 0.15 + amp * 0.2;
      ctx.beginPath();
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const idx = Math.floor((i / pts) * bufLen) % bufLen;
        const v = 1 + ((data[idx] - 128) / 128) * amp * 0.5;
        const wobble = Math.sin(a * 3 + (phase || 0) * 0.05) * 0.1;
        const px = cx + Math.cos(a) * r * (v + wobble), py = cy + Math.sin(a) * r * (v + wobble);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.6 + amp * 0.4; ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ── Type 9: Terrain ──
    function _wfTerrain(ctx, w, h, data, bufLen, color, amp) {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, color); grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad; ctx.globalAlpha = 0.3 + amp * 0.4;
      ctx.beginPath(); ctx.moveTo(0, h);
      const sw = w / bufLen;
      for (let i = 0; i < bufLen; i++) {
        const v = Math.abs((data[i] - 128) / 128);
        ctx.lineTo(i * sw, h - v * h * 0.8);
      }
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.8; ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < bufLen; i++) {
        const v = Math.abs((data[i] - 128) / 128);
        i === 0 ? ctx.moveTo(0, h - v * h * 0.8) : ctx.lineTo(i * sw, h - v * h * 0.8);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }

    // ── Type 10: Dancing Dots ──
    function _wfDots(ctx, w, h, data, bufLen, color, amp, phase) {
      const n = 32, step = Math.floor(bufLen / n);
      for (let i = 0; i < n; i++) {
        const v = Math.abs((data[i * step] - 128) / 128);
        const x = w / (n + 1) * (i + 1), y = h / 2 + ((data[i * step] - 128) / 128) * h * 0.35;
        const r = 2 + v * 6 * amp;
        ctx.fillStyle = color; ctx.globalAlpha = 0.4 + v * 0.6;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        // Trail
        ctx.globalAlpha = 0.15;
        ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // ── Type 11: Concentric Rings ──
    function _wfRings(ctx, w, h, data, bufLen, color, amp, phase) {
      const cx = w / 2, cy = h / 2;
      const n = 6, step = Math.floor(bufLen / n);
      for (let i = 0; i < n; i++) {
        const v = Math.abs((data[i * step] - 128) / 128);
        const r = 8 + (i + 1) * Math.min(w, h) / (n * 2.5) + v * 15 * amp;
        ctx.strokeStyle = color; ctx.globalAlpha = 0.2 + v * 0.5; ctx.lineWidth = 1 + v * 2;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ── Type 12: Flame Wave ──
    function _wfFlame(ctx, w, h, data, bufLen, color, amp, phase) {
      const n = 40, bw = w / n, step = Math.floor(bufLen / n);
      for (let i = 0; i < n; i++) {
        const v = Math.abs((data[i * step] - 128) / 128);
        const bh = v * h * 0.7 + 2;
        const x = i * bw + bw / 2;
        // Gradient for flame effect
        const grad = ctx.createLinearGradient(x, h, x, h - bh);
        grad.addColorStop(0, color);
        grad.addColorStop(0.3, color + 'CC');
        grad.addColorStop(0.7, color + '44');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad; ctx.globalAlpha = 0.6 + v * 0.4;
        // Flickering shape
        const wobble = Math.sin((phase || 0) * 0.1 + i * 0.5) * 2 * v;
        ctx.beginPath();
        ctx.moveTo(x - bw / 2, h);
        ctx.quadraticCurveTo(x + wobble, h - bh * 0.7, x, h - bh);
        ctx.quadraticCurveTo(x - wobble, h - bh * 0.7, x + bw / 2, h);
        ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // ══════════════════════════════════════════════════════════
    //  VISUAL EFFECTS SYSTEM — Hover, particles, flames, glow
    // ══════════════════════════════════════════════════════════
    const _DV_FX_KEY = 'daveai_fx_settings';
    let _dvFxSettings = {
      hover: true, shimmer: true, particles: false, flames: false,
      static: false, neon: true, transitions: true, spark: false
    };

    function _loadFxSettings() {
      try { Object.assign(_dvFxSettings, JSON.parse(localStorage.getItem(_DV_FX_KEY) || '{}')); } catch (e) { }
    }
    function _saveFxSettings() {
      const el = id => document.getElementById(id);
      _dvFxSettings.hover = el('stg-fx-hover')?.checked ?? true;
      _dvFxSettings.shimmer = el('stg-fx-shimmer')?.checked ?? true;
      _dvFxSettings.particles = el('stg-fx-particles')?.checked ?? false;
      _dvFxSettings.flames = el('stg-fx-flames')?.checked ?? false;
      _dvFxSettings.static = el('stg-fx-static')?.checked ?? false;
      _dvFxSettings.neon = el('stg-fx-neon')?.checked ?? true;
      _dvFxSettings.transitions = el('stg-fx-transitions')?.checked ?? true;
      _dvFxSettings.spark = el('stg-fx-spark')?.checked ?? false;
      localStorage.setItem(_DV_FX_KEY, JSON.stringify(_dvFxSettings));
      _dvApplyFxClasses();
    }
    function _syncFxUI() {
      const el = id => document.getElementById(id);
      if (el('stg-fx-hover')) el('stg-fx-hover').checked = _dvFxSettings.hover;
      if (el('stg-fx-shimmer')) el('stg-fx-shimmer').checked = _dvFxSettings.shimmer;
      if (el('stg-fx-particles')) el('stg-fx-particles').checked = _dvFxSettings.particles;
      if (el('stg-fx-flames')) el('stg-fx-flames').checked = _dvFxSettings.flames;
      if (el('stg-fx-static')) el('stg-fx-static').checked = _dvFxSettings.static;
      if (el('stg-fx-neon')) el('stg-fx-neon').checked = _dvFxSettings.neon;
      if (el('stg-fx-transitions')) el('stg-fx-transitions').checked = _dvFxSettings.transitions;
      if (el('stg-fx-spark')) el('stg-fx-spark').checked = _dvFxSettings.spark;
    }

    // Apply CSS classes to all interactive elements based on FX settings
    function _dvApplyFxClasses() {
      const body = document.body;
      // Hover lift
      document.querySelectorAll('button, .ana-card, .proj-card, .vs-voice-card, .dvb-btn, .stg-toggle-row').forEach(el => {
        el.classList.toggle('dv-fx-hover', _dvFxSettings.hover);
        el.classList.toggle('dv-shimmer', _dvFxSettings.shimmer);
        el.classList.toggle('dv-static-active', _dvFxSettings.static);
      });
      // Neon text
      document.querySelectorAll('h1, h2, h3, .stg-label, .vs-section-title, .ana-card .ana-label').forEach(el => {
        el.classList.toggle('dv-neon-text', _dvFxSettings.neon);
      });
      // Spark borders
      document.querySelectorAll('.ana-card, .proj-card, #chat, .vs-voice-card').forEach(el => {
        el.classList.toggle('dv-spark', _dvFxSettings.spark);
      });
    }

    // Particle burst on click
    function _dvParticleBurst(e) {
      if (!_dvFxSettings.particles) return;
      const colors = [_dvWfSettings.femaleColor, _dvWfSettings.maleColor, '#A78BFA', '#FFF700'];
      const wrap = document.createElement('div');
      wrap.className = 'dv-particles';
      wrap.style.left = e.clientX + 'px';
      wrap.style.top = e.clientY + 'px';
      for (let i = 0; i < 12; i++) {
        const p = document.createElement('div');
        p.className = 'dv-particle';
        const angle = (i / 12) * Math.PI * 2;
        const dist = 20 + Math.random() * 30;
        p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
        p.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
        p.style.background = colors[i % colors.length];
        wrap.appendChild(p);
      }
      document.body.appendChild(wrap);
      setTimeout(() => wrap.remove(), 700);
    }
    document.addEventListener('click', _dvParticleBurst);

    // ══════════════════════════════════════════════════════════
    //  ICON / THEME STUDIO — Safe mode, auto-backup, packs
    // ══════════════════════════════════════════════════════════
    const _DV_THEME_KEY = 'daveai_theme_settings';
    const _DV_THEME_BACKUP_KEY = 'daveai_theme_backup';
    let _dvThemeSettings = { safeMode: true, autoBackup: true, activePack: 'stock', brokenPacks: [] };
    let _dvThemeBackupTimer = null;

    const _DV_ICON_PACKS = [
      { id: 'stock', name: 'Stock (Font Awesome)', count: 1600, preview: ['fas fa-home', 'fas fa-cog', 'fas fa-user', 'fas fa-code'], builtin: true },
      { id: 'phosphor', name: 'Phosphor Icons', count: 6600, preview: ['fas fa-cube', 'fas fa-lightbulb', 'fas fa-chat', 'fas fa-star'], url: 'https://unpkg.com/@phosphor-icons/web@2.0.3/src/regular/style.css' },
      { id: 'lucide', name: 'Lucide Icons', count: 1400, preview: ['fas fa-feather', 'fas fa-globe', 'fas fa-zap', 'fas fa-shield'], url: 'https://unpkg.com/lucide-static@0.263.1/font/lucide.css' },
      { id: 'tabler', name: 'Tabler Icons', count: 4600, preview: ['fas fa-layout', 'fas fa-bolt', 'fas fa-palette', 'fas fa-rocket'], url: 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css' },
      { id: 'boxicons', name: 'BoxIcons', count: 1500, preview: ['fas fa-box', 'fas fa-edit', 'fas fa-search', 'fas fa-heart'], url: 'https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css' },
      { id: 'remix', name: 'Remix Icons', count: 2800, preview: ['fas fa-brush', 'fas fa-compass', 'fas fa-terminal', 'fas fa-film'], url: 'https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css' },
      { id: 'bootstrap', name: 'Bootstrap Icons', count: 2000, preview: ['fas fa-grid', 'fas fa-chat', 'fas fa-gear', 'fas fa-people'], url: 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css' },
      { id: 'material', name: 'Material Symbols', count: 3200, preview: ['fas fa-dashboard', 'fas fa-settings', 'fas fa-person', 'fas fa-code'], url: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined' },
      { id: 'heroicons', name: 'Heroicons', count: 300, preview: ['fas fa-sparkles', 'fas fa-shield', 'fas fa-signal', 'fas fa-fire'], url: 'https://cdn.jsdelivr.net/npm/heroicons@2.0.18/24/outline/index.css' },
      { id: 'iconoir', name: 'Iconoir', count: 1500, preview: ['fas fa-gem', 'fas fa-plane', 'fas fa-camera', 'fas fa-music'], url: 'https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/css/iconoir.css' },
      { id: 'css-gg', name: 'CSS.gg', count: 700, preview: ['fas fa-arrow-right', 'fas fa-check', 'fas fa-close', 'fas fa-menu'], url: 'https://unpkg.com/css.gg@2.0.0/icons/all.css' },
      { id: 'simple', name: 'Simple Icons', count: 2800, preview: ['fas fa-github', 'fas fa-twitter', 'fas fa-youtube', 'fas fa-discord'], url: 'https://cdn.jsdelivr.net/npm/simple-icons-font@v7/font/simple-icons.min.css' },
    ];

    function _loadThemeSettings() {
      try { Object.assign(_dvThemeSettings, JSON.parse(localStorage.getItem(_DV_THEME_KEY) || '{}')); } catch (e) { }
    }
    function _saveThemeSettings() {
      const el = id => document.getElementById(id);
      _dvThemeSettings.safeMode = el('stg-theme-safemode')?.checked ?? true;
      _dvThemeSettings.autoBackup = el('stg-theme-autobackup')?.checked ?? true;
      localStorage.setItem(_DV_THEME_KEY, JSON.stringify(_dvThemeSettings));
      _dvStartAutoBackup();
    }
    function _syncThemeUI() {
      const el = id => document.getElementById(id);
      if (el('stg-theme-safemode')) el('stg-theme-safemode').checked = _dvThemeSettings.safeMode;
      if (el('stg-theme-autobackup')) el('stg-theme-autobackup').checked = _dvThemeSettings.autoBackup;
    }

    function _dvRenderIconStudio() {
      const el = document.getElementById('icon-studio-grid');
      if (!el) return;
      el.innerHTML = _DV_ICON_PACKS.map(p => {
        const active = _dvThemeSettings.activePack === p.id ? ' active' : '';
        const broken = (_dvThemeSettings.brokenPacks || []).includes(p.id) ? ' broken' : '';
        return '<div class="icon-pack-card' + active + broken + '" onclick="_dvSelectIconPack(\'' + p.id + '\')">'
          + '<div class="icon-pack-preview">' + p.preview.map(ic => '<i class="' + ic + '"></i>').join('') + '</div>'
          + '<div class="icon-pack-name">' + p.name + '</div>'
          + '<div class="icon-pack-count">' + p.count + ' icons</div>'
          + (broken ? '<label style="font-size:7px;color:#FCA5A5;cursor:pointer" onclick="event.stopPropagation();_dvUnmarkBroken(\'' + p.id + '\')">Unmark broken</label>' : '')
          + '</div>';
      }).join('');
    }

    function _dvSelectIconPack(packId) {
      if ((_dvThemeSettings.brokenPacks || []).includes(packId)) {
        if (!confirm('This icon pack is marked as broken. Try loading it anyway?')) return;
      }
      _dvThemeSettings.activePack = packId;
      _saveThemeSettings();
      _dvRenderIconStudio();
      // Safe mode: set a 30s timer — if the user doesn't confirm it works, revert
      if (_dvThemeSettings.safeMode && packId !== 'stock') {
        const revertTimer = setTimeout(() => {
          if (confirm('Icon pack "' + packId + '" — Does the UI look correct?\n\nClick OK if it works.\nClick Cancel to revert to stock.')) {
            _themeBackupNow(); // working, save as backup
          } else {
            _dvThemeSettings.activePack = 'stock';
            _dvThemeSettings.brokenPacks = [...new Set([...(_dvThemeSettings.brokenPacks || []), packId])];
            _saveThemeSettings();
            _dvRenderIconStudio();
            addRichActivity({ msg: 'Icon pack "' + packId + '" marked as broken, reverted to stock', type: 'warning', agent: 'System' });
          }
        }, 30000);
        addRichActivity({ msg: 'Loading icon pack: ' + packId + '. Safe mode: will ask to confirm in 30s.', type: 'system', agent: 'System' });
      }
    }

    function _dvUnmarkBroken(packId) {
      _dvThemeSettings.brokenPacks = (_dvThemeSettings.brokenPacks || []).filter(p => p !== packId);
      _saveThemeSettings();
      _dvRenderIconStudio();
    }

    // Auto-backup every 10 minutes
    function _dvStartAutoBackup() {
      if (_dvThemeBackupTimer) clearInterval(_dvThemeBackupTimer);
      if (_dvThemeSettings.autoBackup) {
        _dvThemeBackupTimer = setInterval(_themeBackupNow, 10 * 60 * 1000);
      }
    }

    function _themeBackupNow() {
      const backup = {
        ts: Date.now(),
        theme: JSON.parse(JSON.stringify(_dvThemeSettings)),
        fx: JSON.parse(JSON.stringify(_dvFxSettings)),
        wf: JSON.parse(JSON.stringify(_dvWfSettings)),
      };
      localStorage.setItem(_DV_THEME_BACKUP_KEY, JSON.stringify(backup));
      const dot = document.getElementById('theme-backup-dot');
      const label = document.getElementById('theme-backup-label');
      const time = document.getElementById('theme-backup-time');
      if (dot) dot.className = 'theme-backup-dot ok';
      if (label) label.textContent = 'Auto-backup: Active';
      if (time) time.textContent = 'Last: ' + new Date().toLocaleTimeString();
      console.log('[ThemeStudio] Backup saved');
    }

    function _themeRestoreBackup() {
      try {
        const raw = localStorage.getItem(_DV_THEME_BACKUP_KEY);
        if (!raw) { alert('No backup found.'); return; }
        const backup = JSON.parse(raw);
        if (!confirm('Restore theme backup from ' + new Date(backup.ts).toLocaleString() + '?')) return;
        Object.assign(_dvThemeSettings, backup.theme);
        Object.assign(_dvFxSettings, backup.fx);
        Object.assign(_dvWfSettings, backup.wf);
        localStorage.setItem(_DV_THEME_KEY, JSON.stringify(_dvThemeSettings));
        localStorage.setItem(_DV_FX_KEY, JSON.stringify(_dvFxSettings));
        localStorage.setItem(_DV_WF_KEY, JSON.stringify(_dvWfSettings));
        _syncThemeUI(); _syncFxUI(); _dvRenderColorGrids(); _dvRenderWfTypeGrid(); _dvRenderIconStudio(); _dvApplyFxClasses();
        addRichActivity({ msg: 'Theme restored from backup', type: 'system', agent: 'System' });
      } catch (e) { alert('Restore failed: ' + e.message); }
    }

    function _iconPackImport() {
      const url = prompt('Enter icon pack CSS URL:');
      if (!url) return;
      const name = prompt('Give this icon pack a name:') || 'Custom Pack';
      _DV_ICON_PACKS.push({ id: 'custom-' + Date.now(), name, count: '?', preview: ['fas fa-puzzle-piece', 'fas fa-paint-brush', 'fas fa-icons', 'fas fa-shapes'], url });
      _dvRenderIconStudio();
      addRichActivity({ msg: 'Imported custom icon pack: ' + name, type: 'system', agent: 'System' });
    }

    function _iconPackBrowse() {
      window.open('https://icon-sets.iconify.design/', '_blank');
    }

    // ══════════════════════════════════════════════════════════
    //  APP MODE — streamlined view for games/apps/web
    //  Draggable toolbar, mic, mute, minimize, fullscreen, zoom
    // ══════════════════════════════════════════════════════════
    const _AM_KEY = 'daveai_app_mode';
    let _amState = {
      on: false, zoom: 100, chatMin: false, chatFloat: false,
      hide: { status: false, voice: false, chat: false },
      pos: { x: null, y: null },
      chatPos: { x: null, y: null },
      tbOpacity: 35
    };

    function _amLoad() {
      try {
        const s = JSON.parse(localStorage.getItem(_AM_KEY));
        if (s) { _amState = Object.assign(_amState, s); }
      } catch { }
    }
    function _amSave() { localStorage.setItem(_AM_KEY, JSON.stringify(_amState)); }

    function toggleAppMode() {
      _amState.on = !_amState.on;
      if (!_amState.on) _amState.chatMin = false;
      _amApply();
      _amSave();
      console.log('[AppMode] ' + (_amState.on ? 'ON — streamlined view' : 'OFF — developer view'));
    }

    function _amApply() {
      const b = document.body;
      b.classList.toggle('app-mode', _amState.on);
      if (_amState.on && b.classList.contains('immersive')) {
        if (typeof exitImmersive === 'function') exitImmersive();
      }
      b.classList.toggle('app-hide-status', _amState.on && _amState.hide.status);
      b.classList.toggle('app-hide-voice', _amState.on && _amState.hide.voice);
      b.classList.toggle('app-hide-chat', _amState.on && _amState.hide.chat);
      b.classList.toggle('app-chat-minimized', _amState.on && _amState.chatMin);
      b.classList.toggle('app-chat-float', _amState.on && _amState.chatFloat);
      _amApplyZoom();
      _amSyncToolbar();
      _amRestorePos();
      _amRestoreChatPos();
      _amApplyTbOpacity();
      const feed = document.getElementById('chat-feed');
      if (feed && _amState.on && !_amState.chatMin) feed.style.display = 'flex';
    }

    // ── Element toggles ──
    function amtToggle(key) {
      _amState.hide[key] = !_amState.hide[key];
      const btn = document.getElementById('amt-' + key);
      if (btn) { btn.classList.toggle('on', !_amState.hide[key]); btn.classList.toggle('off', _amState.hide[key]); }
      document.body.classList.toggle('app-hide-' + key, _amState.hide[key]);
      _amSave();
    }

    // ── Chat minimize ──
    function amtChatMinimize() {
      _amState.chatMin = !_amState.chatMin;
      document.body.classList.toggle('app-chat-minimized', _amState.chatMin);
      const btn = document.getElementById('amt-chatmin');
      if (btn) {
        const icon = btn.querySelector('i');
        if (icon) icon.className = _amState.chatMin ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
      }
      _amSave();
    }

    // ── Zoom ──
    function amtZoom(delta) {
      if (delta === 0) _amState.zoom = 100;
      else _amState.zoom = Math.max(25, Math.min(200, _amState.zoom + delta));
      _amApplyZoom();
      _amSave();
    }

    function _amApplyZoom() {
      const frame = document.getElementById('preview-frame');
      const label = document.getElementById('amt-zoom-label');
      if (frame && _amState.on && _amState.zoom !== 100) {
        const s = _amState.zoom / 100;
        frame.style.transform = 'scale(' + s + ')';
        frame.style.width = (100 / s) + '%';
        frame.style.height = (100 / s) + '%';
      } else if (frame) {
        frame.style.transform = '';
        frame.style.width = '100%';
        frame.style.height = '100%';
      }
      if (label) label.textContent = _amState.zoom + '%';
    }

    // ── Mic toggle (reuses existing toggleMic if available) ──
    function amtMicToggle() {
      if (typeof toggleMic === 'function') toggleMic();
      const btn = document.getElementById('amt-mic');
      const mainMic = document.getElementById('mic');
      const isActive = mainMic && mainMic.classList.contains('recording');
      if (btn) btn.classList.toggle('mic-active', isActive);
    }

    // ── Mute toggle (reuses existing dvToggleMute) ──
    function amtMuteToggle() {
      if (typeof dvToggleMute === 'function') dvToggleMute();
      _amSyncMuteBtn();
    }
    function _amSyncMuteBtn() {
      const btn = document.getElementById('amt-mute');
      if (!btn) return;
      const muted = typeof _vsMuted !== 'undefined' ? _vsMuted : false;
      btn.classList.toggle('on', !muted);
      btn.classList.toggle('off', muted);
      const icon = btn.querySelector('i');
      if (icon) icon.className = muted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
    }

    // ── Auto-read toggle (reuses existing dvToggleAutoRead) ──
    function amtAutoReadToggle() {
      if (typeof dvToggleAutoRead === 'function') dvToggleAutoRead();
      _amSyncAutoReadBtn();
    }
    function _amSyncAutoReadBtn() {
      const btn = document.getElementById('amt-autoread');
      if (!btn) return;
      const auto = typeof _vsAutoRead !== 'undefined' ? _vsAutoRead : false;
      btn.classList.toggle('on', auto);
    }

    // ── Fullscreen ──
    function amtFullscreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => { });
      } else {
        document.exitFullscreen();
      }
    }

    // ── Float / Dock chat ──
    function amtChatFloat() {
      _amState.chatFloat = !_amState.chatFloat;
      if (_amState.chatMin) { _amState.chatMin = false; document.body.classList.remove('app-chat-minimized'); }
      document.body.classList.toggle('app-chat-float', _amState.chatFloat);
      const chat = document.getElementById('chat');
      if (chat && !_amState.chatFloat) {
        chat.style.left = ''; chat.style.top = ''; chat.style.right = ''; chat.style.bottom = '';
        _amState.chatPos = { x: null, y: null };
      }
      _amSyncToolbar();
      _amSave();
    }
    function amtChatDock() {
      _amState.chatFloat = false;
      document.body.classList.remove('app-chat-float');
      const chat = document.getElementById('chat');
      if (chat) { chat.style.left = ''; chat.style.top = ''; chat.style.right = ''; chat.style.bottom = ''; }
      _amState.chatPos = { x: null, y: null };
      _amSyncToolbar();
      _amSave();
    }

    // ── Draggable floating chat ──
    (function _amInitChatDrag() {
      let dragging = false, offX = 0, offY = 0;
      document.addEventListener('mousedown', function (e) {
        const handle = e.target.closest('#app-chat-drag');
        if (!handle || e.target.closest('.chat-drag-actions')) return;
        const chat = document.getElementById('chat');
        if (!chat || !document.body.classList.contains('app-chat-float')) return;
        dragging = true;
        const rect = chat.getBoundingClientRect();
        offX = e.clientX - rect.left; offY = e.clientY - rect.top;
        e.preventDefault();
      });
      document.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        const chat = document.getElementById('chat');
        if (!chat) return;
        let nx = e.clientX - offX, ny = e.clientY - offY;
        nx = Math.max(0, Math.min(window.innerWidth - 200, nx));
        ny = Math.max(0, Math.min(window.innerHeight - 60, ny));
        chat.style.left = nx + 'px'; chat.style.top = ny + 'px';
        chat.style.right = 'auto'; chat.style.bottom = 'auto';
      });
      document.addEventListener('mouseup', function () {
        if (!dragging) return;
        dragging = false;
        const chat = document.getElementById('chat');
        if (chat) {
          _amState.chatPos.x = parseInt(chat.style.left);
          _amState.chatPos.y = parseInt(chat.style.top);
          _amSave();
        }
      });
      document.addEventListener('touchstart', function (e) {
        const handle = e.target.closest('#app-chat-drag');
        if (!handle || e.target.closest('.chat-drag-actions')) return;
        const chat = document.getElementById('chat');
        if (!chat || !document.body.classList.contains('app-chat-float')) return;
        dragging = true;
        const rect = chat.getBoundingClientRect();
        const t = e.touches[0];
        offX = t.clientX - rect.left; offY = t.clientY - rect.top;
      }, { passive: true });
      document.addEventListener('touchmove', function (e) {
        if (!dragging) return;
        const chat = document.getElementById('chat');
        if (!chat) return;
        const t = e.touches[0];
        let nx = t.clientX - offX, ny = t.clientY - offY;
        nx = Math.max(0, Math.min(window.innerWidth - 200, nx));
        ny = Math.max(0, Math.min(window.innerHeight - 60, ny));
        chat.style.left = nx + 'px'; chat.style.top = ny + 'px';
        chat.style.right = 'auto'; chat.style.bottom = 'auto';
      }, { passive: true });
      document.addEventListener('touchend', function () {
        if (!dragging) return;
        dragging = false;
        const chat = document.getElementById('chat');
        if (chat) {
          _amState.chatPos.x = parseInt(chat.style.left);
          _amState.chatPos.y = parseInt(chat.style.top);
          _amSave();
        }
      });
    })();

    function _amRestoreChatPos() {
      const chat = document.getElementById('chat');
      if (!chat || !_amState.chatFloat) return;
      if (_amState.chatPos.x !== null && _amState.chatPos.y !== null) {
        chat.style.left = Math.min(_amState.chatPos.x, window.innerWidth - 200) + 'px';
        chat.style.top = Math.min(_amState.chatPos.y, window.innerHeight - 60) + 'px';
        chat.style.right = 'auto'; chat.style.bottom = 'auto';
      }
    }

    // ── Screenshot content ──
    function amtScreenshot() {
      const frame = document.getElementById('preview-frame');
      if (!frame) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = frame.clientWidth; canvas.height = frame.clientHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'daveai-screenshot-' + Date.now() + '.png';
          a.click(); URL.revokeObjectURL(a.href);
        });
      } catch (e) {
        console.log('[AppMode] Screenshot failed (cross-origin):', e.message);
        if (typeof addRichActivity === 'function') addRichActivity({ msg: 'Screenshot failed — cross-origin iframe', type: 'error', agent: 'System' });
      }
    }

    // ── Opacity cycle for toolbar ──
    function amtOpacityCycle() {
      const steps = [20, 35, 60, 80, 100];
      const idx = steps.indexOf(_amState.tbOpacity);
      _amState.tbOpacity = steps[(idx + 1) % steps.length];
      _amApplyTbOpacity();
      _amSave();
    }
    function _amApplyTbOpacity() {
      const tb = document.getElementById('app-mode-toolbar');
      if (tb) tb.style.setProperty('--amt-base-opacity', (_amState.tbOpacity / 100));
    }

    // ── Toolbar sync ──
    function _amSyncToolbar() {
      ['status', 'voice', 'chat'].forEach(k => {
        const btn = document.getElementById('amt-' + k);
        if (btn) { btn.classList.toggle('on', !_amState.hide[k]); btn.classList.toggle('off', _amState.hide[k]); }
      });
      const label = document.getElementById('amt-zoom-label');
      if (label) label.textContent = _amState.zoom + '%';
      const minBtn = document.getElementById('amt-chatmin');
      if (minBtn) {
        const icon = minBtn.querySelector('i');
        if (icon) icon.className = _amState.chatMin ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
      }
      const floatBtn = document.getElementById('amt-chatfloat');
      if (floatBtn) { floatBtn.classList.toggle('on', _amState.chatFloat); }
      _amSyncMuteBtn();
      _amSyncAutoReadBtn();
    }

    // ── Draggable toolbar ──
    (function _amInitDrag() {
      let dragging = false, offX = 0, offY = 0;
      document.addEventListener('mousedown', function (e) {
        const handle = e.target.closest('.amt-drag');
        if (!handle) return;
        const tb = document.getElementById('app-mode-toolbar');
        if (!tb) return;
        dragging = true;
        tb.classList.add('dragging');
        const rect = tb.getBoundingClientRect();
        offX = e.clientX - rect.left;
        offY = e.clientY - rect.top;
        e.preventDefault();
      });
      document.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        const tb = document.getElementById('app-mode-toolbar');
        if (!tb) return;
        let nx = e.clientX - offX;
        let ny = e.clientY - offY;
        nx = Math.max(0, Math.min(window.innerWidth - tb.offsetWidth, nx));
        ny = Math.max(0, Math.min(window.innerHeight - tb.offsetHeight, ny));
        tb.style.left = nx + 'px';
        tb.style.top = ny + 'px';
        tb.style.right = 'auto';
      });
      document.addEventListener('mouseup', function () {
        if (!dragging) return;
        dragging = false;
        const tb = document.getElementById('app-mode-toolbar');
        if (tb) {
          tb.classList.remove('dragging');
          _amState.pos.x = parseInt(tb.style.left);
          _amState.pos.y = parseInt(tb.style.top);
          _amSave();
        }
      });
      // Touch support
      document.addEventListener('touchstart', function (e) {
        const handle = e.target.closest('.amt-drag');
        if (!handle) return;
        const tb = document.getElementById('app-mode-toolbar');
        if (!tb) return;
        dragging = true;
        tb.classList.add('dragging');
        const rect = tb.getBoundingClientRect();
        const t = e.touches[0];
        offX = t.clientX - rect.left;
        offY = t.clientY - rect.top;
      }, { passive: true });
      document.addEventListener('touchmove', function (e) {
        if (!dragging) return;
        const tb = document.getElementById('app-mode-toolbar');
        if (!tb) return;
        const t = e.touches[0];
        let nx = t.clientX - offX;
        let ny = t.clientY - offY;
        nx = Math.max(0, Math.min(window.innerWidth - tb.offsetWidth, nx));
        ny = Math.max(0, Math.min(window.innerHeight - tb.offsetHeight, ny));
        tb.style.left = nx + 'px';
        tb.style.top = ny + 'px';
        tb.style.right = 'auto';
      }, { passive: true });
      document.addEventListener('touchend', function () {
        if (!dragging) return;
        dragging = false;
        const tb = document.getElementById('app-mode-toolbar');
        if (tb) {
          tb.classList.remove('dragging');
          _amState.pos.x = parseInt(tb.style.left);
          _amState.pos.y = parseInt(tb.style.top);
          _amSave();
        }
      });
    })();

    function _amRestorePos() {
      const tb = document.getElementById('app-mode-toolbar');
      if (b)
        if (_amState.pos.x !== null && _amState.pos.y !== null) {
          tb.style.left = Math.min(_amState.pos.x, window.innerWidth - 60) + 'px';
          tb.style.top = Math.min(_amState.pos.y, window.innerHeight - 40) + 'px';
          tb.style.right = 'auto';
        } else {
          tb.style.left = ''; tb.style.right = '8px'; tb.style.top = '8px';
        }
    }

    function _amRestore() {
      _amLoad();
      if (_amState.on) _amApply();
    }

    // Reclamp toolbar/chat on resize so they don't go off-screen
    let _amResizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(_amResizeTimer);
      _amResizeTimer = setTimeout(function () {
        if (!_amState.on) return;
        _amRestorePos();
        _amRestoreChatPos();
      }, 200);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.shiftKey && e.key === 'F') { e.preventDefault(); toggleAppMode(); }
      if (e.key === 'Escape' && _amState.on) { toggleAppMode(); }
      if (_amState.on && e.ctrlKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); amtZoom(10); }
      if (_amState.on && e.ctrlKey && e.key === '-') { e.preventDefault(); amtZoom(-10); }
      if (_amState.on && e.ctrlKey && e.key === '0') { e.preventDefault(); amtZoom(0); }
    });

    // ══════════════════════════════════════════════════════════
    //  INITIALIZATION — Load all new settings on page load
    // ══════════════════════════════════════════════════════════
    (function _dvInitNewFeatures() {
      _dvLoadWfSettings();
      _loadFxSettings();
      _loadThemeSettings();
      // Defer UI rendering until DOM is ready
      setTimeout(() => {
        _dvRenderColorGrids();
        _dvRenderWfTypeGrid();
        _dvRenderIconStudio();
        _syncFxUI();
        _syncThemeUI();
        _dvApplyFxClasses();
        _dvStartAutoBackup();
        _amRestore();
      }, 1500);
    })();

