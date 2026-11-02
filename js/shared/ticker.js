// @ts-check
// Webbläsare bromsar timers i flikar som inte syns, till exempel när spelledaren
// har bytt till en annan flik, ibland till en gång i minuten. En timer i en worker
// bromsas inte lika hårt, så svaret visas i tid ändå.

/** Kör fn var ms:e millisekund tills stop anropas. @param {() => void} fn @param {number} ms */
export function startTicker(fn, ms) {
  try {
    const code = `setInterval(() => postMessage(0), ${ms});`;
    const worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    worker.onmessage = fn;
    return { stop: () => worker.terminate() };
  } catch {
    const id = setInterval(fn, ms);
    return { stop: () => clearInterval(id) };
  }
}
