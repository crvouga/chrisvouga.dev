/**
 *
 * @param {null | undefined | string | number | Record<string, unknown>} attrValue
 * @returns {Record<string, unknown>}
 */
export const ensureObject = (attrValue) => {
  if (typeof attrValue === "object") {
    return attrValue ?? {};
  }
  return {};
};
