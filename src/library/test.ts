/**
 *
 * @param {boolean} condition
 * @param {string} message
 */
export const asserts = (condition, message) => {
  if (!condition) {
    console.error(message);
    throw new Error(message);
  }
};

/**
 *
 * @template T
 * @param {T} left
 * @param {T} right
 * @param {string} message
 */
export const assertEquals = (left, right, message) => {
  if (left !== right) {
    console.error("assertEquals FAILED", {
      expected: right,
      actual: left,
    });
    throw new Error(message);
  }
};
