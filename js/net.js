// Kommunikation via PeerJS (WebRTC). Spelledarens webbläsare är servern.
// Resten av appen använder bara createHost och createClient, så den här filen
// kan bytas mot till exempel Firebase utan att spellogiken ändras.
//
// Meddelanden är vanliga objekt med fältet type.

const PEER_PREFIX = 'latquiz-v1-';
const PING_MS = 4000;
const SILENCE_MS = 12000;

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

// handlers: onReady(), onMessage(connId, msg), onDisconnect(connId), onError(text)
export function createHost(code, handlers) {
  const conns = new Map();
  const lastSeen = new Map();
  let peer = null;
  let destroyed = false;

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
      if (!destroyed) setTimeout(() => !destroyed && peer.reconnect(), 2000);
    });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        // Händer när sidan laddas om. Det gamla id:t släpps efter en stund.
        handlers.onError('Väntar på att spelkoden ska bli ledig igen …');
        peer.destroy();
        setTimeout(() => !destroyed && open(), 3000);
      } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
        handlers.onError('Kontakten med anslutningsservern bröts. Försöker igen …');
      } else if (err.type !== 'peer-unavailable') {
        handlers.onError('Anslutningsfel: ' + err.type);
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
      peer.destroy();
    },
  };
}

// handlers: onOpen(), onMessage(msg), onStatus('connecting' | 'connected' | 'offline')
// Klienten försöker ansluta igen av sig själv tills destroy() anropas.
export function createClient(code, handlers) {
  let peer = null;
  let conn = null;
  let lastSeen = 0;
  let retryDelay = 1000;
  let retryTimer = null;
  let destroyed = false;

  function connect() {
    clearTimeout(retryTimer);
    if (destroyed) return;
    handlers.onStatus('connecting');
    if (!peer || peer.destroyed) {
      peer = new Peer(peerOptions());
      peer.on('open', () => openConnection());
      peer.on('error', () => scheduleRetry());
      peer.on('disconnected', () => {
        if (!destroyed && !peer.destroyed) peer.reconnect();
      });
    } else if (peer.disconnected) {
      peer.reconnect();
      peer.once('open', () => openConnection());
    } else {
      openConnection();
    }
  }

  function openConnection() {
    if (conn) conn.close();
    const c = peer.connect(PEER_PREFIX + code, { reliable: true });
    conn = c;
    c.on('open', () => {
      if (conn !== c) return;
      lastSeen = Date.now();
      retryDelay = 1000;
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
    if (conn) { const c = conn; conn = null; try { c.close(); } catch { /* stängd */ } }
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
      if (peer && !peer.destroyed) peer.destroy();
      peer = null;
      conn = null;
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
      if (peer) peer.destroy();
    },
  };
}
