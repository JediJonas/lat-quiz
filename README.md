# Låtquiz

En webbapp för låtquiz med familj och vänner. Spelledaren spelar klipp från Deezer, eller låtar i Spotify, och spelarna gissar artist och titel i sina egna mobiler.

Ändringar görs via pull requests mot `main`.

## Så spelar man

1. Spelledaren öppnar `host.html` på en dator, väljer kategori och trycker på **Dra igång!**. Spelledaren deltar och gissar som standard, men kan stänga av **Jag deltar i spelet** under Inställningar och bara leda spelet. Det går att ändra även under spelet. Namnfältet visas då bara om spelledaren inte har angett något namn tidigare, och utan namn heter spelledaren Spelledare.
2. Spelarna skannar QR-koden, eller öppnar `play.html` och skriver in koden.
3. Spelledaren trycker på spela. I de flesta kategorier spelas ett 30 sekunders klipp från Deezer direkt i spelledarvyn, och timern på 30 sekunder startar när det hörs. Saknar Deezer klippet hoppas låten över och en annan slumpas. Med **Spela musik på alla enheter** i Inställningar, som bara syns med Deezer och är av som standard, spelas klippet även i spelarnas mobiler. De spolar till samma ställe som hos spelledaren, men ljudet blir inte helt i takt, så det passar bäst när alla inte är i samma rum. Har spelledaren valt Spotify som musiktjänst i Inställningar öppnas låten i Spotify-appen och klicket startar timern. Spelledaren stoppar då låten själv och startar nästa låt med knappen Nästa låt.
4. Spelarna väljer artist och titel ur listan. Svaren kan ändras tills tiden är slut, och då visas rätt svar.

Poäng: 1 för rätt artist, 1 för rätt titel och 1 i bonus om båda är rätt inom 15 sekunder. Först till 10 poäng vinner.

## Filer

- `js/game.js`: spellogiken (låtval, gissningar och poäng), utan nätverk och gränssnitt.
- `js/net.js`: kommunikationen via PeerJS, med automatisk återanslutning.
- `js/host.js`, `js/play.js`: spelledarvy och spelarvy.
- `js/meny.js`: menyn uppe till höger på alla sidor, och `js/om.js`: rutan Om Låtquiz, med hur spelet fungerar tekniskt.
- `data/`: kategorier, quizlåtar och förslagslista.
- `js/lookup.js`, `verktyg/spotify-id.html`: uppslagning av Spotify-ID.
- `js/okanda.js`: låtar som spelledaren markerat som okända. De sparas i webbläsaren, hoppas över i kommande spel och kan kopieras under Inställningar, så att de tas bort ur kategorin.
- `js/vantemusik.js`: väntemusiken, Deezer-klipp som slumpas, tonar in och ut och spelas hos spelledaren tills spelet startar. Ingen av låtarna finns bland quizlåtarna.
- `js/klipp.js`: klippet i spelarnas mobiler när spelledaren har valt att spela det på alla enheter. Spelarna får bara klipplänken, inte vilken låt det är.
- `js/deezer.js`: förhandsklipp från Deezer i kategorier med `"audio": "deezer"`. Klippet spelas i spelledarvyn och timern startar när det hörs. Saknas klipp hoppas låten över. Med Spotify som musiktjänst spelas bara låtar med Spotify-ID, och med Deezer bara låtar med Deezer-ID.
- `verktyg/deezer-id.mjs`: hämtar fasta Deezer-ID, se nedan.
- `verktyg/versioner.mjs`, `.github/workflows/publicera.yml`: sidan publiceras på GitHub Pages av ett arbetsflöde, som först ger CSS och JS ett versionsnummer. Då hämtar webbläsaren nya filer efter varje ändring i stället för gamla från cachen. Skriptet körs bara av arbetsflödet och i CI, aldrig för hand.
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

Testerna kontrollerar också att alla JSON-filer går att läsa och att varje quizlåt har ett giltigt Spotify-ID.

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

## Spotify-ID

Så tas en kategori fram:

1. Claude skriver en kandidatlista i `data/kandidater/<kategori>.json` med cirka 200 låtar och lägger till filen i `data/kandidater/index.json`.
2. `verktyg/spotify-id.html` går igenom kandidaterna i ordning och hämtar Spotify-ID från Wikidata. Det stannar när kategorin har nått målet, normalt 100 låtar. Låtar som redan finns i kategorin behålls.
3. Sidan laddar ner kategorifilen med bara låtar som har ID. Den ersätter filen i `data/`, och en ny kategori läggs till i `data/categories.json`. Kandidater som söktes men inte hittades läggs i `data/forslag.json` som lockbeten, städade av `verktyg/lockbeten.mjs` så att b-sidor, karaokeversioner, artikelrubriker och filmuppföljare inte kan förväxlas med rätt svar.

En kategori kan döpa om fälten med `labels`, till exempel Kompositör och Verk för klassisk musik. Verktyget matchar då mot kompositören i Wikidata.

Sidan körs i en vanlig webbläsare, till exempel via GitHub Pages. Låtar som saknas i Wikidata kan fyllas i för hand med en Spotify-länk.

Claude kan också göra hela uppslagningen själv, utan att någon kör sidan:

```
node verktyg/hamta-id.mjs data/kandidater/<kategori>.json 100
```

Skriptet söker först i Wikidata och sedan bland inspelningar i MusicBrainz som har en Spotify-länk. Klassiska verk hittas via verket i MusicBrainz, och första satsen eller den del som titeln nämner väljs, helst med en känd orkester. Claude går igenom träffarna och markerar fel inspelningar med `"skip"` i kandidatlistan, så att de blir lockbeten i stället. Det kräver att miljön når query.wikidata.org och musicbrainz.org.

## Deezer-ID

Varje quizlåt kan ha ett fast `deezerId`, så att rätt inspelning spelas och inte en liveversion eller en cover. Claude hämtar dem med Node:

```
node verktyg/deezer-id.mjs 80-tal 90-tal
```

Verktyget slår först upp låtens ISRC i Wikidata via Spotify-ID:t och hämtar exakt den inspelningen från Deezer. Annars söks låten på Deezer med krav på rätt artist och titel, utan live, remix, cover och nyinspelningar, och den mest spelade versionen nära låtens år väljs. Bara inspelningar som går att spela i Sverige tas med. Granskade undantag står i `verktyg/deezer-val.json`, och artisterna i Eurovision står i `verktyg/eurovision-artister.json`. Låtar som inte får något ID tas bort ur kategorin och läggs som lockbeten i `data/forslag.json` (beslutat 12 oktober 2026).
