// Local, presentation-only audio. Never consumes game RNG or changes a decision.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const U = MTG;
  U.MUSIC_TRACKS = Object.freeze([
    { id: 'moonlit-grove', name: 'Moonlit Grove', detail: 'Felt piano · wooden harp · 72 BPM', tone: 'grove' },
    { id: 'astral-library', name: 'Astral Library', detail: 'Dusty keys · glass chimes · 68 BPM', tone: 'astral' },
    { id: 'ember-sanctum', name: 'Ember Sanctum', detail: 'Nylon guitar · warm embers · 74 BPM', tone: 'ember' },
  ].map(Object.freeze));
  const EFFECTS = new Set(['card', 'summon', 'attack', 'impact', 'heavy-impact', 'bolt', 'explosion',
    'ward', 'counterspell', 'portal', 'death', 'heal', 'victory']);
  const level = (value, fallback) => typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value))) : fallback;
  U.normalizeAudioPreferences = raw => ({
    track: U.MUSIC_TRACKS.some(item => item.id === raw?.track) ? raw.track : 'moonlit-grove',
    music: level(raw?.music, 18), effects: level(raw?.effects, 38), muted: raw?.muted === true,
  });
  // Use only public event properties. Face-down identities, keywords and costs
  // must not influence a sound, even on the controller's own device.
  U.audioCuesForEvent = event => {
    if (!event) return [];
    if (event.type === 'cardPlayed') return [{ id: 'card', rate: event.kind === 'land' ? 0.88 : 1 }];
    if (event.type === 'battlefieldArrival') return event.card?.faceDown ? [] : [{ id: 'summon', priority: 3 }];
    if (event.type === 'combat' && event.kind === 'attackersDeclared' && event.count > 0) return [{ id: 'attack' }];
    if (event.type === 'gameover') return [{ id: 'victory', priority: 4 }];
    if (event.type === 'effectNotice' && event.kind === 'spellCopy') return [{ id: 'bolt', volume: 0.55 }];
    if (event.type !== 'gameEffect') return [];
    const amount = Number(event.amount) || 0;
    if (event.kind === 'damage' && amount > 0) {
      if (event.combat) return [{ id: amount >= 6 ? 'heavy-impact' : 'impact', priority: amount >= 6 ? 2 : 1 }];
      const source = event.source;
      const colors = source && !source.faceDown ? source.colors || source.cur?.colors || [] : [];
      return [{ id: amount >= 10 || (amount >= 5 && colors.includes('R')) ? 'explosion' : 'bolt', priority: amount >= 5 ? 3 : 1 }];
    }
    if (event.kind === 'boardWipe' && (event.count > 0 || event.cards?.length)) return [{ id: 'explosion', priority: 4 }];
    if (event.kind === 'counterspell') return [{ id: 'counterspell', priority: 3 }];
    if (event.kind === 'damagePrevented' || (event.kind === 'keyword' && event.state === 'prevented')) return [{ id: 'ward', priority: 2 }];
    if (event.kind === 'zoneMove' && event.fromZone === 'battlefield') return [{
      id: event.toZone === 'graveyard' ? 'death' : 'portal', volume: 0.65,
    }];
    if (event.kind === 'combatStrike') return [{ id: 'attack', volume: 0.7 }];
    if (event.kind === 'proliferate' && event.count > 0) return [{ id: 'heal', volume: 0.7 }];
    return [];
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
          this.clearEffects();
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
        activeMusic: this.musicVoices.size, loaded: [...this.cache.keys()] };
    }
    attach(game) {
      if (game === this.game) return;
      this.revision++; this.clearEffects(); this.stopMusic(); this.recent.clear();
      this.game = game; this.state = 'idle';
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
          const limiter = this.context.createDynamicsCompressor();
          limiter.threshold.value = -8; limiter.knee.value = 12; limiter.ratio.value = 5;
          limiter.attack.value = 0.003; limiter.release.value = 0.18;
          this.musicBus.connect(limiter); this.effectsBus.connect(limiter); limiter.connect(this.context.destination);
          this.applyVolumes();
        }
        if (this.context.state !== 'running') await this.context.resume();
        this.unlocked = this.context.state === 'running';
        if (!this.unlocked) return false;
        if (!this.preferences.muted && this.preferences.effects > 0 && !this.preloaded) {
          this.preloaded = true;
          // Decode short effects once; music remains lazy and bounded.
          void Promise.all([...EFFECTS].map(id => this.load('sfx/' + id).catch(() => null)));
        }
        void this.syncMusic(); if (!wasRunning) this.notify(); return true;
      } catch {
        this.state = 'locked'; this.notify(); return false;
      }
    }
    applyVolumes() {
      if (!this.context) return;
      const p = this.preferences, at = this.context.currentTime;
      this.musicBus.gain.setTargetAtTime(p.muted ? 0 : p.music / 100, at, 0.08);
      this.effectsBus.gain.setTargetAtTime(p.muted ? 0 : p.effects / 100, at, 0.02);
    }
    configure(changes) {
      this.preferences = U.normalizeAudioPreferences({ ...this.preferences, ...changes });
      let saved = true;
      try { this.env.localStorage.setItem('mtgAudioPreferences', JSON.stringify(this.preferences)); } catch { saved = false; }
      this.applyVolumes();
      if (this.preferences.muted || this.preferences.effects === 0) this.clearEffects();
      void this.syncMusic(); this.notify(); return saved;
    }
    async load(key) {
      if (this.cache.has(key)) return this.cache.get(key);
      const promise = (async () => {
        const response = await this.env.fetch('./assets/audio/' + key + '.mp3');
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
    canPlay() {
      return !!this.game && this.unlocked && this.context?.state === 'running' && !this.env.document?.hidden
        && !this.preferences.muted && this.preferences.effects > 0;
    }
    handle(event, game, { replay = false } = {}) {
      if (game !== this.game || replay || !this.canPlay()) return;
      for (const cue of U.audioCuesForEvent(event)) this.enqueue(cue);
    }
    enqueue(cue) {
      if (!EFFECTS.has(cue.id) || !this.canPlay()) return;
      const now = this.env.performance.now();
      // Coalesce simultaneous combat/removal events; never queue a storm backlog.
      const gap = cue.id === 'card' ? 75 : cue.id === 'explosion' ? 800 : 220;
      if (now - (this.recent.get(cue.id) ?? -Infinity) < gap) return;
      this.pending.set(cue.id, cue);
      if (this.batchTimer) return;
      this.batchTimer = this.env.setTimeout(() => {
        this.batchTimer = null;
        const cues = [...this.pending.values()].sort((a, b) => (b.priority || 0) - (a.priority || 0));
        this.pending.clear();
        const big = cues.some(item => item.id === 'explosion');
        for (const item of cues.filter(item => !big || !['death', 'impact', 'heavy-impact', 'bolt'].includes(item.id)).slice(0, 3)) {
          this.recent.set(item.id, this.env.performance.now()); void this.play(item);
        }
      }, 45);
    }
    async play(cue) {
      if (!this.canPlay()) return;
      const game = this.game, epoch = this.effectsEpoch || 0, requested = this.env.performance.now();
      try {
        const buffer = await this.load('sfx/' + cue.id);
        // Ignore stale loads after mute, tab hiding, a game change or slow network.
        if (!this.canPlay() || game !== this.game || epoch !== (this.effectsEpoch || 0) || this.env.performance.now() - requested > 700) return;
        if (this.voices.size >= 5) {
          const quietest = [...this.voices].sort((a, b) => a.audioPriority - b.audioPriority)[0];
          if (quietest.audioPriority > (cue.priority || 1)) return;
          // A large move must remain audible when earlier tails fill the mix.
          // Retire a less important/older tail with a tiny fade to avoid clicks.
          quietest.audioGain.gain.setTargetAtTime(0, this.context.currentTime, 0.008);
          quietest.stop(this.context.currentTime + 0.03); this.voices.delete(quietest);
        }
        const source = this.context.createBufferSource(), gain = this.context.createGain();
        source.buffer = buffer; source.playbackRate.value = cue.rate || 1;
        source.audioPriority = cue.priority || 1; source.audioGain = gain;
        gain.gain.value = cue.volume ?? 1;
        source.connect(gain); gain.connect(this.effectsBus); this.voices.add(source);
        source.onended = () => { this.voices.delete(source); source.disconnect(); gain.disconnect(); };
        source.start();
        this.history.push({ id: cue.id, at: Math.round(this.env.performance.now()) });
        if (this.history.length > 40) this.history.shift();
      } catch { this.error = 'A sound effect could not load. Use Test effects to retry.'; this.notify(); }
    }
    clearEffects() {
      this.effectsEpoch = (this.effectsEpoch || 0) + 1;
      this.env.clearTimeout(this.batchTimer); this.batchTimer = null; this.pending.clear();
      for (const source of this.voices) { try { source.stop(); } catch { /* Already ended. */ } }
    }
    async preview() {
      await this.unlock(); this.error = ''; this.enqueue({ id: 'card' });
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
