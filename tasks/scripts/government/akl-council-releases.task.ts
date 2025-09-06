import { load } from "npm:cheerio";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import type { Task, TaskResult, ReleaseMedia } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const mediaCentreUrl = "https://ourauckland.aucklandcouncil.govt.nz/media-centre/";
const baseUrl = "https://ourauckland.aucklandcouncil.govt.nz";

const seenReleaseUrls = new Set<string>();
let isFirstRun = true;

interface MediaRelease {
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
    $('article.article-content > *').each((_idx, element) => {
        const $el = $(element);

        if ($el.is('table')) {
            const tableRows: string[] = [];
            $el.find('tr').each((_rowIndex, row) => {
                const rowCells = $(row).find('td, th').map((_cellIndex, cell) => $(cell).text().trim()).get();
                tableRows.push(rowCells.join(' | '));
            });
            contentParts.push(tableRows.join('\n'));
        } else {
             const text = $el.text().trim();
             if (text) {
                 contentParts.push(text);
             }
        }
    });

    const content = contentParts.join('\n\n');

    const mediaItems: ReleaseMedia[] = [];
    $('article.article-content img').each((_idx, el) => {
        const relativeLink = $(el).attr('src');
        if (relativeLink) {
            const absoluteLink = new URL(relativeLink, new URL(link).origin).href;
            mediaItems.push({ link: absoluteLink, title: $(el).attr('alt') || undefined });
        }
    });

    if (content) {
        reviewRelease("Auckland Council", "Media Release", content, link, mediaItems);
    }
}


async function getMediaReleases(): Promise<MediaRelease[]> {
    const res = await fetchWithBrowserHeaders(mediaCentreUrl);
    let html;
    if (res instanceof Response){
        if (!res.ok){
            throw new Error(`Did not get an OK response from ${mediaCentreUrl}`);
        }
        html = await res.text();
    } else {
        if (!res){
            throw new Error(`Did not get an OK response from ${mediaCentreUrl}`);
        }
        html = res;
    }

    const $ = load(html);
    const releases: MediaRelease[] = [];

    $(".media-centre-item").each((_, element) => {
        const item = $(element);
        const linkElement = item.find("h2.media-centre-item__title a");

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

async function checkForNewMediaReleases(): Promise<TaskResult> {
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
    name: "Auckland Council Media Centre",
    description: "Scrapes the Auckland Council media centre for new releases and updates.",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000
    },
    callback: checkForNewMediaReleases,
} as Task;