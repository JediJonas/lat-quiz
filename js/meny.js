// Menyn uppe till höger, samma på alla sidor. Det som används sällan ligger här: gå med i spel,
// starta nytt spel, QR-kod, inställningar, Om spelet, Utseende och att lämna eller avsluta spelet.
// Raderna har ikon och text. Rader som inte går att använda just nu visas inte.
import { showUserSettings } from './theme.js';
import { showAbout } from './om.js';

const svg = (d) => `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="${d}"/></svg>`;
// Material Symbols Rounded (Apache 2.0): menu, login, logout, add, qr_code, settings, info_i och contrast.
export const ICONS = {
  menu: svg('M160-240q-17 0-28.5-11.5T120-280q0-17 11.5-28.5T160-320h640q17 0 28.5 11.5T840-280q0 17-11.5 28.5T800-240H160Zm0-200q-17 0-28.5-11.5T120-480q0-17 11.5-28.5T160-520h640q17 0 28.5 11.5T840-480q0 17-11.5 28.5T800-440H160Zm0-200q-17 0-28.5-11.5T120-680q0-17 11.5-28.5T160-720h640q17 0 28.5 11.5T840-680q0 17-11.5 28.5T800-640H160Z'),
  join: svg('M520-120q-17 0-28.5-11.5T480-160q0-17 11.5-28.5T520-200h240v-560H520q-17 0-28.5-11.5T480-800q0-17 11.5-28.5T520-840h240q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H520Zm-73-320H160q-17 0-28.5-11.5T120-480q0-17 11.5-28.5T160-520h287l-75-75q-11-11-11-27t11-28q11-12 28-12.5t29 11.5l143 143q12 12 12 28t-12 28L429-309q-12 12-28.5 11.5T372-310q-11-12-10.5-28.5T373-366l74-74Z'),
  leave: svg('M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h240q17 0 28.5 11.5T480-800q0 17-11.5 28.5T440-760H200v560h240q17 0 28.5 11.5T480-160q0 17-11.5 28.5T440-120H200Zm487-320H400q-17 0-28.5-11.5T360-480q0-17 11.5-28.5T400-520h287l-75-75q-11-11-11-27t11-28q11-12 28-12.5t29 11.5l143 143q12 12 12 28t-12 28L669-309q-12 12-28.5 11.5T612-310q-11-12-10.5-28.5T613-366l74-74Z'),
  newGame: svg('M440-440H240q-17 0-28.5-11.5T200-480q0-17 11.5-28.5T240-520h200v-200q0-17 11.5-28.5T480-760q17 0 28.5 11.5T520-720v200h200q17 0 28.5 11.5T760-480q0 17-11.5 28.5T720-440H520v200q0 17-11.5 28.5T480-200q-17 0-28.5-11.5T440-240v-200Z'),
  qr: svg('M520-120v-80h80v80h-80Zm-80-80v-200h80v200h-80Zm320-120v-160h80v160h-80Zm-80-160v-80h80v80h-80Zm-480 80v-80h80v80h-80Zm-80-80v-80h80v80h-80Zm360-280v-80h80v80h-80ZM170-650h140v-140H170v140Zm-50 20v-180q0-12.75 8.63-21.38Q137.25-840 150-840h180q12.75 0 21.38 8.62Q360-822.75 360-810v180q0 12.75-8.62 21.37Q342.75-600 330-600H150q-12.75 0-21.37-8.63Q120-617.25 120-630Zm50 460h140v-140H170v140Zm-50 20v-180q0-12.75 8.63-21.38Q137.25-360 150-360h180q12.75 0 21.38 8.62Q360-342.75 360-330v180q0 12.75-8.62 21.37Q342.75-120 330-120H150q-12.75 0-21.37-8.63Q120-137.25 120-150Zm530-500h140v-140H650v140Zm-50 20v-180q0-12.75 8.63-21.38Q617.25-840 630-840h180q12.75 0 21.38 8.62Q840-822.75 840-810v180q0 12.75-8.62 21.37Q822.75-600 810-600H630q-12.75 0-21.37-8.63Q600-617.25 600-630Zm80 510v-120h-80v-80h160v120h80v80H680ZM520-400v-80h160v80H520Zm-160 0v-80h-80v-80h240v80h-80v80h-80Zm40-200v-160h80v80h80v80H400Zm-190-90v-60h60v60h-60Zm0 480v-60h60v60h-60Zm480-480v-60h60v60h-60Z'),
  settings: svg('M421-80q-14 0-25-9t-13-23l-15-94q-19-7-40-19t-37-25l-86 40q-14 6-28 1.5T155-226L97-330q-8-13-4.5-27t15.5-23l80-59q-2-9-2.5-20.5T185-480q0-9 .5-20.5T188-521l-80-59q-12-9-15.5-23t4.5-27l58-104q8-13 22-17.5t28 1.5l86 40q16-13 37-25t40-18l15-95q2-14 13-23t25-9h118q14 0 25 9t13 23l15 94q19 7 40.5 18.5T669-710l86-40q14-6 27.5-1.5T804-734l59 104q8 13 4.5 27.5T852-580l-80 57q2 10 2.5 21.5t.5 21.5q0 10-.5 21t-2.5 21l80 58q12 8 15.5 22.5T863-330l-58 104q-8 13-22 17.5t-28-1.5l-86-40q-16 13-36.5 25.5T592-206l-15 94q-2 14-13 23t-25 9H421Zm59-270q54 0 92-38t38-92q0-54-38-92t-92-38q-54 0-92 38t-38 92q0 54 38 92t92 38Z'),
  about: svg('M430.5-720.59q-20.5-20.59-20.5-49.5t20.59-49.41q20.59-20.5 49.5-20.5t49.41 20.59q20.5 20.59 20.5 49.5t-20.59 49.41q-20.59 20.5-49.5 20.5t-49.41-20.59Zm14 586.01Q430-149.17 430-170v-380q0-20.83 14.62-35.42Q459.24-600 480.12-600q20.88 0 35.38 14.58Q530-570.83 530-550v380q0 20.83-14.62 35.42Q500.76-120 479.88-120q-20.88 0-35.38-14.58Z'),
  appearance: svg('M324-111.5Q251-143 197-197t-85.5-127Q80-397 80-480t31.5-156Q143-709 197-763t127-85.5Q397-880 480-880t156 31.5Q709-817 763-763t85.5 127Q880-563 880-480t-31.5 156Q817-251 763-197t-127 85.5Q563-80 480-80t-156-31.5ZM500-140q137-10 228.5-106T820-480q0-138-91.5-234T500-820v680Z'),
};

// Länkar till de andra sidorna behåller testparametrarna i adressen, men inte koden till ett spel.
function pageUrl(page) {
  const params = new URLSearchParams(location.search);
  params.delete('kod');
  const query = params.toString();
  return page + (query ? '?' + query : '');
}

const onPage = (page) => location.pathname.endsWith('/' + page);

// Raderna före ett spel.
export function startItems() {
  return [
    { label: 'Gå med i spel', icon: ICONS.join, href: pageUrl('play.html'), current: onPage('play.html') },
    { label: 'Starta nytt spel', icon: ICONS.newGame, href: pageUrl('host.html'), current: onPage('host.html') },
  ];
}

// Raderna som finns överallt.
export function commonItems() {
  return [
    { label: 'Om spelet', icon: ICONS.about, action: showAbout },
    { label: 'Utseende', icon: ICONS.appearance, action: showUserSettings },
  ];
}

let count = 0;

// groups() returnerar grupper av rader, som skiljs åt med ett streck. Den anropas varje gång
// menyn öppnas, så att raderna följer läget i spelet. En rad är { label, icon } och antingen
// href eller action, och kan vara disabled eller current (sidan man är på).
export function mountMenu(container, groups) {
  const id = `menu-list-${++count}`;
  const nav = document.createElement('nav');
  nav.className = 'menu';
  nav.setAttribute('aria-label', 'Meny');
  nav.innerHTML = `<button type="button" class="menu-button" aria-label="Meny" title="Meny" aria-expanded="false" aria-controls="${id}">${ICONS.menu}</button>
    <div class="menu-panel" id="${id}" hidden></div>`;
  const button = nav.querySelector('.menu-button');
  const panel = nav.querySelector('.menu-panel');

  function close(focusButton = false) {
    if (panel.hidden) return;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (focusButton) button.focus();
  }

  function render() {
    panel.replaceChildren();
    for (const group of groups().filter((g) => g.length)) {
      const ul = document.createElement('ul');
      for (const item of group) {
        const li = document.createElement('li');
        const el = document.createElement(item.href ? 'a' : 'button');
        el.className = 'menu-item';
        el.innerHTML = item.icon;
        el.append(item.label);
        if (item.href) {
          el.href = item.href;
          if (item.current) el.setAttribute('aria-current', 'page');
        } else {
          el.type = 'button';
          el.disabled = Boolean(item.disabled);
        }
        el.addEventListener('click', (e) => {
          if (item.current) e.preventDefault();
          // Fokus går tillbaka till menyknappen, om inte en ruta öppnas och tar fokus.
          close(!item.href);
          if (item.action) item.action();
        });
        li.append(el);
        ul.append(li);
      }
      panel.append(ul);
    }
  }

  function open() {
    render();
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    panel.querySelector('.menu-item:not(:disabled)')?.focus();
  }

  button.addEventListener('click', () => (panel.hidden ? open() : close()));
  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || panel.hidden) return;
    e.stopPropagation();
    close(true);
  });
  // Menyn stängs när man trycker utanför den eller tabbar vidare.
  document.addEventListener('pointerdown', (e) => { if (!nav.contains(e.target)) close(); });
  nav.addEventListener('focusout', (e) => { if (e.relatedTarget && !nav.contains(e.relatedTarget)) close(); });

  container.prepend(nav);
  return { close };
}
