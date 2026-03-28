export const ensureObject = (
  attrValue: null | undefined | string | number | Record<string, unknown>,
): Record<string, unknown> => {
  if (typeof attrValue === "object") {
    return attrValue ?? {};
  }
  return {};
};
