// Fält där svaret bara kan väljas ur en lista.
// Förslag visas efter 3 tecken, i bokstavsordning.
// Accenter och skiljetecken spelar ingen roll: "senorita" hittar "Señorita".
// Fungerar med finger, mus och tangentbord (pilar, Enter och Esc), och
// skärmläsare får fältet presenterat som en kombinationsruta med lista.

import { compact } from './text.js';

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
  let keys = items.map(compact);
  let options = []; // de valbara raderna som visas just nu
  let active = -1;

  function show(open) {
    box.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    if (!open) setActive(-1);
  }

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
    const hits = items.filter((item, i) => keys[i].includes(query));
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
      keys = items.map(compact);
      if (document.activeElement === input) render();
    },
    disable(disabled) {
      input.disabled = disabled;
      if (disabled) show(false);
    },
  };
}
