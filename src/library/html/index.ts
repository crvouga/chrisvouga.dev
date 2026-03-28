// @ts-check

/**
 * @typedef {Record<string, string | number | Record<string, unknown> | undefined | null>} Attrs
 */

/**
 * @typedef {{ t: "tag"; tagName: string; attrs: Attrs; children: Html[] }} Tag
 */

/**
 * @typedef {{ t: "text"; text: string }} Text
 */

/**
 * @typedef {{ t: "fragment"; children: Html[] }} Fragment
 */

/**
 * @typedef {Tag | Text | Fragment} Html
 */

/**
 * @typedef {(attr?: Attrs, children?: Html[]) => Html} View
 */

/**
 * @template Props
 * @typedef {(props: Props) => View} ViewWithProps
 */

/**
 * @type {(tagName:string, attr?: Attrs, children?: Html[]) => Html}
 */
export const tag = (tagName, attrs, children) => {
  return {
    t: "tag",
    tagName,
    attrs: attrs ?? {},
    children: children ?? [],
  };
};

/**
 *
 * @param {string} text
 * @returns {Html}
 */
export const text = (text) => {
  return {
    t: "text",
    text,
  };
};

/**
 *
 * @param {Html[]} children
 * @returns {Html}
 */
export const fragment = (children) => {
  return {
    t: "fragment",
    children,
  };
};
