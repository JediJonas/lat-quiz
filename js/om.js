// Om Låtquiz, som en ruta. Den går att läsa när som helst, även under ett spel.

const TEXT = `
  <p class="lead">Utmana familj och vänner och tävla om vem som känner igen flest låtar, direkt i webbläsaren.</p>

  <h3>Så spelar man</h3>
  <p>Spelledaren väljer kategori och startar ett nytt spel på sin enhet. Spelarna går med i spelet genom att skanna QR-koden med sina enheter. Det går också bra att skriva in en kod själv eller öppna en länk som spelledaren skickar.</p>
  <p>Spelarna har en halv minut på sig att gissa artist och titel. Rätt artist och rätt titel ger en poäng var, och den som har båda rätt snabbt får en bonuspoäng. Den som först når poänggränsen vinner, till exempel 10 poäng.</p>

  <h3>Musiken</h3>
  <p>Musiken spelas från Deezer eller Spotify.</p>
  <p>Med Deezer spelas ett förhandsklipp direkt i webbläsaren och nästa låt startar av sig själv. Det kräver inget konto.</p>
  <p>Med Spotify startar spelledaren varje låt själv med en knapp som öppnar den i Spotify-appen, som behöver finnas på samma enhet.</p>

  <h3>Teknik</h3>
  <p>Låtquiz är byggt med Claude, en AI från Anthropic, som har skrivit koden utifrån önskemål om hur spelet ska fungera.</p>
  <p>Spelet är vanliga webbsidor i HTML, CSS och JavaScript på GitHub Pages. Spelledarens webbläsare håller i låtar, svar och poäng, och spelarna ansluter direkt till den med WebRTC via PeerJS.</p>
  <p>Varje ändring kontrolleras automatiskt med tester: HTML-validering via W3C, tillgänglighet enligt WCAG 2.2 AA via Axe och prestanda i mobilen via Lighthouse.</p>`;

export function showAbout() {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal about';
  dialog.setAttribute('aria-labelledby', 'about-title');
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="about-title">Om Låtquiz</h2>
      ${TEXT}
      <div class="modal-actions">
        <button value="ok">OK</button>
      </div>
    </form>`;
  // Tangenter i rutan ska inte nå sidan, där Enter annars styr spelet.
  dialog.addEventListener('keydown', (e) => e.stopPropagation());
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  // Rutan själv får fokus, så att texten läses från början och inte rullas ner till Stäng.
  dialog.tabIndex = -1;
  document.body.append(dialog);
  dialog.showModal();
  dialog.focus();
  // showModal har redan lagt fokus på Stäng och rullat ner dit. Texten ska börja överst.
  dialog.scrollTop = 0;
}
