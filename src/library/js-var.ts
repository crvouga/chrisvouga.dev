// @ts-check

import { assertEquals } from "./test.js";

/**
 * Converts a string to a JavaScript variable safe format
 * by converting kebab-case or snake_case to PascalCase
 *
 * @param {string} str - The string to convert
 * @returns {string} - The JavaScript variable safe string
 */
export const stringToJsVarSafe = (str) => {
  if (!str) return "";

  // Replace hyphens and underscores with spaces, then capitalize each word
  return str
    .split(/[-_\s.]/)
    .map((word) => {
      if (!word) return "";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join("");
};

// Tests
assertEquals(stringToJsVarSafe("my-app"), "MyApp", "Kebab case to PascalCase");
assertEquals(stringToJsVarSafe("my_app"), "MyApp", "Snake case to PascalCase");
assertEquals(
  stringToJsVarSafe("my app"),
  "MyApp",
  "Space separated to PascalCase"
);
assertEquals(stringToJsVarSafe("myApp"), "Myapp", "camelCase to PascalCase");
assertEquals(
  stringToJsVarSafe("my-awesome-app"),
  "MyAwesomeApp",
  "Multi-word kebab case"
);
assertEquals(
  stringToJsVarSafe("my_awesome_app"),
  "MyAwesomeApp",
  "Multi-word snake case"
);
assertEquals(stringToJsVarSafe(""), "", "Empty string");
assertEquals(stringToJsVarSafe("a-b-c"), "ABC", "Single letters");
assertEquals(
  stringToJsVarSafe("a_b_c"),
  "ABC",
  "Single letters with underscores"
);
assertEquals(
  stringToJsVarSafe("project-card-media-image"),
  "ProjectCardMediaImage",
  "Complex kebab case"
);
assertEquals(
  stringToJsVarSafe("my.app"),
  "MyApp",
  "Period separated to PascalCase"
);
assertEquals(
  stringToJsVarSafe("my.awesome.app"),
  "MyAwesomeApp",
  "Multi-word period separated"
);
assertEquals(stringToJsVarSafe("a.b.c"), "ABC", "Single letters with periods");
