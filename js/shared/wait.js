// @ts-check
// Väntar ms millisekunder. Används med await, till exempel mellan två försök.

/** @param {number} ms @returns {Promise<void>} */
export const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
