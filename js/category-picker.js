// Kategorivalet på Starta nytt spel: omslag i mobilen och en rullgardin på dator, som hålls lika.
import { $, esc } from './shared/dom.js';
import { enhanceSelect } from './rullista.js';

// Sidan är förifylld med 60-tal förvalt, så att den syns innan kategorierna har laddats. Har man
// inte hunnit välja själv blir den första kategorin förvald, och det är säsongskategorin när den
// visas.
let pickedCategory = false;

export function renderCategories(categories) {
  const picker = $('#category-picker');
  const chosen = pickedCategory ? chosenCategory() : null;
  picker.innerHTML = categories.map((c) => `<label class="cat-option"><input type="radio" name="category" value="${esc(c.id)}" class="visually-hidden">`
    + `<span class="tile" data-kategori="${esc(c.id)}"></span><span class="cat-name">${esc(hyphenate(c.name))}`
    + `${c.songs ? `<span class="cat-songs">${c.songs} låtar</span>` : ''}</span></label>`).join('');
  $('.cat-count').textContent = `${categories.length} kategorier`;
  $('#category-select').innerHTML = categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  const radios = [...picker.querySelectorAll('input')];
  (radios.find((r) => r.value === chosen) || radios[0]).checked = true;
  $('#category-select').value = chosenCategory();
  showChosenCategory({ scroll: true });
}

// Namnen står under smala omslag. Melodifestivalen får ett mjukt bindestreck, så att det
// bryts som Melodi-festivalen i stället för mitt i ett ord eller utanför omslaget.
const hyphenate = (name) => name.replace('Melodifestivalen', 'Melodi\u00adfestivalen');

export const chosenCategory = () => ($('#category-picker input:checked') || {}).value;

// Sidans ljus får den valda kategorins färger. När sidan visas rullas det valda omslaget fram.
function showChosenCategory({ scroll = false } = {}) {
  document.documentElement.dataset.kategori = chosenCategory() || '';
  if (!scroll) return;
  // Bara raden rullas i sidled, inte sidan.
  const picker = $('#category-picker');
  const option = $('#category-picker input:checked').parentElement;
  const left = option.offsetLeft - picker.offsetLeft - 16;
  if (left < picker.scrollLeft || left + option.offsetWidth + 32 > picker.scrollLeft + picker.clientWidth) picker.scrollLeft = left;
}

// I mobilen väljs kategorin bland omslag och på dator i en rullgardin. De två hålls lika.
export function mountCategoryPicker() {
  enhanceSelect($('#category-select'));
  $('#category-picker').addEventListener('change', () => {
    pickedCategory = true;
    $('#category-select').value = chosenCategory();
    showChosenCategory();
  });
  $('#category-select').addEventListener('change', (e) => {
    const radio = [...$('#category-picker').querySelectorAll('input')].find((r) => r.value === e.target.value);
    if (radio) radio.checked = true;
    pickedCategory = true;
    showChosenCategory({ scroll: true });
  });
}
