import { load } from "npm:cheerio";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import type { Task, TaskResult, ReleaseMedia } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const newsUrl = "https://www.justice.govt.nz/about/news-and-media/news/";
const baseUrl = "https://www.justice.govt.nz";

const seenNewsUrls = new Set<string>();
let isFirstRun = true;

interface JusticeNews {
    title: string;
    url: string;
    date: string;
    description: string;
}

async function fetchInformationFromRelease(link: string){
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

    const title = $('#main h2').first().text().trim();
    if (title) {
        contentParts.push(title);
    }

    $('#main p:not(.last-published)').each((_idx, element) => {
        const $el = $(element);
        const text = $el.text().trim();

        if (text && !text.toLowerCase().includes("back to the news")){
            contentParts.push(text);
        }
    });

    const content = contentParts.join('\n\n');
    const mediaItems: ReleaseMedia[] = [];

    if (content){
        reviewRelease("Ministry of Justice", "Media Statement", content, link, mediaItems);
    }
}


async function getJusticeNews(): Promise<JusticeNews[]> {
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
    const newsItems: JusticeNews[] = [];

    $('ol#SearchResults li').each((_, element) => {
        const item = $(element).find('article');
        const anchor = item.find("h4 a");

        if (anchor.length === 0) return;

        const title = anchor.text().trim();
        const relativeUrl = anchor.attr("href");
        const date = item.find("p.metaInfo time").text().trim();
        const description = item.find("p:not(.metaInfo)").last().text().trim();

        if (title && relativeUrl) {
            const url = new URL(relativeUrl, baseUrl).href;
            newsItems.push({
                title,
                url,
                date,
                description
            });
        }
    });

    if (newsItems.length === 0) {
        throw new Error("No news items found on the page. The website structure might have changed.");
    }

    return newsItems;
}

async function checkForNewJusticeNews(): Promise<TaskResult> {
    let newsItems;
    try {
        newsItems = await getJusticeNews();
    } catch (error) {
        return { success: false, errorMessage: (error as Error).message };
    }

    for (const item of newsItems.reverse()) {
        if (!seenNewsUrls.has(item.url)) {
            seenNewsUrls.add(item.url);

            if (!isFirstRun) {
                await fetchInformationFromRelease(item.url);
            }
        }
    }

    if (isFirstRun) {
        isFirstRun = false;
    }

    return { success: true };
}

export default {
    name: "Ministry of Justice News",
    description: "Scrapes the Ministry of Justice website for new news articles.",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000
    },
    callback: checkForNewJusticeNews,
} as Task;
