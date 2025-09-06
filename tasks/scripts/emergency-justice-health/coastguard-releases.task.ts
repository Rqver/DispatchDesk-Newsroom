import { load } from "npm:cheerio";
import {fetchWithBrowserHeaders, fetchWithHeadlessBrowser} from "../../../util/web.ts";
import type { Task, TaskResult, ReleaseMedia } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const newsUrl = "https://www.coastguard.nz/our-story/news-and-media";

const seenNewsUrls = new Set<string>();
let isFirstRun = true;

interface CoastguardNews {
    title: string;
    url: string;
    date: string;
}

async function fetchInformationFromRelease(link: string) {
    const html = await fetchWithHeadlessBrowser(link);
    if (!html) {
        throw new Error(`Did not get any HTML back from ${link} using headless browser.`);
    }

    const $ = load(html);

    const contentParts: string[] = [];

    $('.main-content.prose p, .text-content__content.prose p').each((_idx, element) => {
        const text = $(element).text().trim();
        if (text) {
            contentParts.push(text);
        }
    });

    let content = contentParts.join('\n\n');

    content = content.replace(/\bENDS\b[\s\S]*$/i, "").trim();

    const mediaItems: ReleaseMedia[] = [];
    $('section.craft-block.media-block').each((_idx, el) => {
        const $el = $(el);
        const imageElement = $el.find('img');
        const imageUrl = imageElement.attr('src');

        if (imageUrl && /\.(jpg|jpeg|png|webp|gif)$/i.test(imageUrl)) {
            const caption = $el.find('.caption').text().trim();
            const altText = imageElement.attr('alt')?.trim();

            mediaItems.push({
                link: imageUrl,
                title: caption || altText || undefined
            });
        }
    });

    if (content) {
        reviewRelease("Coastguard New Zealand", "Media Release", content, link, mediaItems);
    }
}

async function getCoastguardNews(): Promise<CoastguardNews[]> {
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
    const newsItems: CoastguardNews[] = [];

    $('div.card-small').each((_, element) => {
        const item = $(element);
        const anchor = item.find(".card-small__body--title a");

        if (anchor.length === 0) return;

        const title = anchor.text().trim();
        const url = anchor.attr("href");
        const date = item.find(".card-small__body--event-date").text().trim();

        if (title && url) {
            newsItems.push({
                title,
                url,
                date
            });
        }
    });

    if (newsItems.length === 0) {
        throw new Error("No news items found on the page. The website structure might have changed.");
    }

    return newsItems;
}

async function checkForNewCoastguardNews(): Promise<TaskResult> {
    let newsItems;
    try {
        newsItems = await getCoastguardNews();
    } catch (error) {
        return { success: false, errorMessage: (error as Error).message };
    }

    for (const item of newsItems.reverse()) {
        if (!seenNewsUrls.has(item.url)) {
            seenNewsUrls.add(item.url);

            if (!isFirstRun) {
                try {
                    await fetchInformationFromRelease(item.url);
                } catch (error) {
                    console.error(`Failed to process release from ${item.url}:`, (error as Error).message);
                }
            }
        }
    }

    if (isFirstRun) {
        isFirstRun = false;
    }

    return { success: true };
}

export default {
    name: "Coastguard NZ News",
    description: "Scrapes the Coastguard NZ website for new news and media releases.",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000,
    },
    callback: checkForNewCoastguardNews
} as Task;
