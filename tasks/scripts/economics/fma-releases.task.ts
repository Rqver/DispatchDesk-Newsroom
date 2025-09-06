import { load } from "npm:cheerio";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import type { ReleaseMedia, Task, TaskResult } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const fmaUrl = "https://www.fma.govt.nz/news/all-releases/media-releases/";
const baseUrl = "https://www.fma.govt.nz";

const seenReleaseUrls = new Set<string>();
let isFirstRun = true;

interface FmaMediaRelease {
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

    $('.registry-item-page__body-wrap-main--elemental .content-element__content > *').each((_idx, element) => {
        const $el = $(element);

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

    let content = contentParts.join('\n\n');

    content = content.replace(/\bENDS\b[\s\S]*$/i, "").trim();

    const mediaItems: ReleaseMedia[] = [];
    $('.registry-item-page__body-wrap-main--elemental .content-element__content img').each((_idx, el) => {
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
        await reviewRelease("FMA", "Media Release", content, link, mediaItems);
    }
}


async function getMediaReleases(): Promise<FmaMediaRelease[]> {
    const res = await fetchWithBrowserHeaders(fmaUrl);
    let html;
    if (res instanceof Response){
        if (!res.ok){
            throw new Error(`Did not get an OK response from ${fmaUrl}`);
        }
        html = await res.text();
    } else {
        if (!res){
            throw new Error(`Did not get an OK response from ${fmaUrl}`);
        }
        html = res;
    }

    const $ = load(html);
    const releases: FmaMediaRelease[] = [];

    $("article.results-list__result").each((_, element) => {
        const article = $(element);
        const titleEl = article.find("h3.results-list__result-title a");
        const descriptionEl = article.find("div.result--meta-description");

        const title = titleEl.text().trim();
        const relativeUrl = titleEl.attr("href");
        const url = relativeUrl ? `${baseUrl}${relativeUrl}` : undefined;
        const description = descriptionEl.text().trim();

        if (title && url) {
            releases.push({ title, description, url });
        } else {
            console.error(`Missing title or url for an article.`);
        }
    });

    return releases;
}

async function checkForNewFmaReleases(): Promise<TaskResult> {
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
    name: "FMA Media Releases",
    description: "Scrapes the FMA website for new media releases.",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000
    },
    callback: checkForNewFmaReleases,
} as Task;