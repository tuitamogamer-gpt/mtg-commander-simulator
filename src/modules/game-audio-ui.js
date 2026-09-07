'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  if (typeof document === 'undefined' || !MTG.UI) return;
  const node = (tag, cls, text) => {
    const element = document.createElement(tag); element.className = cls;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  MTG.UI.prototype.renderAudioSettings = function () {
    const ui = this, audio = MTG.audio;
    const overlay = node('div', 'quickmenuov audiooverlay');
    const panel = node('section', 'quickmenu audiopanel');
    const head = node('header', 'quickmenuhead');
    const heading = node('div', '');
    heading.append(node('span', '', 'Set the mood'), node('h2', '', 'Music & sound'));
    const close = node('button', 'quickmenuclose', '×'); close.type = 'button';
    close.setAttribute('aria-label', 'Close music and sound');
    const dismiss = () => {
      ui.quickMenuOpen = false; ui.render(); document.querySelector('.menubutton')?.focus({ preventScroll: true });
    };
    close.onclick = dismiss; head.append(heading, close);
    const body = node('div', 'audiobody');
    body.appendChild(node('p', 'audiointro', 'A quieter kind of magic. Original fantasy lo-fi for long games.'));
    const tracks = node('div', 'audiotracks'); tracks.setAttribute('role', 'group'); tracks.setAttribute('aria-label', 'Background instrumental');
    const status = node('p', 'audiostatus'); status.setAttribute('role', 'status');
    let storageUnavailable = false;
    const change = changes => {
      storageUnavailable = !audio.configure(changes); void audio.unlock(); update();
    };
    for (const [index, track] of MTG.MUSIC_TRACKS.entries()) {
      const button = node('button', 'audiotrack'); button.type = 'button'; button.dataset.track = track.id; button.dataset.tone = track.tone;
      const art = node('span', 'audiotrackart', ['♧', '✧', '◈'][index]); art.setAttribute('aria-hidden', 'true');
      const label = node('span', 'audiotracklabel'); label.append(node('b', '', track.name), node('small', '', track.detail));
      const selected = node('span', 'audiotrackselected', '✓'); selected.setAttribute('aria-hidden', 'true');
      button.append(art, label, selected);
      button.onclick = () => change({ track: track.id }); tracks.appendChild(button);
    }
    body.appendChild(tracks);
    const controls = node('div', 'audiolevels');
    const sliders = {};
    for (const [key, label] of [['music', 'Music volume'], ['effects', 'Milestone effects volume']]) {
      const row = node('div', 'audiolevel'), title = node('label', '', label), output = node('output', '');
      const input = node('input', ''); input.type = 'range'; input.id = 'audio-' + key;
      input.min = '0'; input.max = '100'; input.step = '1'; input.value = String(audio.preferences[key]);
      title.htmlFor = input.id; output.htmlFor = input.id;
      input.oninput = () => change({ [key]: Number(input.value) });
      row.append(title, output, input); controls.appendChild(row); sliders[key] = { input, output };
    }
    const actions = node('div', 'audioactions');
    const mute = node('button', 'pbtn audiomute'); mute.type = 'button'; mute.onclick = () => change({ muted: !audio.preferences.muted });
    const preview = node('button', 'pbtn audiopreview', 'Test effects'); preview.type = 'button';
    preview.onclick = () => { void audio.preview(); };
    actions.append(mute, preview); body.append(controls, actions, status);
    body.appendChild(node('p', 'audiohint', 'Music loops softly. Effects mark major arrivals, 10+ damage, board wipes and the end of a game. Everyday card plays are silent.'));
    const footer = node('footer', 'audiofooter');
    const back = node('button', 'pbtn', '← Arena controls'); back.type = 'button';
    back.onclick = () => { ui.quickMenuOpen = true; ui.render(); document.querySelector('.audiosettingsopen')?.focus({ preventScroll: true }); };
    const done = node('button', 'pbtn primary', 'Done'); done.type = 'button'; done.onclick = dismiss;
    footer.append(back, done); panel.append(head, body, footer); overlay.appendChild(panel);
    overlay.onclick = event => { if (event.target === overlay) dismiss(); };
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
    });
    function update() {
      const p = audio.preferences, state = audio.status();
      for (const button of tracks.children) button.setAttribute('aria-pressed', String(button.dataset.track === p.track));
      for (const [key, slider] of Object.entries(sliders)) {
        if (slider.input.value !== String(p[key])) slider.input.value = String(p[key]);
        if (slider.output.textContent !== p[key] + '%') slider.output.textContent = p[key] + '%';
        slider.input.setAttribute('aria-valuetext', p[key] === 0 ? 'Off' : p[key] + '%');
      }
      const muteLabel = p.muted ? 'Unmute all' : 'Mute all';
      // Safari can cancel a click if its text node is replaced between
      // pointerdown (audio unlock) and pointerup. Keep unchanged controls intact.
      if (mute.textContent !== muteLabel) mute.textContent = muteLabel;
      mute.setAttribute('aria-pressed', String(p.muted));
      preview.disabled = p.muted || p.effects === 0 || state.state === 'unavailable';
      status.textContent = state.state === 'unavailable' ? 'Audio is unavailable in this browser.'
        : state.error || (storageUnavailable ? 'Applied for this session · device storage is unavailable'
          : p.muted ? 'All audio muted · saved on this device'
            : state.state === 'loading' ? 'Loading instrumental…'
              : state.context !== 'running' ? 'Choose a track or Test effects to start audio.'
                : p.music === 0 ? 'Music off · effects keep their own volume'
                  : 'Now playing · ' + MTG.MUSIC_TRACKS.find(track => track.id === p.track).name);
    }
    const unsubscribe = audio.subscribe(update);
    const observer = new MutationObserver(() => { if (!overlay.isConnected) { unsubscribe(); observer.disconnect(); } });
    observer.observe(document.body, { childList: true, subtree: true });
    update();
    MTG.enhanceDialog(overlay, panel, { label: 'Music and sound settings', initialFocus: close });
    return overlay;
  };
})();
