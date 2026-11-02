// Rutan Inställningar hos spelledaren, både på Starta nytt spel och under spelet.
// Modulen bygger rutan och returnerar valen. Vad valen gör, och när, avgör host.js.
import * as game from './game.js';
import { showConfirm } from './dialog.js';
import { esc } from './shared/dom.js';
import * as prefs from './shared/preferences.js';
import { enhanceSelect } from './rullista.js';
import { mountSwitch } from './theme.js';
import { dragToClose } from './ark.js';
import { ICONS as MENU_ICONS } from './meny.js';
import { DELAY_CHOICES, cleanDelay, delayShort, delayText } from './ljudfordrojning.js';
import { countUnknown, formatUnknown } from './okanda.js';

// short: den korta texten på segmentet. text: hela texten, som skärmläsare läser.
const SETTING_FIELDS = [
  { key: 'roundMs', label: 'Tid per låt', short: (v) => `${v / 1000} s`, text: (v) => `${v / 1000} sekunder per låt` },
  { key: 'bonusMs', label: 'Bonus för snabbt svar', short: (v) => (v ? `${v / 1000} s` : 'Av'), text: (v) => (v ? `Inom ${v / 1000} sekunder` : 'Ingen bonus') },
  { key: 'winScore', label: 'Poänggräns', short: (v) => String(v), text: (v) => `Först till ${v} poäng` },
];

// Ett fåtal val står sida vid sida som en segmentväljare, som i iPhone. Valen är radioknappar,
// så att piltangenterna byter val och formuläret läser värdet som förut.
function segmented(name, label, choices) {
  return `<fieldset class="segmented-field"><legend>${label}</legend><div class="segmented">
    ${choices.map(({ value, short, text, checked }) => `<label><input type="radio" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''}>`
      + `<span aria-hidden="true">${esc(short)}</span><span class="visually-hidden">${esc(text)}</span></label>`).join('')}
  </div></fieldset>`;
}

// Strömbrytaren Denna låt är okänd, under ett spel. Låtens titel visas inte, eftersom
// spelledaren också gissar.
function unknownCheckbox() {
  return `
    <div class="current-song">
      <button type="button" class="theme-switch" id="mark-unknown"></button>
    </div>`;
}

// Okända låtar kopieras som text och skickas vidare, så att de tas bort ur kategorin.
// Allt om okända låtar ligger i samma avdelning. Under ett spel gäller den aktuella låten.
function unknownGroup(show, checkbox, list) {
  if (!show || (!checkbox && !list)) return '';
  return `<div class="unknown-group"><h3>Okända låtar</h3>${checkbox}${list}</div>`;
}

function unknownSection(count) {
  if (!count) return '';
  return `
    <div class="unknown-songs">
      <p class="unknown-actions">
        <button type="button" id="copy-unknown" class="link">Kopiera okända låtar (${count})</button>
        <button type="button" id="clear-unknown" class="link">Rensa</button>
      </p>
      <p id="unknown-status" class="note" role="status"></p>
      <textarea id="unknown-text" class="unknown-text" readonly rows="6" aria-label="Okända låtar" hidden></textarea>
    </div>`;
}

function wireUnknown(dialog, names) {
  const copy = dialog.querySelector('#copy-unknown');
  if (!copy) return;
  const status = dialog.querySelector('#unknown-status');
  copy.addEventListener('click', async () => {
    const text = formatUnknown(prefs.unknownSongs(), names);
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = 'Kopierat. Klistra in listan i projektet, så tas låtarna bort ur kategorierna.';
    } catch {
      // Utan tillgång till urklipp visas texten, så att den kan kopieras för hand.
      const area = dialog.querySelector('#unknown-text');
      area.value = text;
      area.hidden = false;
      area.focus();
      area.select();
      status.textContent = 'Kopiera texten nedan.';
    }
  });
  dialog.querySelector('#clear-unknown').addEventListener('click', async () => {
    const ok = await showConfirm('Låtarna spelas igen i kommande spel. Kopiera listan först om den inte är skickad.', {
      title: 'Rensa okända låtar?', okText: 'Rensa', danger: true, icon: MENU_ICONS.delete,
    });
    if (!ok) return;
    prefs.setUnknownSongs({});
    dialog.querySelector('.unknown-songs').remove();
    const group = dialog.querySelector('.unknown-group');
    if (!group.querySelector('.current-song')) group.remove();
  });
}

// Namnfältet under strömbrytarna, där Jag deltar i spelet står. Före spelet står namnet på
// startsidan. Under spelet visas namnfältet bara om spelledaren inte har angett något namn
// tidigare. Lämnas det tomt heter spelledaren Spelledare.
function hostNameRow(askName) {
  return askName ? `
    <div id="setting-host-name-row" class="field-group host-name-row"><div class="field-row">
      <label for="setting-host-name">Namn</label>
      <input id="setting-host-name" name="hostName" maxlength="${game.MAX_NAME}" autocomplete="nickname"
        placeholder="${game.DEFAULT_HOST_NAME}">
    </div></div>` : '';
}

// Returnerar en funktion som ger { plays, name }. Ett namn som en spelare redan har
// stoppar Spara, så att två inte heter likadant.
function wireHostPlays(dialog, host) {
  let on = host.plays;
  const row = dialog.querySelector('#setting-host-name-row');
  const input = dialog.querySelector('#setting-host-name');
  const update = () => { if (row) row.hidden = !on; };
  mountSwitch(dialog.querySelector('#setting-host-plays'), 'Jag deltar i spelet', () => on, () => { on = !on; update(); });
  update();
  if (input) {
    input.addEventListener('input', () => input.setCustomValidity(''));
    dialog.querySelector('form').addEventListener('submit', (e) => {
      if (e.submitter?.value !== 'ok' || !on || !host.isTaken(input.value)) return;
      e.preventDefault();
      input.setCustomValidity(`${game.cleanHostName(input.value)} är redan med i spelet. Välj ett annat namn.`);
      input.reportValidity();
    });
  }
  return () => ({ plays: on, name: game.cleanHostName(input ? input.value : host.knownName) });
}

// Bonustider som inte är kortare än tiden per låt går inte att välja. Var en sådan vald byts den
// mot den längsta som går, samma val som cleanSettings gör.
function wireBonus(dialog) {
  const form = dialog.querySelector('form');
  const update = () => {
    const roundMs = Number(new FormData(form).get('roundMs'));
    const inputs = [...form.querySelectorAll('input[name=bonusMs]')];
    for (const input of inputs) input.disabled = !game.bonusAllowed(Number(input.value), roundMs);
    const checked = inputs.find((input) => input.checked);
    if (checked && checked.disabled) inputs.filter((input) => !input.disabled).at(-1).checked = true;
  };
  for (const input of form.querySelectorAll('input[name=roundMs]')) input.addEventListener('change', update);
  update();
}

/**
 * Visar rutan och returnerar de valda inställningarna, eller null om spelledaren avbryter.
 * I ett pågående spel finns även kategorin med. Den returneras som categoryId.
 * @param {object} current Tid per låt, bonus och poänggräns som gäller nu
 * @param {object} options
 * @param {object[] | null} [options.categories] kategorierna att välja bland under spelet, annars null
 * @param {string | null} [options.categoryId] den valda kategorin
 * @param {Record<string, string>} [options.names] kategoriernas namn, som används när okända låtar kopieras
 * @param {boolean} [options.clipAll] klippet spelas även i spelarnas mobiler
 * @param {boolean} [options.extraSounds] väntemusiken, trumvirveln och vinnarlåten spelas
 * @param {number} [options.audioDelay] Ljudsynk i millisekunder
 * @param {{ plays: boolean, knownName: string, askName: boolean, isTaken: (name: string) => boolean }} options.host
 *   Jag deltar i spelet, spelledarens kända namn, om namnfältet ska visas och om ett namn är upptaget
 * @param {{ show: boolean, songPlaying: boolean, isCurrent: () => boolean, toggleCurrent: () => void }} options.unknown
 *   avdelningen Okända låtar, och strömbrytaren för låten som spelas
 */
export function showSettings(current, {
  categories = null, categoryId = null, names = {}, clipAll = false, extraSounds = true, audioDelay = 0, host, unknown,
}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal settings';
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="settings-title">Inställningar</h2>
      <div class="settings-group">
      ${categories ? `
        <div class="setting-row"><label for="setting-category">Kategori</label>
        <select id="setting-category" name="categoryId">
          ${categories.map((c) => `<option value="${esc(c.id)}"${c.id === categoryId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select></div>` : ''}
      ${SETTING_FIELDS.map(({ key, label, short, text }) => segmented(key, label,
        game.SETTING_CHOICES[key].map((v) => ({ value: v, short: short(v), text: text(v), checked: v === current[key] })))).join('')}
      </div>
      <div class="switches clip-all"><button type="button" class="theme-switch" id="setting-clip-all"></button><button type="button" class="theme-switch" id="setting-extra-sounds"></button><button type="button" class="theme-switch" id="setting-host-plays"></button></div>
      ${hostNameRow(host.askName)}
      <div class="settings-group audio-delay">
      ${segmented('audioDelay', 'Ljudsynk', DELAY_CHOICES.map((v) => ({ value: v, short: delayShort(v), text: delayText(v), checked: v === audioDelay })))}
      </div>
      ${unknownGroup(unknown.show, unknown.songPlaying ? unknownCheckbox() : '', unknownSection(countUnknown(prefs.unknownSongs())))}
      <div class="modal-actions">
        <button value="cancel" class="secondary">Avbryt</button>
        <button value="ok">Spara</button>
      </div>
    </form>`;
  // En rullista skickar inte formuläret med Enter, så Enter sparar här. I namnfältet skulle
  // Enter annars trycka på formulärets första knapp, Avbryt.
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT')) {
      e.preventDefault();
      e.stopPropagation(); // annars startar Enter även spelet
      dialog.querySelector('[value=ok]').click();
    }
  });
  wireUnknown(dialog, names);
  wireBonus(dialog);
  const chosenHost = wireHostPlays(dialog, host);
  let clipOn = clipAll;
  mountSwitch(dialog.querySelector('#setting-clip-all'), 'Spela ljud på alla enheter', () => clipOn, () => { clipOn = !clipOn; });
  let soundsOn = extraSounds;
  mountSwitch(dialog.querySelector('#setting-extra-sounds'), 'Spela extraljud', () => soundsOn, () => { soundsOn = !soundsOn; });
  const mark = dialog.querySelector('#mark-unknown');
  // Antalet i länken följer strömbrytaren.
  const copyUnknown = dialog.querySelector('#copy-unknown');
  // Strömbrytaren gäller direkt, utan att spelledaren behöver spara, som i Utseende.
  if (mark) mountSwitch(mark, 'Denna låt är okänd', unknown.isCurrent, () => {
    unknown.toggleCurrent();
    if (copyUnknown) copyUnknown.textContent = `Kopiera okända låtar (${countUnknown(prefs.unknownSongs())})`;
  });
  // Rutan själv får fokus, inte första valet, så att inget ser markerat ut i mobilen.
  // Skärmläsaren läser rubriken, och Tab går till valen.
  dialog.tabIndex = -1;
  dialog.setAttribute('aria-labelledby', 'settings-title');
  document.body.append(dialog);
  dragToClose(dialog);
  const categorySelect = dialog.querySelector('#setting-category');
  if (categorySelect) enhanceSelect(categorySelect, { touch: true });
  dialog.showModal();
  dialog.focus();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      const form = dialog.querySelector('form');
      const values = Object.fromEntries(new FormData(form));
      resolve(dialog.returnValue === 'ok'
        ? {
          ...game.cleanSettings(values),
          ...(categories ? { categoryId: values.categoryId } : {}),
          clipAll: clipOn,
          extraSounds: soundsOn,
          audioDelay: cleanDelay(values.audioDelay),
          host: chosenHost(),
        } : null);
      dialog.remove();
    }, { once: true });
  });
}
