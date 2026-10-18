// Raden längst ner som visar vilken väntemusik eller vinnarlåt som spelas, till exempel
// "Vinnarlåt Queen – We Are the Champions". Quizlåtarna visas aldrig här.

// Det som står på raden, eller null när ingen väntemusik eller vinnarlåt spelas.
// label: "Väntemusik" eller "Vinnarlåt". song: låten, med artist och titel.
export function nowMusic(label, song) {
  if (!song || !song.artist || !song.title) return null;
  return { label, artist: song.artist, title: song.title };
}

export function showNowMusic(el, info) {
  el.hidden = !info;
  if (!info) return;
  const text = `${info.artist} – ${info.title}`;
  if (el.dataset.text === info.label + text) return;
  el.dataset.text = info.label + text;
  el.replaceChildren();
  const label = document.createElement('span');
  label.className = 'now-music-label';
  label.textContent = info.label;
  el.append(label, ' ', text);
}
