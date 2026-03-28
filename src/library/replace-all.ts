/**
 * @param {string} str
 * @param {string} search
 * @param {string} replace
 * @returns {string}
 */
export const replaceAll = (str, search, replace) => {
  return str.split(search).join(replace);
};

const testCases = [
  {
    str: "hello world",
    search: "world",
    replace: "there",
    expected: "hello there",
  },
  {
    str: "foo bar foo",
    search: "foo",
    replace: "baz",
    expected: "baz bar baz",
  },
  {
    str: "123-456-789",
    search: "-",
    replace: ":",
    expected: "123:456:789",
  },
  {
    str: "no match here",
    search: "xyz",
    replace: "abc",
    expected: "no match here",
  },
  {
    str: "",
    search: "a",
    replace: "b",
    expected: "",
  },
];

testCases.forEach(({ str, search, replace, expected }, index) => {
  const result = replaceAll(str, search, replace);
  if (result !== expected) {
    throw new Error(
      `Test case ${
        index + 1
      } failed: expected "${expected}", but got "${result}"`
    );
  }
});
