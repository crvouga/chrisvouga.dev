import { tag, text } from "./index";
import type { Html, Tag, Text, Fragment } from "./index";
import { isRecord } from "../is-record";
import { assertEquals } from "../test";

export const render = (elem: Html): string => {
  const html = renderMain(elem);
  const minified = minifyHtml(html);
  return prependDocType(minified);
};

/**
 * Minifies HTML by removing unnecessary whitespace.
 * Preserves content inside script and style tags.
 */
const minifyHtml = (html: string): string => {
  const preserved: string[] = [];
  let preservedIndex = 0;

  const withPlaceholders = html.replace(
    /<(script|style)([^>]*)>([\s\S]*?)<\/\1>/gi,
    (_match, tag, attrs, content) => {
      const placeholder = `__PRESERVED_${preservedIndex}__`;
      preserved[preservedIndex] = `<${tag}${attrs}>${content}</${tag}>`;
      preservedIndex++;
      return placeholder;
    },
  );

  let minified = withPlaceholders
    .replace(/>\s+</g, "><")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+>/g, ">")
    .replace(/<\s+/g, "<")
    .trim();

  preserved.forEach((content, index) => {
    minified = minified.replace(`__PRESERVED_${index}__`, content);
  });

  return minified;
};

const prependDocType = (html: string): string => {
  return `<!DOCTYPE html>${html}`;
};

const renderMain = (elem: Html): string => {
  switch (elem.t) {
    case "tag":
      return renderTag(elem);
    case "text":
      return renderText(elem);
    case "fragment":
      return renderFragment(elem);
  }
};

const renderTag = (elem: Tag): string => {
  const attrsString = renderAttrs(elem.attrs);
  const childrenString = elem.children.map(renderMain).join("");
  const leadingTag = `${elem.tagName} ${attrsString}`.trim();
  return `<${leadingTag}>${childrenString}</${elem.tagName}>`;
};

const renderText = (elem: Text): string => {
  return elem.text;
};

const renderFragment = (elem: Fragment): string => {
  return elem.children.map(renderMain).join("");
};

export const renderAttrs = (attrs: Record<string, unknown>): string => {
  return Object.keys(attrs)
    .flatMap((key) => {
      const value = attrs[key];

      if (key === "style" && isRecord(value)) {
        const styles = renderStyles(value).replace(/"/g, "&quot;");
        return `${key}="${styles}"`;
      }

      if (typeof value === "string") {
        const escaped = value.replace(/"/g, "&quot;");
        return `${key}="${escaped}"`;
      }

      if (typeof value === "number") {
        return `${key}="${value}"`;
      }

      return `${key}="${String(attrs[key]).replace(/"/g, "&quot;")}"`;
    })
    .join(" ");
};

const renderStyles = (styles: Record<string, unknown>): string => {
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
  "Test 1",
);
assertEquals(renderStyles({ padding: "16px" }), "padding: 16px", "Test 2");
assertEquals(renderStyles({ padding: "" }), "", "Test 2");
assertEquals(renderStyles({ padding: undefined }), "", "Test 2");
assertEquals(
  renderStyles({ padding: "16px", color: "blue" }),
  "padding: 16px; color: blue",
  "Test 2",
);
