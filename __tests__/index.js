const rulesEngine = require("../src");

describe("bad arguments", function() {
  test("no arguments", function() {
    function func() {
      rulesEngine();
    }

    expect(func).toThrowErrorMatchingInlineSnapshot(
      `"\`validators\` argument must be set"`
    );
  });

  describe("empty `validators` list", function() {
    test("`validators` as array", function() {
      function func() {
        rulesEngine([]);
      }

      expect(func).toThrowErrorMatchingInlineSnapshot(
        `"No \`validators\` are defined"`
      );
    });

    test("`validators` as object", function() {
      function func() {
        rulesEngine({});
      }

      expect(func).toThrowErrorMatchingInlineSnapshot(
        `"No \`validators\` are defined"`
      );
    });
  });

  test("no `rules` argument", function() {
    function func() {
      rulesEngine([[]]);
    }

    expect(func).toThrowErrorMatchingInlineSnapshot(
      `"\`rules\` argument must be set"`
    );
  });

  describe("empty `rules` list", function() {
    test("`rules` as array", function() {
      function func() {
        rulesEngine([[]], []);
      }

      expect(func).toThrowErrorMatchingInlineSnapshot(
        `"No \`rules\` are defined"`
      );
    });

    test("`rules` as object", function() {
      function func() {
        rulesEngine([[]], {});
      }

      expect(func).toThrowErrorMatchingInlineSnapshot(
        `"No \`rules\` are defined"`
      );
    });
  });

  test("no rules enabled", function() {
    function func() {
      rulesEngine([[]], [""]);
    }

    expect(func).toThrowErrorMatchingInlineSnapshot(`"No rules are enabled"`);
  });
});

test("enabled one rule", function() {
  const validators = [["dumb", { run() {} }]];
  const rules = ["dumb"];

  const promise = Promise.all(rulesEngine(validators, rules));

  return expect(promise).resolves.toMatchInlineSnapshot(`
                Array [
                  Object {
                    "dependsOn": undefined,
                    "name": "dumb",
                    "result": undefined,
                  },
                ]
            `);
});

test("circular reference", function() {
  const validators = [["dumb", { dependsOn: "dumb" }]];
  const rules = ["dumb"];

  const promise = Promise.all(rulesEngine(validators, rules));

  return expect(promise).rejects.toMatchInlineSnapshot(`
                Object {
                  "error": [SyntaxError: Circular reference between rules 'dumb'],
                }
            `);
});

describe("rules dependencies", function() {
  test("succesful", function() {
    const validators = [
      ["parent", { run() {} }],
      ["child", { dependsOn: "parent", run() {} }]
    ];
    const rules = ["parent", "child"];

    const promise = Promise.all(rulesEngine(validators, rules));

    return expect(promise).resolves.toMatchInlineSnapshot(`
              Array [
                Object {
                  "dependsOn": undefined,
                  "name": "parent",
                  "result": undefined,
                },
                Object {
                  "dependsOn": "parent",
                  "name": "child",
                  "result": undefined,
                },
              ]
            `);
  });

  test("failed", function() {
    const validators = [
      [
        "parent",
        {
          run() {
            throw new Error();
          }
        }
      ],
      ["child", { dependsOn: "parent", run() {} }]
    ];
    const rules = ["parent", "child"];

    const promise = Promise.allSettled(rulesEngine(validators, rules));

    return expect(promise).resolves.toMatchInlineSnapshot(`
              Array [
                Object {
                  "reason": Object {
                    "dependsOn": undefined,
                    "error": [Error],
                    "name": "parent",
                  },
                  "status": "rejected",
                },
                Object {
                  "reason": Object {
                    "dependsOn": "parent",
                    "name": "child",
                    "unsatisfied": true,
                  },
                  "status": "rejected",
                },
              ]
            `);
  });
});
