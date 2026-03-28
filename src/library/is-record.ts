/**
 *
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export const isRecord = (value) => {
  return typeof value === "object" && value !== null;
};
