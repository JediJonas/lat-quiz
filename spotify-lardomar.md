# Spotify: det vi lärde oss

Låtquiz kunde spela låtarna i Spotify fram till 23 oktober 2026. Då togs Spotify bort helt, så att appen bara spelar klipp från Deezer. Skälet var att Spotify krävde ett klick för varje låt, en egen Nästa låt-knapp och mycket specialkod, medan Deezer-klippen gör spelet helt automatiskt. Här står det som är värt att veta om Spotify någon gång ska tillbaka.

Koden och alla Spotify-ID finns kvar i git-historiken. Den sista versionen med Spotify är commit `608a72d`, till exempel `git show 608a72d:js/host.js` eller `git show 608a72d:data/80-tal.json`.

## Regler: inget API

- Spotifys utvecklarpolicy förbjuder uttryckligen spel, även frågesporter, och kräver att omslag och låtinformation visas när en låt spelas. Därför användes aldrig Spotifys Web API, Web Playback SDK eller någon utvecklarregistrering, inte ens för att slå upp ID. Policyn: https://developer.spotify.com/policy
- Sedan februari 2026 kräver Spotifys utvecklarläge dessutom Premium och tillåter högst 5 användare per app.
- Att automatiskt läsa Spotifys webbsidor, till exempel publika spellistor, bryter mot användarvillkoren.
- Hitster gör tekniskt det vi inte får göra, alltså fjärrstyr Spotify-appen. Jumbo har troligen ett avtal med Spotify.
- Utan API kan appen inte starta eller stoppa låten, inte veta när den börjar höras och inte hämta någon data från Spotify. Det enda som går är att öppna en vanlig låtlänk, som vanlig privat lyssning. Spelledaren bör ha Premium för att säkert få rätt låt.

## Öppna en låt

- **Dator:** `spotify:track:<id>?autoplay=true`, öppnad genom att klicka på ett tillfälligt `<a>`-element. Den öppnar Spotify-appen och byter låt även om en annan redan spelar. Utan `?autoplay=true` byter appen inte låt. Varianterna `spotify:track:<id>`, `spotify:track:<id>#0:00`, `https://open.spotify.com/track/<id>` och samma med `?autoplay=true` jämfördes den 14 oktober 2026. Reserv: `https://open.spotify.com/track/<id>`.
- **Mobil** (`(pointer: coarse)`): `https://open.spotify.com/track/<id>` med `window.open(url, '_blank', 'noopener')`. En `spotify:`-länk får webbläsaren att fråga varje gång om den får öppna Spotify. Länken till open.spotify.com öppnar appen direkt, eftersom Spotify har kopplat domänen till appen (universella länkar på iPhone, App Links på Android).
- **Utan ID:** `https://open.spotify.com/search/<artist titel>`, där spelledaren väljer översta träffen.
- Länken måste öppnas direkt i spelledarens klick, annars stoppar webbläsaren den. Därför kunde nästa låt inte starta av sig själv, ingen nedräkning gick att ha före första låten, och väntemusiken och vinnarlåten behövde egna knappar (Spela väntemusik, Spela vinnarlåt). Timern startade vid klicket.
- En `spotify:`-länk räknas av webbläsaren som att sidan lämnas, så varningen i `beforeunload` hoppades över en sekund efter ett sådant klick.

## Samspel med sidan

- **iPhone stoppar Spotify när sidan tar ljudet.** Med Spotify fick sidan inte starta Web Audio eller ljudelement vid spelledarens tryck. Trumvirveln, det enda sidan spelade, förbereddes med `navigator.audioSession.type = 'ambient'` så att den blandades med Spotify, och en ljudmotor som redan gick pausades med `suspend()` (PR 309, 18 oktober 2026).
- Med Spotify spelades bara låtar i Spotify, även väntemusik och vinnarlåt, aldrig Deezer-klipp blandat (beslutat 17 oktober 2026). Det krävde Spotify-ID på alla 25 väntelåtar och 25 vinnarlåtar. Åtta väntelåtar gick inte att slå upp, och Jonas letade fram dem själv.
- Webbläsare bromsar timers i flikar som inte syns, till exempel när spelledaren byter till Spotify. Timern i spelledarvyn går därför i en Web Worker, vilket finns kvar.
- Öppnas Spotify på samma mobil som spelledarvyn kan webbläsaren pausas, särskilt på iPhone, och anslutningen till spelarna brytas. Därför var spelledarvyn tänkt för dator. Spelas Spotify på en annan enhet än spelledarvyn behövs en knapp "Starta timer".

## Spotify-ID

- Ett giltigt Spotify-ID har 22 tecken, `[A-Za-z0-9]{22}`. Wikidata har ibland felaktiga ID.
- Bästa källan var kworb.net, en fristående sajt med statistik över Spotify-strömningar som tillåter automatisk hämtning. Sverigelistan har drygt 10 000 låtar med ID, och artistsidorna, som hittas via artistens Spotify-ID i Wikidata (P1902), har alla låtar med strömningar sedan start. Hämta en sida i taget, med paus. kworb.net används fortfarande för att mäta hur kända låtar är.
- Reserv: Wikidata (P2207 för låtens Spotify-ID) och MusicBrainz via verk (P435), skiva (P436) och namnsökning. MusicBrainz tillåter ungefär ett anrop per sekund, så en kategori tar en till ett par timmar, och har få svenska och äldre låtar.
- Song.link blockerar anrop från webbläsare (CORS). iTunes användes inte.
- Wikidata anger även den som gjort en cover som artist (P175), så remaster-, cover- och samlingsversioner kunde väljas. Varje ID kontrollerades mot kworb.net eller MusicBrainz. Den 12 oktober 2026 rättades 78 låtar.
- Spotify-ID gav också låtens ISRC via Wikidata (P1243), och med den hämtade `verktyg/deezer-id.mjs` exakt samma inspelning från Deezer (`track/isrc:<isrc>`). Det steget togs bort med Spotify-ID:na. Det kan ersättas med en sökning efter låten i Wikidata.
- Verktygen `verktyg/hamta-id.mjs` (Node) och `verktyg/spotify-id.html` (i webbläsaren) hämtade Spotify-ID för en kandidatlista. De finns i git-historiken.

## Om Spotify ska tillbaka

- Ett val av musiktjänst i Inställningar, och en regel för vad som spelas med vilken tjänst.
- En knapp för nästa låt, eftersom varje låt måste öppnas i ett klick, och knappar för väntemusik och vinnarlåt.
- Spotify-ID på alla quizlåtar, väntelåtar och vinnarlåtar. De gamla finns i git-historiken, men nya låtar har tillkommit sedan dess.
- Inget ljud från sidan på iPhone medan Spotify spelar, se ovan.
