import { load } from "npm:cheerio";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import type { Task, TaskResult, ReleaseMedia } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const pscUrl = "https://www.publicservice.govt.nz/news";
const baseUrl = "https://www.publicservice.govt.nz";

const seenNewsUrls = new Set<string>();
let isFirstRun = true;

interface PscNews {
    title: string;
    url: string;
}

async function fetchInformationFromRelease(link: string, title: string) {
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
    $('div.col-12.col-lg-10.offset-lg-1 section.element .typography').each((_idx, element) => {
        const text = $(element).text().trim();
        if (text) {
            contentParts.push(text);
        }
    });

    const content = title + ": " + contentParts.join('\n\n');

    const mediaItems: ReleaseMedia[] = [];
    $('div.col-12.col-lg-10.offset-lg-1 section.elementcaptionedimage img').each((_idx, el) => {
        const relativeLink = $(el).attr('src');
        if (relativeLink) {
            const absoluteLink = new URL(relativeLink, new URL(link).origin).href;
            mediaItems.push({ link: absoluteLink, title: $(el).attr('alt') || undefined });
        }
    });

    if (content) {
        reviewRelease("Public Service Commission", "News", content, link, mediaItems);
    }
}


async function getPscNews(): Promise<PscNews[]> {
    const res = await fetchWithBrowserHeaders(pscUrl);
    let html;
    if (res instanceof Response){
        if (!res.ok){
            throw new Error(`Did not get an OK response from ${pscUrl}`);
        }
        html = await res.text();
    } else {
        if (!res){
            throw new Error(`Did not get an OK response from ${pscUrl}`);
        }
        html = res;
    }

    const $ = load(html);
    const newsItems: PscNews[] = [];

    $('ul.tiles.tiles--image li a.tile').each((_i, el) => {
        const article = $(el);
        const title = article.find('span.tile__header').text().trim();
        const relativeUrl = article.attr('href');

        if (title && relativeUrl) {
            newsItems.push({
                title,
                url: new URL(relativeUrl, baseUrl).href.split("?")[0],
            });
        } else {
            console.error(`Failed to parse a news item, missing title or URL: ${article.html()}`)
        }
    });

    if (newsItems.length === 0) {
        throw new Error("No news items found on the page. The page structure may have changed.")
    }

    return newsItems;
}

async function checkForNewPscNews(): Promise<TaskResult> {
    let newsItems;
    try {
        newsItems = await getPscNews();
    } catch (error) {
        return { success: false, errorMessage: (error as Error).message };
    }

    for (const news of newsItems.reverse()) {
        if (!seenNewsUrls.has(news.url)) {
            seenNewsUrls.add(news.url);

            if (!isFirstRun) {
                await fetchInformationFromRelease(news.url, news.title);
            }
        }
    }

    if (isFirstRun) {
        isFirstRun = false;
    }

    return { success: true }
}

export default {
    name: "Public Service Commission News",
    description: "Scrapes the Public Service Commission news page for new releases and updates.",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000
    },
    callback: checkForNewPscNews
} as Task;