// Raden längst ner som visar vilken väntemusik eller vinnarlåt som spelas, till exempel
// "Nu spelas Queen – We Are the Champions". Quizlåtarna visas aldrig här.

// Texten på raden, eller null när ingen väntemusik eller vinnarlåt spelas.
export function nowMusic(song) {
  if (!song || !song.artist || !song.title) return null;
  return `Nu spelas ${song.artist} – ${song.title}`;
}

export function showNowMusic(el, text) {
  el.hidden = !text;
  if (text && el.textContent !== text) el.textContent = text;
}
