// src/index.ts
// A comprehensive script for scraping Atlassian Confluence Cloud Pages using Node.js/Bun runtime

// Install the following dependencies:
// bun add confluence.js dotenv node-html-parser

import { ConfluenceClient } from "confluence.js";
import { parse } from "node-html-parser";
import { config } from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";

// Load environment variables from .env file
config();

// Configuration
const CONFLUENCE_HOST =
  process.env.CONFLUENCE_HOST || "https://your-domain.atlassian.net";
const AUTH_METHOD = process.env.AUTH_METHOD || "basic"; // Options: basic, oauth2, jwt, pat

// Create the Confluence client based on authentication method
function createConfluenceClient() {
  const clientConfig = {
    host: CONFLUENCE_HOST,
    apiPrefix: "/wiki", // Default API prefix for Confluence Cloud
  };

  switch (AUTH_METHOD.toLowerCase()) {
    case "basic":
      // Using email and API token (recommended for Cloud)
      clientConfig.authentication = {
        basic: {
          email: process.env.CONFLUENCE_EMAIL,
          apiToken: process.env.CONFLUENCE_API_TOKEN,
        },
      };
      break;
    case "oauth2":
      clientConfig.authentication = {
        oauth2: {
          accessToken: process.env.CONFLUENCE_ACCESS_TOKEN,
        },
      };
      break;
    case "jwt":
      clientConfig.authentication = {
        jwt: {
          issuer: process.env.CONFLUENCE_JWT_ISSUER,
          secret: process.env.CONFLUENCE_JWT_SECRET,
          expiryTimeSeconds: parseInt(
            process.env.CONFLUENCE_JWT_EXPIRY || "180",
          ),
        },
      };
      break;
    case "pat":
      clientConfig.authentication = {
        personalAccessToken: process.env.CONFLUENCE_PAT,
      };
      break;
    default:
      throw new Error(`Unsupported authentication method: ${AUTH_METHOD}`);
  }

  return new ConfluenceClient(clientConfig);
}

// Helper function to sanitize content for file system
function sanitizeFilename(name) {
  return name.replace(/[/\\?%*:|"<>]/g, "-");
}

// Get page content with options to expand content
async function getPageContent(client, pageId) {
  try {
    // Using body-format=storage to get the raw storage format of the content
    // This includes the HTML/wiki markup with macros
    const response = await client.content.getContentById({
      id: pageId,
      expand: ["body.storage", "version", "space"],
    });

    return response;
  } catch (error) {
    console.error(`Error fetching page with ID ${pageId}:`, error.message);
    throw error;
  }
}

// Get all attachments for a page
async function getPageAttachments(client, pageId) {
  try {
    const response = await client.contentAttachments.getAttachments({
      id: pageId,
      expand: ["version"],
    });

    return response.results;
  } catch (error) {
    console.error(
      `Error fetching attachments for page ${pageId}:`,
      error.message,
    );
    return [];
  }
}

// Download an attachment
async function downloadAttachment(client, attachmentId, targetDir) {
  try {
    const attachment = await client.content.getContentById({
      id: attachmentId,
      expand: ["version"],
    });

    // Get the download link
    const downloadResponse = await client.contentAttachments.getAttachmentData({
      id: attachment.id,
    });

    // Create filename based on attachment title
    const filename = sanitizeFilename(attachment.title);
    const filePath = path.join(targetDir, filename);

    // Write the attachment to file
    await fs.writeFile(filePath, Buffer.from(downloadResponse));

    console.log(`Downloaded attachment: ${filename}`);
    return filePath;
  } catch (error) {
    console.error(
      `Error downloading attachment ${attachmentId}:`,
      error.message,
    );
    return null;
  }
}

// Parse the HTML content and extract relevant information
function parseContentHtml(htmlContent) {
  try {
    const root = parse(htmlContent);

    // Extract text content
    const textContent = root.textContent.trim();

    // Extract tables
    const tables = root.querySelectorAll("table").map((table) => {
      const rows = table.querySelectorAll("tr").map((row) => {
        return row
          .querySelectorAll("td, th")
          .map((cell) => cell.textContent.trim());
      });
      return rows;
    });

    // Extract links
    const links = root.querySelectorAll("a").map((link) => {
      return {
        text: link.textContent.trim(),
        href: link.getAttribute("href"),
      };
    });

    // Extract images
    const images = root.querySelectorAll("img").map((img) => {
      return {
        src: img.getAttribute("src"),
        alt: img.getAttribute("alt") || "",
      };
    });

    return {
      textContent,
      tables,
      links,
      images,
    };
  } catch (error) {
    console.error("Error parsing HTML content:", error.message);
    return {
      textContent: "",
      tables: [],
      links: [],
      images: [],
    };
  }
}

// Get all pages in a space
async function getAllPagesInSpace(client, spaceKey, startAt = 0, limit = 50) {
  try {
    const response = await client.content.getContent({
      spaceKey,
      type: "page",
      start: startAt,
      limit,
      expand: ["version"],
    });

    let allPages = [...response.results];

    // If there are more pages, fetch them recursively
    if (response.size + response.start < response.totalSize) {
      const nextPages = await getAllPagesInSpace(
        client,
        spaceKey,
        startAt + limit,
        limit,
      );
      allPages = [...allPages, ...nextPages];
    }

    return allPages;
  } catch (error) {
    console.error(`Error fetching pages in space ${spaceKey}:`, error.message);
    return [];
  }
}

// Search for pages containing specific text
async function searchPages(client, searchQuery, startAt = 0, limit = 50) {
  try {
    const response = await client.search.search({
      cql: `text ~ "${searchQuery}"`,
      start: startAt,
      limit,
      expand: ["version"],
    });

    let allResults = [...response.results];

    // If there are more results, fetch them recursively
    if (response.size + response.start < response.totalSize) {
      const nextResults = await searchPages(
        client,
        searchQuery,
        startAt + limit,
        limit,
      );
      allResults = [...allResults, ...nextResults];
    }

    return allResults;
  } catch (error) {
    console.error(`Error searching for "${searchQuery}":`, error.message);
    return [];
  }
}

// Save content to file
async function saveContentToFile(content, filePath) {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Write to file
    await fs.writeFile(filePath, content);
    console.log(`Content saved to ${filePath}`);
    return filePath;
  } catch (error) {
    console.error(`Error saving content to ${filePath}:`, error.message);
    return null;
  }
}

// Main function to scrape a Confluence page and save content
async function scrapePage(client, pageId, outputDir = "./output") {
  try {
    console.log(`Scraping page with ID: ${pageId}`);

    // Get page content
    const page = await getPageContent(client, pageId);
    const pageTitle = sanitizeFilename(page.title);
    const spaceKey = page.space ? page.space.key : "unknown";

    // Create directory for this page
    const pageDir = path.join(outputDir, spaceKey, pageTitle);
    await fs.mkdir(pageDir, { recursive: true });

    // Extract HTML content
    const htmlContent = page.body.storage.value;

    // Save original HTML
    await saveContentToFile(htmlContent, path.join(pageDir, "content.html"));

    // Parse HTML and extract information
    const parsedContent = parseContentHtml(htmlContent);

    // Save parsed content as JSON
    await saveContentToFile(
      JSON.stringify(parsedContent, null, 2),
      path.join(pageDir, "parsed_content.json"),
    );

    // Save plain text content
    await saveContentToFile(
      parsedContent.textContent,
      path.join(pageDir, "content.txt"),
    );

    // Download attachments
    const attachments = await getPageAttachments(client, pageId);

    // Create attachments directory
    const attachmentsDir = path.join(pageDir, "attachments");

    if (attachments.length > 0) {
      await fs.mkdir(attachmentsDir, { recursive: true });

      for (const attachment of attachments) {
        await downloadAttachment(client, attachment.id, attachmentsDir);
      }
    }

    // Save metadata
    const metadata = {
      id: page.id,
      title: page.title,
      version: page.version.number,
      createdBy: page.version.by ? page.version.by.displayName : "Unknown",
      createdAt: page.version.createdAt,
      spaceKey,
      attachments: attachments.map((att) => ({
        id: att.id,
        title: att.title,
        mediaType: att.metadata ? att.metadata.mediaType : "Unknown",
      })),
    };

    await saveContentToFile(
      JSON.stringify(metadata, null, 2),
      path.join(pageDir, "metadata.json"),
    );

    console.log(`Successfully scraped page "${page.title}" (ID: ${pageId})`);
    return {
      pageId,
      title: page.title,
      outputDir: pageDir,
    };
  } catch (error) {
    console.error(`Failed to scrape page ${pageId}:`, error.message);
    return null;
  }
}

// Main execution function - examples of usage
async function main() {
  try {
    const client = createConfluenceClient();

    // Example 1: Scrape a single page by ID
    const pageId = process.env.CONFLUENCE_PAGE_ID || "123456";
    await scrapePage(client, pageId);

    // Example 2: Scrape all pages in a space
    const spaceKey = process.env.CONFLUENCE_SPACE_KEY || "MYSPACE";
    const pagesInSpace = await getAllPagesInSpace(client, spaceKey);

    console.log(`Found ${pagesInSpace.length} pages in space ${spaceKey}`);

    for (const page of pagesInSpace) {
      await scrapePage(client, page.id);
    }

    // Example 3: Search for pages with specific content and scrape them
    const searchQuery =
      process.env.CONFLUENCE_SEARCH_QUERY || "important information";
    const searchResults = await searchPages(client, searchQuery);

    console.log(
      `Found ${searchResults.length} pages containing "${searchQuery}"`,
    );

    for (const result of searchResults) {
      if (result.type === "page") {
        await scrapePage(client, result.id);
      }
    }

    console.log("Scraping completed successfully!");
  } catch (error) {
    console.error("Error in scraping process:", error.message);
    process.exit(1);
  }
}

// Run the main function
main();
