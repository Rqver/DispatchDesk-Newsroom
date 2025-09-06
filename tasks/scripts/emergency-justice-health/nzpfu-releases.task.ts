import { load } from "npm:cheerio";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import type { ReleaseMedia, Task, TaskResult } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const newsUrl = "https://www.nzpfu.org.nz/news/";
const baseUrl = "https://www.nzpfu.org.nz";

const seenNewsUrls = new Set<string>();
let isFirstRun = true;

interface NzpfuNews {
    title: string;
    url: string;
    description: string;
    meta: string;
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

    $('.section-article__entry .s8-templates-section-content > *').each((_idx, element) => {
        const $el = $(element);

        if ($el.is('ul')) {
            const listItems = $el.find('li').map((_, li) => {
                return `- ${$(li).text().trim()}`;
            }).get();
            contentParts.push(listItems.join('\n'));
        } else if ($el.is('blockquote, p')) {
            const text = $el.text().trim();
            if (text) {
                contentParts.push(text);
            }
        }
    });

    const content = contentParts.join('\n\n');

    const mediaItems: ReleaseMedia[] = [];

    if (content) {
        reviewRelease("NZ Professional Firefighters Union", "Post to Members", content, link, mediaItems);
    }
}


async function getNzpfuNews(): Promise<NzpfuNews[]> {
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
    const newsItems: NzpfuNews[] = [];

    $('div.s8-templates-card').each((_, element) => {
        const item = $(element).find('article');
        const anchor = item.find('h2 a');

        if (anchor.length === 0) return;

        const title = anchor.find('span[itemprop="headline"]').text().trim();
        const relativeUrl = anchor.attr('href');
        const description = item.find('p[itemprop="description"]').text().trim();
        const meta = item.find('.post-meta small').text().trim().replace(/\s+/g, ' ');

        if (title && relativeUrl) {
            const url = new URL(relativeUrl, baseUrl).href;
            newsItems.push({
                title,
                url,
                description,
                meta
            });
        }
    });

    if (newsItems.length === 0) {
        throw new Error("No news items found on the page. The website structure might have changed.");
    }

    return newsItems;
}

async function checkForNewNzpfuNews(): Promise<TaskResult> {
    let newsItems;
    try {
        newsItems = await getNzpfuNews();
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
    name: "NZPFU News",
    description: "Scrapes the NZ Professional Firefighters Union website for new news articles.",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000,
    },
    callback: checkForNewNzpfuNews,
} as Task;
