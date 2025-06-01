import { test, expect, mock } from "bun:test";
import { ConfluenceClient } from "confluence.js";

const originalEnv = process.env;

function mockEnv(envVars: Record<string, string>) {
  process.env = { ...originalEnv, ...envVars };
}

function restoreEnv() {
  process.env = originalEnv;
}

test("createConfluenceClient - basic auth", async () => {
  mockEnv({
    AUTH_METHOD: "basic",
    CONFLUENCE_HOST: "https://test.atlassian.net",
    CONFLUENCE_EMAIL: "test@example.com",
    CONFLUENCE_API_TOKEN: "test-token"
  });

  const { createConfluenceClient } = await import("../src/index.ts");
  const client = createConfluenceClient();
  
  expect(client).toBeInstanceOf(ConfluenceClient);
  restoreEnv();
});

test("createConfluenceClient - oauth2 auth", async () => {
  mockEnv({
    AUTH_METHOD: "oauth2",
    CONFLUENCE_HOST: "https://test.atlassian.net",
    CONFLUENCE_ACCESS_TOKEN: "oauth-token"
  });

  const { createConfluenceClient } = await import("../src/index.ts");
  const client = createConfluenceClient();
  
  expect(client).toBeInstanceOf(ConfluenceClient);
  restoreEnv();
});

test("createConfluenceClient - jwt auth", async () => {
  mockEnv({
    AUTH_METHOD: "jwt",
    CONFLUENCE_HOST: "https://test.atlassian.net",
    CONFLUENCE_JWT_ISSUER: "test-issuer",
    CONFLUENCE_JWT_SECRET: "test-secret",
    CONFLUENCE_JWT_EXPIRY: "300"
  });

  const { createConfluenceClient } = await import("../src/index.ts");
  const client = createConfluenceClient();
  
  expect(client).toBeInstanceOf(ConfluenceClient);
  restoreEnv();
});

test("createConfluenceClient - pat auth", async () => {
  mockEnv({
    AUTH_METHOD: "pat",
    CONFLUENCE_HOST: "https://test.atlassian.net",
    CONFLUENCE_PAT: "personal-access-token"
  });

  const { createConfluenceClient } = await import("../src/index.ts");
  const client = createConfluenceClient();
  
  expect(client).toBeInstanceOf(ConfluenceClient);
  restoreEnv();
});

test("createConfluenceClient - unsupported auth method", async () => {
  mockEnv({
    AUTH_METHOD: "invalid",
    CONFLUENCE_HOST: "https://test.atlassian.net"
  });

  const { createConfluenceClient } = await import("../src/index.ts");
  
  expect(() => createConfluenceClient()).toThrow();
  restoreEnv();
});

test("createConfluenceClient - default host", async () => {
  mockEnv({
    AUTH_METHOD: "basic",
    CONFLUENCE_EMAIL: "test@example.com",
    CONFLUENCE_API_TOKEN: "test-token"
  });
  
  delete process.env.CONFLUENCE_HOST;

  const { createConfluenceClient } = await import("../src/index.ts");
  const client = createConfluenceClient();
  
  expect(client).toBeInstanceOf(ConfluenceClient);
  restoreEnv();
});

test("createConfluenceClient - empty credentials", async () => {
  mockEnv({
    AUTH_METHOD: "basic",
    CONFLUENCE_HOST: "https://test.atlassian.net"
  });

  const { createConfluenceClient } = await import("../src/index.ts");
  const client = createConfluenceClient();
  
  expect(client).toBeInstanceOf(ConfluenceClient);
  restoreEnv();
});
