# Låtquiz

En webbapp för låtquiz med familj och vänner. Spelledaren spelar låtar i Spotify, och spelarna gissar artist och titel i sina egna mobiler.

Ändringar görs via pull requests mot `main`.

## Så spelar man

1. Spelledaren öppnar `host.html` på en dator med Spotify, väljer kategori och trycker på **Skapa spel**.
2. Spelarna skannar QR-koden, eller öppnar `play.html` och skriver in koden.
3. Spelledaren trycker på **Nästa låt**. Låten öppnas i Spotify-appen, och klicket startar en timer på 60 sekunder. Spelledaren stoppar låten själv efter ungefär 10 sekunder.
4. Spelarna väljer artist och titel ur listan. Rätt svar visas när tiden är slut, eller när alla har svarat.

Poäng: 1 för rätt artist, 1 för rätt titel och 1 i bonus om båda är rätt inom 15 sekunder. Först till 10 poäng vinner.

## Filer

- `js/game.js`: spellogiken (låtval, gissningar och poäng), utan nätverk och gränssnitt.
- `js/net.js`: kommunikationen via PeerJS, med automatisk återanslutning.
- `js/host.js`, `js/play.js`: spelledarvy och spelarvy.
- `data/`: kategorier, quizlåtar och förslagslista.
- `js/lookup.js`, `verktyg/spotify-id.html`: uppslagning av Spotify-ID.
- `vendor/`: PeerJS 1.5.4 och qrcode-generator 1.4.4.

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

## Spotify-ID

Så tas en kategori fram:

1. Claude skriver en kandidatlista i `data/kandidater/<kategori>.json` med cirka 200 låtar och lägger till filen i `data/kandidater/index.json`.
2. `verktyg/spotify-id.html` går igenom kandidaterna i ordning och hämtar Spotify-ID från Wikidata. Det stannar när kategorin har nått målet, normalt 100 låtar. Låtar som redan finns i kategorin behålls.
3. Sidan laddar ner kategorifilen med bara låtar som har ID. Den ersätter filen i `data/`, och en ny kategori läggs till i `data/categories.json`. Kandidater som söktes men inte hittades läggs i `data/forslag.json` som lockbeten.

En kategori kan döpa om fälten med `labels`, till exempel Kompositör och Verk för klassisk musik. Verktyget matchar då mot kompositören i Wikidata.

Sidan körs i en vanlig webbläsare, till exempel via GitHub Pages. Låtar som saknas i Wikidata kan fyllas i för hand med en Spotify-länk.
