import { load } from "npm:cheerio";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import type { Task, TaskResult, ReleaseMedia } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const newsUrl = "https://www.hdc.org.nz/news-resources/news/";
const baseUrl = "https://www.hdc.org.nz";

const seenNewsUrls = new Set<string>();
let isFirstRun = true;

interface HdcNews {
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

    $('.c-rte__body-text p').each((_idx, element) => {
        const text = $(element).text().trim();
        if (text) {
            contentParts.push(text);
        }
    });

    const content = contentParts.join('\n\n');

    const mediaItems: ReleaseMedia[] = [];

    if (content) {
        reviewRelease("Health & Disability Commissioner", "News", content, link, mediaItems);
    }
}

async function getHdcNews(): Promise<HdcNews[]> {
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
    const newsItems: HdcNews[] = [];

    $('div.c-listing-pods li.o-grid__item').each((_, element) => {
        const item = $(element);
        const anchor = item.find("a.o-tile");

        if (anchor.length === 0) return;

        const title = anchor.find("h3.o-tile__heading").text().trim();
        const relativeUrl = anchor.attr("href");

        if (title && relativeUrl) {
            const url = new URL(relativeUrl, baseUrl).href;
            newsItems.push({
                title,
                url
            });
        }
    });

    if (newsItems.length === 0) {
        throw new Error("No news items found on the page. The website structure might have changed.");
    }

    return newsItems;
}

async function checkForNewHdcNews(): Promise<TaskResult> {
    let newsItems;
    try {
        newsItems = await getHdcNews();
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
    name: "HDC News",
    description: "Scrapes the Health & Disability Commissioner website for new news articles.",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000,
    },
    callback: checkForNewHdcNews,
} as Task;
