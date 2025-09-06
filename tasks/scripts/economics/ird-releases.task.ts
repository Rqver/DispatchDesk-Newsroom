import { load } from "npm:cheerio";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import type { ReleaseMedia, Task, TaskResult } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const irdUrl = "https://www.ird.govt.nz/media-releases";
const baseUrl = "https://www.ird.govt.nz";

const seenReleaseUrls = new Set<string>();
let isFirstRun = true;

interface IrdMediaRelease {
    title: string;
    description: string;
    url: string;
}

async function fetchInformationFromRelease(link: string): Promise<void> {
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
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

    $('article.media-article__content > *').each((_idx, element) => {
        const $el = $(element);

        if ($el.is('strong.media-article__date') || $el.is('section.media-article__meta')) {
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

    const content = contentParts.join('\n\n').trim();

    const mediaItems: ReleaseMedia[] = [];
    $('article.media-article__content img').each((_idx, el) => {
        const $img = $(el);
        const relativeLink = $img.attr('src');
        if (relativeLink) {
            if (!imageExtensions.some(ext => relativeLink.toLowerCase().endsWith(ext))) {
                return;
            }

            const absoluteLink = new URL(relativeLink, baseUrl).href;
            const title = $img.attr('alt')?.trim();

            mediaItems.push({ link: absoluteLink, title: title || undefined });
        }
    });

    if (content) {
        reviewRelease("Inland Revenue", "Media Release", content, link, mediaItems);
    }
}


async function getMediaReleases(): Promise<IrdMediaRelease[]> {
    const res = await fetchWithBrowserHeaders(irdUrl);
    let html;
    if (res instanceof Response){
        if (!res.ok){
            throw new Error(`Did not get an OK response from ${irdUrl}`);
        }
        html = await res.text();
    } else {
        if (!res){
            throw new Error(`Did not get an OK response from ${irdUrl}`);
        }
        html = res;
    }

    const $ = load(html);
    const releases: IrdMediaRelease[] = [];

    const banner = $(".media-landing__banner");
    if (banner.length > 0) {
        const title = banner.find("h4.media-landing__banner__title").text().trim();
        const relativeUrl = banner.find("a.media-landing__banner__read-more").attr("href");
        const description = banner.find("div.media-landing__banner__summary").text().trim();
        const url = relativeUrl ? `${baseUrl}${relativeUrl}` : undefined;

        if (title && url) {
            releases.push({ title, description, url });
        } else {
            console.error(`Missing title or URL in banner.`);
        }
    }


    $("li.media-card--list__item").each((_, element) => {
        const article = $(element);
        const titleEl = article.find("a.media-card--list__title");
        const descriptionEl = article.find("div.media-card--list__summary");

        const title = titleEl.text().trim();
        const relativeUrl = titleEl.attr("href");
        const url = relativeUrl ? `${baseUrl}${relativeUrl}` : undefined;
        const description = descriptionEl.text().trim();

        if (title && url) {
            releases.push({ title, description, url });
        } else {
            console.error(`Missing title or URL for a list item.`);
        }
    });

    return releases;
}

async function checkForNewIrdReleases(): Promise<TaskResult> {
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

    return { success: true }
}


export default {
    name: "IRD Media Releases",
    description: "Scrapes the IRD website for new media releases.",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000
    },
    callback: checkForNewIrdReleases,
} as Task;