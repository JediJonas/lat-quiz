// Rutorna glider upp nerifrån i mobilen, som ark på iPhone. Drar man nedåt från greppet eller
// rubriken följer arket med, och släpps det långt nog ner eller med fart stängs det som Avbryt.
// Bara överkanten tar emot dragningen, så att resten av arket kan rullas och valen tryckas.
const SHEET = window.matchMedia('(max-width: 600px)');
const CLOSE_PX = 120; // så långt ner arket ska dras för att stängas
const CLOSE_SPEED = 0.6; // eller så fort, i pixlar per millisekund
const SLIDE_MS = 200;

export function dragToClose(dialog) {
  let start = null;
  let dy = 0;
  const reset = () => { dialog.style.transition = ''; dialog.style.transform = ''; };

  dialog.addEventListener('touchstart', (e) => {
    const title = dialog.querySelector('h2');
    if (!SHEET.matches || e.touches.length !== 1 || !title || dialog.scrollTop > 0) return;
    const y = e.touches[0].clientY;
    if (y > title.getBoundingClientRect().bottom) return;
    start = { y, at: e.timeStamp };
    dy = 0;
  }, { passive: true });

  dialog.addEventListener('touchmove', (e) => {
    if (!start) return;
    dy = Math.max(0, e.touches[0].clientY - start.y);
    e.preventDefault(); // sidan ska inte rulla medan arket dras
    dialog.style.transition = 'none';
    dialog.style.transform = `translateY(${dy}px)`;
  }, { passive: false });

  const end = (e) => {
    if (!start) return;
    const speed = dy / Math.max(1, e.timeStamp - start.at);
    start = null;
    dialog.style.transition = `transform ${SLIDE_MS}ms ease-out`;
    if (dy < CLOSE_PX && !(dy > 20 && speed > CLOSE_SPEED)) { dialog.style.transform = ''; setTimeout(reset, SLIDE_MS); return; }
    dialog.style.transform = 'translateY(100%)';
    setTimeout(() => { if (dialog.open) dialog.close(); reset(); }, SLIDE_MS);
  };
  dialog.addEventListener('touchend', end);
  dialog.addEventListener('touchcancel', end);
}
