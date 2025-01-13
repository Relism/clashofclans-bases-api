const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");

const app = express();
const PORT = 3000;

const baseUrl = "https://clashofclans-layouts.com";

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

/**
 * Fetches base layouts from a given page URL.
 *
 * @param {string} url - The URL of the page to scrape base layouts from.
 * @returns {Promise<Array<Object>>} - A promise that resolves to an array of base layout objects.
 */
const fetchBasesFromPage = async (url) => {
  const response = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36",
      Accept: "application/json, text/html, */*",
    },
  });

  const $ = cheerio.load(response.data);
  const baseElements = $("body > main > div > div.bases_grid > div");
  const bases = [];

  for (let i = 0; i < baseElements.length; i++) {
    const element = baseElements[i];
    const label = $(element)
      .find("a > div > div:nth-child(1) > div")
      .text()
      .trim();

    if (label === "with Link") {
      const title = $(element).find("a").attr("title").split(" with Link,")[0];
      const url = baseUrl + $(element).find("a").attr("href");

      const basePageResponse = await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36",
          Accept: "application/json, text/html, */*",
        },
      });
      const basePage$ = cheerio.load(basePageResponse.data);

      const highQualityImage =
        baseUrl +
        basePage$("body > main > div > div.base_border_wide > a").attr("href");

      const baseLink = basePage$(
        "body > main > div > div.base_link_block > a"
      ).attr("href");

      bases.push({
        title,
        url,
        image: highQualityImage,
        baseLink,
      });
    }
  }
  return bases;
};

/**
 * Fetches the maximum number of pages available for the given URL.
 *
 * @param {string} url - The URL to scrape for pagination information.
 * @returns {Promise<number>} - A promise that resolves to the maximum page number.
 */
const getMaxPages = async (url) => {
  const response = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36",
      Accept: "application/json, text/html, */*",
    },
  });

  const $ = cheerio.load(response.data);
  const maxPage = $("body > main > div > div.pagination_pages > span.pages")
    .find("a")
    .last()
    .text();

  return parseInt(maxPage) || 1;
};

/**
 * Fetches base layouts from multiple pages, with pagination and limit functionality.
 *
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<void>} - Resolves when the response is sent.
 */
app.get("/getBases", async (req, res) => {
  const { level, limit, type } = req.query;

  const finalLimit = limit ? Math.min(parseInt(limit), 100) : 20;

  if (!level) {
    return res.status(400).json({ error: "Missing required parameter: level" });
  }

  const validTypes = ["", "war", "farm", "defence"];
  const typePath = validTypes.includes(type) ? `${type}/` : "";
  const url = `${baseUrl}/plans/th_${level}/${typePath}`;

  try {
    const maxPages = await getMaxPages(url);
    const allBases = [];
    let fetchedBases = 0;

    for (let page = 1; page <= maxPages; page++) {
      if (fetchedBases >= finalLimit) break;
      const pageUrl = `${baseUrl}/plans/th_${level}/${typePath}page_${page}/`;
      const bases = await fetchBasesFromPage(pageUrl);

      allBases.push(...bases);
      fetchedBases += bases.length;

      if (fetchedBases >= finalLimit) break;
    }

    res.setHeader("Content-Type", "application/json");
    res.json({
      level,
      type: type || "default",
      limit: finalLimit,
      data: allBases.slice(0, finalLimit),
    });
  } catch (error) {
    console.error("Error scraping data:", error.message);
    res.status(500).json({
      error: "Failed to fetch and scrape data. Please try again later.",
    });
  }
});

/**
 * Fetches a random base layout from the available pages.
 *
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<void>} - Resolves when the random base is sent in the response.
 */
app.get("/getRandomBase", async (req, res) => {
  const { level, type } = req.query;

  if (!level) {
    return res.status(400).json({ error: "Missing required parameter: level" });
  }

  const validTypes = ["", "war", "farm", "defence"];
  const typePath = validTypes.includes(type) ? `${type}/` : "";
  const url = `${baseUrl}/plans/th_${level}/${typePath}`;

  try {
    const maxPages = await getMaxPages(url);
    const randomPage = Math.floor(Math.random() * maxPages) + 1;
    const pageUrl = `${baseUrl}/plans/th_${level}/${typePath}page_${randomPage}/`;

    const bases = await fetchBasesFromPage(pageUrl);
    res.setHeader("Content-Type", "application/json");

    if (bases.length > 0) {
      const randomBase = bases[Math.floor(Math.random() * bases.length)];
      res.json(randomBase);
    } else {
      res.status(404).json({ error: "No bases found on the random page." });
    }
  } catch (error) {
    console.error("Error scraping data:", error.message);
    res.status(500).json({
      error: "Failed to fetch and scrape data. Please try again later.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
