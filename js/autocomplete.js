// Fält där svaret bara kan väljas ur en lista.
// Förslag visas efter 3 tecken, i bokstavsordning: först det som innehåller texten,
// sedan det som liknar den trots stavfel ("micael" hittar "Michael Jackson").
// Accenter och skiljetecken spelar ingen roll: "senorita" hittar "Señorita".
// Fungerar med finger, mus och tangentbord (pilar, Enter och Esc), och
// skärmläsare får fältet presenterat som en kombinationsruta med lista.

import { compact, searchIndex, findSuggestions } from './text.js';

const MIN_CHARS = 3;
const MAX_SHOWN = 50;

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

  // Listan räcker ner till underkanten av det som syns, i mobilen alltså till tangentbordet,
  // så att inga förslag döljs bakom det. Utan visualViewport gäller höjden i CSS.
  function fit() {
    const vv = window.visualViewport;
    if (!vv || box.hidden) return;
    const GAP = 8;
    // Webbläsarna räknar fältets läge olika när tangentbordet är uppe: från den synliga ytan
    // eller från hela sidfönstret. Den minsta tänkbara platsen används, så att listan aldrig
    // når in under tangentbordet. Hellre en rad för lite än en dold.
    const visibleBottom = Math.min(vv.height, vv.offsetTop + vv.height, window.innerHeight);
    const space = visibleBottom - input.getBoundingClientRect().bottom - 6 - GAP; // 6 = listans marginal i CSS
    const limit = Math.max(120, Math.floor(space));
    // Listan slutar efter den sista raden som får plats helt, så att ingen rad syns till hälften.
    const style = getComputedStyle(box);
    const below = parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth);
    const top = box.getBoundingClientRect().top - box.scrollTop;
    let height = limit;
    for (const li of box.children) {
      // Utan avrundning, så att små fel inte lägger ihop sig över raderna.
      const bottom = li.getBoundingClientRect().bottom - top + below;
      if (bottom > limit) break;
      height = bottom;
    }
    box.style.maxHeight = `${height}px`;
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
    if (items.length === 0) note('Laddar förslag…');
    else if (hits.length === 0) note('Inga träffar');
    else if (hits.length > MAX_SHOWN) note(`… och ${hits.length - MAX_SHOWN} till. Skriv mer.`);
    show(true);
  }

  input.addEventListener('input', () => {
    // Fritext räknas inte som svar. Ändras ett valt svar tas det bort.
    if (selected && input.value !== selected) {
      selected = '';
      input.classList.remove('chosen');
      onChange('');
    }
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
      show(false);
    },
    setList(newList) {
      items = newList;
      index = searchIndex(items);
      if (document.activeElement === input) render();
    },
    disable(disabled) {
      input.disabled = disabled;
      if (disabled) show(false);
    },
  };
}
