// advanced-confluence-parser.js
// A module for advanced parsing of Confluence HTML content

import { parse } from "node-html-parser";

/**
 * Advanced parser for Confluence HTML content
 * Extracts structured data from the HTML
 */
export class ConfluenceParser {
  /**
   * Parse Confluence HTML content
   * @param {string} htmlContent - The HTML content from Confluence
   * @returns {Object} Parsed structured data
   */
  static parseContent(htmlContent) {
    try {
      const root = parse(htmlContent);

      return {
        metadata: this.extractMetadata(root),
        title: this.extractTitle(root),
        sections: this.extractSections(root),
        tables: this.extractTables(root),
        lists: this.extractLists(root),
        codeBlocks: this.extractCodeBlocks(root),
        links: this.extractLinks(root),
        images: this.extractImages(root),
        macros: this.extractMacros(root),
      };
    } catch (error) {
      console.error("Error parsing HTML content:", error.message);
      return {
        error: error.message,
        htmlContent,
      };
    }
  }

  /**
   * Extract metadata from HTML
   */
  static extractMetadata(root) {
    const metaTags = root.querySelectorAll("meta");
    const metadata = {};

    metaTags.forEach((meta) => {
      const name = meta.getAttribute("name");
      const content = meta.getAttribute("content");
      if (name && content) {
        metadata[name] = content;
      }
    });

    return metadata;
  }

  /**
   * Extract title from HTML
   */
  static extractTitle(root) {
    const titleElement =
      root.querySelector("title") || root.querySelector("h1");
    return titleElement ? titleElement.textContent.trim() : "";
  }

  /**
   * Extract sections with headers and content
   */
  static extractSections(root) {
    const sections = [];
    const headers = root.querySelectorAll("h1, h2, h3, h4, h5, h6");

    headers.forEach((header) => {
      // Get all elements after this header until the next header of same or higher level
      const level = parseInt(header.tagName.substring(1));
      let content = [];
      let nextElement = header.nextElementSibling;

      while (nextElement) {
        const isHeader = ["H1", "H2", "H3", "H4", "H5", "H6"].includes(
          nextElement.tagName,
        );
        if (isHeader) {
          const nextLevel = parseInt(nextElement.tagName.substring(1));
          if (nextLevel <= level) break;
        }

        content.push(nextElement.outerHTML);
        nextElement = nextElement.nextElementSibling;
      }

      sections.push({
        level,
        title: header.textContent.trim(),
        content: content.join(""),
        textContent: content
          .map((html) => {
            // Simple HTML to text conversion
            const tempEl = parse(html);
            return tempEl.textContent.trim();
          })
          .join("\n")
          .trim(),
      });
    });

    return sections;
  }

  /**
   * Extract tables from HTML
   */
  static extractTables(root) {
    const tables = root.querySelectorAll("table");

    return tables.map((table) => {
      // Get table caption if exists
      const caption = table.querySelector("caption");
      const captionText = caption ? caption.textContent.trim() : "";

      // Extract headers
      const headers = table
        .querySelectorAll("th")
        .map((th) => th.textContent.trim());

      // Extract rows
      const rows = table
        .querySelectorAll("tr")
        .map((tr) => {
          const cells = tr.querySelectorAll("td").map((td) => {
            // Check for colspan and rowspan
            const colspan = td.getAttribute("colspan")
              ? parseInt(td.getAttribute("colspan"))
              : 1;
            const rowspan = td.getAttribute("rowspan")
              ? parseInt(td.getAttribute("rowspan"))
              : 1;

            return {
              text: td.textContent.trim(),
              html: td.innerHTML.trim(),
              colspan,
              rowspan,
            };
          });

          return cells;
        })
        .filter((row) => row.length > 0); // Filter out rows with no cells (like header rows)

      return {
        caption: captionText,
        headers,
        rows,
      };
    });
  }

  /**
   * Extract lists (ordered and unordered) from HTML
   */
  static extractLists(root) {
    const lists = {
      ordered: this.extractSpecificLists(root, "ol"),
      unordered: this.extractSpecificLists(root, "ul"),
    };

    return lists;
  }

  /**
   * Helper method to extract specific types of lists
   */
  static extractSpecificLists(root, selector) {
    const lists = root.querySelectorAll(selector);

    return lists.map((list) => {
      const items = list.querySelectorAll("li").map((li) => {
        // Check if list item has nested lists
        const nestedLists = {
          ordered: this.extractSpecificLists(li, "ol"),
          unordered: this.extractSpecificLists(li, "ul"),
        };

        return {
          text: li.textContent.trim(),
          html: li.innerHTML.trim(),
          nestedLists:
            nestedLists.ordered.length > 0 || nestedLists.unordered.length > 0
              ? nestedLists
              : null,
        };
      });

      return items;
    });
  }

  /**
   * Extract code blocks from HTML
   */
  static extractCodeBlocks(root) {
    const codeBlocks = root.querySelectorAll("pre, code");

    return codeBlocks.map((codeBlock) => {
      // Try to determine language from class name (common in Confluence)
      const classes = codeBlock.getAttribute("class") || "";
      let language = "unknown";

      // Common language class patterns in Confluence
      const langMatch = classes.match(/language-(\w+)/);
      if (langMatch) {
        language = langMatch[1];
      } else if (classes.includes("java")) {
        language = "java";
      } else if (classes.includes("js")) {
        language = "javascript";
      } else if (classes.includes("py")) {
        language = "python";
      } else if (classes.includes("xml") || classes.includes("html")) {
        language = "xml";
      } else if (classes.includes("css")) {
        language = "css";
      } else if (classes.includes("sql")) {
        language = "sql";
      }

      return {
        code: codeBlock.textContent.trim(),
        language,
        html: codeBlock.outerHTML,
      };
    });
  }

  /**
   * Extract links from HTML
   */
  static extractLinks(root) {
    const links = root.querySelectorAll("a");

    return links.map((link) => {
      const href = link.getAttribute("href") || "";
      const text = link.textContent.trim();
      const title = link.getAttribute("title") || "";

      // Determine if it's an internal Confluence link
      const isInternal = href.includes("/wiki/") || href.startsWith("/");

      // Determine if it's an attachment link
      const isAttachment = href.includes("/download/attachments/");

      return {
        href,
        text,
        title,
        isInternal,
        isAttachment,
      };
    });
  }

  /**
   * Extract images from HTML
   */
  static extractImages(root) {
    const images = root.querySelectorAll("img");

    return images.map((img) => {
      const src = img.getAttribute("src") || "";
      const alt = img.getAttribute("alt") || "";
      const title = img.getAttribute("title") || "";
      const width = img.getAttribute("width") || null;
      const height = img.getAttribute("height") || null;

      // Determine if it's an attachment image
      const isAttachment = src.includes("/download/attachments/");

      return {
        src,
        alt,
        title,
        width,
        height,
        isAttachment,
      };
    });
  }

  /**
   * Extract Confluence macros
   */
  static extractMacros(root) {
    // In Confluence HTML, macros are typically in elements with classes or attributes containing "macro"
    const macroNodes = root.querySelectorAll(
      '[class*="macro"], [data-macro-name], [ac\\:name]',
    );

    return macroNodes.map((node) => {
      const macroName =
        node.getAttribute("data-macro-name") ||
        node.getAttribute("ac:name") ||
        "unknown";

      // Extract macro parameters
      const params = {};
      const paramNodes = node.querySelectorAll("[ac\\:name], [ac\\:parameter]");

      paramNodes.forEach((paramNode) => {
        const paramName =
          paramNode.getAttribute("ac:name") ||
          paramNode.getAttribute("ac:parameter");
        if (paramName) {
          params[paramName] = paramNode.textContent.trim();
        }
      });

      return {
        name: macroName,
        parameters: params,
        html: node.outerHTML,
        content: node.textContent.trim(),
      };
    });
  }
}

// Example usage:
// import { ConfluenceParser } from './advanced-confluence-parser.js';
//
// const htmlContent = '... HTML content from Confluence ...';
// const parsedContent = ConfluenceParser.parseContent(htmlContent);
//
// console.log(JSON.stringify(parsedContent, null, 2));
