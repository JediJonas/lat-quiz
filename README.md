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
- `js/net.js`: kommunikationen via PeerJS, med automatisk återanslutning.
- `js/host.js`, `js/play.js`: spelledarvy och spelarvy.
- `js/meny.js`: menyn uppe till höger på alla sidor, och `js/om.js`: rutan Om Låtquiz, med hur spelet fungerar tekniskt.
- `data/`: kategorier, quizlåtar och förslagslista.
- `js/lookup.js`: textmatchning för `verktyg/deezer-id.mjs`.
- `js/okanda.js`: låtar som spelledaren markerat som okända. De sparas i webbläsaren, hoppas över i kommande spel och kan kopieras under Inställningar, så att de tas bort ur kategorin.
- `js/vantemusik.js`: väntemusiken, ett slumpat Deezer-klipp ur 13 instrumentala jazzlåtar som tonar in och ut och loopar hos spelledaren tills spelet startar. Varje väntan får en ny låt. Med Spela ljud på alla enheter spelas den, liksom vinnarlåten, även i spelarnas mobiler, i takt med spelledaren. Ingen av låtarna finns bland quizlåtarna.
- `js/nuspelas.js`: raden längst ner, "Nu spelas artist – titel", medan väntemusiken eller vinnarlåten spelas. Den syns hos spelledaren och i spelarnas mobiler, även när ljudet bara spelas hos spelledaren.
- `js/klipp.js`: klippet i spelarnas mobiler när spelledaren har valt att spela det på alla enheter. Spelarna får bara klipplänken, inte vilken låt det är.
- `js/deezer.js`: förhandsklipp från Deezer. Klippet spelas i spelledarvyn och timern startar när det hörs. Saknas klipp hoppas låten över. Bara låtar med Deezer-ID spelas.
- `verktyg/deezer-id.mjs`: hämtar fasta Deezer-ID, se nedan.
- `spotify-lardomar.md`: vad vi lärde oss om Spotify, som spelades fram till 23 oktober 2026, om det någon gång ska tillbaka.
- `verktyg/versioner.mjs`, `.github/workflows/publicera.yml`: sidan publiceras på GitHub Pages av ett arbetsflöde, som först ger CSS och JS ett versionsnummer. Då hämtar webbläsaren nya filer efter varje ändring i stället för gamla från cachen. Skriptet körs bara av arbetsflödet och i CI, aldrig för hand. Numret längst ner på sidorna syns bara med `?debug=1`, som sparas på enheten tills `?debug=0` används.
- `favicon.svg`, `ikoner/`, `manifest.webmanifest`: faviconen (Material Symbols Rounded music_note i vitt på en rundad fyrkant i appens ljusa gröna färg, #1ed760, utan toning) och samma ikon som PNG: `apple-touch-icon.png` (180 px, fyrkantig) för hemskärmen i iPhone och iPad, och 192 och 512 px (plus en maskbar 512 px) i manifestet för Lägg till på startskärmen i Android. PNG-filerna för Android är renderade från `favicon.svg`. `apple-touch-icon.png` är renderad från `ikoner/apple-touch-icon.svg`, som har en diagonal toning från samma ljusa gröna uppe till vänster till lite mörkare grönt nere till höger och en svag skugga under noten så att ikonen känns mer levande på hemskärmen. PNG-filerna behöver göras om om faviconen ändras.
- `vendor/`: PeerJS 1.5.4, qrcode-generator 1.4.4 och typsnittet Inter (SIL Open Font License). Loggan `logo.svg` är ritad från typsnittet Lobster (SIL Open Font License).

## Köra lokalt

Sidorna är statiska, så det räcker med en enkel webbserver:

```
python3 -m http.server 8080
```

Öppna sedan http://localhost:8080/host.html. Spelare på samma wifi når datorn via dess IP-adress.

PeerJS gratisserver används som standard. För att testa med en egen PeerJS-server läggs `?peerHost=127.0.0.1&peerPort=9000` till i adressen.

## Tester

```
npm test
```

Testerna kontrollerar också att alla JSON-filer går att läsa och att varje quizlåt har ett giltigt Deezer-ID.

## Webbkvalitet

Varje pull request kör `.github/workflows/webbkvalitet.yml`, som följer regeln webbkvalitet: tester, HTML-validering (W3C Nu), tillgänglighet med axe (WCAG 2.2 AA, ljust och mörkt läge genom ett helt spel), Lighthouse i mobilläge, länkkontroll och sidvikt. Verktygen ligger i `webbkvalitet/`, med egna beroenden, så att själva appen förblir fri från beroenden.

Lokalt, med webbservern på port 8080 igång:

```
cd webbkvalitet
npm ci
npm run peer &        # lokal PeerJS-server, behövs för axe
npm run html
npm run axe
npm run lighthouse
npm run lankar
npm run sidvikt
```

## Ny kategori

1. Claude skriver en kandidatlista i `data/kandidater/<kategori>.json` med cirka 200 låtar och lägger till filen i `data/kandidater/index.json`. Kändheten kan mätas i antal strömningar på kworb.net.
2. De låtar som väljs läggs i `data/<kategori>.json` med `id`, `artist`, `title` och `year`, och kategorin läggs till i `data/categories.json` och `host.html`.
3. `verktyg/deezer-id.mjs` hämtar Deezer-ID, se nedan.
4. Låtar utan Deezer-ID tas bort ur kategorin och läggs som lockbeten i `data/forslag.json`, städade av `verktyg/lockbeten.mjs` så att b-sidor, karaokeversioner, artikelrubriker och filmuppföljare inte kan förväxlas med rätt svar.

En kategori kan döpa om fälten med `labels`, till exempel Kompositör och Verk för klassisk musik.

## Deezer-ID

Varje quizlåt kan ha ett fast `deezerId`, så att rätt inspelning spelas och inte en liveversion eller en cover. Claude hämtar dem med Node:

```
node verktyg/deezer-id.mjs 80-tal 90-tal
```

Verktyget söker låten på Deezer med krav på rätt artist och titel, utan live, remix, cover och nyinspelningar, och den mest spelade versionen nära låtens år väljs. Bara inspelningar som går att spela i Sverige tas med. Granskade undantag står i `verktyg/deezer-val.json`, och artisterna i Eurovision står i `verktyg/eurovision-artister.json`. Låtar som inte får något ID tas bort ur kategorin och läggs som lockbeten i `data/forslag.json` (beslutat 12 oktober 2026).
