import { load } from "npm:cheerio";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import type { ReleaseMedia, Task, TaskResult } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const newsUrl = "https://www.nzdf.mil.nz/media-centre/news/search/?q=&_newstype=162&_services=&_topics%5B9%5D=9&sort=";
const baseUrl = "https://www.nzdf.mil.nz";

const seenNewsUrls = new Set<string>();
let isFirstRun = true;

interface NzdfNews {
    title: string;
    url: string;
    category: string;
    date: string;
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

    $('.elements--flush .elementcontent .typography > *').each((_idx, element) => {
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

    const content = title + ": " + contentParts.join('\n\n');

    const mediaItems: ReleaseMedia[] = [];
    $('.elementsimpleimage').each((_idx, el) => {
        const imageElement = $(el).find('img');
        const relativeLink = imageElement.attr('src');
        const title = imageElement.attr('alt')?.trim();

        if (relativeLink) {
            const isImage = /\.(jpg|jpeg|png|gif)$/i.test(relativeLink);
            if(isImage) {
                const absoluteLink = new URL(relativeLink, baseUrl).href;
                mediaItems.push({ link: absoluteLink, title: title || undefined });
            }
        }
    });

    if (content) {
        reviewRelease("New Zealand Defence Force", "News", content, link, mediaItems);
    }
}


async function getNzdfNews(): Promise<NzdfNews[]> {
    const res = await fetchWithBrowserHeaders(newsUrl, {
        "X-Requested-With": "XMLHttpRequest"
    }, true);
    if (!res || !res.ok) {
        throw new Error(`Failed to fetch page, status: ${res?.status}, text: ${await res.text()}`);
    }

    const jsonData = await res.json();
    const html = jsonData.content;
    if (!html) {
        throw new Error("No 'content' key found in the JSON response.");
    }

    const $ = load(html);
    const newsItems: NzdfNews[] = [];

    $('a.article').each((_, element) => {
        const item = $(element);
        const relativeUrl = item.attr("href");
        const title = item.find("h3.article__title").text().trim();
        const date = item.find("p.article__date").text().trim();
        const category = item.find("h4.article__category").text().trim();

        if (title && relativeUrl) {
            const url = new URL(relativeUrl, baseUrl).href;
            newsItems.push({
                title,
                url,
                category,
                date
            });
        }
    });

    if (newsItems.length === 0) {
        throw new Error("No news items found in the response content. The website structure might have changed.");
    }

    return newsItems;
}

async function checkForNewNzdfNews(): Promise<TaskResult> {
    let newsItems;
    try {
        newsItems = await getNzdfNews();
    } catch (error) {
        return { success: false, errorMessage: (error as Error).message };
    }

    for (const item of newsItems.reverse()) {
        if (!seenNewsUrls.has(item.url)) {
            seenNewsUrls.add(item.url);

            if (!isFirstRun) {
                await fetchInformationFromRelease(item.url, item.title);
            }
        }
    }

    if (isFirstRun) {
        isFirstRun = false;
    }

    return { success: true };
}

export default {
    name: "NZDF News",
    description: "Scrapes the NZDF website for new media releases.",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000,
    },
    callback: checkForNewNzdfNews,
} as Task;
