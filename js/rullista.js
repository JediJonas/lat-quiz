// En rullgardin i appens stil för kategorin på dator. Systemets egen lista går knappt att
// ge appens utseende, så med mus visas en knapp och en lista som förslagslistan, med ett
// litet omslag framför varje kategori och en bock vid den valda. Den vanliga select-rutan
// står kvar dold och håller värdet, så att formulär och change-händelser fungerar som förut.
// I mobilen visas systemets väljare som vanligt.
// Tangentbordet fungerar som i en vanlig rullgardin: pilar, Home, End, Enter, mellanslag,
// Esc och första bokstaven. Skärmläsare får knappen presenterad som en kombinationsruta.

const fine = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
let count = 0;

export function enhanceSelect(select) {
  if (!fine() || select.dataset.enhanced) return;
  select.dataset.enhanced = 'true';
  const n = ++count;
  const wrap = document.createElement('div');
  wrap.className = 'rullista';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'rullista-knapp';
  button.id = `${select.id}-knapp`;
  button.setAttribute('role', 'combobox');
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  const list = document.createElement('ul');
  list.className = 'suggestions rullista-lista';
  list.id = `rullista-${n}`;
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  button.setAttribute('aria-controls', list.id);
  const label = document.querySelector(`label[for="${select.id}"]`);
  if (label) {
    label.htmlFor = button.id;
    if (!label.id) label.id = `${select.id}-etikett`;
    list.setAttribute('aria-labelledby', label.id);
  }
  select.before(wrap);
  wrap.append(button, list, select);
  select.hidden = true;
  select.tabIndex = -1;

  let active = -1;
  const options = () => [...list.children];
  const cover = (value) => `<span class="tile mini" data-kategori="${value}" aria-hidden="true"></span>`;

  function showValue() {
    const option = select.selectedOptions[0];
    button.innerHTML = option ? `${cover(option.value)}<span class="rullista-namn"></span>` : '';
    if (option) button.querySelector('.rullista-namn').textContent = option.textContent;
  }
  // Värdet kan sättas i koden, till exempel när kategorin väljs bland omslagen. Då följer knappen med.
  const own = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(select, 'value', {
    get() { return own.get.call(this); },
    set(v) { own.set.call(this, v); showValue(); },
  });

  function setActive(i) {
    const items = options();
    if (items[active]) items[active].classList.remove('active');
    active = i;
    const li = items[active];
    if (li) {
      li.classList.add('active');
      button.setAttribute('aria-activedescendant', li.id);
      li.scrollIntoView({ block: 'nearest' });
    } else {
      button.removeAttribute('aria-activedescendant');
    }
  }

  function open() {
    list.innerHTML = '';
    [...select.options].forEach((o, i) => {
      const li = document.createElement('li');
      li.id = `${list.id}-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(o.selected));
      li.dataset.value = o.value;
      li.innerHTML = `${cover(o.value)}<span class="rullista-namn"></span>`;
      li.querySelector('.rullista-namn').textContent = o.textContent;
      list.append(li);
    });
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    setActive(Math.max(0, select.selectedIndex));
  }

  function close() {
    if (list.hidden) return;
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    setActive(-1);
  }

  function choose(i) {
    const li = options()[i];
    close();
    if (!li || li.dataset.value === select.value) return;
    select.value = li.dataset.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  showValue();
  button.addEventListener('click', () => (list.hidden ? open() : close()));
  // mousedown så att knappen behåller fokus när man klickar i listan.
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) choose(options().indexOf(li));
  });
  list.addEventListener('mousemove', (e) => {
    const li = e.target.closest('li');
    if (li && options().indexOf(li) !== active) setActive(options().indexOf(li));
  });
  button.addEventListener('blur', close);
  button.addEventListener('keydown', (e) => {
    const last = select.options.length - 1;
    if (list.hidden) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
      return;
    }
    const keys = {
      ArrowDown: () => setActive(Math.min(last, active + 1)),
      ArrowUp: () => setActive(Math.max(0, active - 1)),
      Home: () => setActive(0),
      End: () => setActive(last),
      Enter: () => choose(active),
      ' ': () => choose(active),
      // Esc stänger bara listan, inte dialogen den står i.
      Escape: () => { e.stopPropagation(); close(); },
    };
    if (keys[e.key]) { e.preventDefault(); keys[e.key](); return; }
    if (e.key === 'Tab') { close(); return; }
    // Första bokstaven hoppar till nästa kategori som börjar på den.
    if (e.key.length === 1 && /\p{L}|\d/u.test(e.key)) {
      const items = [...select.options];
      const key = e.key.toLocaleLowerCase('sv');
      for (let step = 1; step <= items.length; step++) {
        const i = (active + step) % items.length;
        if (items[i].textContent.toLocaleLowerCase('sv').startsWith(key)) { setActive(i); break; }
      }
    }
  });
  // Klick utanför stänger listan.
  document.addEventListener('mousedown', (e) => { if (!wrap.contains(e.target)) close(); });
}
