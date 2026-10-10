// Fält där svaret bara kan väljas ur en lista.
// Förslag visas efter 3 tecken, i bokstavsordning.

const MIN_CHARS = 3;
const MAX_SHOWN = 50;

// onChange(value) anropas med det valda värdet, eller '' när valet tas bort.
export function autocomplete(input, list, onChange) {
  const box = document.createElement('ul');
  box.className = 'suggestions';
  box.hidden = true;
  input.after(box);
  input.setAttribute('autocomplete', 'off');
  let selected = '';

  function choose(value) {
    selected = value;
    input.value = value;
    input.classList.toggle('chosen', Boolean(value));
    box.hidden = true;
    onChange(value);
  }

  function render() {
    const query = input.value.trim().toLocaleLowerCase('sv');
    box.innerHTML = '';
    if (query.length < MIN_CHARS) { box.hidden = true; return; }
    const hits = list.filter((item) => item.toLocaleLowerCase('sv').includes(query));
    for (const item of hits.slice(0, MAX_SHOWN)) {
      const li = document.createElement('li');
      li.textContent = item;
      // pointerdown så att valet hinner registreras innan fältet tappar fokus
      li.addEventListener('pointerdown', (e) => { e.preventDefault(); choose(item); input.blur(); });
      box.append(li);
    }
    if (hits.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Inga träffar';
      box.append(li);
    } else if (hits.length > MAX_SHOWN) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = `… och ${hits.length - MAX_SHOWN} till. Skriv mer.`;
      box.append(li);
    }
    box.hidden = false;
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
  input.addEventListener('focus', render);
  input.addEventListener('blur', () => { box.hidden = true; });

  return {
    set(value) {
      selected = value || '';
      input.value = selected;
      input.classList.toggle('chosen', Boolean(selected));
      box.hidden = true;
    },
    disable(disabled) {
      input.disabled = disabled;
      if (disabled) box.hidden = true;
    },
  };
}
