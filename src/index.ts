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
    apiPrefix: "/wiki/rest/api", // This is correct
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
function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "-");
}

// Get page content with options to expand content
async function getPageContent(client, pageId) {
  try {
    console.log(`[API] Fetching page content for ID: ${pageId}`);
    const response = await fetchDirectly(`/content/${pageId}?expand=body.storage,version,space`);

    // Validate response data
    if (!response || !response.id) {
      throw new Error(`Invalid response received for page ${pageId}`);
    }

    console.log(`[API] Successfully fetched page "${response.title}" (ID: ${pageId})`);
    console.log('[API] Page metadata:', {
      id: response.id,
      title: response.title,
      spaceKey: response.space?.key,
      version: response.version?.number,
      contentLength: response.body?.storage?.value?.length || 0
    });

    return response;
  } catch (error) {
    console.error(`[API] Error fetching page ${pageId}:`, error);
    throw error;
  }
}

// Get all attachments for a page
async function getPageAttachments(client, pageId) {
  try {
    console.log(`[API] Fetching attachments for page ID: ${pageId}`);
    const response = await fetchDirectly(`/content/${pageId}/child/attachment?expand=version,metadata`);
    
    if (!response || !Array.isArray(response.results)) {
      console.log(`[API] No attachments found for page ${pageId}`);
      return [];
    }

    console.log(`[API] Found ${response.results.length} attachments`);
    console.log('[API] Attachments summary:', response.results.map(att => ({
      id: att.id,
      title: att.title,
      mediaType: att.metadata?.mediaType
    })));
    return response.results;
  } catch (error) {
    console.error(`[API] Error fetching attachments for page ${pageId}:`, error);
    return [];
  }
}

// Download an attachment
async function downloadAttachment(client, attachmentId, targetDir) {
  try {
    // Get attachment metadata
    const attachment = await fetchDirectly(`/content/${attachmentId}?expand=version,container`);

    // The correct download URL format for attachments
    const downloadUrl = `${CONFLUENCE_HOST}/wiki/download/attachments/${attachment.container.id}/${attachment.title}`;
    const downloadResponse = await fetch(downloadUrl, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${process.env.CONFLUENCE_EMAIL}:${process.env.CONFLUENCE_API_TOKEN}`).toString('base64')}`,
      }
    });

    if (!downloadResponse.ok) {
      throw new Error(`Failed to download attachment: ${downloadResponse.status} - ${downloadResponse.statusText}`);
    }

    // Get the binary data
    const arrayBuffer = await downloadResponse.arrayBuffer();

    // Create filename based on attachment title
    const filename = sanitizeFilename(attachment.title);
    const filePath = path.join(targetDir, filename);

    // Write the attachment to file
    await fs.writeFile(filePath, Buffer.from(arrayBuffer));

    console.log(`[API] Successfully downloaded attachment: ${filename}`);
    return filePath;
  } catch (error) {
    console.error(`[API] Error downloading attachment ${attachmentId}:`, error);
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
    console.log(`[API] Fetching pages in space "${spaceKey}" (start: ${startAt}, limit: ${limit})`);
    const response = await fetchDirectly(`/content?spaceKey=${spaceKey}&type=page&start=${startAt}&limit=${limit}&expand=version`);
    
    // Validate response
    if (!response || !Array.isArray(response.results)) {
      throw new Error(`Invalid response format for space ${spaceKey}`);
    }

    console.log(`[API] Retrieved ${response.results.length} pages (Total: ${response.size || 0})`);
    
    let allPages = response.results;

    if (response.size && response._links?.next) {
      console.log(`[API] Fetching next batch of pages`);
      const nextPages = await getAllPagesInSpace(client, spaceKey, startAt + limit, limit);
      allPages = [...allPages, ...(nextPages || [])];
    }

    return allPages;
  } catch (error) {
    console.error(`[API] Error fetching pages in space ${spaceKey}:`, error);
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

    // Validate response
    if (!response || !Array.isArray(response.results)) {
      throw new Error(`Invalid search response for query "${searchQuery}"`);
    }

    let allResults = response.results;

    if (response.size && response.totalSize && response.start !== undefined &&
        response.size + response.start < response.totalSize) {
      const nextResults = await searchPages(client, searchQuery, startAt + limit, limit);
      allResults = [...allResults, ...(nextResults || [])];
    }

    return allResults;
  } catch (error) {
    console.error(`[API] Error searching for "${searchQuery}":`, {
      error: error.message,
      status: error.status,
      details: error.response?.data || 'No additional details available'
    });
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

// Fix the interface to match the original working structure
interface VectorizedContent {
  id: string;
  title: string;
  pageId: string;
  spaceKey: string;
  content: string;  // Changed back to string from object
  type: 'section' | 'list_item' | 'metadata';
  metadata: {
    url: string;
    lastUpdated: string;
    author: string;
    section?: string;
  };
}

// Update the extraction function to match the interface
function extractVectorContent(htmlContent: string, pageMetadata: any): VectorizedContent[] {
  try {
    const root = parse(htmlContent);
    const vectors: VectorizedContent[] = [];
    
    const baseMetadata = {
      url: `${CONFLUENCE_HOST}/wiki/spaces/${pageMetadata.space.key}/pages/${pageMetadata.id}`,
      lastUpdated: pageMetadata.version.when,
      author: pageMetadata.version.by.displayName,
    };

    // Process the main content first
    const mainContent = root.querySelector('body') || root;
    
    // Split content into chunks based on headers and natural breaks
    const contentSections = mainContent.querySelectorAll('div, p, table, ul, ol');
    let currentChunk = {
      content: '',
      section: 'Main Content'
    };
    
    contentSections.forEach((element, index) => {
      // Check if this is a header
      const header = element.querySelector('h1, h2, h3, h4, h5, h6');
      if (header) {
        // Save previous chunk if it exists
        if (currentChunk.content.trim()) {
          vectors.push({
            id: `${pageMetadata.id}-chunk-${vectors.length}`,
            title: pageMetadata.title,
            pageId: pageMetadata.id,
            spaceKey: pageMetadata.space.key,
            content: currentChunk.content.trim(),
            type: 'section',
            metadata: {
              ...baseMetadata,
              section: currentChunk.section
            }
          });
        }
        // Start new chunk
        currentChunk = {
          content: header.textContent.trim(),
          section: header.textContent.trim()
        };
      } else {
        // Process different types of content
        let text = '';
        if (element.tagName === 'TABLE') {
          text = processTable(element);
        } else if (['UL', 'OL'].includes(element.tagName)) {
          text = element.querySelectorAll('li')
            .map(li => `• ${li.textContent.trim()}`)
            .join('\n');
        } else {
          text = element.textContent.trim();
        }

        if (text) {
          currentChunk.content += '\n\n' + text;
        }

        // Create a new chunk if it's getting too large (around 1000 characters)
        if (currentChunk.content.length > 1000) {
          vectors.push({
            id: `${pageMetadata.id}-chunk-${vectors.length}`,
            title: pageMetadata.title,
            pageId: pageMetadata.id,
            spaceKey: pageMetadata.space.key,
            content: currentChunk.content.trim(),
            type: 'section',
            metadata: {
              ...baseMetadata,
              section: currentChunk.section
            }
          });
          // Start new chunk with some overlap
          const lastParagraph = currentChunk.content.split('\n\n').slice(-1)[0];
          currentChunk = {
            content: lastParagraph || '',
            section: currentChunk.section
          };
        }
      }
    });

    // Don't forget to add the last chunk
    if (currentChunk.content.trim()) {
      vectors.push({
        id: `${pageMetadata.id}-chunk-${vectors.length}`,
        title: pageMetadata.title,
        pageId: pageMetadata.id,
        spaceKey: pageMetadata.space.key,
        content: currentChunk.content.trim(),
        type: 'section',
        metadata: {
          ...baseMetadata,
          section: currentChunk.section
        }
      });
    }

    // Add metadata vector
    vectors.push({
      id: `${pageMetadata.id}-metadata`,
      title: pageMetadata.title,
      pageId: pageMetadata.id,
      spaceKey: pageMetadata.space.key,
      content: JSON.stringify({
        title: pageMetadata.title,
        spaceKey: pageMetadata.space.key,
        sections: vectors.map(v => v.metadata.section).filter((s, i, arr) => arr.indexOf(s) === i),
        totalChunks: vectors.length,
        lastUpdated: pageMetadata.version.when,
        author: pageMetadata.version.by.displayName
      }, null, 2),
      type: 'metadata',
      metadata: baseMetadata
    });

    return vectors;
  } catch (error) {
    console.error("Error extracting vector content:", error);
    return [];
  }
}

// Update the processTable function to handle tables better
function processTable(tableNode: any): string {
  try {
    const headers = tableNode.querySelectorAll('th')
      .map((th: any) => th.textContent.trim());
    
    const rows = tableNode.querySelectorAll('tr')
      .map((tr: any) => tr.querySelectorAll('td')
        .map((td: any) => td.textContent.trim())
      )
      .filter((row: string[]) => row.length > 0);

    let result = '';
    if (headers.length > 0) {
      result += `Table Headers: ${headers.join(' | ')}\n`;
    }
    rows.forEach((row: string[]) => {
      result += `Row: ${row.join(' | ')}\n`;
    });
    
    return result;
  } catch (error) {
    console.error("Error processing table:", error);
    return '';
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

    // Add debug logging for vector content
    console.log(`[Scrape] Extracting vectors for page "${page.title}"`);
    const vectorContent = extractVectorContent(htmlContent, page);
    console.log(`[Scrape] Generated ${vectorContent.length} vectors`);

    if (vectorContent.length === 0) {
      console.warn(`[Scrape] Warning: No vectors generated for page "${page.title}"`);
      console.log('[Scrape] HTML Content sample:', htmlContent.slice(0, 200));
    }

    // Save vector content with better error handling
    const vectorPath = path.join(pageDir, "vector_content.json");
    try {
      await saveContentToFile(
        JSON.stringify(vectorContent, null, 2),
        vectorPath
      );
      console.log(`[Scrape] Vectors saved to ${vectorPath}`);
    } catch (error) {
      console.error(`[Scrape] Error saving vectors to ${vectorPath}:`, error);
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
      vectorization: {
        chunks: vectorContent.length,
        types: [...new Set(vectorContent.map(v => v.type))],
        totalTokens: vectorContent.reduce((acc, chunk) => 
          acc + chunk.content.split(/\s+/).length, 0  // Fixed: content is now a string
        )
      }
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

// Add this function after createConfluenceClient()
async function validateConfiguration(client) {
  console.log('[Validation] Checking environment variables and API access...');
  
  // Check required env variables
  const requiredVars = {
    'CONFLUENCE_HOST': process.env.CONFLUENCE_HOST,
    'CONFLUENCE_EMAIL': process.env.CONFLUENCE_EMAIL,
    'CONFLUENCE_API_TOKEN': process.env.CONFLUENCE_API_TOKEN,
    'CONFLUENCE_PAGE_ID': process.env.CONFLUENCE_PAGE_ID,
    'CONFLUENCE_SPACE_KEY': process.env.CONFLUENCE_SPACE_KEY
  };

  for (const [name, value] of Object.entries(requiredVars)) {
    if (!value) {
      console.error(`[Validation] Missing required environment variable: ${name}`);
    } else {
      console.log(`[Validation] Found ${name}: ${name.includes('TOKEN') ? '****' : value}`);
    }
  }

  // Test API connectivity
  try {
    console.log('[Validation] Testing API connectivity...');
    
    // Test space access
    const spaceKey = process.env.CONFLUENCE_SPACE_KEY;
    if (spaceKey) {
      console.log(`[Validation] Testing space access for: ${spaceKey}`);
      const spaceResponse = await client.space.getSpace({ spaceKey });
      console.log(`[Validation] Successfully accessed space: "${spaceResponse.name}" (${spaceResponse.key})`);
    }

    // Test page access
    const pageId = process.env.CONFLUENCE_PAGE_ID;
    if (pageId) {
      console.log(`[Validation] Testing page access for ID: ${pageId}`);
      const pageResponse = await client.content.getContentById({
        id: pageId,
        expand: ['space']
      });
      console.log(`[Validation] Successfully accessed page: "${pageResponse.title}" in space "${pageResponse.space?.key}"`);
    }

    console.log('[Validation] API connectivity test successful');
    return true;
  } catch (error) {
    console.error('[Validation] API connectivity test failed:', {
      error: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      details: error.response?.data
    });
    return false;
  }
}

// Add this function to test just the space access
async function testSpaceAccess(client) {
  try {
    const spaceKey = process.env.CONFLUENCE_SPACE_KEY;
    // Try both with and without the ~ prefix
    const spaceKeys = [
      spaceKey,
      spaceKey.startsWith('~') ? spaceKey.substring(1) : `~${spaceKey}`
    ];
    
    console.log('[Test] Trying space access with different key formats...');
    
    for (const key of spaceKeys) {
      try {
        console.log(`[Test] Attempting access with key: ${key}`);
        const response = await client.space.getSpace({ spaceKey: key });
        if (response && response.key) {
          console.log(`[Test] Successfully accessed space with key: ${key}`);
          console.log('[Test] Space details:', {
            key: response.key,
            name: response.name,
            type: response.type
          });
          // Update the env variable with the working key
          process.env.CONFLUENCE_SPACE_KEY = key;
          return true;
        }
      } catch (e) {
        console.log(`[Test] Failed with key ${key}:`, e.message);
      }
    }
    return false;
  } catch (error) {
    console.error('[Test] Space access test failed:', error);
    return false;
  }
}

// Add this helper function
async function fetchDirectly(endpoint, options = {}) {
  const url = `${CONFLUENCE_HOST}/wiki/rest/api${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Basic ${Buffer.from(`${process.env.CONFLUENCE_EMAIL}:${process.env.CONFLUENCE_API_TOKEN}`).toString('base64')}`,
      'Accept': 'application/json',
      ...options.headers
    }
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
}

// Add this test function
async function testDirectFetch() {
  try {
    console.log('[Test] Testing direct fetch...');
    
    // Test page content
    const pageContent = await fetchDirectly(`/content/98317?expand=body.storage,space,version`);
    console.log('[Test] Page content:', {
      id: pageContent.id,
      title: pageContent.title,
      spaceKey: pageContent.space?.key
    });
    
    // Test space access
    const spaceContent = await fetchDirectly(`/space/~5c0ec264b203a71cc9cb2d97`);
    console.log('[Test] Space content:', {
      key: spaceContent.key,
      name: spaceContent.name
    });
    
    return true;
  } catch (error) {
    console.error('[Test] Direct fetch failed:', error);
    return false;
  }
}

// Main execution function - examples of usage
async function main() {
  try {
    console.log('[Main] Testing direct fetch first...');
    const directFetchWorking = await testDirectFetch();
    
    if (!directFetchWorking) {
      console.error('[Main] Direct API access failed. Please verify credentials and permissions.');
      process.exit(1);
    }

    console.log('[Main] Initializing Confluence client...');
    const client = createConfluenceClient();
    console.log('[Main] Client initialized successfully');

    // Example 1: Scrape a single page by ID
    const pageId = process.env.CONFLUENCE_PAGE_ID || "98317"; // Using the known working page ID
    console.log(`[Main] Starting single page scrape for ID: ${pageId}`);
    await scrapePage(client, pageId);

    // Example 2: Scrape all pages in space
    const spaceKey = process.env.CONFLUENCE_SPACE_KEY || "~5c0ec264b203a71cc9cb2d97"; // Using the known working space key
    console.log(`[Main] Starting space scrape for key: ${spaceKey}`);
    const pagesInSpace = await getAllPagesInSpace(client, spaceKey);

    console.log(`[Main] Found ${pagesInSpace.length} pages in space ${spaceKey}`);
    
    for (const page of pagesInSpace) {
      console.log(`[Main] Processing page "${page.title}" (${page.id})`);
      await scrapePage(client, page.id);
    }

    console.log('[Main] Scraping completed successfully!');
  } catch (error) {
    console.error('[Main] Fatal error in scraping process:', {
      error: error.message,
      stack: error.stack,
      details: error.response?.data
    });
    process.exit(1);
  }
}

// Run the main function
main();
