// Fält där svaret bara kan väljas ur en lista.
// Förslag visas efter 3 tecken, i bokstavsordning: först det som innehåller texten,
// sedan det som liknar den trots stavfel ("micael" hittar "Michael Jackson").
// Accenter och skiljetecken spelar ingen roll: "senorita" hittar "Señorita".
// Fungerar med finger, mus och tangentbord (pilar, Enter och Esc), och
// skärmläsare får fältet presenterat som en kombinationsruta med lista.
// Ett kryss i fältet rensar det med ett tryck, så att man kan skriva ett nytt svar direkt.

import { compact, searchIndex, findSuggestions } from './text.js';

const MIN_CHARS = 3;
const MAX_SHOWN = 50;
// Material Symbols Rounded (Apache 2.0): cancel, fylld.
const CLEAR_ICON = '<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="m480-424 116 116q11 11 28 11t28-11q11-11 11-28t-11-28L536-480l116-116q11-11 11-28t-11-28q-11-11-28-11t-28 11L480-536 364-652q-11-11-28-11t-28 11q-11 11-11 28t11 28l116 116-116 116q-11 11-11 28t11 28q11 11 28 11t28-11l116-116Zm0 344q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z"/></svg>';

// onChange(value) anropas med det valda värdet, eller '' när valet tas bort.
// Listan kan fyllas i senare med setList, medan förslagen fortfarande laddas.
export function autocomplete(input, list, onChange) {
  const box = document.createElement('ul');
  box.className = 'suggestions';
  box.id = input.id + '-suggestions';
  box.setAttribute('role', 'listbox');
  box.setAttribute('aria-label', 'Förslag');
  box.hidden = true;
  input.after(box);
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', box.id);
  input.setAttribute('aria-expanded', 'false');

  const label = document.querySelector(`label[for="${input.id}"]`);
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'clear-input';
  clear.setAttribute('aria-label', label ? `Rensa ${label.textContent.toLowerCase()}` : 'Rensa');
  clear.title = 'Rensa';
  clear.innerHTML = CLEAR_ICON;
  clear.hidden = true;
  box.before(clear);
  // Krysset syns bara när det finns något att rensa.
  const showClear = () => { clear.hidden = !input.value || input.disabled; };
  // pointerdown så att fältet inte tappar fokus och tangentbordet stängs och öppnas igen.
  clear.addEventListener('pointerdown', (e) => e.preventDefault());
  clear.addEventListener('click', () => {
    input.value = '';
    if (selected) {
      selected = '';
      input.classList.remove('chosen');
      onChange('');
    }
    showClear();
    // Fokus i fältet, så att man kan skriva ett nytt svar direkt. Var det inte fokuserat
    // öppnar fokus förslagslistan via render, annars stängs den här.
    if (document.activeElement === input) render();
    else input.focus();
  });

  let selected = '';
  let items = list;
  let index = searchIndex(items);
  let options = []; // de valbara raderna som visas just nu
  let active = -1;

  function show(open) {
    box.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    if (open) fit();
    else setActive(-1);
  }

  // Listan räcker ner till underkanten av det som syns, i mobilen alltså till tangentbordet.
  // Den rullas inte, utan visar de träffar som får plats helt. Syns inte rätt svar får man
  // skriva mer. Utan visualViewport gäller höjden i CSS och listan rullas som förut.
  let allOptions = []; // alla träffar som byggts, även de som inte får plats
  let lastLimit = null;
  function fit() {
    const vv = window.visualViewport;
    if (!vv || box.hidden || !allOptions.length) return;
    const GAP = 8;
    // Webbläsarna räknar fältets läge olika när tangentbordet är uppe: från den synliga ytan
    // eller från hela sidfönstret. Den minsta tänkbara platsen används, så att listan aldrig
    // når in under tangentbordet. Hellre en rad för lite än en dold.
    const visibleBottom = Math.min(vv.height, vv.offsetTop + vv.height, window.innerHeight);
    const space = visibleBottom - input.getBoundingClientRect().bottom - 6 - GAP; // 6 = listans marginal i CSS
    const limit = Math.max(120, Math.floor(space));
    if (limit === lastLimit) return;
    lastLimit = limit;
    box.style.maxHeight = 'none';
    for (const li of allOptions) li.hidden = false;
    const style = getComputedStyle(box);
    const below = parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth);
    // Så många hela rader som får plats. Utan avrundning, så att små fel inte lägger ihop sig.
    const top = box.getBoundingClientRect().top;
    let fits = 0;
    for (const li of allOptions) {
      if (li.getBoundingClientRect().bottom - top + below > limit) break;
      fits++;
    }
    fits = Math.max(1, fits);
    allOptions.forEach((li, i) => { li.hidden = i >= fits; });
    // Bara de synliga raderna går att välja med piltangenterna.
    if (active >= fits) setActive(-1);
    options = allOptions.slice(0, fits);
  }
  // Tangentbordet öppnas och sidan rullar medan listan är öppen, så höjden räknas om.
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fit);
    window.visualViewport.addEventListener('scroll', fit);
  }
  window.addEventListener('scroll', fit, { passive: true });

  function setActive(index) {
    if (options[active]) options[active].removeAttribute('aria-selected');
    active = index;
    const li = options[active];
    if (li) {
      li.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', li.id);
      li.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function choose(value) {
    selected = value;
    input.value = value;
    input.classList.toggle('chosen', Boolean(value));
    showClear();
    show(false);
    onChange(value);
  }

  function note(text) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.setAttribute('role', 'presentation');
    li.textContent = text;
    box.append(li);
  }

  function render() {
    const query = compact(input.value);
    box.innerHTML = '';
    options = [];
    active = -1;
    input.removeAttribute('aria-activedescendant');
    if (query.length < MIN_CHARS) { show(false); return; }
    const { exact, close } = findSuggestions(index, query);
    const hits = exact.concat(close);
    for (const [i, item] of hits.slice(0, MAX_SHOWN).entries()) {
      const li = document.createElement('li');
      li.id = `${box.id}-${i}`;
      li.setAttribute('role', 'option');
      li.textContent = item;
      // pointerdown så att valet hinner registreras innan fältet tappar fokus
      li.addEventListener('pointerdown', (e) => { e.preventDefault(); choose(item); input.blur(); });
      box.append(li);
      options.push(li);
    }
    allOptions = options;
    lastLimit = null;
    box.style.maxHeight = '';
    if (items.length === 0) note('Laddar förslag…');
    else if (hits.length === 0) note('Inga träffar');
    show(true);
  }

  input.addEventListener('input', () => {
    // Fritext räknas inte som svar. Ändras ett valt svar tas det bort.
    if (selected && input.value !== selected) {
      selected = '';
      input.classList.remove('chosen');
      onChange('');
    }
    showClear();
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (box.hidden) render();
      if (!options.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((active + step + options.length) % options.length);
    } else if (e.key === 'Enter') {
      // Enter väljer den markerade raden, eller den enda träffen.
      const li = options[active] || (options.length === 1 ? options[0] : null);
      if (li && !box.hidden) {
        e.preventDefault();
        choose(li.textContent);
      }
    } else if (e.key === 'Escape' && !box.hidden) {
      e.preventDefault();
      show(false);
    }
  });
  input.addEventListener('focus', render);
  input.addEventListener('blur', () => show(false));

  return {
    set(value) {
      selected = value || '';
      input.value = selected;
      input.classList.toggle('chosen', Boolean(selected));
      showClear();
      show(false);
    },
    setList(newList) {
      items = newList;
      index = searchIndex(items);
      if (document.activeElement === input) render();
    },
    disable(disabled) {
      input.disabled = disabled;
      showClear();
      if (disabled) show(false);
    },
  };
}
