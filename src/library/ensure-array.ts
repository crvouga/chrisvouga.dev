export const ensureArray = <T>(attrValue: T): T[] => {
  if (Array.isArray(attrValue)) {
    return attrValue;
  }
  return [];
};
