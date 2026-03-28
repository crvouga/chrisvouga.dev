export const asserts = (condition: boolean, message: string): void => {
  if (!condition) {
    console.error(message);
    throw new Error(message);
  }
};

export const assertEquals = <T>(left: T, right: T, message: string): void => {
  if (left !== right) {
    console.error("assertEquals FAILED", {
      expected: right,
      actual: left,
    });
    throw new Error(message);
  }
};
