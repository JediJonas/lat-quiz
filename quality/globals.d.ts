// Typer för det som appen använder men som inte finns i TypeScripts standardtyper.

// PeerJS läses in från vendor/peerjs.min.js med en script-tagg.
declare const Peer: any;

// qrcode-generator läses in från vendor/qrcode.js med en script-tagg.
declare const qrcode: any;

// Versionen och när sidan publicerades, inskriven av tools/build.mjs. Saknas lokalt.
declare var LATQUIZ_VERSION: string | undefined;

interface Window {
  // Äldre Safari har bara ljudmotorn med prefix.
  webkitAudioContext?: typeof AudioContext;
}

interface Navigator {
  // Safari 17+: styr om sidans ljud blandas med annat ljud i iPhone.
  audioSession?: { type: string };
}
