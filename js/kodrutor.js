// Koden i Gå med visas i fyra rutor, som en engångskod i iPhone. Ett enda fält tar emot
// texten, så att inklistring, autofyll och skärmläsare fungerar som vanligt. Rutorna visar
// bara vad som står i fältet, och rutan där nästa bokstav hamnar har fokusramen.
export function codeBoxes(input) {
  const boxes = [...input.parentElement.querySelectorAll('.code-box')];
  const render = () => {
    // Koderna består bara av bokstäver. Annat, till exempel mellanslag från inklistring, tas bort.
    const clean = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, boxes.length);
    if (clean !== input.value) input.value = clean;
    // Markören står alltid sist, eftersom bokstäverna fylls på i ordning.
    if (document.activeElement === input) input.setSelectionRange(clean.length, clean.length);
    const active = document.activeElement === input ? Math.min(clean.length, boxes.length - 1) : -1;
    boxes.forEach((box, i) => {
      box.textContent = clean[i] || '';
      box.classList.toggle('active', i === active);
    });
  };
  for (const type of ['input', 'focus', 'blur', 'click']) input.addEventListener(type, render);
  render();
}
