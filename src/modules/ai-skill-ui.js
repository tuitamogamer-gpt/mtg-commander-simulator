'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  if (typeof document === 'undefined') return;
  const node = (tag, text, cls) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  };
  MTG.openAISkillLibrary = function (onChange = () => {}) {
    if (document.querySelector('.aiskilldialog')) return;
    const opener = document.activeElement;
    const dialog = node('dialog', undefined, 'aiskilldialog');
    dialog.setAttribute('aria-labelledby', 'aiskill-title');
    dialog.innerHTML = `
      <header class="aiskillhead"><div><small>LOCAL OPPONENT WORKSHOP</small><h2 id="aiskill-title">Custom AI skills</h2><p>Give your opponents a play style of your own.</p></div><button type="button" class="pbtn" data-action="close" aria-label="Close custom AI skills">Close ×</button></header>
      <div class="aiskillbody">
        <section class="aiskilleditor" aria-label="Import an opponent skill">
          <div class="aiskillsteps"><b>01 · Create</b><span>Use the template or copy the creation prompt.</span><b>02 · Check</b><span>Upload a JSON file or paste it below.</span><b>03 · Play</b><span>Save, then choose it in any bot’s Play style.</span></div>
          <details class="aiskillguide"><summary>Instructions &amp; creation prompt</summary>
            <p>Describe your preferred play style in the prompt below, then use it in your own AI assistant. Save its JSON response as <code>my-skill.json</code>. You can also edit the template yourself.</p>
            <p><b>The game reads settings, not prose.</b> The base style supplies combat, modes and politics. Multipliers tune evaluation; role bonuses tune casting. The description is only a label. These preferences never grant illegal actions or knowledge of hidden cards.</p>
            <label for="aiskill-base">Template base</label><select id="aiskill-base"></select>
            <div class="aiskilltools"><button type="button" class="pbtn" data-action="template">Download JSON template</button><button type="button" class="pbtn" data-action="copy">Copy creation prompt</button></div>
            <label for="aiskill-prompt">Creation prompt — replace [DESCRIBE YOUR STYLE HERE]</label><textarea id="aiskill-prompt" rows="6" readonly></textarea>
            <p><b>Limits:</b> 32 KB per JSON file; 20 saved skills. Evaluation multipliers: 0.5–2 (1 keeps the base priority). Up to four card-role bonuses: −6–6. Reserve mana: 0–4, a soft preference while holding interaction.</p>
            <p>Skills are stored in this browser, not synced as an account library. Export a backup before clearing browser data. Selected revisions travel with private game saves and public debug exports. Random style uses only built-in styles. Commander Live has no bots.</p>
          </details>
          <div class="aiskilldrop"><b>Upload your skill.json</b><span>Choose a file or drop it here · JSON only · up to 32 KB</span><input type="file" accept=".json,application/json" aria-label="Upload AI skill JSON"></div>
          <label for="aiskill-json">Or paste the skill JSON</label><textarea id="aiskill-json" rows="10" spellcheck="false" placeholder='{"schema": "commander-ai-skill/v1", …}'></textarea>
          <div class="aiskillpreview" hidden></div>
        </section>
        <aside class="aiskilllibrary" aria-label="Saved AI skills"><h3>Your skill library <span class="aiskillcount"></span></h3><p>Saved on this device. Available for every Solo AI seat.</p><div class="aiskilllist"></div></aside>
      </div>
      <footer class="aiskillfooter"><p role="status" aria-live="polite" class="aiskillstatus">Start with a template, or upload your own JSON file.</p><div><button type="button" class="pbtn" data-action="check">Check skill</button><button type="button" class="pbtn primary" data-action="save" disabled>Save skill</button></div></footer>`;
    document.body.appendChild(dialog);
    const $ = selector => dialog.querySelector(selector);
    const input = $('#aiskill-json'), fileInput = $('input[type=file]'), preview = $('.aiskillpreview');
    const saveButton = $('[data-action=save]'), status = $('.aiskillstatus');
    let candidate = null, generation = 0;
    const message = (text, error = false) => { status.textContent = text; status.classList.toggle('error', error); };
    const invalidate = () => { candidate = null; generation++; saveButton.disabled = true; preview.hidden = true; preview.replaceChildren(); };
    const download = (text, filename) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = node('a'); a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const check = () => {
      invalidate();
      try {
        candidate = MTG.parseAISkill(input.value);
        const base = MTG.AI_STYLES[candidate.baseStyle];
        const existing = MTG.readAISkillLibrary().records.find(doc => doc.id === candidate.id);
        preview.append(node('small', 'VALID SKILL · READY TO SAVE'), node('h3', candidate.name), node('p', candidate.description));
        preview.append(node('p', `Based on ${base.label}. ${existing ? `Saving replaces “${existing.name}” in your library; existing game saves keep their revision.` : 'Adds a new style to your library.'}`));
        const settings = node('dl');
        for (const [key, value] of Object.entries(candidate.profileMultipliers)) settings.append(node('dt', key), node('dd', `×${value} of base`));
        for (const [key, value] of Object.entries(candidate.roleBonuses)) settings.append(node('dt', `Cast: ${key}`), node('dd', `${value > 0 ? '+' : ''}${value}`));
        settings.append(node('dt', 'Reserve mana'), node('dd', String(candidate.reserveMana ?? MTG.getAIStyleSkill(candidate.baseStyle)?.reserveMana ?? 0)));
        preview.append(settings); preview.hidden = false;
        saveButton.disabled = false;
        message('Valid JSON. Review the settings, then Save skill.');
      } catch (error) { message(error.message, true); }
    };
    const renderLibrary = () => {
      const library = MTG.readAISkillLibrary();
      const list = $('.aiskilllist'); list.replaceChildren();
      $('.aiskillcount').textContent = `${library.records.length} / 20`;
      if (library.error) {
        list.append(node('p', `Library unavailable: ${library.error}`, 'error'));
        const reset = node('button', 'Reset local skill library', 'pbtn'); reset.type = 'button';
        reset.onclick = () => {
          if (!confirm('Remove the saved custom AI skill library in this browser? Exported JSON files and built-in styles are not affected.')) return;
          try {
            MTG.resetAISkillLibrary();
            onChange({ removedKeys: Object.keys(MTG.AI_STYLES).filter(key => MTG.AI_STYLES[key].custom) });
            renderLibrary(); message('Local skill library reset.');
          } catch (error) { message(error.message, true); }
        };
        list.append(reset); return;
      }
      if (!library.records.length) list.append(node('p', 'No custom skills yet. Built-in archetypes and Command Zone signatures remain available.', 'aiskillempty'));
      for (const doc of library.records) {
        const card = node('article');
        card.append(node('h4', doc.name), node('small', `Based on ${MTG.AI_STYLES[doc.baseStyle].label}`), node('p', doc.description));
        const actions = node('div', undefined, 'aiskilltools');
        for (const [label, action] of [
          ['Edit', () => { invalidate(); input.value = JSON.stringify(doc, null, 2); check(); input.focus(); }],
          ['Export', () => download(JSON.stringify(doc, null, 2), `${doc.id}.json`)],
          ['Remove', () => {
            if (!confirm(`Remove “${doc.name}” from this browser's skill library?`)) return;
            try { MTG.removeAISkill(doc.id); onChange({ removedKeys: [MTG.aiSkillKey(doc)] }); renderLibrary(); invalidate(); message('Skill removed. Seats using it return to Random style.'); }
            catch (error) { message(error.message, true); }
          }],
        ]) {
          const button = node('button', label, 'pbtn'); button.type = 'button'; button.onclick = action;
          button.setAttribute('aria-label', `${label} ${doc.name}`); actions.append(button);
        }
        card.append(actions); list.append(card);
      }
    };
    input.addEventListener('input', () => { invalidate(); message('JSON changed. Check it again before saving.'); });
    const loadFile = async file => {
      invalidate();
      const ticket = generation;
      if (!file) return;
      if (!/\.json$/i.test(file.name)) { message('Choose a .json skill file.', true); return; }
      if (file.size > MTG.AI_SKILL_FORMAT.maxBytes) { message('AI skill: file exceeds 32 KB.', true); return; }
      message(`Reading ${file.name}…`);
      try {
        const content = await file.text();
        if (ticket !== generation || !dialog.isConnected) return;
        input.value = content; check();
      } catch { if (ticket === generation) message('The file could not be read. Try selecting it again.', true); }
    };
    fileInput.onchange = () => { loadFile(fileInput.files[0]); fileInput.value = ''; };
    const drop = $('.aiskilldrop');
    drop.ondragover = event => { event.preventDefault(); drop.classList.add('dragover'); };
    drop.ondragleave = () => drop.classList.remove('dragover');
    drop.ondrop = event => {
      event.preventDefault(); drop.classList.remove('dragover');
      if (event.dataTransfer.files.length !== 1) { invalidate(); message('Upload one JSON skill at a time.', true); return; }
      loadFile(event.dataTransfer.files[0]);
    };
    $('[data-action=check]').onclick = check;
    saveButton.onclick = () => {
      if (!candidate) return;
      try {
        const old = MTG.readAISkillLibrary().records.find(doc => doc.id === candidate.id);
        const key = MTG.saveAISkill(candidate);
        const name = candidate.name;
        onChange({ key, previousKey: old ? MTG.aiSkillKey(old) : null });
        renderLibrary(); invalidate();
        message(`Saved “${name}”. Close this window and choose it under Your custom skills in a bot’s Play style.`);
      } catch (error) { message(error.message, true); }
    };
    for (const key of MTG.AI_SKILL_FORMAT.bases) {
      const option = node('option', MTG.AI_STYLES[key].label); option.value = key; $('#aiskill-base').append(option);
    }
    $('#aiskill-base').value = 'josh';
    $('#aiskill-prompt').value = MTG.aiSkillPrompt();
    $('[data-action=template]').onclick = () => {
      const baseStyle = $('#aiskill-base').value;
      const template = baseStyle === 'josh' ? MTG.aiSkillTemplate() : {
        schema: MTG.AI_SKILL_FORMAT.schema, id: 'my-opponent', name: 'My Opponent',
        description: `My custom ${MTG.AI_STYLES[baseStyle].label} opponent.`, baseStyle,
        profileMultipliers: { cardAdvantage: 1 }, roleBonuses: {},
      };
      download(JSON.stringify(template, null, 2), `${template.id}.json`);
      invalidate(); input.value = JSON.stringify(template, null, 2); check();
    };
    $('[data-action=copy]').onclick = async () => {
      try { await navigator.clipboard.writeText($('#aiskill-prompt').value); message('Creation prompt copied. Replace the style placeholder in your AI assistant.'); }
      catch { $('#aiskill-prompt').focus(); $('#aiskill-prompt').select(); message('Clipboard unavailable. The prompt is selected; copy it manually.'); }
    };
    $('[data-action=close]').onclick = () => dialog.close();
    dialog.addEventListener('close', () => { generation++; dialog.remove(); if (opener?.isConnected) opener.focus(); });
    renderLibrary(); dialog.showModal();
    fileInput.focus();
  };
})();
