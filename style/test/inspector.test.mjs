import test from "node:test";
import assert from "node:assert/strict";

test("shouldInspectElement keeps only visible non-zero elements", async () => {
  const { shouldInspectElement } = await import("../src/shared/inspector.js");

  assert.equal(
    shouldInspectElement({
      tagName: "DIV",
      rect: { width: 120, height: 44 },
      style: { display: "block", visibility: "visible", opacity: "1" }
    }),
    true
  );
  assert.equal(
    shouldInspectElement({
      tagName: "SPAN",
      rect: { width: 0, height: 20 },
      style: { display: "inline", visibility: "visible", opacity: "1" }
    }),
    false
  );
  assert.equal(
    shouldInspectElement({
      tagName: "SCRIPT",
      rect: { width: 120, height: 44 },
      style: { display: "block", visibility: "visible", opacity: "1" }
    }),
    false
  );
});

test("metric labels prefer matching class tokens with computed values", async () => {
  const { createMetricRows } = await import("../src/shared/inspector.js");

  const rows = createMetricRows(
    { className: "panel gap-xl p-md text-brand" },
    {
      paddingTop: "16px",
      paddingRight: "16px",
      paddingBottom: "16px",
      paddingLeft: "16px",
      marginTop: "0px",
      marginRight: "0px",
      marginBottom: "0px",
      marginLeft: "0px",
      gap: "12px",
      rowGap: "12px",
      columnGap: "12px",
      width: "240px",
      height: "80px"
    },
    { showPadding: true, showMargin: false, showSize: true, showColor: false }
  );

  assert.equal(rows.some((row) => row.value.includes("gap-xl") && row.value.includes("12px")), true);
  assert.equal(rows.some((row) => row.value.includes("p-md") && row.value.includes("16px")), true);
  assert.equal(rows.some((row) => row.value.includes("240") && row.value.includes("80")), true);
});

test("metric labels show arbitrary em tokens with the computed base font size", async () => {
  const { createMetricRows } = await import("../src/shared/inspector.js");

  const rows = createMetricRows(
    { className: "field p-[0.25em]" },
    {
      fontSize: "14px",
      paddingTop: "3.5px",
      paddingRight: "3.5px",
      paddingBottom: "3.5px",
      paddingLeft: "3.5px",
      marginTop: "0px",
      marginRight: "0px",
      marginBottom: "0px",
      marginLeft: "0px",
      gap: "normal",
      rowGap: "normal",
      columnGap: "normal",
      width: "120px",
      height: "32px"
    },
    { showPadding: true, showMargin: false, showSize: false, showColor: false }
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].value.includes("p-[0.25em]"), true);
  assert.equal(rows[0].value.includes("3.5px"), true);
  assert.equal(rows[0].value.includes("font 14px"), true);
});

test("color mode returns color rows with color values", async () => {
  const { createMetricRows } = await import("../src/shared/inspector.js");

  const rows = createMetricRows(
    { className: "card bg-surface border-subtle shadow-elevated text-brand p-md" },
    {
      paddingTop: "16px",
      paddingRight: "16px",
      paddingBottom: "16px",
      paddingLeft: "16px",
      color: "rgb(10, 20, 30)",
      backgroundColor: "rgb(240, 241, 242)",
      borderTopColor: "rgb(200, 201, 202)",
      borderTopStyle: "solid",
      borderTopWidth: "1px",
      boxShadow: "rgba(1, 2, 3, 0.25) 0px 4px 12px",
      backgroundImage: "none"
    },
    { showPadding: true, showMargin: true, showSize: true, showColor: true }
  );

  assert.deepEqual(
    rows.map((row) => row.label),
    ["text", "bg", "border", "shadow"]
  );
  assert.equal(rows.every((row) => row.type === "color"), true);
  assert.equal(rows.some((row) => row.value.includes("p-md")), false);
  assert.equal(rows[0].value.includes("text-brand"), true);
  assert.equal(rows[0].value.includes("rgb(10, 20, 30)"), true);
  assert.equal(rows[1].value.includes("bg-surface"), true);
  assert.equal(rows[1].value.includes("rgb(240, 241, 242)"), true);
  assert.equal(rows[2].value.includes("border-subtle"), true);
  assert.equal(rows[2].value.includes("rgb(200, 201, 202)"), true);
  assert.equal(rows[3].value.includes("shadow-elevated"), true);
  assert.equal(rows[3].value.includes("rgb(1, 2, 3)"), true);
  assert.equal(rows[3].value.includes("#010203"), true);
  assert.equal(rows[3].raw.includes("0px 4px 12px"), true);
});

test("color mode includes css variables, rgb, hex, and pseudo-state colors", async () => {
  const { createMetricRows } = await import("../src/shared/inspector.js");
  const styleRule = (selectorText, declarations) => ({
    selectorText,
    style: {
      getPropertyValue(property) {
        return declarations[property] || "";
      }
    }
  });
  const element = {
    className: "card text-brand bg-surface hover:bg-surface-hover active:border-brand",
    ownerDocument: {
      documentElement: {
        style: {
          getPropertyValue(property) {
            return {
              "--color-brand": "rgb(10, 20, 30)",
              "--color-surface": "rgb(240, 241, 242)",
              "--color-surface-hover": "rgb(220, 221, 222)",
              "--color-brand-active": "rgb(1, 2, 3)"
            }[property] || "";
          }
        }
      },
      styleSheets: [
        {
          cssRules: [
            styleRule(".text-brand", { color: "var(--color-brand)" }),
            styleRule(".bg-surface", { "background-color": "var(--color-surface)" }),
            styleRule(".hover\\:bg-surface-hover:hover", { "background-color": "var(--color-surface-hover)" }),
            styleRule(".active\\:border-brand:active", { "border-color": "var(--color-brand-active)" })
          ]
        }
      ]
    }
  };

  const rows = createMetricRows(
    element,
    {
      color: "rgb(10, 20, 30)",
      backgroundColor: "rgb(240, 241, 242)",
      borderTopColor: "transparent",
      borderTopStyle: "none",
      borderTopWidth: "0px",
      boxShadow: "none",
      backgroundImage: "none"
    },
    { showColor: true }
  );

  assert.equal(rows.some((row) => row.label === "text" && row.value.includes("--color-brand")), true);
  assert.equal(rows.some((row) => row.label === "text" && row.value.includes("#0a141e")), true);
  assert.equal(rows.some((row) => row.label === "bg" && row.value.includes("--color-surface")), true);
  assert.equal(rows.some((row) => row.state === "hover" && row.label === "bg" && row.value.includes("--color-surface-hover")), true);
  assert.equal(rows.some((row) => row.state === "active" && row.label === "border" && row.value.includes("#010203")), true);
});

test("color mode infers css variables by matching computed color values", async () => {
  const { createMetricRows } = await import("../src/shared/inspector.js");
  const variables = {
    "--color-brand": "rgb(10, 20, 30)",
    "--color-surface": "#f0f1f2"
  };
  const rootStyle = {
    0: "--color-brand",
    1: "--color-surface",
    length: 2,
    item(index) {
      return this[index];
    },
    getPropertyValue(property) {
      return variables[property] || "";
    }
  };

  const rows = createMetricRows(
    {
      className: "text-brand bg-surface",
      ownerDocument: {
        documentElement: { style: rootStyle },
        styleSheets: []
      }
    },
    {
      color: "rgb(10, 20, 30)",
      backgroundColor: "rgb(240, 241, 242)",
      borderTopColor: "transparent",
      borderTopStyle: "none",
      borderTopWidth: "0px",
      boxShadow: "none",
      backgroundImage: "none"
    },
    { showColor: true }
  );

  assert.equal(rows.some((row) => row.label === "text" && row.value.includes("--color-brand")), true);
  assert.equal(rows.some((row) => row.label === "bg" && row.value.includes("--color-surface")), true);
});

test("color mode lists every css variable name that resolves to the color", async () => {
  const { createMetricRows } = await import("../src/shared/inspector.js");
  const variables = {
    "--brand-text": "rgb(10, 20, 30)",
    "--color-brand": "rgb(10, 20, 30)",
    "--semantic-link": "#0a141e"
  };
  const rootStyle = {
    0: "--brand-text",
    1: "--color-brand",
    2: "--semantic-link",
    length: 3,
    item(index) {
      return this[index];
    },
    getPropertyValue(property) {
      return variables[property] || "";
    }
  };
  const styleRule = (selectorText, declarations) => ({
    selectorText,
    style: {
      getPropertyValue(property) {
        return declarations[property] || "";
      }
    }
  });

  const rows = createMetricRows(
    {
      className: "text-brand",
      ownerDocument: {
        documentElement: { style: rootStyle },
        styleSheets: [
          {
            cssRules: [styleRule(".text-brand", { color: "var(--brand-text)" })]
          }
        ]
      }
    },
    {
      color: "rgb(10, 20, 30)",
      backgroundColor: "transparent",
      borderTopColor: "transparent",
      borderTopStyle: "none",
      borderTopWidth: "0px",
      boxShadow: "none"
    },
    { showColor: true }
  );

  const textRow = rows.find((row) => row.label === "text");
  assert.equal(textRow.value.includes("--brand-text"), true);
  assert.equal(textRow.value.includes("--color-brand"), true);
  assert.equal(textRow.value.includes("--semantic-link"), true);
});

test("color mode reads hover and active color styles from matching css selectors", async () => {
  const { createMetricRows } = await import("../src/shared/inspector.js");
  const variables = {
    "--btn-hover-bg": "rgb(240, 241, 242)",
    "--btn-hover-text": "rgb(10, 20, 30)",
    "--btn-active-border": "rgb(1, 2, 3)"
  };
  const rootStyle = {
    0: "--btn-hover-bg",
    1: "--btn-hover-text",
    2: "--btn-active-border",
    length: 3,
    item(index) {
      return this[index];
    },
    getPropertyValue(property) {
      return variables[property] || "";
    }
  };
  const styleRule = (selectorText, declarations) => ({
    selectorText,
    style: {
      getPropertyValue(property) {
        return declarations[property] || "";
      }
    }
  });

  const rows = createMetricRows(
    {
      tagName: "BUTTON",
      className: "btn",
      matches(selector) {
        return selector === "button" || selector === ".btn";
      },
      ownerDocument: {
        documentElement: { style: rootStyle },
        styleSheets: [
          {
            cssRules: [
              styleRule("button:hover", {
                "background-color": "var(--btn-hover-bg)",
                color: "var(--btn-hover-text)"
              }),
              styleRule("button:active", {
                "border-color": "var(--btn-active-border)"
              })
            ]
          }
        ]
      }
    },
    {
      color: "rgb(40, 40, 40)",
      backgroundColor: "transparent",
      borderTopColor: "transparent",
      borderTopStyle: "none",
      borderTopWidth: "0px",
      boxShadow: "none"
    },
    { showColor: true }
  );

  assert.equal(rows.some((row) => row.state === "hover" && row.label === "bg" && row.value.includes("--btn-hover-bg")), true);
  assert.equal(rows.some((row) => row.state === "hover" && row.label === "text" && row.value.includes("--btn-hover-text")), true);
  assert.equal(rows.some((row) => row.state === "active" && row.label === "border" && row.value.includes("--btn-active-border")), true);
});

test("color mode reads background color from matching css declarations", async () => {
  const { createMetricRows } = await import("../src/shared/inspector.js");
  const rootStyle = {
    0: "--surface-bg",
    length: 1,
    item(index) {
      return this[index];
    },
    getPropertyValue(property) {
      return property === "--surface-bg" ? "rgb(240, 241, 242)" : "";
    }
  };
  const styleRule = (selectorText, declarations) => ({
    selectorText,
    style: {
      getPropertyValue(property) {
        return declarations[property] || "";
      }
    }
  });

  const rows = createMetricRows(
    {
      className: "card",
      ownerDocument: {
        documentElement: { style: rootStyle },
        styleSheets: [
          {
            cssRules: [styleRule(".card", { "background-color": "var(--surface-bg)" })]
          }
        ]
      }
    },
    {
      color: "rgb(10, 20, 30)",
      backgroundColor: "rgba(0, 0, 0, 0)",
      borderTopColor: "transparent",
      borderTopStyle: "none",
      borderTopWidth: "0px",
      boxShadow: "none"
    },
    { showColor: true }
  );

  assert.equal(rows.some((row) => row.label === "bg" && row.value.includes("--surface-bg")), true);
  assert.equal(rows.some((row) => row.label === "bg" && row.value.includes("#f0f1f2")), true);
});

test("color mode keeps text color and ignores invisible border", async () => {
  const { createMetricRows } = await import("../src/shared/inspector.js");

  const rows = createMetricRows(
    { className: "card text-brand" },
    {
      color: "rgb(10, 20, 30)",
      backgroundColor: "transparent",
      borderTopColor: "rgb(10, 20, 30)",
      borderTopStyle: "none",
      borderTopWidth: "0px",
      boxShadow: "none",
      backgroundImage: "none"
    },
    { showColor: true }
  );

  assert.deepEqual(
    rows.map((row) => row.label),
    ["text"]
  );
});

test("createBoxModel returns computed-style side values for figma-like layers", async () => {
  const { createBoxModel } = await import("../src/shared/inspector.js");

  const model = createBoxModel(
    { className: "card p-md mt-xl gap-xl border-subtle" },
    {
      width: "240px",
      height: "80px",
      paddingTop: "16px",
      paddingRight: "12px",
      paddingBottom: "16px",
      paddingLeft: "12px",
      marginTop: "24px",
      marginRight: "0px",
      marginBottom: "8px",
      marginLeft: "0px",
      borderTopWidth: "1px",
      borderRightWidth: "1px",
      borderBottomWidth: "1px",
      borderLeftWidth: "1px",
      borderTopStyle: "solid",
      borderRightStyle: "solid",
      borderBottomStyle: "solid",
      borderLeftStyle: "solid",
      rowGap: "12px",
      columnGap: "12px"
    },
    { showPadding: true, showMargin: true, showSize: true, showBorder: true, showGap: true }
  );

  assert.equal(model.size.value.includes("240"), true);
  assert.equal(model.size.value.includes("80"), true);
  assert.equal(model.padding.top.includes("p-md"), true);
  assert.equal(model.padding.top.includes("16px"), true);
  assert.equal(model.padding.right, "12px");
  assert.equal(model.margin.top.includes("mt-xl"), true);
  assert.equal(model.margin.top.includes("24px"), true);
  assert.equal(model.border.top.includes("border-subtle"), true);
  assert.equal(model.border.top.includes("1px"), true);
  assert.equal(model.gap.row.includes("gap-xl"), true);
  assert.equal(model.gap.row.includes("12px"), true);
});

test("dedupeRepeatedElements keeps one repeated list-like element per parent signature", async () => {
  const { dedupeRepeatedElements } = await import("../src/shared/inspector.js");

  const parent = { tagName: "UL", className: "result-list" };
  const first = { tagName: "LI", className: "result-item", parentElement: parent };
  const second = { tagName: "LI", className: "result-item", parentElement: parent };
  const different = { tagName: "BUTTON", className: "result-item", parentElement: parent };

  const result = dedupeRepeatedElements([
    { element: first, id: "first" },
    { element: second, id: "second" },
    { element: different, id: "button" }
  ]);

  assert.deepEqual(
    result.map((item) => item.id),
    ["first", "button"]
  );
});

test("dedupeRepeatedElements keeps one visually similar metric item per parent", async () => {
  const { dedupeRepeatedElements } = await import("../src/shared/inspector.js");

  const parent = { tagName: "DIV", className: "form-panel" };
  const first = { tagName: "DIV", className: "field-row", parentElement: parent };
  const second = { tagName: "DIV", className: "field-row", parentElement: parent };
  const differentMetric = { tagName: "DIV", className: "field-row", parentElement: parent };
  const sameShapeDifferentParent = {
    tagName: "DIV",
    className: "field-row",
    parentElement: { tagName: "DIV", className: "other-panel" }
  };

  const repeatedRows = [
    { type: "padding", label: "padding", value: "p-[0.25em] (3.5px)" },
    { type: "margin", label: "margin", value: "3px 0px" }
  ];

  const result = dedupeRepeatedElements([
    { element: first, rect: { width: 242, height: 31 }, rows: repeatedRows, id: "first" },
    { element: second, rect: { width: 244, height: 32 }, rows: repeatedRows, id: "second" },
    {
      element: differentMetric,
      rect: { width: 244, height: 32 },
      rows: [{ type: "padding", label: "padding", value: "8px" }],
      id: "differentMetric"
    },
    {
      element: sameShapeDifferentParent,
      rect: { width: 244, height: 32 },
      rows: repeatedRows,
      id: "differentParent"
    }
  ]);

  assert.deepEqual(
    result.map((item) => item.id),
    ["first", "differentMetric", "differentParent"]
  );
});

test("planLabelPlacements moves labels to another side when top would overlap", async () => {
  const { planLabelPlacements } = await import("../src/shared/inspector.js");

  const placements = planLabelPlacements(
    [
      {
        rect: { left: 80, top: 80, width: 160, height: 28 },
        label: "padding: 8px"
      },
      {
        rect: { left: 82, top: 82, width: 158, height: 28 },
        label: "padding: 8px"
      }
    ],
    {
      viewportWidth: 420,
      viewportHeight: 260,
      labelSize: 11
    }
  );

  assert.equal(placements.length, 2);
  assert.equal(placements[0].position, "top");
  assert.notEqual(placements[1].position, "top");
  assert.equal(
    placements[0].left < placements[1].left + placements[1].width &&
      placements[0].left + placements[0].width > placements[1].left &&
      placements[0].top < placements[1].top + placements[1].height &&
      placements[0].top + placements[0].height > placements[1].top,
    false
  );
});

test("planLabelPlacements keeps selected labels outside the selected boundary when space is available", async () => {
  const { planLabelPlacements } = await import("../src/shared/inspector.js");

  const boundary = { left: 100, top: 60, width: 220, height: 280 };
  const placements = planLabelPlacements(
    [
      {
        rect: { left: 130, top: 90, width: 80, height: 24 },
        label: "size: 80x24"
      },
      {
        rect: { left: 135, top: 125, width: 120, height: 28 },
        label: "padding: 8px\nsize: 120x28"
      },
      {
        rect: { left: 150, top: 168, width: 150, height: 32 },
        label: "gap: 8px\nsize: 150x32"
      }
    ],
    {
      viewportWidth: 620,
      viewportHeight: 420,
      labelSize: 11,
      avoidRect: boundary
    }
  );

  assert.equal(placements.length, 3);
  assert.equal(
    placements.every(
      (placement) =>
        placement.left + placement.width <= boundary.left ||
        placement.left >= boundary.left + boundary.width ||
        placement.top + placement.height <= boundary.top ||
        placement.top >= boundary.top + boundary.height
    ),
    true
  );
});
