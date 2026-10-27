import { BROWSER_REQUIRED_MESSAGE, findBrowser } from "./browser.js";

export const PDF_TIMEOUT_MS = 30_000;

/** An error whose message is short and safe to show the person. */
export class PdfError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "PdfError";
    this.status = status;
  }
}

// One generation at a time: each request waits for the one before it. A failure of one never blocks
// the next.
let queue = Promise.resolve();
function inTurn(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

/**
 * Prints `url` (the app's print page) to a US Letter PDF with headless Chrome or Edge, through
 * puppeteer-core (which downloads no browser). One browser launch per call, always closed after, 30
 * seconds in all. The page sets window.__printReady = true once the document and its fonts are in
 * (or window.__printError = a message), and the print rules in src/index.css (@page letter, 0.5in
 * margins, #resume-print) are the only page rules: nothing here duplicates them.
 * Resolves to a Buffer.
 */
export function generatePdf(url, { timeoutMs = PDF_TIMEOUT_MS, findBrowserFn = findBrowser } = {}) {
  return inTurn(async () => {
    const executablePath = findBrowserFn();
    if (!executablePath) throw new PdfError(BROWSER_REQUIRED_MESSAGE);

    const { default: puppeteer } = await import("puppeteer-core");
    const deadline = Date.now() + timeoutMs;
    const remaining = () => Math.max(1000, deadline - Date.now());

    let browser;
    // Whatever step the browser is in, it is closed when the time runs out.
    let timer;
    try {
      browser = await puppeteer.launch({ executablePath, headless: true, timeout: remaining() });
      timer = setTimeout(() => browser.close().catch(() => {}), timeoutMs);
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "load", timeout: remaining() });
      await page.waitForFunction("window.__printReady === true || Boolean(window.__printError)", { timeout: remaining() });
      const failure = await page.evaluate("window.__printError ?? null");
      if (failure) throw new PdfError(failure);
      // preferCSSPageSize: the page size and margins come from the @page rule in src/index.css.
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      return Buffer.from(pdf);
    } catch (err) {
      if (err instanceof PdfError) throw err;
      console.warn(`[pdf] generation failed: ${err.message}`);
      throw new PdfError(Date.now() >= deadline ? "The PDF took too long to generate. Try again." : "The PDF couldn't be generated. Try again.");
    } finally {
      clearTimeout(timer);
      await browser?.close().catch(() => {});
    }
  });
}
