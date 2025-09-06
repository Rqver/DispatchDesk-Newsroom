import { load } from "npm:cheerio";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import type { ReleaseMedia, Task, TaskResult } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const msdUrl = "https://www.msd.govt.nz/about-msd-and-our-work/newsroom/index.html";
const baseUrl = "https://www.msd.govt.nz";

const seenReleaseUrls = new Set<string>();
let isFirstRun = true;

interface MsdNewsArticle {
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

    $('#content div.block > *').each((_idx, element) => {
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

    const content = contentParts.join('\n\n').trim();

    const mediaItems: ReleaseMedia[] = [];
    $('#content div.block img').each((_idx, el) => {
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
        reviewRelease("MSD", "News", content, link, mediaItems);
    }
}

async function getNewsArticles(): Promise<MsdNewsArticle[]> {
    const res = await fetchWithBrowserHeaders(msdUrl);
    let html;
    if (res instanceof Response){
        if (!res.ok){
            throw new Error(`Did not get an OK response from ${msdUrl}`);
        }
        html = await res.text();
    } else {
        if (!res){
            throw new Error(`Did not get an OK response from ${msdUrl}`);
        }
        html = res;
    }

    const $ = load(html);
    const articles: MsdNewsArticle[] = [];

    $("div#content div.listing").each((_, element) => {
        const articleEl = $(element);
        const titleEl = articleEl.find("div.title a");
        const descriptionEl = articleEl.find("p");

        const title = titleEl.text().trim();
        const relativeUrl = titleEl.attr("href");
        const url = relativeUrl ? new URL(relativeUrl, baseUrl).href : undefined;
        const description = descriptionEl.text().trim();

        if (title && url) {
            articles.push({ title, description, url });
        } else {
            throw new Error(`Missing title or URL for a listing item.`)
        }
    });

    return articles;
}

async function checkForNewMsdArticles(): Promise<TaskResult> {
    let articles;
    try {
        articles = await getNewsArticles();
    } catch (error) {
        return { success: false, errorMessage: (error as Error).message };
    }

    for (const article of articles.reverse()) {
        if (!seenReleaseUrls.has(article.url)) {
            seenReleaseUrls.add(article.url);

            if (!isFirstRun) {
                await fetchInformationFromRelease(article.url);
            }
        }
    }

    if (isFirstRun) {
        isFirstRun = false;
    }

    return { success: true }
}

export default {
    name: "MSD Newsroom",
    description: "Scrapes the MSD website for news and media releases.",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000
    },
    callback: checkForNewMsdArticles,
} as Task;