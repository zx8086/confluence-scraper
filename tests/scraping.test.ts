import { test, expect, mock, beforeEach, spyOn } from "bun:test";
import fs from "node:fs/promises";

const mockFetch = mock();
global.fetch = mockFetch as any;

const mockPageResponse = {
  id: "123456",
  title: "Test Page",
  body: {
    storage: {
      value: "<div><h1>Test Content</h1><p>This is test content.</p></div>"
    }
  },
  space: {
    key: "TEST",
    name: "Test Space"
  },
  version: {
    number: 1,
    when: "2024-01-01T00:00:00.000Z",
    by: {
      displayName: "Test User"
    }
  }
};

const mockAttachmentsResponse = {
  results: [
    {
      id: "att123",
      title: "test-file.pdf",
      container: { id: "123456" },
      metadata: { mediaType: "application/pdf" }
    }
  ]
};

const mockSpacePagesResponse = {
  results: [
    { id: "page1", title: "Page 1", version: { number: 1 } },
    { id: "page2", title: "Page 2", version: { number: 1 } }
  ],
  size: 2
};

beforeEach(() => {
  mockFetch.mockClear();
  process.env.AUTH_METHOD = "basic";
  process.env.CONFLUENCE_HOST = "https://test.atlassian.net";
  process.env.CONFLUENCE_EMAIL = "test@example.com";
  process.env.CONFLUENCE_API_TOKEN = "test-token";
});

test("getPageContent - successful fetch", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(mockPageResponse)
  });

  const { getPageContent, createConfluenceClient } = await import("../src/index.ts");
  const client = createConfluenceClient();
  
  const result = await getPageContent(client, "123456");

  expect(result).toEqual(mockPageResponse);
  expect(mockFetch).toHaveBeenCalled();
});

test("getPageContent - API error", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 404
  });

  const { getPageContent, createConfluenceClient } = await import("../src/index.ts");
  const client = createConfluenceClient();
  
  await expect(getPageContent(client, "invalid")).rejects.toThrow("HTTP error! status: 404");
});

test("getPageAttachments - with attachments", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(mockAttachmentsResponse)
  });

  const { getPageAttachments, createConfluenceClient } = await import("../src/index.ts");
  const client = createConfluenceClient();
  
  const result = await getPageAttachments(client, "123456");

  expect(result).toEqual(mockAttachmentsResponse.results);
  expect(mockFetch).toHaveBeenCalled();
});

test("getPageAttachments - no attachments", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ results: [] })
  });

  const { getPageAttachments, createConfluenceClient } = await import("../src/index.ts");
  const client = createConfluenceClient();
  
  const result = await getPageAttachments(client, "123456");

  expect(result).toEqual([]);
});

test("getPageAttachments - API error", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 500
  });

  const { getPageAttachments, createConfluenceClient } = await import("../src/index.ts");
  const client = createConfluenceClient();
  
  const result = await getPageAttachments(client, "123456");

  expect(result).toEqual([]);
});

test("downloadAttachment - successful download", async () => {
  const mockAttachment = {
    id: "att123",
    title: "test-file.pdf",
    container: { id: "123456" }
  };

  const mockFileContent = new ArrayBuffer(100);

  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAttachment)
    })
    .mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockFileContent)
    });

  const mockWriteFile = spyOn(fs, "writeFile").mockResolvedValue(undefined);

  const { downloadAttachment, createConfluenceClient } = await import("../src/index.ts");
  const client = createConfluenceClient();
  
  const result = await downloadAttachment(client, "att123", "/tmp/test");

  expect(result).toContain("test-file.pdf");
  expect(mockWriteFile).toHaveBeenCalled();
  
  mockWriteFile.mockRestore();
});

test("downloadAttachment - download failure", async () => {
  const mockAttachment = {
    id: "att123",
    title: "test-file.pdf",
    container: { id: "123456" }
  };

  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAttachment)
    })
    .mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found"
    });

  const { downloadAttachment, createConfluenceClient } = await import("../src/index.ts");
  const client = createConfluenceClient();
  
  const result = await downloadAttachment(client, "att123", "/tmp/test");

  expect(result).toBeNull();
});

test("getAllPagesInSpace - single page response", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(mockSpacePagesResponse)
  });

  const { getAllPagesInSpace, createConfluenceClient } = await import("../src/index.ts");
  const client = createConfluenceClient();
  
  const result = await getAllPagesInSpace(client, "TEST");

  expect(result).toEqual(mockSpacePagesResponse.results as any);
  expect(mockFetch).toHaveBeenCalled();
});

test("getAllPagesInSpace - pagination", async () => {
  const firstPageResponse = {
    results: [{ id: "page1", title: "Page 1", version: { number: 1 } }],
    size: 1,
    _links: { next: "/next" }
  };

  const secondPageResponse = {
    results: [{ id: "page2", title: "Page 2", version: { number: 1 } }],
    size: 1
  };

  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(firstPageResponse)
    })
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(secondPageResponse)
    });

  const { getAllPagesInSpace, createConfluenceClient } = await import("../src/index.ts");
  const client = createConfluenceClient();
  
  const result = await getAllPagesInSpace(client, "TEST");

  expect(result).toHaveLength(2);
  expect(result[0]?.id).toBe("page1");
  expect(result[1]?.id).toBe("page2");
});

test("getAllPagesInSpace - API error", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 403
  });

  const { getAllPagesInSpace, createConfluenceClient } = await import("../src/index.ts");
  const client = createConfluenceClient();
  
  const result = await getAllPagesInSpace(client, "INVALID");

  expect(result).toEqual([]);
});

test("scrapePage - successful scraping", async () => {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPageResponse)
    })
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: [] })
    });

  const mockMkdir = spyOn(fs, "mkdir").mockResolvedValue(undefined);
  const mockWriteFile = spyOn(fs, "writeFile").mockResolvedValue(undefined);

  const { scrapePage, createConfluenceClient } = await import("../src/index.ts");
  const client = createConfluenceClient();
  
  const result = await scrapePage(client, "123456", "/tmp/test-output");

  expect(result).toEqual({
    pageId: "123456",
    title: "Test Page",
    outputDir: expect.stringContaining("Test Page")
  });

  expect(mockMkdir).toHaveBeenCalled();
  expect(mockWriteFile).toHaveBeenCalledTimes(5);
  
  mockMkdir.mockRestore();
  mockWriteFile.mockRestore();
});

test("scrapePage - page fetch failure", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 404
  });

  const { scrapePage, createConfluenceClient } = await import("../src/index.ts");
  const client = createConfluenceClient();
  
  const result = await scrapePage(client, "invalid");

  expect(result).toBeNull();
});
