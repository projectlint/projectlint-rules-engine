const tasksEngine = require("../src");

describe("bad arguments", function() {
  test("no arguments", function() {
    function func() {
      tasksEngine();
    }

    expect(func).toThrowErrorMatchingInlineSnapshot(
      `"\`validators\` argument must be set"`
    );
  });

  describe("empty `validators` list", function() {
    test("`validators` as array", function() {
      function func() {
        tasksEngine([]);
      }

      expect(func).toThrowErrorMatchingInlineSnapshot(
        `"No \`validators\` are defined"`
      );
    });

    test("`validators` as object", function() {
      function func() {
        tasksEngine({});
      }

      expect(func).toThrowErrorMatchingInlineSnapshot(
        `"No \`validators\` are defined"`
      );
    });
  });

  test("no `rules` argument", function() {
    function func() {
      tasksEngine([[]]);
    }

    expect(func).toThrowErrorMatchingInlineSnapshot(
      `"\`rules\` argument must be set"`
    );
  });

  describe("empty `rules` list", function() {
    test("`rules` as array", function() {
      function func() {
        tasksEngine([[]], []);
      }

      expect(func).toThrowErrorMatchingInlineSnapshot(
        `"No \`rules\` are defined"`
      );
    });

    test("`rules` as object", function() {
      function func() {
        tasksEngine([[]], {});
      }

      expect(func).toThrowErrorMatchingInlineSnapshot(
        `"No \`rules\` are defined"`
      );
    });
  });

  test("no rules enabled", function() {
    function func() {
      tasksEngine([[]], [""]);
    }

    expect(func).toThrowErrorMatchingInlineSnapshot(`"No rules are enabled"`);
  });
});

test("enabled one rule", function() {
  const validators = [["dumb", { func() {} }]];
  const rules = ["dumb"];

  const result = tasksEngine(validators, rules);

  expect(result).toMatchInlineSnapshot(`
    Object {
      "dumb": Promise {},
    }
  `);

  const promise = Promise.all(Object.values(result));

  return expect(promise).resolves.toMatchInlineSnapshot(`
                Array [
                  undefined,
                ]
            `);
});

test("circular reference", function() {
  const validators = [["dumb", { dependsOn: "dumb" }]];
  const rules = ["dumb"];

  function func() {
    tasksEngine(validators, rules);
  }

  expect(func).toThrowErrorMatchingInlineSnapshot(
    `"Circular reference between rules 'dumb'"`
  );
});

describe("rules dependencies", function() {
  describe("succesful", function() {
    test("string dependency", function() {
      const validators = [
        ["parent", { func() {} }],
        ["child", { dependsOn: "parent", func() {} }]
      ];
      const rules = ["parent", "child"];

      const result = tasksEngine(validators, rules);

      expect(result).toMatchInlineSnapshot(`
        Object {
          "child": Promise {},
          "parent": Promise {},
        }
      `);

      const promise = Promise.all(Object.values(result));

      return expect(promise).resolves.toMatchInlineSnapshot(`
                Array [
                  undefined,
                  undefined,
                ]
              `);
    });

    test("array dependency", function() {
      const validators = [
        ["parent", { func() {} }],
        ["child", { dependsOn: ["parent"], func() {} }]
      ];
      const rules = ["parent", "child"];

      const result = tasksEngine(validators, rules);

      expect(result).toMatchInlineSnapshot(`
        Object {
          "child": Promise {},
          "parent": Promise {},
        }
      `);

      const promise = Promise.all(Object.values(result));

      return expect(promise).resolves.toMatchInlineSnapshot(`
                Array [
                  undefined,
                  undefined,
                ]
              `);
    });

    test("object dependency", function() {
      const validators = [
        ["parent", { func() {} }],
        ["child", { dependsOn: { parent: true }, func() {} }]
      ];
      const rules = ["parent", "child"];

      const result = tasksEngine(validators, rules);

      expect(result).toMatchInlineSnapshot(`
        Object {
          "child": Promise {},
          "parent": Promise {},
        }
      `);

      const promise = Promise.all(Object.values(result));

      return expect(promise).resolves.toMatchInlineSnapshot(`
                Array [
                  undefined,
                  undefined,
                ]
              `);
    });
  });

  describe("failed", function() {
    test("string dependency", function() {
      const validators = [
        [
          "parent",
          {
            func() {
              throw new Error();
            }
          }
        ],
        ["child", { dependsOn: "parent", func() {} }]
      ];
      const rules = ["parent", "child"];

      const result = tasksEngine(validators, rules);

      expect(result).toMatchInlineSnapshot(`
        Object {
          "child": Promise {},
          "parent": Promise {},
        }
      `);

      const promise = Promise.allSettled(Object.values(result));

      return expect(promise).resolves.toMatchInlineSnapshot(`
                Array [
                  Object {
                    "reason": [Error],
                    "status": "rejected",
                  },
                  Object {
                    "reason": [Unsatisfied],
                    "status": "rejected",
                  },
                ]
              `);
    });

    describe("object dependency", function() {
      test("shortcircuit", function() {
        const validators = [
          ["parent", { func() {} }],
          ["child", { dependsOn: { parent: true }, func() {} }]
        ];
        const rules = ["parent", "child"];

        const result = tasksEngine(validators, rules, { shortcircuit_or: true });

        expect(result).toMatchInlineSnapshot(`
          Object {
            "child": Promise {},
            "parent": Promise {},
          }
        `);

        const promise = Promise.allSettled(Object.values(result));

        return expect(promise).resolves.toMatchInlineSnapshot(`
                  Array [
                    Object {
                      "status": "fulfilled",
                      "value": undefined,
                    },
                    Object {
                      "status": "fulfilled",
                      "value": undefined,
                    },
                  ]
                `);
      });

      test("no shortcircuit", function() {
        const validators = [
          [
            "parent",
            {
              func() {
                throw new Error();
              }
            }
          ],
          ["child", { dependsOn: { parent: true }, func() {} }]
        ];
        const rules = ["parent", "child"];

        const result = tasksEngine(validators, rules);

        expect(result).toMatchInlineSnapshot(`
          Object {
            "child": Promise {},
            "parent": Promise {},
          }
        `);

        const promise = Promise.allSettled(Object.values(result));

        return expect(promise).resolves.toMatchInlineSnapshot(`
                  Array [
                    Object {
                      "reason": [Error],
                      "status": "rejected",
                    },
                    Object {
                      "reason": [Unsatisfied],
                      "status": "rejected",
                    },
                  ]
                `);
      });
    });
  });
});
