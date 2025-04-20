/**
 * @param {string} href
 * @param {string} text
 * @returns {string}
 */
export const a = (href, text) => {
  return `<a style="color: white;" target="_blank" rel="noreferrer noopener" href="${href}">${text}</a>`;
};
