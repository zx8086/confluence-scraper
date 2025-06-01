import { test, expect, mock } from "bun:test";

const mockPageMetadata = {
  id: "123456",
  title: "Test Page",
  space: { key: "TEST" },
  version: {
    when: "2024-01-01T00:00:00.000Z",
    by: { displayName: "Test User" }
  }
};

test("parseContentHtml - basic HTML parsing", async () => {
  const { parseContentHtml } = await import("../src/index.ts");
  
  const htmlContent = `
    <div>
      <h1>Main Title</h1>
      <p>This is a paragraph with some text.</p>
      <table>
        <tr><th>Header 1</th><th>Header 2</th></tr>
        <tr><td>Cell 1</td><td>Cell 2</td></tr>
      </table>
      <a href="https://example.com">Example Link</a>
      <img src="image.jpg" alt="Test Image" />
    </div>
  `;

  const result = parseContentHtml(htmlContent);

  expect(result.textContent).toContain("Main Title");
  expect(result.textContent).toContain("This is a paragraph");
  expect(result.tables).toHaveLength(1);
  expect(result.tables[0]).toEqual([
    ["Header 1", "Header 2"],
    ["Cell 1", "Cell 2"]
  ]);
  expect(result.links).toHaveLength(1);
  expect(result.links[0]).toEqual({
    text: "Example Link",
    href: "https://example.com"
  });
  expect(result.images).toHaveLength(1);
  expect(result.images[0]).toEqual({
    src: "image.jpg",
    alt: "Test Image"
  });
});

test("parseContentHtml - empty content", async () => {
  const { parseContentHtml } = await import("../src/index.ts");
  
  const result = parseContentHtml("");

  expect(result.textContent).toBe("");
  expect(result.tables).toEqual([]);
  expect(result.links).toEqual([]);
  expect(result.images).toEqual([]);
});

test("parseContentHtml - malformed HTML", async () => {
  const { parseContentHtml } = await import("../src/index.ts");
  
  const htmlContent = "<div><p>Unclosed paragraph<table><tr><td>Cell";

  const result = parseContentHtml(htmlContent);

  expect(result.textContent).toContain("Unclosed paragraph");
  expect(result.textContent).toContain("Cell");
});

test("parseContentHtml - complex table structure", async () => {
  const { parseContentHtml } = await import("../src/index.ts");
  
  const htmlContent = `
    <table>
      <thead>
        <tr><th>Name</th><th>Age</th><th>City</th></tr>
      </thead>
      <tbody>
        <tr><td>John</td><td>25</td><td>New York</td></tr>
        <tr><td>Jane</td><td>30</td><td>London</td></tr>
      </tbody>
    </table>
  `;

  const result = parseContentHtml(htmlContent);

  expect(result.tables).toHaveLength(1);
  expect(result.tables[0]).toEqual([
    ["Name", "Age", "City"],
    ["John", "25", "New York"],
    ["Jane", "30", "London"]
  ]);
});

test("extractVectorContent - basic content chunking", async () => {
  const { extractVectorContent } = await import("../src/index.ts");
  
  const htmlContent = `
    <div>
      <h1>Introduction</h1>
      <p>This is the introduction section with some content.</p>
      <h2>Details</h2>
      <p>This section contains detailed information about the topic.</p>
    </div>
  `;

  const result = extractVectorContent(htmlContent, mockPageMetadata);

  expect(result.length).toBeGreaterThan(0);
  expect(result[result.length - 1]?.type).toBe("metadata");
  
  const contentVectors = result.filter(v => v.type === "section");
  expect(contentVectors.length).toBeGreaterThan(0);
  
  contentVectors.forEach(vector => {
    expect(vector.id).toContain(mockPageMetadata.id);
    expect(vector.title).toBe(mockPageMetadata.title);
    expect(vector.pageId).toBe(mockPageMetadata.id);
    expect(vector.spaceKey).toBe(mockPageMetadata.space.key);
    expect(typeof vector.content).toBe("string");
    expect(vector.metadata.url).toContain(mockPageMetadata.space.key);
    expect(vector.metadata.lastUpdated).toBe(mockPageMetadata.version.when);
    expect(vector.metadata.author).toBe(mockPageMetadata.version.by.displayName);
  });
});

test("extractVectorContent - large content chunking", async () => {
  const { extractVectorContent } = await import("../src/index.ts");
  
  const longText = "This is a very long paragraph. ".repeat(100);
  const htmlContent = `<div><p>${longText}</p></div>`;

  const result = extractVectorContent(htmlContent, mockPageMetadata);

  expect(result.length).toBeGreaterThan(1);
  
  const contentVectors = result.filter(v => v.type === "section");
  expect(contentVectors.length).toBeGreaterThan(0);
  
  contentVectors.forEach(vector => {
    expect(vector.content.length).toBeGreaterThan(0);
  });
});

test("extractVectorContent - empty content", async () => {
  const { extractVectorContent } = await import("../src/index.ts");
  
  const result = extractVectorContent("", mockPageMetadata);

  expect(result.length).toBe(1);
  expect(result[0]?.type).toBe("metadata");
});

test("processTable - basic table processing", async () => {
  const { processTable } = await import("../src/index.ts");
  const { parse } = await import("node-html-parser");
  
  const tableHtml = `
    <table>
      <tr><th>Name</th><th>Value</th></tr>
      <tr><td>Item 1</td><td>100</td></tr>
      <tr><td>Item 2</td><td>200</td></tr>
    </table>
  `;
  
  const tableNode = parse(tableHtml).querySelector("table");
  const result = processTable(tableNode);

  expect(result).toContain("Table Headers: Name | Value");
  expect(result).toContain("Row: Item 1 | 100");
  expect(result).toContain("Row: Item 2 | 200");
});

test("processTable - table without headers", async () => {
  const { processTable } = await import("../src/index.ts");
  const { parse } = await import("node-html-parser");
  
  const tableHtml = `
    <table>
      <tr><td>Cell 1</td><td>Cell 2</td></tr>
      <tr><td>Cell 3</td><td>Cell 4</td></tr>
    </table>
  `;
  
  const tableNode = parse(tableHtml).querySelector("table");
  const result = processTable(tableNode);

  expect(result).toContain("Row: Cell 1 | Cell 2");
  expect(result).toContain("Row: Cell 3 | Cell 4");
  expect(result).not.toContain("Table Headers:");
});

test("processTable - empty table", async () => {
  const { processTable } = await import("../src/index.ts");
  const { parse } = await import("node-html-parser");
  
  const tableHtml = "<table></table>";
  const tableNode = parse(tableHtml).querySelector("table");
  const result = processTable(tableNode);

  expect(result).toBe("");
});
