import { load } from "npm:cheerio";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import type { Task, TaskResult, ReleaseMedia } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const newsUrl = "https://www.privacy.org.nz/news/statements-media-releases/";
const baseUrl = "https://www.privacy.org.nz";

const seenReleaseUrls = new Set<string>();
let isFirstRun = true;

interface PrivacyCommissionerMediaRelease {
    title: string;
    url: string;
}

async function fetchInformationFromRelease(link: string) {
    const res = await fetchWithBrowserHeaders(link);
    let html;
    if (res instanceof Response){
        if (!res.ok){
            throw new Error(`Did not get an OK response from ${link}`);
        }
        html = await res.text();
    } else {
        if (!res){
            throw new Error(`Did not get an OK response from ${link}`);
        }
        html = res;
    }

    const $ = load(html);

    const contentParts: string[] = [];
    $('article > *').each((_idx, element) => {
        const $el = $(element);

        if ($el.is('header')) {
            return;
        }

        if ($el.is('ul, ol')) {
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
    $('article img').each((_idx, el) => {
        const relativeLink = $(el).attr('src');
        if (relativeLink) {
            const absoluteLink = new URL(relativeLink, new URL(link).origin).href;
            mediaItems.push({ link: absoluteLink, title: $(el).attr('alt') || undefined });
        }
    });

    if (content) {
        reviewRelease("Office of the Privacy Commissioner", "Media Release", content, link, mediaItems);
    }
}


async function getMediaReleases(): Promise<PrivacyCommissionerMediaRelease[]> {
    const res = await fetchWithBrowserHeaders(newsUrl);
    let html;
    if (res instanceof Response){
        if (!res.ok){
            throw new Error(`Did not get an OK response from ${newsUrl}`);
        }
        html = await res.text();
    } else {
        if (!res){
            throw new Error(`Did not get an OK response from ${newsUrl}`);
        }
        html = res;
    }

    const $ = load(html);
    const releases: PrivacyCommissionerMediaRelease[] = [];

    $("section.resultsList article").each((_, element) => {
        const articleCard = $(element);
        const linkElement = articleCard.find("header h4 a");

        const title = linkElement.text().trim();
        const relativeUrl = linkElement.attr("href");

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

async function checkForNewPrivacyCommissionerReleases(): Promise<TaskResult> {
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
    name: "Privacy Commissioner News",
    description: "Scrapes the Privacy Commissioner's news page for new releases and updates.",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000
    },
    callback: checkForNewPrivacyCommissionerReleases,
} as Task;