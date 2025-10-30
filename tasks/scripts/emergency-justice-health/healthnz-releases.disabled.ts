import { load } from "npm:cheerio";
import { fetchWithHeadlessBrowser } from "../../../util/web.ts";
import type { Task, TaskResult, ReleaseMedia } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const releasesUrl = "https://www.tewhatuora.govt.nz/corporate-information/news-and-updates";
const baseUrl = "https://www.tewhatuora.govt.nz";

const seenReleaseUrls = new Set<string>();
let isFirstRun = true;

interface TeWhatuOraRelease {
    title: string;
    url: string;
}

async function fetchInformationFromRelease(link: string) {
    const html = await fetchWithHeadlessBrowser(link, {
        waitForSelector: ".page-standard__main-content",
    });

    if (!html) {
        throw new Error(`Failed to get page content for ${link} using headless browser.`);
    }

    const $ = load(html);

    const contentParts: string[] = [];

    $('.page-standard__main-content .rich-text > *').each((_idx, element) => {
        const $el = $(element);

        if ($el.is('ul')) {
            const listItems = $el.find('li').map((_, li) => {
                return `- ${$(li).text().trim().replace(/\s+/g, ' ')}`;
            }).get();
            contentParts.push(listItems.join('\n'));
        } else {
            const text = $el.text().trim();
            if (text) {
                contentParts.push(text);
            }
        }
    });

    const content = contentParts.join('\n\n');

    const mediaItems: ReleaseMedia[] = [];

    if (content) {
        reviewRelease("Health New Zealand", "News and Updates", content, link, mediaItems);
    }
}


async function getTeWhatuOraReleases(): Promise<TeWhatuOraRelease[]> {
    const html = await fetchWithHeadlessBrowser(releasesUrl, {
        waitForSelector: "div.news-landing__main-content",
    });

    if (!html) {
        throw new Error("Failed to get page content using headless browser.");
    }

    const $ = load(html);
    const releases: TeWhatuOraRelease[] = [];

    $("ul.listing__list li.listing__item").each((_, element) => {
        const item = $(element);
        const anchor = item.find("a.listing__link");

        const title = anchor.text().trim();
        const relativeUrl = anchor.attr("href");

        if (title && relativeUrl) {
            releases.push({
                title,
                url: new URL(relativeUrl, baseUrl).href,
            });
        }
    });

    if (releases.length === 0) {
        throw new Error("No releases found on the page. The website structure might have changed.");
    }

    return releases;
}

async function checkForNewTeWhatuOraReleases(): Promise<TaskResult> {
    let releases;
    try {
        releases = await getTeWhatuOraReleases();
    } catch (error) {
        return { success: false, errorMessage: (error as Error).message };
    }

    for (const release of releases.reverse()) {
        if (!seenReleaseUrls.has(release.url)) {
            seenReleaseUrls.add(release.url);

            if (!isFirstRun) {
                await fetchInformationFromRelease(release.url);
            }
        }
    }

    if (isFirstRun) {
        isFirstRun = false;
    }

    return { success: true };
}

export default {
    name: "Health NZ Releases",
    description: "Scrapes the tewhatuora.govt.nz website for new news and updates.",
    resourceType: "browser",
    frequencyMs: 5 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 10 * 60 * 1000,
    },
    callback: checkForNewTeWhatuOraReleases,
} as Task;
