import { load } from "npm:cheerio";
import { fetchWithHeadlessBrowser } from "../../../util/web.ts";
import type { Task, TaskResult, ReleaseMedia } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const mohUrl = "https://www.health.govt.nz/news";
const baseUrl = "https://www.health.govt.nz";

const seenReleaseUrls = new Set<string>();
let isFirstRun = true;

interface MohMediaRelease {
    title: string;
    url: string;
}

async function fetchInformationFromRelease(link: string) {
    const html = await fetchWithHeadlessBrowser(link);
    if (!html) {
        throw new Error(`Failed to get page content for ${link} using headless browser.`);
    }

    const $ = load(html);
    const contentParts: string[] = [];

    $('div.prose > *').each((_idx, element) => {
        const $el = $(element);

        if ($el.is('ul')) {
            const listItems = $el.find('li').map((_, li) => {
                return `- ${$(li).text().trim()}`;
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
        reviewRelease("Ministry of Health", "News", content, link, mediaItems);
    }
}

async function getMediaReleases(): Promise<MohMediaRelease[]> {
    const html = await fetchWithHeadlessBrowser(mohUrl);

    if (!html) {
        throw new Error("Failed to get page content using headless browser.")
    }

    const $ = load(html);
    const releases: MohMediaRelease[] = [];

    $(".view__content ul > li").each((_, element) => {
        const articleCard = $(element);

        const titleElement = articleCard.find("h2 a");
        const title = titleElement.text().trim();
        const relativeUrl = titleElement.attr("href");

        if (title && relativeUrl) {
            releases.push({
                title,
                url: new URL(relativeUrl, baseUrl).href,
            });
        }
    });

    if (releases.length === 0) {
        throw new Error("No media releases found on the page. The website structure might have changed.");
    }

    return releases;
}

async function checkForNewMohReleases(): Promise<TaskResult> {
    let releases;
    try {
        releases = await getMediaReleases();
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
    name: "Ministry of Health News",
    description: "Scrapes the Ministry of Health website for new news articles.",
    resourceType: "browser",
    frequencyMs: 5 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 10 * 60 * 1000
    },
    callback: checkForNewMohReleases,
} as Task;
