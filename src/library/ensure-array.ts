/**
 * @template T
 * @param {T} attrValue
 * @returns {T[]}
 */
export const ensureArray = (attrValue) => {
  if (Array.isArray(attrValue)) {
    return attrValue;
  }
  return [];
};
