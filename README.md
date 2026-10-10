# Låtquiz

En webbapp för låtquiz med familj och vänner. Spelledaren spelar låtar i Spotify, och spelarna gissar artist och titel i sina egna mobiler.

Ändringar görs via pull requests mot `main`.

## Så spelar man

1. Spelledaren öppnar `host.html` på en dator med Spotify, väljer kategori och trycker på **Skapa spel**.
2. Spelarna skannar QR-koden, eller öppnar `play.html` och skriver in koden.
3. Spelledaren trycker på **Nästa låt** och sedan på **Spela låten i Spotify**. Klicket startar en timer på 30 sekunder. Spelledaren stoppar låten själv efter ungefär 10 sekunder.
4. Spelarna väljer artist och titel ur listan. Rätt svar visas när tiden är slut, eller när alla har svarat.

Poäng: 1 för rätt artist, 1 för rätt titel och 1 i bonus om båda är rätt inom 15 sekunder.

## Filer

- `js/game.js`: spellogiken (låtval, gissningar och poäng), utan nätverk och gränssnitt.
- `js/net.js`: kommunikationen via PeerJS, med automatisk återanslutning.
- `js/host.js`, `js/play.js`: spelledarvy och spelarvy.
- `data/`: kategorier, quizlåtar och förslagslista.
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
