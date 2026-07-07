import { chromium } from "playwright";

export async function getEbaySoldPrice(search: string) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const cleanSearch = search
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 5)
    .join(" ");

  await page.goto(
    `https://www.ebay.fr/sch/i.html?_nkw=${encodeURIComponent(cleanSearch)}&LH_Sold=1&LH_Complete=1`,
    { waitUntil: "domcontentloaded" }
  );

  await page.waitForTimeout(4000);

  const prices = await page.evaluate(() => {
    const text = document.body.innerText;

    const matches = [...text.matchAll(/(\d+[,.]?\d*)\s*EUR/g)];

    return matches
      .map((m) => Number(m[1].replace(",", ".")))
      .filter((n) => !isNaN(n) && n > 5 && n < 500);
  });

  console.log("EBAY SEARCH:", cleanSearch);
  console.log("EBAY PRICES:", prices.slice(0, 10));

  await browser.close();

  if (!prices.length) {
    return {
      average: 0,
      confidence: 0,
      count: 0,
    };
  }

  const average = prices.reduce((a, b) => a + b, 0) / prices.length;

  return {
    average: Math.round(average),
    confidence: Math.min(100, prices.length * 5),
    count: prices.length,
  };
}