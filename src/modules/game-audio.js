// Local, presentation-only audio. Never consumes game RNG or changes a decision.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const U = MTG;
  U.MUSIC_TRACKS = Object.freeze([
    { id: 'council-at-dusk', name: 'Council at Dusk', detail: 'Acoustic strings · a quiet, mystical council', tone: 'grove' },
    { id: 'aether-tides', name: 'Aether Tides', detail: 'Airy keys · minimal astral ambience', tone: 'astral' },
    { id: 'emberwatch', name: 'Emberwatch', detail: 'Warm embers · restrained low drums', tone: 'ember' },
    { id: 'moonlit-grove', name: 'Moonlit Grove', detail: 'Felt piano · wooden harp · 72 BPM', tone: 'grove' },
    { id: 'astral-library', name: 'Astral Library', detail: 'Dusty keys · glass chimes · 68 BPM', tone: 'astral' },
    { id: 'ember-sanctum', name: 'Ember Sanctum', detail: 'Nylon guitar · warm embers · 74 BPM', tone: 'ember' },
  ].map(Object.freeze));
  U.SOUND_EFFECTS = Object.freeze([
    { id: 'combat', name: 'Combat', cooldown: 1200 },
    { id: 'venture', name: 'Venture', cooldown: 1000 },
    { id: 'counters', name: 'Counters & proliferate', cooldown: 900 },
    { id: 'counterspell', name: 'Counterspell', cooldown: 900 },
    { id: 'instant', name: 'Instant', cooldown: 800 },
    { id: 'sorcery', name: 'Sorcery', cooldown: 1000 },
    { id: 'spell-copy', name: 'Spell copy', cooldown: 900 },
    { id: 'summon', name: 'Major arrival', cooldown: 2500 },
    { id: 'heavy-impact', name: 'Heavy impact', cooldown: 2500 },
    { id: 'explosion', name: 'Explosion', cooldown: 2500 },
    { id: 'victory', name: 'Victory', cooldown: 2500 },
    { id: 'defeat', name: 'Defeat', cooldown: 2500 },
    ...[
      ['flying', 'Flying'], ['vigilance', 'Vigilance'], ['haste', 'Haste'], ['menace', 'Menace'],
      ['reach', 'Reach'], ['first-strike', 'First strike'], ['double-strike', 'Double strike'],
      ['trample', 'Trample'], ['lifelink', 'Lifelink'], ['deathtouch', 'Deathtouch'],
      ['infect', 'Infect'], ['wither', 'Wither'], ['proliferate', 'Proliferate'],
    ].map(([keyword, name]) => ({ id: 'keyword-' + keyword, name, keyword, cooldown: 1500, file: `sfx/keyword-${keyword}-v1.mp3` })),
  ].map(effect => Object.freeze({ ...effect, file: effect.file || `sfx/${effect.id}-v3.mp3` })));
  U.VOICE_CUES = Object.freeze([
    { id: 'your-turn', name: 'Your turn' },
    { id: 'victory', name: 'Victory' },
    { id: 'defeat', name: 'Defeat' },
    { id: 'massive-hit', name: 'A massive hit', kind: 'commentary' },
    { id: 'board-wipe', name: 'The board clears', kind: 'commentary' },
    { id: 'clutch-counter', name: 'A big spell countered', kind: 'commentary' },
    { id: 'huge-summon', name: 'A huge creature arrives', kind: 'commentary' },
    { id: 'comeback', name: 'Back in the game', kind: 'commentary' },
    { id: 'army-built', name: 'An army arrives', kind: 'commentary' },
  ].map(Object.freeze));
  const EFFECTS = new Map(U.SOUND_EFFECTS.map(effect => [effect.id, effect]));
  const NARRATION = new Set(U.VOICE_CUES.map(cue => cue.id));
  const COMMENTARY = new Set(U.VOICE_CUES.filter(cue => cue.kind === 'commentary').map(cue => cue.id));
  const KEYWORD_ORDER = ['double-strike', 'first-strike', 'deathtouch', 'trample', 'lifelink', 'infect', 'wither', 'reach', 'menace', 'flying', 'haste', 'vigilance', 'proliferate'];
  const publicAudioFacts = event => ['combat', 'gameEffect', 'battlefieldArrival'].includes(event?.type)
    && event.audioFacts && typeof event.audioFacts === 'object' && !Array.isArray(event.audioFacts) ? event.audioFacts : null;
  const audioListener = game => game?.viewer || game?.human?.();
  const level = (value, fallback) => typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value))) : fallback;
  U.normalizeAudioPreferences = raw => ({
    track: U.MUSIC_TRACKS.some(item => item.id === raw?.track) ? raw.track : 'council-at-dusk',
    music: level(raw?.music, 18), effects: level(raw?.effects, 38), narration: level(raw?.narration, 0), muted: raw?.muted === true,
  });
  U.audioVoiceForEvent = (event, game) => {
    const listener = audioListener(game);
    if (!listener || !event) return null;
    if (event.type === 'turn') return event.p === listener && !listener.lost ? 'your-turn' : null;
    if (event.type === 'gameover' && event.winner) return event.winner === listener ? 'victory' : 'defeat';
    return null;
  };
  U.audioCommentaryForEvent = event => {
    const facts = publicAudioFacts(event);
    if (!facts) return null;
    const finite = key => typeof facts[key] === 'number' && Number.isFinite(facts[key]);
    const atLeast = (key, threshold) => finite(key) && facts[key] >= threshold;
    if (atLeast('removedCount', 5)) return 'board-wipe';
    if (atLeast('counteredSpellManaValue', 6)) return 'clutch-counter';
    if (atLeast('actualDamageToPlayer', 12)) return 'massive-hit';
    if (atLeast('power', 8) || atLeast('toughness', 10)) return 'huge-summon';
    if (atLeast('creatureTokensCreated', 5)) return 'army-built';
    if (atLeast('lifeGained', 8) && finite('lifeBefore') && facts.lifeBefore <= 10 && atLeast('lifeAfter', 15)) return 'comeback';
    return null;
  };
  // Use only public event properties. Face-down identities, keywords and costs
  // must not influence a sound, even on the controller's own device.
  const ordinaryCuesForEvent = (event, game) => {
    if (!event) return [];
    if (event.type === 'combat') return event.kind === 'attackersDeclared' && event.count > 0
      ? [{ id: 'combat', priority: 2, volume: .7 }] : [];
    if (event.type === 'dungeon') return [{ id: 'venture', priority: 3, volume: .8 }];
    if (event.type === 'cardPlayed') {
      if (event.kind !== 'spell' || event.card?.faceDown) return [];
      // The engine supplies the public types of the chosen spell face. Reading
      // the printed card would misclassify Adventures, split and face-down spells.
      if (event.spellTypes?.includes('Instant')) return [{ id: 'instant', priority: 2, volume: .65 }];
      if (event.spellTypes?.includes('Sorcery')) return [{ id: 'sorcery', priority: 1, volume: .65 }];
      return [];
    }
    if (event.type === 'effectNotice') {
      if (event.kind === 'spellCopy' && !event.card?.faceDown && !event.spell?.card?.faceDown) return [{ id: 'spell-copy', priority: 2, volume: .55 }];
      if (event.kind === 'counter' && event.n > 0 && event.card?.zone === 'battlefield') {
        return [{ id: 'counters', priority: 1, volume: .6 }];
      }
      return [];
    }
    if (event.type === 'battlefieldArrival') return !event.card || event.card.faceDown ||
      !['commander', 'powerhouse'].includes(event.kind) ? [] : [{ id: 'summon', priority: 3 }];
    if (event.type === 'gameover') {
      const listener = audioListener(game);
      return listener && event.winner ? [{ id: event.winner === listener ? 'victory' : 'defeat', priority: 5, volume: .85 }] : [];
    }
    if (event.type !== 'gameEffect') return [];
    const amount = Number(event.amount) || 0;
    if (event.kind === 'counterspell') return [{ id: 'counterspell', priority: 4, volume: .8 }];
    if (event.kind === 'proliferate' && event.count > 0) return [{ id: 'counters', priority: 2, volume: .6 }];
    if (['counterChange', 'playerCounter'].includes(event.kind) && amount > 0) {
      const target = event.card || event.target || event.player;
      if (target?.zone === 'battlefield' || (!target?.zone && Number.isInteger(target?.idx))) {
        return [{ id: 'counters', priority: 1, volume: .6 }];
      }
    }
    if (event.kind === 'damage' && amount >= 10) {
      return [{ id: event.combat ? 'heavy-impact' : 'explosion', priority: 3 }];
    }
    if (event.kind === 'boardWipe' && (event.count ?? event.cards?.length ?? 0) >= 3) return [{ id: 'explosion', priority: 4 }];
    return [];
  };
  U.audioCuesForEvent = (event, game) => {
    const ordinary = ordinaryCuesForEvent(event, game), facts = publicAudioFacts(event);
    const keyword = Array.isArray(facts?.keywords) && KEYWORD_ORDER.find(id => facts.keywords.includes(id));
    // One keyword represents the moment; major impacts and game results keep
    // their higher priority when several effects share the same sound batch.
    return keyword ? [{ id: 'keyword-' + keyword, priority: 2.5, volume: .6 }, ...ordinary] : ordinary;
  };

  class GameAudio {
    constructor(env = globalThis) {
      this.env = env; this.context = null; this.game = null; this.unlocked = false;
      this.cache = new Map(); this.voices = new Set(); this.musicVoices = new Set();
      this.pending = new Map(); this.recent = new Map(); this.listeners = new Set();
      this.revision = 0; this.musicId = null; this.state = 'idle'; this.error = ''; this.history = [];
      let raw;
      try { raw = JSON.parse(env.localStorage?.getItem('mtgAudioPreferences')); } catch { /* Optional storage. */ }
      this.preferences = U.normalizeAudioPreferences(raw);
      this.gesture = () => { if (this.game) void this.unlock(); };
      this.visibility = () => {
        if (env.document.hidden) {
          this.clearEffects(); this.clearNarration();
          void this.context?.suspend().catch(() => {});
          this.notify();
        } else if (this.game && this.unlocked) void this.unlock();
      };
      env.document?.addEventListener('pointerdown', this.gesture, { passive: true });
      env.document?.addEventListener('keydown', this.gesture);
      env.document?.addEventListener('visibilitychange', this.visibility);
    }
    notify() { for (const listener of this.listeners) listener(); }
    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    status() {
      return { state: this.env.document?.hidden ? 'paused' : this.state, error: this.error,
        muted: this.preferences.muted, track: this.preferences.track,
        context: this.context?.state || 'locked', activeEffects: this.voices.size,
        activeMusic: this.musicVoices.size, activeNarration: this.narration ? 1 : 0, loaded: [...this.cache.keys()] };
    }
    attach(game) {
      if (game === this.game) return;
      this.revision++; this.clearEffects(); this.clearNarration(); this.stopMusic(); this.recent.clear();
      this.game = game; this.state = 'idle';
      this.commentaryAt = -Infinity; this.resultAnnounced = false;
      if (game && this.unlocked) void this.syncMusic();
    }
    async unlock() {
      if (!this.game || this.env.document?.hidden) return false;
      const wasRunning = this.unlocked && this.context?.state === 'running';
      try {
        if (!this.context) {
          const Context = this.env.AudioContext || this.env.webkitAudioContext;
          if (!Context) { this.state = 'unavailable'; this.notify(); return false; }
          this.context = new Context();
          this.musicBus = this.context.createGain(); this.effectsBus = this.context.createGain();
          this.narrationBus = this.context.createGain();
          const limiter = this.context.createDynamicsCompressor();
          limiter.threshold.value = -8; limiter.knee.value = 12; limiter.ratio.value = 5;
          limiter.attack.value = 0.003; limiter.release.value = 0.18;
          this.musicBus.connect(limiter); this.effectsBus.connect(limiter); this.narrationBus.connect(limiter); limiter.connect(this.context.destination);
          this.applyVolumes();
        }
        if (this.context.state !== 'running') await this.context.resume();
        this.unlocked = this.context.state === 'running';
        if (!this.unlocked) return false;
        if (!this.preferences.muted && this.preferences.effects > 0 && !this.preloaded) {
          this.preloaded = true;
          // Decode short effects once; music remains lazy and bounded.
          void Promise.all([...EFFECTS.keys()].map(id => this.load('sfx/' + id).catch(() => null)));
        }
        void this.syncMusic(); if (!wasRunning) this.notify(); return true;
      } catch {
        this.state = 'locked'; this.notify(); return false;
      }
    }
    applyVolumes() {
      if (!this.context) return;
      const p = this.preferences, at = this.context.currentTime;
      this.musicBus.gain.setTargetAtTime(p.muted ? 0 : p.music / 100 * (this.narration ? .35 : 1), at, 0.08);
      this.effectsBus.gain.setTargetAtTime(p.muted ? 0 : p.effects / 100, at, 0.02);
      this.narrationBus.gain.setTargetAtTime(p.muted ? 0 : p.narration / 100, at, 0.02);
    }
    configure(changes) {
      this.preferences = U.normalizeAudioPreferences({ ...this.preferences, ...changes });
      let saved = true;
      try { this.env.localStorage.setItem('mtgAudioPreferences', JSON.stringify(this.preferences)); } catch { saved = false; }
      this.applyVolumes();
      if (this.preferences.muted || this.preferences.effects === 0) this.clearEffects();
      if (this.preferences.muted || this.preferences.narration === 0) this.clearNarration();
      void this.syncMusic(); this.notify(); return saved;
    }
    async load(key) {
      if (this.cache.has(key)) return this.cache.get(key);
      const promise = (async () => {
        const filename = key.startsWith('sfx/') ? EFFECTS.get(key.slice(4))?.file : key + '.mp3';
        if (!filename) throw new Error('Unknown audio cue');
        const response = await this.env.fetch('./assets/audio/' + filename);
        if (!response.ok) throw new Error('Audio download failed');
        return this.context.decodeAudioData(await response.arrayBuffer());
      })();
      this.cache.set(key, promise);
      try { return await promise; }
      catch (error) { this.cache.delete(key); throw error; }
    }
    stopMusic(fade = 0) {
      if (!this.context) return;
      const at = this.context.currentTime;
      for (const voice of this.musicVoices) {
        voice.gain.gain.cancelScheduledValues(at);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, at);
        voice.gain.gain.linearRampToValueAtTime(0, at + fade);
        try { voice.source.stop(at + fade + 0.02); } catch { /* Already ended. */ }
      }
      this.musicId = null;
    }
    async syncMusic() {
      if (!this.context || !this.unlocked || !this.game) return;
      const prefs = this.preferences;
      if (prefs.muted || prefs.music === 0) {
        this.revision++; this.stopMusic(0.12); this.state = 'muted'; this.notify(); return;
      }
      if (this.musicId === prefs.track && ['loading', 'playing'].includes(this.state)) return;
      const revision = ++this.revision, id = prefs.track;
      this.musicId = id; this.state = 'loading'; this.error = ''; this.notify();
      try {
        const buffer = await this.load('music/' + id);
        if (revision !== this.revision || !this.game) return;
        this.stopMusic(1.2);
        const source = this.context.createBufferSource(), gain = this.context.createGain();
        source.buffer = buffer; source.loop = true;
        source.connect(gain); gain.connect(this.musicBus);
        const voice = { source, gain }; this.musicVoices.add(voice);
        source.onended = () => { this.musicVoices.delete(voice); source.disconnect(); gain.disconnect(); };
        const at = this.context.currentTime;
        gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(1, at + 1.2);
        source.start(); this.musicId = id; this.state = 'playing';
        for (const key of this.cache.keys()) if (key.startsWith('music/') && key !== 'music/' + id) this.cache.delete(key);
        this.notify();
      } catch {
        if (revision !== this.revision) return;
        this.stopMusic(0.2); this.state = 'error'; this.error = 'This track could not load. Choose it again to retry.'; this.notify();
      }
    }
    canPlay(channel = 'effects') {
      return !!this.game && !this.game._simulation && this.unlocked && this.context?.state === 'running' && !this.env.document?.hidden
        && !this.preferences.muted && this.preferences[channel] > 0;
    }
    handle(event, game, { replay = false } = {}) {
      if (game !== this.game || replay || game?._simulation) return;
      if (event?.type === 'gameover') {
        this.resultAnnounced = true;
        if (this.narrationId && !['victory', 'defeat'].includes(this.narrationId)) this.clearNarration();
      }
      if (this.canPlay()) for (const cue of U.audioCuesForEvent(event, game)) this.enqueue(cue);
      if (this.canPlay('narration')) {
        const id = U.audioVoiceForEvent(event, game) || (audioListener(game) && U.audioCommentaryForEvent(event));
        if (event?.type === 'turn' && !id && this.narrationId === 'your-turn') this.clearNarration();
        if (id) void this.playNarration(id);
      }
    }
    enqueue(cue) {
      if (!EFFECTS.has(cue.id) || !this.canPlay()) return;
      const now = this.env.performance.now();
      // Coalesce counter batches and copies; retain longer gaps for big impacts.
      const gap = EFFECTS.get(cue.id).cooldown;
      if (now - (this.recent.get(cue.id) ?? -Infinity) < gap) return;
      this.pending.set(cue.id, cue);
      if (this.batchTimer) return;
      this.batchTimer = this.env.setTimeout(() => {
        this.batchTimer = null;
        const cues = [...this.pending.values()].sort((a, b) => (b.priority || 0) - (a.priority || 0));
        this.pending.clear();
        for (const item of cues.slice(0, 1)) {
          this.recent.set(item.id, this.env.performance.now()); void this.play(item);
        }
      }, 45);
    }
    async play(cue, { preview = false } = {}) {
      if (!EFFECTS.has(cue.id) || !this.canPlay()) return;
      const game = this.game, epoch = this.effectsEpoch || 0, requested = this.env.performance.now();
      const priority = cue.priority || 1, request = this.effectRequest = (this.effectRequest || 0) + 1;
      const protectedByMajor = () => !preview && this.effectFocus && priority < this.effectFocus.priority
        && (request < this.effectFocus.request || this.env.performance.now() < this.effectFocus.until);
      if (protectedByMajor()) return;
      if (priority >= 3) this.effectFocus = { request, priority, until: requested + 180 };
      const current = () => this.canPlay() && game === this.game && epoch === (this.effectsEpoch || 0)
        && this.env.performance.now() - requested <= 700 && !protectedByMajor();
      try {
        const buffer = await this.load('sfx/' + cue.id);
        // Serialize admissions, including the short tail fade, so concurrent
        // downloads never briefly exceed the three-source limit.
        const admit = async () => {
          if (!current()) return;
          const retired = new Set([...this.voices].filter(source =>
            preview || source.audioCueId === cue.id && source.audioPriority <= priority || priority >= 3 && source.audioPriority < priority));
          const kept = [...this.voices].filter(source => !retired.has(source)).sort((a, b) => a.audioPriority - b.audioPriority);
          while (kept.length >= 3) {
            const quietest = kept.shift();
            if (quietest.audioPriority > priority) return;
            retired.add(quietest);
          }
          if (retired.size) {
            const at = this.context.currentTime;
            for (const source of retired) {
              source.audioGain.gain.setTargetAtTime(0, at, 0.006);
              try { source.stop(at + 0.025); } catch { /* Already ended. */ }
            }
            await new Promise(resolve => this.env.setTimeout(resolve, 30));
            // onended can be delivered later than the audio render quantum.
            // Keep retiring nodes tracked until they are definitely silent.
            for (const source of retired) {
              try { source.stop(); } catch { /* Already ended. */ }
              source.disconnect(); source.audioGain.disconnect(); this.voices.delete(source);
            }
            if (!current()) return;
          }
          const source = this.context.createBufferSource(), gain = this.context.createGain();
          source.buffer = buffer;
          source.audioPriority = priority; source.audioGain = gain; source.audioCueId = cue.id;
          gain.gain.value = cue.volume ?? 1;
          source.connect(gain); gain.connect(this.effectsBus); this.voices.add(source);
          source.onended = () => { this.voices.delete(source); source.disconnect(); gain.disconnect(); };
          source.start();
          if (priority >= 3) this.effectFocus = { request: Math.max(request, this.effectFocus?.request || 0), priority, until: this.env.performance.now() + 180 };
          this.history.push({ id: cue.id, at: Math.round(this.env.performance.now()) });
          if (this.history.length > 40) this.history.shift();
        };
        const playing = (this.mixQueue || Promise.resolve()).then(admit, admit);
        this.mixQueue = playing.catch(() => {});
        await playing;
      } catch {
        if (!current()) return;
        this.error = 'A sound effect could not load. Use Test effects to retry.'; this.notify();
      }
    }
    cancelPendingEffects() {
      this.effectsEpoch = (this.effectsEpoch || 0) + 1;
      this.previewRequest = (this.previewRequest || 0) + 1; this.effectFocus = null;
      this.env.clearTimeout(this.batchTimer); this.batchTimer = null; this.pending.clear();
    }
    clearEffects() {
      this.cancelPendingEffects();
      for (const source of this.voices) {
        try { source.stop(); } catch { /* Already ended. */ }
        source.disconnect(); source.audioGain.disconnect(); this.voices.delete(source);
      }
    }
    clearNarration() {
      this.narrationEpoch = (this.narrationEpoch || 0) + 1;
      const source = this.narration; this.narration = null; this.narrationId = null;
      if (source) { try { source.stop(); } catch { /* Already ended. */ } }
      this.applyVolumes();
    }
    async playNarration(id, { preview = false } = {}) {
      if (!NARRATION.has(id) || !this.canPlay('narration')) return;
      const now = this.env.performance.now(), key = 'voice/' + id;
      const commentary = COMMENTARY.has(id);
      if (!preview && commentary && (this.resultAnnounced || this.narrationId || now - (this.commentaryAt ?? -Infinity) < 18000)) return;
      if (!preview && (now - (this.recent.get(key) ?? -Infinity) < 5000 || id === 'your-turn' && (this.narrationId || this.resultAnnounced))) return;
      if (!preview && commentary) this.commentaryAt = now;
      this.recent.set(key, now);
      // One spoken line at a time. Game end can replace an unfinished turn cue.
      this.clearNarration();
      this.narrationId = id;
      const epoch = this.narrationEpoch, game = this.game;
      try {
        const buffer = await this.load(key);
        if (!this.canPlay('narration') || game !== this.game || epoch !== this.narrationEpoch || this.env.performance.now() - now > 1500) {
          if (epoch === this.narrationEpoch) this.narrationId = null;
          return;
        }
        const source = this.context.createBufferSource();
        source.buffer = buffer; source.connect(this.narrationBus); this.narration = source;
        source.onended = () => {
          source.disconnect();
          if (this.narration === source) { this.narration = null; this.narrationId = null; this.applyVolumes(); this.notify(); }
        };
        this.applyVolumes(); source.start();
        this.history.push({ id, channel: 'voice', at: Math.round(this.env.performance.now()) });
        if (this.history.length > 40) this.history.shift();
        this.notify();
      } catch {
        if (epoch !== this.narrationEpoch || game !== this.game) return;
        this.narrationId = null;
        this.error = 'A voice cue could not load. Use Test voice to retry.'; this.notify();
      }
    }
    async previewNarration(id = 'your-turn') {
      if (!NARRATION.has(id)) return;
      await this.unlock(); this.error = '';
      await this.playNarration(id, { preview: true });
    }
    async preview(id = 'combat') {
      if (!EFFECTS.has(id)) return;
      const request = this.previewRequest = (this.previewRequest || 0) + 1;
      await this.unlock();
      if (request !== this.previewRequest) return;
      this.error = ''; this.cancelPendingEffects();
      await this.play({ id, priority: 3, volume: .7 }, { preview: true });
    }
    dispose() {
      this.attach(null); this.listeners.clear();
      this.env.document?.removeEventListener('pointerdown', this.gesture);
      this.env.document?.removeEventListener('keydown', this.gesture);
      this.env.document?.removeEventListener('visibilitychange', this.visibility);
      void this.context?.close().catch(() => {});
    }
  }
  U.GameAudio = GameAudio;
  if (typeof document !== 'undefined') U.audio = new GameAudio();
})();
