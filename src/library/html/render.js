import { tag, text } from "./index.js";
import { isRecord } from "../is-record.js";
import { assertEquals } from "../test.js";

/**
 *
 * @param {import("./index.js").Html} elem
 * @returns {string}
 */
export const render = (elem) => {
  const html = renderMain(elem);
  const minified = minifyHtml(html);
  return prependDocType(minified);
};

/**
 * Minifies HTML by removing unnecessary whitespace
 * Preserves content inside script and style tags
 * @param {string} html
 * @returns {string}
 */
const minifyHtml = (html) => {
  // Extract script and style content to preserve them
  /** @type {string[]} */
  const preserved = [];
  let preservedIndex = 0;

  // Replace script and style content with placeholders
  const withPlaceholders = html.replace(
    /<(script|style)([^>]*)>([\s\S]*?)<\/\1>/gi,
    (_match, tag, attrs, content) => {
      const placeholder = `__PRESERVED_${preservedIndex}__`;
      preserved[preservedIndex] = `<${tag}${attrs}>${content}</${tag}>`;
      preservedIndex++;
      return placeholder;
    }
  );

  // Minify the HTML (excluding preserved content)
  let minified = withPlaceholders
    // Remove whitespace between tags
    .replace(/>\s+</g, "><")
    // Collapse multiple spaces to single space
    .replace(/[ \t]+/g, " ")
    // Remove spaces before closing tags
    .replace(/\s+>/g, ">")
    // Remove spaces after opening tags
    .replace(/<\s+/g, "<")
    // Remove leading/trailing whitespace
    .trim();

  // Restore preserved content
  preserved.forEach((content, index) => {
    minified = minified.replace(`__PRESERVED_${index}__`, content);
  });

  return minified;
};

/**
 *
 * @param {string} html
 * @returns {string}
 */
const prependDocType = (html) => {
  return `<!DOCTYPE html>${html}`;
};

/**
 *
 * @param {import("./index.js").Html} elem
 * @returns {string}
 */
const renderMain = (elem) => {
  switch (elem.t) {
    case "tag":
      return renderTag(elem);
    case "text":
      return renderText(elem);
    case "fragment":
      return renderFragment(elem);
  }
};

/**
 *
 * @param {import("./index.js").Tag} elem
 */
const renderTag = (elem) => {
  const attrsString = renderAttrs(elem.attrs);
  const childrenString = elem.children.map(renderMain).join("");
  const leadingTag = `${elem.tagName} ${attrsString}`.trim();
  return `<${leadingTag}>${childrenString}</${elem.tagName}>`;
};

/**
 * @param {import("./index.js").Text} elem
 */
const renderText = (elem) => {
  return elem.text;
};

/**
 * @param {import("./index.js").Fragment} elem
 */
const renderFragment = (elem) => {
  return elem.children.map(renderMain).join("");
};

/**
 * @param {Record<string, unknown>} attrs
 * @returns {string}
 */
export const renderAttrs = (attrs) => {
  return Object.keys(attrs)
    .flatMap((key) => {
      const value = attrs[key];

      if (key === "style" && isRecord(value)) {
        return `${key}="${renderStyles(value)}"`;
      }

      if (typeof value === "string" || value === "number") {
        return `${key}="${value}"`;
      }

      return `${key}="${attrs[key]}"`;
    })
    .join(" ");
};

/**
 *
 * @param {Record<string, unknown>} styles
 * @returns {string}
 */
const renderStyles = (styles) => {
  return Object.entries(styles)
    .flatMap(([key, value]) => {
      if (key.trim().length === 0) {
        return [];
      }
      if (typeof value === "string" && value.trim().length > 0) {
        return [`${key.trim()}: ${value.trim()}`];
      }
      if (typeof value === "number") {
        return [`${key.trim()}: ${value}`];
      }
      return [];
    })
    .join("; ");
};

assertEquals(renderMain(tag("div")), "<div></div>", "Test 1");
assertEquals(renderMain(tag("div", {})), "<div></div>", "Test 1");
assertEquals(renderMain(tag("div", {}, [])), "<div></div>", "Test 1");
assertEquals(
  renderMain(tag("div", {}, [text("hello")])),
  "<div>hello</div>",
  "Test 1"
);
assertEquals(renderStyles({ padding: "16px" }), "padding: 16px", "Test 2");
assertEquals(renderStyles({ padding: "" }), "", "Test 2");
assertEquals(renderStyles({ padding: undefined }), "", "Test 2");
assertEquals(
  renderStyles({ padding: "16px", color: "blue" }),
  "padding: 16px; color: blue",
  "Test 2"
);
