import {Browser, Page} from "npm:puppeteer";
import { extractText } from "npm:unpdf";
import {browserPool} from "./browser-pool.ts";

export const DEFAULT_BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "TE": "trailers",
};

function mergeHeaders(base: Record<string, string>, overrides: Record<string, string>): Record<string, string> {
    type HeaderEntry = { original: string; value: string };

    const headerMap = new Map<string, HeaderEntry>();

    for (const [key, value] of Object.entries(base)) {
        headerMap.set(key.toLowerCase(), { original: key, value });
    }

    for (const [key, value] of Object.entries(overrides)) {
        const lowerKey = key.toLowerCase();
        headerMap.set(lowerKey, { original: key, value });
    }

    const result: Record<string, string> = {};
    for (const { original, value } of headerMap.values()) {
        result[original] = value;
    }

    return result;
}

export async function fetchWithBrowserHeaders(
    url: string | URL,
    extraHeaders?: Record<string, string>,
    noFallBack?: false
): Promise<Response | string | undefined>;

export async function fetchWithBrowserHeaders(
    url: string | URL,
    extraHeaders: Record<string, string>,
    noFallBack: true
): Promise<Response>;

export async function fetchWithBrowserHeaders(url: string | URL, extraHeaders: Record<string, string> = {}, noFallBack?: boolean): Promise<Response | string | undefined> {
    const headers = mergeHeaders(DEFAULT_BROWSER_HEADERS, extraHeaders);
    const res = await fetch(url, { headers });

    if (!res.ok) {
        const errorBody = await res.text().catch(() => "Could not read error body.");
        throw new Error(`Request failed with status ${res.status} for ${url}. Body: ${errorBody.slice(0, 500)}`);
    }

    const text = await res.clone().text();
    if (text.includes("_Incapsula_Resource") && !noFallBack) {
        return await fetchWithHeadlessBrowser(url as string);
    }

    return res;
}

export interface HeadlessBrowserOptions {
    waitForSelector?: string;
    timeoutMs?: number;
    waitForRedirect?: boolean;
    allowRequest?: (req: Request) => boolean;
}

export async function fetchWithHeadlessBrowser(url: string, options: HeadlessBrowserOptions = {}): Promise<string | undefined> {
    const { waitForSelector, timeoutMs = 15000, waitForRedirect,allowRequest } = options;

    let browser: Browser | undefined;
    let page: Page | undefined;
    let isBrowserHealthy = false;

    try {
        browser = await browserPool.getBrowser();
        page = await browser.newPage();

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (allowRequest && allowRequest(req as unknown as Request)) {
                req.continue();
                return;
            }

            const resourceType = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media', 'manifest', 'other'].includes(resourceType)) {
                req.abort();
                return;
            }

            req.continue();
        });

        await page.setViewport({ width: 1920, height: 1080 });

        if (waitForRedirect) {
            try {
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: timeoutMs }),
                    page.goto(url, { timeout: timeoutMs }),
                ]);
            } catch (err) {
                const e = err as Error;
                if (!e.toString().includes("Timeout")) {
                    throw err;
                }
            }
        } else {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: timeoutMs });
        }

        if (waitForSelector) {
            await page.waitForSelector(waitForSelector, { timeout: timeoutMs });
        }

        const content = await page.content();
        await page.close();
        isBrowserHealthy = true;
        return content;
    } catch (err) {
        console.error(`Error fetching ${url} with headless browser:`, err);
        isBrowserHealthy = false;
        return undefined;
    } finally {
        if (browser) {
            if (page && !page.isClosed()) {
                await page.close().catch(e => console.error("Error closing headless browser page in finally block:", e));
            }

            if (isBrowserHealthy) {
                browserPool.releaseBrowser(browser);
            } else {
                browserPool.disposeBrowser(browser);
            }
        }
    }
}

export async function fetchNonTextWithHeadlessBrowser(url: string, options?: HeadlessBrowserOptions): Promise<string> {
    const content = await fetchWithHeadlessBrowser(url, options);
    if(!content){
        throw new Error(`Failed to fetch RSS feed with headless browser`);
    }

    const match = content.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
    if(!match) return content;
    return match[1];
}

export async function fetchPdfContent(url: string, headers?: Record<string, string>): Promise<string | undefined> {
    try {
        const response = await fetchWithBrowserHeaders(url, headers ?? {}, true)
        if (!response.ok) {
            throw new Error(`Failed to fetch PDF with status ${response.status} for ${url}`);
        }

        const pdfBuffer = await response.arrayBuffer();
        const { text } = await extractText(pdfBuffer);
        return text.join(" ");
    } catch (err) {
        throw new Error(`Error fetching PDF content for ${url}: ${err}`);
    }
}