import { load } from "npm:cheerio";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import type { Task, TaskResult, ReleaseMedia } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const nzecNewsUrl = "https://exportcredit.treasury.govt.nz/news";
const baseUrl = "https://exportcredit.treasury.govt.nz";

const seenNewsUrls = new Set<string>();
let isFirstRun = true;

interface NzecNews {
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
    $('.prose.article__body p').each((_idx, element) => {
        const text = $(element).text().trim();
        if (text) {
            contentParts.push(text);
        }
    });

    const content = contentParts.join('\n\n');

    const mediaItems: ReleaseMedia[] = [];
    $('.prose.article__body img').each((_idx, el) => {
        const relativeLink = $(el).attr('src');
        if (relativeLink) {
            const absoluteLink = new URL(relativeLink, new URL(link).origin).href;
            mediaItems.push({ link: absoluteLink, title: $(el).attr('alt') || undefined });
        }
    });

    if (content) {
        reviewRelease("New Zealand Export Credit", "News", content, link, mediaItems);
    }
}

async function getNews(): Promise<NzecNews[]> {
    const res = await fetchWithBrowserHeaders(nzecNewsUrl);
    let html;
    if (res instanceof Response){
        if (!res.ok){
            throw new Error(`Did not get an OK response from ${nzecNewsUrl}`);
        }
        html = await res.text();
    } else {
        if (!res){
            throw new Error(`Did not get an OK response from ${nzecNewsUrl}`);
        }
        html = res;
    }

    const $ = load(html);
    const newsItems: NzecNews[] = [];

    $("div.slat.node").each((_, element) => {
        const articleCard = $(element);
        const linkElement = articleCard.find("h2.slat__title a");

        const title = linkElement.text().trim();
        const relativeUrl = linkElement.attr("href");

        if (title && relativeUrl) {
            newsItems.push({
                title,
                url: new URL(relativeUrl, baseUrl).href,
            });
        }
    });

    if (newsItems.length === 0) {
        throw new Error("No news found on the page. The website structure might have changed.");
    }

    return newsItems;
}

async function checkForNewNzecNews(): Promise<TaskResult> {
    let newsItems;
    try {
        newsItems = await getNews();
    } catch (error) {
        return { success: false, errorMessage: (error as Error).message };
    }

    for (const news of newsItems.reverse()) {
        if (!seenNewsUrls.has(news.url)) {
            seenNewsUrls.add(news.url);

            if (!isFirstRun) {
                await fetchInformationFromRelease(news.url);
            }
        }
    }

    if (isFirstRun) {
        isFirstRun = false;
    }

    return { success: true };
}

export default {
    name: "NZEC News",
    description: "Scrapes the NZEC news page for new releases and updates.",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000
    },
    callback: checkForNewNzecNews,
} as Task;