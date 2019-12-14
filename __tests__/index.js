const rulesEngine = require("../src");

test("no arguments", function() {
  return expect(rulesEngine()).rejects.toMatchInlineSnapshot(
    `[SyntaxError: \`validators\` must be set]`
  );
});
