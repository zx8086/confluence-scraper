import { test, expect, mock, spyOn } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";

test("sanitizeFilename - removes invalid characters", async () => {
  const { sanitizeFilename } = await import("../src/index.ts");
  
  expect(sanitizeFilename("file/name")).toBe("file-name");
  expect(sanitizeFilename("file\\name")).toBe("file-name");
  expect(sanitizeFilename("file?name")).toBe("file-name");
  expect(sanitizeFilename("file%name")).toBe("file-name");
  expect(sanitizeFilename("file*name")).toBe("file-name");
  expect(sanitizeFilename("file:name")).toBe("file-name");
  expect(sanitizeFilename("file|name")).toBe("file-name");
  expect(sanitizeFilename('file"name')).toBe("file-name");
  expect(sanitizeFilename("file<name")).toBe("file-name");
  expect(sanitizeFilename("file>name")).toBe("file-name");
});

test("sanitizeFilename - preserves valid characters", async () => {
  const { sanitizeFilename } = await import("../src/index.ts");
  
  expect(sanitizeFilename("valid-filename.txt")).toBe("valid-filename.txt");
  expect(sanitizeFilename("file_name_123")).toBe("file_name_123");
  expect(sanitizeFilename("file.name.ext")).toBe("file.name.ext");
});

test("sanitizeFilename - handles empty string", async () => {
  const { sanitizeFilename } = await import("../src/index.ts");
  
  expect(sanitizeFilename("")).toBe("");
});

test("sanitizeFilename - handles multiple invalid characters", async () => {
  const { sanitizeFilename } = await import("../src/index.ts");
  
  expect(sanitizeFilename("file/\\?%*:|\"<>name")).toBe("file----------name");
});

test("saveContentToFile - successful save", async () => {
  const mockMkdir = spyOn(fs, "mkdir").mockResolvedValue(undefined);
  const mockWriteFile = spyOn(fs, "writeFile").mockResolvedValue(undefined);

  const { saveContentToFile } = await import("../src/index.ts");
  
  const result = await saveContentToFile("test content", "/tmp/test/file.txt");

  expect(result).toBe("/tmp/test/file.txt");
  expect(mockMkdir).toHaveBeenCalledWith("/tmp/test", { recursive: true });
  expect(mockWriteFile).toHaveBeenCalledWith("/tmp/test/file.txt", "test content");
  
  mockMkdir.mockRestore();
  mockWriteFile.mockRestore();
});

test("saveContentToFile - directory creation failure", async () => {
  const mockMkdir = spyOn(fs, "mkdir").mockRejectedValue(new Error("Permission denied"));

  const { saveContentToFile } = await import("../src/index.ts");
  
  const result = await saveContentToFile("test content", "/invalid/path/file.txt");

  expect(result).toBeNull();
  
  mockMkdir.mockRestore();
});

test("saveContentToFile - file write failure", async () => {
  const mockMkdir = spyOn(fs, "mkdir").mockResolvedValue(undefined);
  const mockWriteFile = spyOn(fs, "writeFile").mockRejectedValue(new Error("Disk full"));

  const { saveContentToFile } = await import("../src/index.ts");
  
  const result = await saveContentToFile("test content", "/tmp/test/file.txt");

  expect(result).toBeNull();
  
  mockMkdir.mockRestore();
  mockWriteFile.mockRestore();
});

test("fetchDirectly - successful request", async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    AUTH_METHOD: "basic",
    CONFLUENCE_HOST: "https://test.atlassian.net",
    CONFLUENCE_EMAIL: "test@example.com",
    CONFLUENCE_API_TOKEN: "test-token"
  };

  const mockResponse = { id: "123", title: "Test" };
  const mockFetch = mock().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockResponse)
  });
  global.fetch = mockFetch as any;

  const { fetchDirectly } = await import("../src/index.ts");
  
  const result = await fetchDirectly("/content/123");

  expect(result).toEqual(mockResponse);
  expect(mockFetch).toHaveBeenCalled();
  process.env = originalEnv;
});

test("fetchDirectly - HTTP error", async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    AUTH_METHOD: "basic",
    CONFLUENCE_HOST: "https://test.atlassian.net",
    CONFLUENCE_EMAIL: "test@example.com",
    CONFLUENCE_API_TOKEN: "test-token"
  };

  const mockFetch = mock().mockResolvedValue({
    ok: false,
    status: 404
  });
  global.fetch = mockFetch as any;

  const { fetchDirectly } = await import("../src/index.ts");
  
  await expect(fetchDirectly("/content/invalid")).rejects.toThrow("HTTP error! status: 404");
  process.env = originalEnv;
});

test("fetchDirectly - with custom options", async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    AUTH_METHOD: "basic",
    CONFLUENCE_HOST: "https://test.atlassian.net",
    CONFLUENCE_EMAIL: "test@example.com",
    CONFLUENCE_API_TOKEN: "test-token"
  };

  const mockResponse = { success: true };
  const mockFetch = mock().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockResponse)
  });
  global.fetch = mockFetch as any;

  const { fetchDirectly } = await import("../src/index.ts");
  
  const customOptions = {
    method: "POST",
    headers: { "Custom-Header": "value" }
  };
  
  const result = await fetchDirectly("/content", customOptions);

  expect(result).toEqual(mockResponse);
  expect(mockFetch).toHaveBeenCalled();
  process.env = originalEnv;
});

test("validateConfiguration - missing environment variables", async () => {
  const originalEnv = process.env;
  process.env = {
    AUTH_METHOD: "basic",
    CONFLUENCE_HOST: "https://test.atlassian.net"
  };

  const mockClient = {
    space: {
      getSpace: mock().mockResolvedValue({ key: "TEST" })
    },
    content: {
      getContentById: mock().mockResolvedValue({ id: "123456" })
    }
  };

  const { validateConfiguration } = await import("../src/index.ts");
  
  const result = await validateConfiguration(mockClient);

  expect(result).toBe(false);
  process.env = originalEnv;
});

test("validateConfiguration - successful validation", async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    AUTH_METHOD: "basic",
    CONFLUENCE_HOST: "https://test.atlassian.net",
    CONFLUENCE_EMAIL: "test@example.com",
    CONFLUENCE_API_TOKEN: "test-token",
    CONFLUENCE_PAGE_ID: "123456",
    CONFLUENCE_SPACE_KEY: "TEST"
  };

  const mockClient = {
    space: {
      getSpace: mock().mockResolvedValue({
        key: "TEST",
        name: "Test Space"
      })
    },
    content: {
      getContentById: mock().mockResolvedValue({
        id: "123456",
        title: "Test Page",
        space: { key: "TEST" }
      })
    }
  };

  const { validateConfiguration } = await import("../src/index.ts");
  
  const result = await validateConfiguration(mockClient);

  expect(result).toBe(true);
  expect(mockClient.space.getSpace).toHaveBeenCalledWith({ spaceKey: "TEST" });
  expect(mockClient.content.getContentById).toHaveBeenCalledWith({
    id: "123456",
    expand: ["space"]
  });
  process.env = originalEnv;
});

test("validateConfiguration - API error", async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    AUTH_METHOD: "basic",
    CONFLUENCE_HOST: "https://test.atlassian.net",
    CONFLUENCE_EMAIL: "test@example.com",
    CONFLUENCE_API_TOKEN: "invalid-token",
    CONFLUENCE_SPACE_KEY: "TEST"
  };

  const mockClient = {
    space: {
      getSpace: mock().mockImplementation(async () => {
        throw new Error("Unauthorized");
      })
    },
    content: {
      getContentById: mock()
    }
  };

  const { validateConfiguration } = await import("../src/index.ts");
  
  const result = await validateConfiguration(mockClient);

  expect(result).toBe(false);
  process.env = originalEnv;
});

test("searchPages - successful search", async () => {
  const mockSearchResponse = {
    results: [
      { id: "page1", title: "Search Result 1" },
      { id: "page2", title: "Search Result 2" }
    ],
    size: 2,
    totalSize: 2,
    start: 0
  };

  const mockClient = {
    search: {
      search: mock().mockResolvedValue(mockSearchResponse)
    }
  };

  const { searchPages } = await import("../src/index.ts");
  
  const result = await searchPages(mockClient, "test query");

  expect(result).toEqual(mockSearchResponse.results);
  expect(mockClient.search.search).toHaveBeenCalledWith({
    cql: 'text ~ "test query"',
    start: 0,
    limit: 50,
    expand: ["version"]
  });
});

test("searchPages - search with pagination", async () => {
  const firstPageResponse = {
    results: [{ id: "page1", title: "Result 1" }],
    size: 1,
    totalSize: 2,
    start: 0
  };

  const secondPageResponse = {
    results: [{ id: "page2", title: "Result 2" }],
    size: 1,
    totalSize: 2,
    start: 1
  };

  const mockClient = {
    search: {
      search: mock()
        .mockResolvedValueOnce(firstPageResponse)
        .mockResolvedValueOnce(secondPageResponse)
    }
  };

  const { searchPages } = await import("../src/index.ts");
  
  const result = await searchPages(mockClient, "test query", 0, 1);

  expect(result).toHaveLength(2);
  expect(result[0].id).toBe("page1");
  expect(result[1].id).toBe("page2");
});

test("searchPages - search error", async () => {
  const mockClient = {
    search: {
      search: mock().mockRejectedValue(new Error("Search failed"))
    }
  };

  const { searchPages } = await import("../src/index.ts");
  
  const result = await searchPages(mockClient, "test query");

  expect(result).toEqual([]);
});
