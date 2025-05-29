# Confluence Scraper

A powerful TypeScript tool for extracting content from Atlassian Confluence Cloud instances and transforming it into multiple output formats optimized for different use cases.

## Overview

The Confluence Scraper extracts structured data from Confluence pages and transforms it into multiple formats, including AI-ready vector embeddings. It's designed for:

- **Data Engineers**: Extract structured data from Confluence for analysis or migration
- **AI/ML Practitioners**: Prepare content for AI/ML workflows through intelligent vectorization and chunking
- **Content Managers**: Archive Confluence content in multiple formats (HTML, JSON, plain text)

## Features

- **Multiple Authentication Methods**: Supports Basic Auth, OAuth2, JWT, and Personal Access Tokens
- **Flexible Content Extraction**: Process entire spaces or individual pages
- **Intelligent Content Chunking**: Creates semantically meaningful chunks optimized for AI/ML models
- **Attachment Management**: Downloads and organizes all page attachments
- **Multiple Output Formats**:
  - Original HTML content
  - Structured JSON with parsed content
  - Plain text for simple processing
  - Vector-ready content chunks for AI/ML applications
  - Complete metadata with page information

## Installation

This project uses [Bun](https://bun.sh) as its JavaScript runtime.

1. Install Bun if you haven't already:
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. Clone the repository:
   ```bash
   git clone https://github.com/zx8086/confluence-scraper.git
   cd confluence-scraper
   ```

3. Install dependencies:
   ```bash
   bun install
   ```

## Configuration

The scraper is configured using environment variables. Create a `.env` file in the project root with the following variables:

```
# Required Configuration
CONFLUENCE_HOST=https://your-domain.atlassian.net
AUTH_METHOD=basic  # Options: basic, oauth2, jwt, pat

# Authentication (based on AUTH_METHOD)
CONFLUENCE_EMAIL=your-email@example.com  # For basic auth
CONFLUENCE_API_TOKEN=your-api-token      # For basic auth
# OR
CONFLUENCE_ACCESS_TOKEN=your-oauth-token  # For oauth2
# OR
CONFLUENCE_JWT_ISSUER=your-jwt-issuer     # For jwt
CONFLUENCE_JWT_SECRET=your-jwt-secret     # For jwt
CONFLUENCE_JWT_EXPIRY=180                 # For jwt (optional, defaults to 180)
# OR
CONFLUENCE_PAT=your-personal-access-token # For pat

# Content Selection (at least one is required)
CONFLUENCE_PAGE_ID=123456                # For single page scraping
CONFLUENCE_SPACE_KEY=YOURSPACE           # For space-wide scraping
```

## Authentication Methods

The scraper supports four authentication methods:

### Basic Authentication (Recommended for Cloud)

Uses email and API token for authentication. Generate an API token from your Atlassian account settings.

```
AUTH_METHOD=basic
CONFLUENCE_EMAIL=your-email@example.com
CONFLUENCE_API_TOKEN=your-api-token
```

### OAuth2 Authentication

Uses an OAuth2 access token for authentication.

```
AUTH_METHOD=oauth2
CONFLUENCE_ACCESS_TOKEN=your-oauth-token
```

### JWT Authentication

Uses JWT (JSON Web Token) for authentication.

```
AUTH_METHOD=jwt
CONFLUENCE_JWT_ISSUER=your-jwt-issuer
CONFLUENCE_JWT_SECRET=your-jwt-secret
CONFLUENCE_JWT_EXPIRY=180  # Optional, defaults to 180 seconds
```

### Personal Access Token (PAT)

Uses a Personal Access Token for authentication.

```
AUTH_METHOD=pat
CONFLUENCE_PAT=your-personal-access-token
```

## Usage

### Scraping a Single Page

To scrape a single Confluence page, set the `CONFLUENCE_PAGE_ID` environment variable and run:

```bash
bun src/index.ts
```

Example with inline environment variables:

```bash
CONFLUENCE_PAGE_ID=123456 bun src/index.ts
```

### Scraping an Entire Space

To scrape all pages in a Confluence space, set the `CONFLUENCE_SPACE_KEY` environment variable and run:

```bash
bun src/index.ts
```

Example with inline environment variables:

```bash
CONFLUENCE_SPACE_KEY=YOURSPACE bun src/index.ts
```

### Using the Start Script

You can also use the npm script defined in package.json:

```bash
bun start
```

## Output Structure

The scraper creates an organized directory structure for the extracted content:

```
output/
├── {SPACE_KEY}/
│   ├── {PAGE_TITLE}/
│   │   ├── content.html         # Original page HTML
│   │   ├── parsed_content.json  # Structured content data
│   │   ├── content.txt          # Plain text version
│   │   ├── vector_content.json  # AI-ready chunks
│   │   ├── metadata.json        # Page metadata
│   │   └── attachments/         # Downloaded files
│   │       ├── file1.pdf
│   │       ├── image1.png
│   │       └── ...
│   └── ...
└── ...
```

### Output Files

- **content.html**: The original HTML content from Confluence
- **parsed_content.json**: Structured JSON with extracted text, tables, links, and images
- **content.txt**: Plain text version of the page content
- **vector_content.json**: AI-ready content chunks with metadata, optimized for embedding models
- **metadata.json**: Page metadata including ID, title, version, author, and attachment information
- **attachments/**: Directory containing all downloaded attachments from the page

## Vector Content Format

The `vector_content.json` file contains semantically meaningful chunks optimized for AI/ML applications. Each chunk follows this structure:

```json
{
  "id": "page123-chunk-0",
  "title": "Page Title",
  "pageId": "123",
  "spaceKey": "SPACE",
  "content": "The actual content text...",
  "type": "section",
  "metadata": {
    "url": "https://your-domain.atlassian.net/wiki/spaces/SPACE/pages/123",
    "lastUpdated": "2023-04-01T12:00:00.000Z",
    "author": "John Doe",
    "section": "Introduction"
  }
}
```

The content is split into chunks based on:
- Headers (h1-h6) to preserve semantic structure
- Size limits (~1000 characters) to optimize for embedding models
- Content type (sections, list items, metadata)

## Advanced Usage

### Custom Output Directory

You can specify a custom output directory by modifying the `outputDir` parameter in the `scrapePage` function call:

```javascript
await scrapePage(client, pageId, "./custom-output");
```

### Searching Pages

The scraper includes a `searchPages` function to find pages containing specific text:

```javascript
const pages = await searchPages(client, "search query");
for (const page of pages) {
  await scrapePage(client, page.id);
}
```

## Troubleshooting

### API Access Issues

If you encounter API access issues:

1. Verify your authentication credentials in the `.env` file
2. Check that your Confluence user has appropriate permissions
3. For space-wide scraping, ensure the space key is correct (try with and without the `~` prefix)
4. Check the console output for specific error messages

### Content Extraction Issues

If content is not being extracted correctly:

1. Check that the page ID is correct
2. Verify that the page contains content in the expected format
3. For tables or complex content, check the parsed_content.json file for extraction details

## Development

### Running Tests

```bash
bun test
```

### TypeScript Configuration

The project uses TypeScript with ESNext target and strict type checking. See `tsconfig.json` for details.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
