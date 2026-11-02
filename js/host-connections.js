// @ts-check
// Spelledarens anslutningar till spelarna: vem som är ansluten på vilken förbindelse, vad
// spelarna skickar och vad de får tillbaka. Spelläget ägs av host.js och hämtas med state().
// Meddelandena kontrolleras och städas i protocol.js först.
import * as game from './game.js';
import { t } from './shared/lang.js';
import { createHost as netCreateHost } from './net.js';
import { showJoined, showLeft, showMessage } from './meddelande.js';
import * as protocol from './shared/protocol.js';

// Kontakten med förmedlingsservern bryts oftast när spelledaren har lämnat webbläsaren, till
// exempel för en annan app i mobilen. Meddelandet är därför allmänt, som hos spelarna.
const NET_MESSAGES = {
  relay: { kind: 'busy', title: t('net.lost.title'), text: t('net.retrying') },
  'unavailable-id': { kind: 'busy', title: t('net.waitingCode.title'), text: t('net.waitingCode.text') },
  network: { kind: 'busy', title: t('net.offline.title'), text: t('net.retrying') },
};

// Så länge väntar spelledaren innan anslutningarna stängs, så att Spelet är slut hinner fram.
export const CLOSE_WAIT_MS = 300;

/**
 * @param {{
 *   state: () => any,
 *   viewFor: (playerId: string) => object,
 *   changed: () => void,
 *   createHost?: typeof netCreateHost,
 *   show?: { joined: (name: string) => void, left: (name: string) => void, message: (msg: object) => void },
 * }} options
 * state: spelläget. viewFor: det en spelare ska se. changed: spelläget har ändrats och ska
 * sparas, skickas och ritas. createHost och show byts ut i testerna.
 */
export function createConnections({ state, viewFor, changed, createHost = netCreateHost,
  show = { joined: showJoined, left: showLeft, message: showMessage } }) {
  /** @type {Map<string, string>} förbindelse till spelarens id */
  const connToPlayer = new Map();
  let net = null;
  let trouble = false;

  /** Ett meddelande till alla anslutna, utom den på förbindelsen except. */
  function toAll(msg, except = null) {
    if (!net) return;
    for (const connId of connToPlayer.keys()) if (connId !== except) net.send(connId, msg);
  }

  function sendState(connId) {
    const playerId = connToPlayer.get(connId);
    if (playerId) net.send(connId, protocol.state(viewFor(playerId)));
  }

  /** Varje spelare får sin egen vy av spelläget. */
  function broadcast() {
    for (const connId of connToPlayer.keys()) sendState(connId);
  }

  function hello(connId, { name, playerId }) {
    const s = state();
    if (game.nameTaken(s, { id: playerId, name })) {
      net.send(connId, protocol.nameTaken(name));
      return;
    }
    // Samma spelare på en ny anslutning: släpp den gamla.
    for (const [otherConn, otherId] of connToPlayer) {
      if (otherId === playerId && otherConn !== connId) {
        connToPlayer.delete(otherConn);
        net.drop(otherConn);
      }
    }
    connToPlayer.set(connId, playerId);
    const isNew = !s.players[playerId];
    game.addPlayer(s, { id: playerId, name });
    changed();
    // Alla utom den nya spelaren får veta det. Den som ansluter igen är inte ny.
    if (isNew) {
      show.joined(name);
      toAll(protocol.joined(name), connId);
    }
  }

  function onMessage(connId, raw) {
    const msg = protocol.fromPlayer(raw);
    if (!msg) return;
    if (msg.type === protocol.MSG.hello) {
      hello(connId, msg);
      return;
    }
    const playerId = connToPlayer.get(connId);
    if (!playerId) return;
    const s = state();
    if (msg.type === protocol.MSG.answer) {
      game.submitAnswer(s, playerId, msg.field, msg.value, Date.now());
      changed();
    } else if (msg.type === protocol.MSG.leave) {
      // Spelaren valde Lämna spelet. Den räknas som frånkopplad och får tillbaka poängen om den går med igen.
      if (!s.players[playerId]) return;
      const { name } = s.players[playerId];
      net.drop(connId);
      show.left(name);
      toAll(protocol.left(name));
    }
  }

  function onDisconnect(connId) {
    const playerId = connToPlayer.get(connId);
    connToPlayer.delete(connId);
    if (!playerId || [...connToPlayer.values()].includes(playerId)) return;
    game.setConnected(state(), playerId, false);
    changed();
  }

  /** Spelet tar emot spelare med koden. */
  function start(code) {
    net = createHost(code, {
      onReady: () => {
        if (trouble) show.message({ key: 'net', kind: 'ok', title: t('net.back.title'), text: t('net.back.text') });
        trouble = false;
      },
      onMessage,
      onDisconnect,
      onError: (type) => {
        trouble = true;
        show.message({ key: 'net', ...(NET_MESSAGES[type] || { kind: 'problem', title: t('net.error.title'), text: type }) });
      },
    });
  }

  /** Spelarna får veta att spelet är slut, så att de inte tror att anslutningen bara bröts. */
  async function close() {
    if (!net) return;
    toAll(protocol.ended());
    await new Promise((resolve) => { setTimeout(resolve, CLOSE_WAIT_MS); });
    net.destroy();
  }

  return { start, broadcast, toAll, close };
}
