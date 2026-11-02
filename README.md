# Låtquiz

En webbapp för låtquiz med familj och vänner. Spelledaren spelar klipp från Deezer, och spelarna gissar artist och titel i sina egna mobiler.

Ändringar görs via pull requests mot `main`.

## Så spelar man

1. Spelledaren öppnar `host.html` på en dator, väljer kategori och trycker på **Dra igång!**. Spelledaren deltar och gissar som standard, men kan stänga av **Jag deltar i spelet** under Inställningar och bara leda spelet. Det går att ändra även under spelet. Namnfältet visas då bara om spelledaren inte har angett något namn tidigare, och utan namn heter spelledaren Spelledare.
2. Spelarna skannar QR-koden, eller öppnar `play.html` och skriver in koden.
3. Spelledaren trycker på **Starta spelet**. Ett klipp från Deezer spelas direkt i spelledarvyn, och timern startar när det hörs. Under Inställningar väljer spelledaren **Tid per låt**, 10, 15, 20, 25 eller 30 sekunder (standard 30), och så lång del av klippet spelas. Saknar Deezer klippet hoppas låten över och en annan slumpas. Nästa låt startar av sig själv 10 sekunder efter att rätt svar visats. Spelledaren kan pausa och fortsätta med **Pausa spelet** och **Starta spelet** i menyn. Med **Spela ljud på alla enheter** i Inställningar, som är av som standard, spelas klippet även i spelarnas mobiler. De spolar till samma ställe som hos spelledaren, men ljudet blir inte helt i takt, så det passar bäst när alla inte är i samma rum.
4. Spelarna väljer artist och titel ur listan. Svaren kan ändras tills tiden är slut, och då visas rätt svar.

Poäng: 1 för rätt artist, 1 för rätt titel och 1 i bonus om båda är rätt inom 15 sekunder (bonustiden är alltid kortare än tiden per låt). Först till 10 poäng vinner som standard, och poänggränsen kan vara 3, 5, 10, 15 eller 20.

## Filer

- `js/game.js`: spellogiken (låtval, gissningar och poäng), utan nätverk och gränssnitt.
- `js/net.js`: kommunikationen via PeerJS, med automatisk återanslutning. Meddelandena står i `js/shared/protocol.js`, så det är de två filerna som behöver förstås för att byta PeerJS mot något annat.
- `js/host.js`, `js/play.js`: spelledarvy och spelarvy. Spelledarens anslutningar till spelarna (vem som är ansluten, vad de skickar och vad de får tillbaka) ligger i `js/host-connections.js`, och Inställningar med ändringarna som gäller från nästa låt i `js/host-settings.js`. Menyn, tangenterna och QR-koden ligger i `js/host-menu.js`.
- `js/game-view.js`: spelvyn som spelarna och spelledaren delar. Korten ritas i `js/views/`: väntekortet, låtkortet, rätt svar och vinnaren, poänglistan och när vinnaren visas. Svarsfälten med sina regler för iPhone ligger kvar i `game-view.js`.
- `js/shared/`: det som alla sidor delar. `storage.js` har alla nycklar i webbläsarens lagring och tar bort gamla nycklar, `preferences.js` enhetens val (Spela extraljud, Spela ljud på alla enheter, Ljudsynk, namnet och de senaste inställningarna), `dom.js` `$` och `esc`, `html.js` en liten HTML-hjälp som escapar själv, `ids.js` koder och id:n, `ticker.js` en timer som inte bromsas i flikar som inte syns, och `protocol.js` alla meddelanden mellan spelledaren och spelarna och vilka fält vyn har. Nya filer får engelska namn.
- `js/menu.js`: menyn uppe till höger på alla sidor, och `js/about.js`: rutan Om Låtquiz, med hur spelet fungerar tekniskt.
- `data/`: kategorier, quizlåtar och förslagslista.
- `js/lookup.js`: textmatchning för `tools/deezer-id.mjs`.
- `js/unknown-songs.js`: låtar som spelledaren markerat som okända. De sparas i webbläsaren, hoppas över i kommande spel och kan kopieras under Inställningar, så att de tas bort ur kategorin.
- `js/lobby-music.js`: väntemusiken, ett slumpat Deezer-klipp ur instrumentala jazzlåtar som tonar in och ut och loopar hos spelledaren tills spelet startar. Varje väntan får en ny låt. Med Spela ljud på alla enheter spelas den, liksom vinnarlåten från `js/winner-song.js`, även i spelarnas mobiler, i takt med spelledaren. Ingen av låtarna finns bland quizlåtarna.
- `data/music.json`: väntemusiken (`lobby`) och vinnarlåtarna (`winner`). Under `default` står låtarna för alla kategorier, och en säsongskategori kan ha en egen lista under sitt id.
- `js/now-playing.js`: raden längst ner, "Nu spelas artist – titel", medan väntemusiken eller vinnarlåten spelas. Den syns hos spelledaren och i spelarnas mobiler, även när ljudet bara spelas hos spelledaren.
- `js/clip-player.js`: klippet i spelarnas mobiler när spelledaren har valt att spela det på alla enheter. Spelarna får bara klipplänken, inte vilken låt det är.
- `js/deezer.js`: förhandsklipp från Deezer. Klippet spelas i spelledarvyn och timern startar när det hörs. Saknas klipp hoppas låten över. Bara låtar med Deezer-ID spelas.
- `tools/deezer-id.mjs`: hämtar fasta Deezer-ID, se nedan.
- `tools/categories.mjs`: kategorierna beskrivs bara i `data/categories.json`. Verktyget skriver antalet låtar där, och omslagens färger och tecken i `css/style.css` mellan två markeringar.
- `tools/texts.mjs`: texterna i `index.html`, `host.html` och `play.html` skrivs från språkfilen `js/lang/sv.js`, så att en text bara ändras där. Elementen har `data-t="nyckel"` för texten, `data-t-html` för text med HTML och till exempel `data-t-aria-label` för ett attribut. Sidorna har kvar texten, så att de visas direkt. Kör `node tools/texts.mjs` när en text i sidorna har ändrats i språkfilen. Testerna säger till om det har glömts, eller om en ny text i en sida saknar nyckel.
- `tools/listen.mjs`: bygger lyssningssidan `lyssna/lyssna-latarna-i-appen.html` i projektfilerna, där alla låtar som appen spelar går att höra: väntelåtarna, säsongskategoriernas väntelåtar, vinnarlåtarna och quizlåtarna i varje kategori. Kategorierna står i samma ordning som i appen och låtarna i bokstavsordning efter artist och titel. Kör `node tools/listen.mjs <utfil>` efter att låtlistorna har ändrats.
- `spotify-lardomar.md`: vad vi lärde oss om Spotify, som spelades fram till 23 oktober 2026, om det någon gång ska tillbaka.
- `tools/build.mjs`, `tools/versions.mjs`, `.github/workflows/publish.yml`: sidan publiceras på GitHub Pages av ett arbetsflöde, som först bygger den i `_site/`. JavaScript bundlas och minifieras med esbuild till en fil per startfil (`js/host.js`, `js/play.js` och `js/menu.js`), med en source map bredvid så att felsökning i Safari och Chrome visar de riktiga filerna. CSS och `vendor/qrcode.js` minifieras. Sist får CSS och JS ett versionsnummer, så att webbläsaren hämtar nya filer efter varje ändring i stället för gamla från cachen. Källfilerna i repot ändras inte och körs som de är lokalt. Numret längst ner på sidorna syns bara med `?debug=1`, som sparas på enheten tills `?debug=0` används.
- `favicon.svg`, `icons/`, `manifest.webmanifest`: faviconen (Material Symbols Rounded music_note i vitt på en rundad fyrkant i appens ljusa gröna färg, #1ed760, utan toning) och samma ikon som PNG: `apple-touch-icon.png` (180 px, fyrkantig) för hemskärmen i iPhone och iPad, och 192 och 512 px (plus en maskbar 512 px) i manifestet för Lägg till på startskärmen i Android. PNG-filerna för Android är renderade från `favicon.svg`. `apple-touch-icon.png` är renderad från `icons/apple-touch-icon.svg`, som har en diagonal toning från samma ljusa gröna uppe till vänster till lite mörkare grönt nere till höger och en svag skugga under noten så att ikonen känns mer levande på hemskärmen. PNG-filerna behöver göras om om faviconen ändras.
- `vendor/`: PeerJS 1.5.4, qrcode-generator 1.4.4 och typsnittet Inter (SIL Open Font License). Loggan `logo.svg` är ritad från typsnittet Lobster (SIL Open Font License).

## Köra lokalt

Sidorna är statiska, så det räcker med en enkel webbserver:

```
python3 -m http.server 8080
```

Öppna sedan http://localhost:8080/host.html. Spelare på samma wifi når datorn via dess IP-adress.

Så körs källfilerna som de är, utan bygge. För att se exakt det som publiceras, bundlat och minifierat:

```
npm ci
npm run build
cd _site && python3 -m http.server 8080
```

PeerJS gratisserver används som standard. För att testa med en egen PeerJS-server läggs `?peerHost=127.0.0.1&peerPort=9000` till i adressen.

## Tester

```
npm ci
npm test
```

Testerna kontrollerar också att alla JSON-filer går att läsa och att varje quizlåt har ett giltigt Deezer-ID.

## Webbkvalitet

Varje pull request kör `.github/workflows/quality.yml`, som följer regeln webbkvalitet: tester, lint (ESLint), typkontroll, ett röktest som spelar ett helt spel med en spelledare och en spelare, HTML-validering (W3C Nu), tillgänglighet med axe (WCAG 2.2 AA, ljust och mörkt läge genom ett helt spel), Lighthouse i mobilläge, länkkontroll och sidvikt. Verktygen ligger i `quality/`, med egna beroenden, så att själva appen förblir fri från beroenden.

Kontrollerna gäller den byggda sidan i `_site/`, alltså det som publiceras. Lint och typkontrollen gäller källfilerna. Lokalt, med den byggda sidan på port 8080 och källfilerna på port 8081 (axe behöver dem för meddelanderutan):

```
npm ci && npm run build
(cd _site && python3 -m http.server 8080 &)
python3 -m http.server 8081 &
cd quality
npm ci
npm run lint
npm run types
npm run peer &        # lokal PeerJS-server, behövs för röktestet och axe
npm run smoke
npm run html
npm run axe
npm run lighthouse
npm run links
npm run page-weight
```

Typkontrollen gäller bara filer i `js/` som börjar med `// @ts-check`. Typerna skrivs som JSDoc-kommentarer, så att filerna fortsätter att köras som de är i webbläsaren. Konfigurationen för ESLint och TypeScript ligger i `quality/`, så att appen förblir fri från beroenden.

## Ny kategori

1. Claude tar fram cirka 200 kandidater. Kändheten kan mätas i antal strömningar på kworb.net. Kandidatlistan är ett arbetsunderlag och ligger inte i repot. De gamla listorna togs bort 2 november 2026 och finns i git-historiken under `data/candidates/`.
2. De låtar som väljs läggs i `data/categories/<kategori>.json` med `id`, `artist`, `title` och `year`, och kategorin läggs till i `data/categories.json` (med `"file": "categories/<kategori>.json"`) med omslagets tecken, två färger och mörkhetsgrad i `cover`. Sedan körs `node tools/categories.mjs`, som skriver antalet låtar i `categories.json` och omslagets färger i `css/style.css`. Testerna säger till om det har glömts, och om vit text på omslaget inte når 4,5:1 (höj då `dim`).
3. `tools/deezer-id.mjs` hämtar Deezer-ID, se nedan.
4. Låtar utan Deezer-ID tas bort ur kategorin och läggs som lockbeten i `data/decoys.json`, städade av `tools/decoys.mjs` så att b-sidor, karaokeversioner, artikelrubriker och filmuppföljare inte kan förväxlas med rätt svar. Ett lockbete som bara stavas annorlunda än ett rätt svar, som "Nick Cave and the Bad Seeds" när svaret är "Nick Cave & The Bad Seeds", tas också bort: `answerKey` i `js/text.js` räknar "&", "+", "and" och "och" lika, bortser från mellanslag och bindestreck och, för artister, ett inledande "The". Rättningen använder samma nyckel. Kör verktyget och `npm test` när `data/decoys.json` eller en låtlista ändras.

En kategori kan döpa om fälten med `labels`, till exempel Kompositör och Verk för klassisk musik. En låt kan också ha egna `labels`, som går före kategorins. Det används i Halloween, där ledmotiv har Kompositör och Film eller Serie och klassiska verk har Kompositör och Verk. En kategori vars `labels` saknar `artist`, som TV-serier med bara `{ "title": "Serie" }`, har bara ett fält. Då ger rätt svar 1 poäng och bonusen 1 till, och `artist` i låtarna är den som hörs på ledmotivet.

### Säsongskategorier

En kategori med `season` i `data/categories.json` syns bara mellan två datum varje år, båda dagarna inräknade, till exempel Halloween:

```
"season": { "from": "10-15", "to": "11-05" }
```

Datumen skrivs som `MM-DD` och ändras bara där. Ett fönster över nyår, som `12-01` till `01-06`, går också. Säsongskategorier står inte i `host.html` utan läggs till av `js/host.js` när det är säsong, och en kategori som redan spelas står kvar i Inställningar även om säsongen tar slut under spelet. Kategorierna står med årtiondena först och sedan resten i bokstavsordning, säsongskategorierna inräknade, så att 60-tal alltid är först och förvalt.

Jul syns 1 december–6 januari och har jullåtar, både utländska och svenska.

Säsongskategorierna har egen väntemusik och egna vinnarlåtar under sitt id i `data/music.json`, och en effekt bakom sidan från `js/season.js`: snö i Jul och fallande löv i Halloween. Effekten följer den valda kategorin, syns hos både spelledaren och spelarna och står still med minskad rörelse.

Halloween blandar läskiga låtar med ledmotiv från skräckfilmer och serier. För ledmotiven är Artist den som skrev det och Titel filmens eller seriens namn, som i Filmmusik, och spåret står i `track`.

I Filmmusik heter fälten Kompositör och Film. Ledmotiv som sjungs av en artist har egna `labels` med Artist och Film, och då är artisten den som hörs på inspelningen, inte den som skrev låten.

## Deezer-ID

Varje quizlåt kan ha ett fast `deezerId`, så att rätt inspelning spelas och inte en liveversion eller en cover. Claude hämtar dem med Node:

```
node tools/deezer-id.mjs 80-tal 90-tal
```

Verktyget söker låten på Deezer med krav på rätt artist och titel, utan live, remix, cover och nyinspelningar, och den mest spelade versionen nära låtens år väljs. Bara inspelningar som går att spela i Sverige tas med. Granskade undantag står i `tools/deezer-choices.json`, och artisterna i Eurovision står i `tools/eurovision-artists.json`. Låtar som inte får något ID tas bort ur kategorin och läggs som lockbeten i `data/decoys.json` (beslutat 12 oktober 2026).
