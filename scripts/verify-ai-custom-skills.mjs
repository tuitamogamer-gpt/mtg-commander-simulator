// Run against a local server. PLAYWRIGHT_MODULE may point to an installed package.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:8773';
const out = path.resolve('output/ai-custom-skills/browser');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.route('**/api/account?*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: null, profile: null, save: null }) }));
const verify = (condition, label) => { assert.ok(condition, label); checks.push(label); console.log('PASS', label); };
const screenshot = async name => page.screenshot({ path: path.join(out, `${name}.png`), animations: 'disabled', timeout: 60000 });
const pod = async () => {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-menu-action=solo]').first().click();
  await page.getByRole('button', { name: 'Choose my first deck', exact: true }).click({ timeout: 3000 }).catch(() => {});
  await page.locator('.deckentry[data-deck="Quandrix Unlimited"] .deckcard').click();
  await page.getByRole('button', { name: 'Build this pod →', exact: true }).click();
  await page.locator('.customskillsbutton').waitFor({ state: 'visible' });
};
const open = () => page.locator('.customskillsbutton').click();
const close = () => page.locator('.aiskilldialog [data-action=close]').click();
const upload = async (doc, filename = 'opponent.json') => {
  await page.locator('.aiskilldialog input[type=file]').setInputFiles({ name: filename, mimeType: 'application/json', buffer: Buffer.from(typeof doc === 'string' ? doc : JSON.stringify(doc)) });
  await page.waitForTimeout(100);
};
const stored = () => page.evaluate(() => localStorage.getItem(MTG.AI_SKILL_FORMAT.storageKey));
try {
  await pod(); await open();
  verify(await page.locator('.aiskilldialog').evaluate(el => el.open), 'Workshop opens as a native modal dialog');
  await page.locator('.aiskillguide summary').click();
  verify((await page.locator('#aiskill-prompt').inputValue()).includes('[DESCRIBE YOUR STYLE HERE]'), 'Creation prompt includes editable placeholder and full contract');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('[data-action=copy]').click();
  verify((await page.evaluate(() => navigator.clipboard.readText())).includes('commander-ai-skill/v1'), 'Copy creation prompt writes the full command to the clipboard');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-action=template]').click();
  const download = await downloadPromise;
  await download.saveAs(path.join(out, 'downloaded-template.json'));
  const template = JSON.parse(await fs.readFile(path.join(out, 'downloaded-template.json'), 'utf8'));
  verify(template.schema === 'commander-ai-skill/v1', 'Download produces valid skill JSON');
  await page.locator('.aiskillguide summary').click();
  await screenshot('01-template-preview');
  await upload('{invalid');
  verify(await page.locator('[data-action=save]').isDisabled(), 'Invalid JSON cannot be saved');
  verify((await stored()) === null, 'Invalid upload leaves storage untouched');
  await upload('x'.repeat(32769));
  verify((await page.locator('.aiskillstatus').innerText()).includes('32 KB'), 'Oversize file has an actionable error');
  await upload({ ...template, script: 'alert(1)' });
  verify((await page.locator('.aiskillstatus').innerText()).includes('Unknown skill field'), 'Executable/unknown fields are rejected');
  await page.locator('.aiskilldrop').evaluate((el, doc) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([JSON.stringify(doc)], 'dropped.json', { type: 'application/json' }));
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, template);
  await page.waitForFunction(() => !document.querySelector('[data-action=save]').disabled);
  verify(await page.locator('.aiskillpreview').isVisible(), 'Drag-and-drop uses the same validated preview');
  await page.locator('#aiskill-json').fill(JSON.stringify(template));
  verify(await page.locator('[data-action=save]').isDisabled(), 'Pasted edits must be checked again');
  await page.locator('[data-action=check]').click();
  await page.locator('[data-action=save]').click();
  verify(await page.getByRole('button', { name: 'Export Patient Engine', exact: true }).isVisible(), 'Save adds an exportable library entry');
  const exportPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Patient Engine', exact: true }).click();
  await (await exportPromise).saveAs(path.join(out, 'exported-skill.json'));
  verify(JSON.parse(await fs.readFile(path.join(out, 'exported-skill.json'), 'utf8')).id === template.id, 'Exported library skill is reusable JSON');
  await close();
  const key = await page.evaluate(() => MTG.aiSkillKey(MTG.readAISkillLibrary().records[0]));
  const styleSelect = page.getByLabel('AI Dragon play style', { exact: true });
  await styleSelect.selectOption(key);
  verify(/custom skill/i.test(await page.locator('.botconfig').first().innerText()), 'Bot seat shows the selected custom skill description');
  await open();
  const updated = { ...template, name: 'Patient Engine V2', reserveMana: 3 };
  await upload(updated);
  verify((await page.locator('.aiskillpreview').innerText()).includes('replaces'), 'Replacement is disclosed before saving');
  await page.locator('[data-action=save]').click(); await close();
  const updatedKey = await styleSelect.inputValue();
  verify(updatedKey !== key, 'Replacing a selected skill selects its new revision');
  await pod();
  const persisted = await page.getByLabel('AI Dragon play style', { exact: true }).locator('optgroup[label="Your custom skills"] option').allTextContents();
  verify(persisted.some(text => text.includes('Patient Engine V2')), 'Saved skill survives reload without another upload');
  await open();
  const hostile = { ...template, id: 'quoted-style', name: 'X"><img src=x onerror=window.__skillXss=1>' };
  await upload(hostile); await page.locator('[data-action=save]').click();
  verify(await page.locator('.aiskilllist img').count() === 0, 'Skill names render as text, not markup');
  await close();
  const hostileKey = await page.evaluate(() => MTG.aiSkillKey(MTG.readAISkillLibrary().records.find(doc => doc.id === 'quoted-style')));
  await page.getByLabel('AI Wolf play style', { exact: true }).selectOption(hostileKey);
  await page.locator('.setupstep[data-step=review]').click();
  verify(await page.locator('.reviewstyle [onerror]').count() === 0, 'Quoted metadata cannot inject elements into the review');
  verify(await page.evaluate(() => !window.__skillXss), 'No uploaded markup executed');
  await page.locator('.reviewback').click(); await open();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: `Remove ${hostile.name}`, exact: true }).click();
  await close();
  verify(await page.getByLabel('AI Wolf play style', { exact: true }).inputValue() === 'random', 'Removing a selected skill resets the seat visibly');
  await page.setViewportSize({ width: 390, height: 844 }); await open();
  await screenshot('02-mobile-library');
  verify(await page.locator('.aiskilldialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Mobile workshop has no horizontal overflow');
  await page.locator('.aiskillguide summary').click();
  await screenshot('03-mobile-instructions');
  verify(await page.locator('.aiskilldialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Mobile instructions and prompt remain within the dialog');
  await page.keyboard.press('Escape');
  await page.locator('.aiskilldialog').waitFor({ state: 'detached' });
  verify(await page.locator('.aiskilldialog').count() === 0, 'Escape closes workshop');
  verify(await page.locator('.customskillsbutton').evaluate(el => document.activeElement === el), 'Focus returns to the workshop opener');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-mode=online]').click();
  verify(await page.locator('.customskillsbutton').isHidden(), 'Commander Live keeps custom bot skills out of human-only setup');
  await page.locator('[data-mode=solo]').click();
  await page.getByLabel('AI Dragon play style', { exact: true }).selectOption(updatedKey);
  await page.locator('.setupstep[data-step=review]').click();
  await screenshot('04-review');
  await page.evaluate(() => { Math.random = () => 0.000083096; });
  await page.locator('.reviewstart').click();
  await page.waitForFunction(() => window._game && window._ui?.pending);
  await page.evaluate(() => { window._game.speedFactor = 0; window._ui.prioMode = 'off'; });
  let playedLand = false;
  for (let step = 0; step < 180; step++) {
    const state = await page.evaluate(() => MTG.renderGameState());
    const ready = await page.evaluate(() => window._game.aiDecisionLog?.some(entry => entry.style.startsWith('custom-') && entry.skill.startsWith('custom-') && /Cast|Play land/.test(entry.chosen) && !entry.fallback) && window._game.stack.length === 0 && window._game.battlefield.some(card => card.ctrl.aiStyle?.startsWith('custom-') && !card.is('Land')));
    if (ready && playedLand) break;
    if (state.pending?.type === 'main') {
      const landName = await page.evaluate(() => window._ui.pending?.q?.lands?.[0]?.name);
      if (landName) {
        await page.getByRole('button', { name: `${landName}. Playable now. Open card actions.`, exact: true }).first().click();
        await page.getByRole('button', { name: 'Play land', exact: true }).click();
        playedLand = true;
        await page.waitForTimeout(100);
        continue;
      }
    }
    const buttonNames = await page.locator('#game button:visible').allTextContents();
    let target = buttonNames.find(text => /Keep/.test(text));
    if (!target && !playedLand) target = buttonNames.find(text => /Play land/.test(text));
    if (!target) target = buttonNames.find(text => /^(Proceed|Pass|End turn|End main|Next phase|No attacks|No blocks|Got it|Continue|Done)/i.test(text.trim()));
    if (target) {
      const button = page.locator('#game button:visible').filter({ hasText: target }).last();
      if (/Play land/.test(target)) playedLand = true;
      await button.click({ timeout: 5000 });
    } else {
      const actionable = await page.evaluate(() => {
        const ui = window._ui, q = ui?.pending?.q;
        if (q?.type === 'main' && q.lands?.length) return q.lands[0].iid;
        return null;
      });
      if (actionable && !playedLand) {
        const card = page.locator(`#game [data-iid="${actionable}"]`).first();
        if (await card.count()) await card.click();
      }
    }
    await page.waitForTimeout(100);
  }
  const result = await page.evaluate(() => ({ state: MTG.renderGameState(),
    custom: window._game.players.filter(p => p.isAI && p.aiStyle.startsWith('custom-')).map(p => ({ style: p.aiStyle, base: MTG.getAIBaseStyle(p.aiStyle), skill: MTG.getAIStyleSkill(p.aiStyle).id })),
    decisions: window._game.aiDecisionLog, humanLands: window._game.lands(window._ui.me).length }));
  await fs.writeFile(path.join(out, 'game-state.json'), JSON.stringify(result, null, 2));
  verify(result.custom.length === 1 && result.custom[0].style === updatedKey, 'Normal game bootstrap retains the custom style and skill');
  verify(result.decisions.some(entry => entry.style === updatedKey && entry.skill === updatedKey && entry.mode), 'Real local AI decisions use the uploaded skill and inherited mode');
  verify(result.decisions.some(entry => entry.style === updatedKey && /^Cast /.test(entry.chosen)), 'Custom bot casts a real card');
  verify(result.state.players.some(player => player.aiStyle === updatedKey && player.battlefield.some(card => !card.types.includes('Land'))), 'Custom bot spell resolves onto the battlefield');
  verify(!result.decisions.some(entry => entry.fallback), 'Gameplay has no AI fallback');
  verify(result.humanLands >= 1, 'Human completes a real land play');
  await page.locator('.battlefieldarrival').waitFor({ state: 'detached', timeout: 10000 });
  await page.waitForTimeout(1400);
  await screenshot('05-custom-gameplay');
  verify(await page.evaluate(() => !window.__skillXss), 'Gameplay remains free of uploaded markup execution');
  verify(errors.length === 0, `No console/page errors: ${errors.join('; ')}`);
  await fs.rm(path.join(out, 'failure.json'), { force: true });
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify({ checks, errors, passed: true }, null, 2));
} catch (error) {
  await fs.writeFile(path.join(out, 'failure.json'), JSON.stringify({ checks, errors, failure: error.stack, body: await page.locator('body').innerText().catch(() => '') }, null, 2));
  throw error;
} finally { await browser.close(); }
