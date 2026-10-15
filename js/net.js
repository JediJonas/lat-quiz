// Kommunikation via PeerJS (WebRTC). Spelledarens webbläsare är servern.
// Resten av appen använder bara createHost och createClient, så den här filen
// kan bytas mot till exempel Firebase utan att spellogiken ändras.
//
// Meddelanden är vanliga objekt med fältet type.

const PEER_PREFIX = 'latquiz-v1-';
const PING_MS = 4000;
const SILENCE_MS = 12000;
// Så länge får ett anslutningsförsök ta innan spelaren försöker igen.
const CONNECT_MS = 8000;
// Så många försök får en ny spelare innan appen ger upp och säger att spelet inte svarar.
const FIRST_ATTEMPTS = 3;
// Har spelledarens sida varit dold så här länge kopplas förbindelsen till förmedlingsservern upp igen.
const REFRESH_AFTER_MS = 5000;

// För lokal testning kan en egen PeerJS-server anges i adressen,
// till exempel ?peerHost=localhost&peerPort=9000.
export function peerOptions() {
  const params = new URLSearchParams(location.search);
  const host = params.get('peerHost');
  if (!host) return { debug: 1 };
  return {
    host,
    port: Number(params.get('peerPort') || 9000),
    path: params.get('peerPath') || '/',
    secure: params.get('peerSecure') === '1',
    debug: 1,
  };
}

// Parametrar som ska följa med i anslutningslänken till spelarna.
export function peerQuery() {
  const params = new URLSearchParams(location.search);
  const keep = new URLSearchParams();
  for (const key of ['peerHost', 'peerPort', 'peerPath', 'peerSecure']) {
    if (params.has(key)) keep.set(key, params.get(key));
  }
  return keep.toString();
}

// handlers: onReady(), onMessage(connId, msg), onDisconnect(connId),
// onError(type): 'relay' när kontakten med förmedlingsservern bröts, 'unavailable-id' när
// spelkoden är upptagen efter en omladdning, 'network' vid nätverksfel, annars PeerJS feltyp.
export function createHost(code, handlers) {
  const conns = new Map();
  const lastSeen = new Map();
  let peer = null;
  let destroyed = false;
  // Sant medan förbindelsen till förmedlingsservern kopplas upp på nytt med flit.
  let refreshing = false;
  let hiddenAt = null;

  function open() {
    peer = new Peer(PEER_PREFIX + code, peerOptions());
    peer.on('open', () => handlers.onReady());
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        conns.set(conn.connectionId, conn);
        lastSeen.set(conn.connectionId, Date.now());
      });
      conn.on('data', (msg) => {
        lastSeen.set(conn.connectionId, Date.now());
        if (msg && msg.type === 'pong') return;
        handlers.onMessage(conn.connectionId, msg);
      });
      conn.on('close', () => drop(conn.connectionId));
      conn.on('error', () => drop(conn.connectionId));
    });
    // Kontakten med förmedlingsservern bröts. Befintliga spelare påverkas inte,
    // men nya kan inte ansluta förrän vi är tillbaka.
    peer.on('disconnected', () => {
      if (refreshing || destroyed) return;
      handlers.onError('relay');
      setTimeout(() => !destroyed && peer.disconnected && !peer.destroyed && peer.reconnect(), 2000);
    });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        // Händer när sidan laddas om. Det gamla id:t släpps efter en stund.
        handlers.onError('unavailable-id');
        peer.destroy();
        setTimeout(() => !destroyed && open(), 3000);
      } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
        handlers.onError('network');
      } else if (err.type !== 'peer-unavailable') {
        handlers.onError(err.type);
      }
    });
  }

  function drop(connId) {
    const conn = conns.get(connId);
    if (!conn) return;
    conns.delete(connId);
    lastSeen.delete(connId);
    try { conn.close(); } catch { /* redan stängd */ }
    handlers.onDisconnect(connId);
  }

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [connId, conn] of conns) {
      if (now - lastSeen.get(connId) > SILENCE_MS) drop(connId);
      else conn.send({ type: 'ping' });
    }
  }, PING_MS);

  // I mobilen fryses sidan när den inte syns, till exempel när spelledaren har öppnat Spotify.
  // Förbindelsen till förmedlingsservern kan då ha dött utan att PeerJS märker det, och nya spelare
  // kommer inte fram. När sidan syns igen kopplas den upp på nytt. Spelare som redan är med påverkas inte.
  function onVisible() {
    if (document.visibilityState !== 'visible') { hiddenAt = Date.now(); return; }
    const wasHidden = hiddenAt !== null && Date.now() - hiddenAt >= REFRESH_AFTER_MS;
    hiddenAt = null;
    if (!wasHidden || destroyed || peer.destroyed) return;
    if (!peer.disconnected) {
      refreshing = true;
      peer.disconnect();
      refreshing = false;
    }
    peer.reconnect();
  }
  document.addEventListener('visibilitychange', onVisible);

  open();

  return {
    send(connId, msg) {
      const conn = conns.get(connId);
      if (conn && conn.open) conn.send(msg);
    },
    drop,
    destroy() {
      destroyed = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      peer.destroy();
    },
  };
}

// handlers: onOpen(), onMessage(msg), onStatus('connecting' | 'connected' | 'offline' | 'host-missing'),
// onNotFound() när det inte finns något spel med koden, onUnreachable(reason) när
// anslutningen aldrig har lyckats efter flera försök: 'relay' om förmedlingsservern inte
// gick att nå, 'host' om spelledaren aldrig svarade.
// 'host-missing' betyder att nätet fungerar men spelledaren inte finns, till exempel när
// spelledarens flik är stängd.
// Har klienten varit ansluten en gång försöker den ansluta igen av sig själv tills destroy() anropas.
export function createClient(code, handlers) {
  let peer = null;
  let conn = null;
  let lastSeen = 0;
  let retryDelay = 1000;
  let retryTimer = null;
  let attemptTimer = null;
  let destroyed = false;
  let everConnected = false;
  let failedAttempts = 0;
  // Sant när förmedlingsservern har svarat under något av försöken.
  let relayReached = false;

  function closePeer() {
    clearTimeout(attemptTimer);
    const p = peer;
    peer = null;
    conn = null;
    if (p && !p.destroyed) p.destroy();
  }

  // Varje försök börjar med en ny Peer, precis som en omladdning av sidan. En gammal Peer
  // kan ha en död förbindelse till förmedlingsservern utan att märka det, och då kommer
  // inget svar alls.
  function connect() {
    clearTimeout(retryTimer);
    if (destroyed) return;
    handlers.onStatus('connecting');
    closePeer();
    const p = new Peer(peerOptions());
    peer = p;
    p.on('open', () => {
      if (peer !== p) return;
      relayReached = true;
      openConnection();
    });
    p.on('error', (err) => {
      if (peer !== p) return;
      // Spelledaren finns inte. Har vi aldrig varit anslutna är koden fel
      // eller spelet avslutat. Annars laddar spelledaren troligen om sidan.
      if (err.type === 'peer-unavailable' && !everConnected) {
        handlers.onNotFound();
        return;
      }
      if (err.type === 'peer-unavailable') {
        scheduleRetry();
        handlers.onStatus('host-missing');
        return;
      }
      // Fel mot förmedlingsservern stör inte en öppen förbindelse till spelledaren.
      if (conn && conn.open) return;
      scheduleRetry();
    });
    p.on('disconnected', () => {
      if (peer === p && !destroyed) p.reconnect();
    });
    // PeerJS har ingen egen tidsgräns. Blir det tyst under uppkopplingen försöker vi igen.
    attemptTimer = setTimeout(() => { if (peer === p) scheduleRetry(); }, CONNECT_MS);
  }

  function openConnection() {
    const c = peer.connect(PEER_PREFIX + code, { reliable: true });
    conn = c;
    c.on('open', () => {
      if (conn !== c) return;
      clearTimeout(attemptTimer);
      lastSeen = Date.now();
      retryDelay = 1000;
      everConnected = true;
      handlers.onStatus('connected');
      handlers.onOpen();
    });
    c.on('data', (msg) => {
      if (conn !== c) return;
      lastSeen = Date.now();
      if (msg && msg.type === 'ping') { c.send({ type: 'pong' }); return; }
      handlers.onMessage(msg);
    });
    c.on('close', () => { if (conn === c) scheduleRetry(); });
    c.on('error', () => { if (conn === c) scheduleRetry(); });
  }

  function scheduleRetry() {
    if (destroyed) return;
    closePeer();
    // En ny spelare som aldrig har kommit fram får veta det i stället för att vänta för alltid,
    // till exempel när spelledarens sida inte går att nå från spelarens nät.
    if (!everConnected && ++failedAttempts >= FIRST_ATTEMPTS) {
      handlers.onUnreachable(relayReached ? 'host' : 'relay');
      return;
    }
    handlers.onStatus('offline');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 8000);
  }

  // Inget hört från spelledaren på ett tag: anslut igen.
  const watchdog = setInterval(() => {
    if (conn && conn.open && Date.now() - lastSeen > SILENCE_MS) scheduleRetry();
  }, 2000);

  // Mobilen väcks efter skärmlås: kontrollera direkt i stället för att vänta.
  function onVisible() {
    if (document.visibilityState !== 'visible' || destroyed) return;
    if (!conn || !conn.open || Date.now() - lastSeen > PING_MS * 2) {
      retryDelay = 1000;
      connect();
    }
  }
  document.addEventListener('visibilitychange', onVisible);

  connect();

  return {
    send(msg) {
      if (conn && conn.open) { conn.send(msg); return true; }
      return false;
    },
    destroy() {
      destroyed = true;
      clearInterval(watchdog);
      clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisible);
      closePeer();
    },
  };
}
