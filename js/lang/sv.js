// @ts-check
// Svenska, appens enda språk än så länge. Nycklarna är på engelska och säger var texten syns.
// {namn} byts mot ett värde. En funktion används när texten beror på värdena, till exempel
// på hur många det gäller. Se js/shared/lang.js.

// "Anna", "Anna och Bo", "Anna, Bo och Cia".
const list = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} och ${names[names.length - 1]}` : names[0]);

export default {
  // Menyn uppe till höger.
  'menu.label': 'Meny',
  'menu.join': 'Gå med i spel',
  'menu.newGame': 'Starta nytt spel',
  'menu.about': 'Om Låtquiz',
  'menu.appearance': 'Utseende',
  'menu.start': 'Starta spelet',
  'menu.pause': 'Pausa spelet',
  'menu.showQr': 'Visa QR-kod',
  'menu.settings': 'Inställningar',
  'menu.endGame': 'Avsluta spelet',

  // Meddelanderutan längst ner.
  'message.label': 'Meddelande',
  'message.joined.titleOne': 'Välkommen, {name}!',
  'message.joined.titleMany': 'Välkomna!',
  'message.joined.text': ({ names }) => `${list(names)} har gått med i spelet.`,
  'message.left.title': 'Hej då, {name}!',
  'message.left.text': '{name} har lämnat spelet.',
  'message.unexpected.title': 'Något gick fel',
  'message.unexpected.text': 'Ladda om sidan och försök igen.{detail}',

  // Låtkortet medan låten spelar.
  'song.title': 'Låt {number}',
  'song.started': 'Låt {number} har börjat.',
  'song.timeLeft': 'Du har {s} sekunder på dig.',
  'song.loading': 'Låten laddas',
  'song.paused': 'Pausad',
  'song.listen': 'Lyssna och gissa',
  'song.playing': 'Spelas nu',

  // Väntekortet före första låten, med reglerna som små etiketter.
  'waiting.title.host': 'Väntar på spelarna',
  'waiting.title.player': 'Snart kör vi!',
  'waiting.text.host': 'Starta spelet när alla är här',
  'waiting.text.player': 'Spelledaren startar första låten snart',
  'rules.roundTime': '{s} s per låt',
  'rules.field': '1 p för {field}',
  'rules.bonus': 'Bonus inom {s} s',
  'rules.winScore': 'Först till {score} p',
  'intro.announce': 'Nu börjar det!',
  'intro.countdown': 'Första låten spelas om {s} s',
  'intro.now': 'Första låten spelas nu',

  // Kortet när svaret visas, och vinnaren.
  'result.answerLabel': 'Låt {number} · Rätt svar',
  'result.clipFrom': 'Ljudklipp från',
  'result.noAnswer': 'Inget svar',
  'result.bonus': 'Bonus',
  'result.bonusText': 'Blixtsnabbt!',
  'result.pointsLong': 'poäng',
  'result.pointsShort': 'p',
  'result.place': 'Plats',
  'result.climbed': 'Du klättrade till plats {rank}.',
  'result.nextIn': 'Nästa låt om',
  'result.nextInLong': 'Nästa låt startar av sig själv om {s} sekunder.',
  'result.gameOver': 'Spelet är slut',
  'result.winScore': 'Först till {score} poäng.',
  'result.winners': ({ names }) => `${names.join(' och ')} vinner!`,
  'result.announce': 'Rätt svar: {title} med {artist}.',
  'result.announcePoints': 'Du fick {points} poäng.',
  'unit.seconds': '{s} s',

  // Poänglistan, för skärmläsare.
  'standings.points': 'poäng',
  'standings.place': 'Plats',
  'standings.up': 'placeringar upp',
  'standings.offline': '(frånkopplad)',

  // Pausen, i meddelanderutan.
  'pause.title.host': 'Spelet är pausat',
  'pause.title.player': 'Kort paus',
  'pause.text.host': 'Tryck på Starta spelet för att fortsätta.',
  'pause.text.player': 'Spelledaren pausade. Vi fortsätter snart.',
  'pause.resumed': 'Spelet fortsätter.',

  // Peppkommentarerna. Listorna väljs bland efter spelets läge, så att alla enheter visar samma.
  'cheer.all': ['Klockrent!', 'Snyggt!', 'Vilken koll!', 'Mitt i prick!'],
  'cheer.half': ['Halvvägs där!', 'Bra, en av två!', 'Nästan hela vägen!'],
  'cheer.none': ['Nästa tar du!', 'Den var klurig!', 'Ny chans snart!'],
  'win.intro': ['Vi har en vinnare!', 'Grattis!', 'Vilken match!', 'Hipp hipp hurra!', 'Det är klart!'],
  'win.shared': 'Delad glädje är dubbel glädje!',
  'win.alone': 'Seger! Nästa gång tar du med kompisar.',
  'win.close': ['Det var jämnt in i det sista!', 'Med nöd och näppe!'],
  'win.fast': 'Det gick undan!',
  'win.big': ['Ingen chans för de andra!', 'Överlägset!'],
  'win.long': 'Det blev ett riktigt maraton!',
  'win.general': [
    'Ett öra för musik!',
    'Hela topplistan i huvudet.',
    'Ingen låt för svår.',
    'Dags för ett tacktal!',
    'Vem behöver ens Shazam?',
    'Den här segern ska firas!',
    'Musikkunskap på högsta nivå.',
    'Låtquizets mästare!',
  ],

  // Rutan Om Låtquiz.
  'about.title': 'Om Låtquiz',
  'about.ok': 'OK',
  'about.body': `
  <p class="lead">Utmana familj och vänner och tävla om vem som känner igen flest låtar, direkt i webbläsaren.</p>

  <h3>Så spelar man</h3>
  <p>Spelledaren väljer kategori och startar ett nytt spel på sin enhet. Spelarna går med i spelet genom att skanna QR-koden med sina enheter. Det går också bra att skriva in en kod själv eller öppna en länk som spelledaren skickar.</p>
  <p>Spelarna har en halv minut på sig att gissa artist och titel. Rätt artist och rätt titel ger en poäng var, och den som har båda rätt snabbt får en bonuspoäng. Först till 10 poäng vinner.</p>

  <h3>Musiken</h3>
  <p>Musiken är förhandsklipp från <a href="https://www.deezer.com/" target="_blank" rel="noopener">Deezer</a> som spelas direkt i webbläsaren, utan konto.</p>
  <p>Trumvirveln före vinnaren kommer från <a href="https://freesound.org/" target="_blank" rel="noopener">Freesound</a> och är fri att använda (CC0).</p>

  <h3>Teknik</h3>
  <p>Låtquiz är byggt med <a href="https://claude.ai/" target="_blank" rel="noopener">Claude</a>, en AI från Anthropic, som har skrivit koden utifrån önskemål om hur spelet ska fungera.</p>
  <p>Spelet är vanliga webbsidor i HTML, CSS och JavaScript på GitHub Pages. Spelledarens webbläsare håller i låtar, svar och poäng, och spelarna ansluter direkt till den med WebRTC via PeerJS.</p>
  <p>Varje ändring kontrolleras automatiskt med tester: HTML-validering via W3C, tillgänglighet enligt WCAG 2.2 AA via Axe och prestanda i mobilen via Lighthouse.</p>`,
};
