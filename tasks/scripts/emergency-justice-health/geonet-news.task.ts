import { load } from "npm:cheerio";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import type { Task, TaskResult, ReleaseMedia } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const apiUrl = "https://api.geonet.org.nz/news/geonet";
const baseUrl = "https://www.geonet.org.nz";
const seenNewsUrls = new Set<string>();
let isFirstRun = true;

interface GeonetFeedItem {
    title: string;
    tag: string;
    link: string;
}

interface GeonetApiResponse {
    feed: GeonetFeedItem[];
}

async function fetchInformationFromRelease(link: string, type: string) {
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
    $('.col-12 p.lead, .col-12 + div p').each((_idx, element) => {
        const text = $(element).text().trim();
        if (text) {
            contentParts.push(text);
        }
    });

    const content = contentParts.join('\n\n');

    const mediaItems: ReleaseMedia[] = [];
    $('div.row img').each((_idx, el) => {
        const relativeLink = $(el).attr('src');
        if (relativeLink) {
            const absoluteLink = new URL(relativeLink, baseUrl).href;
            mediaItems.push({ link: absoluteLink, title: $(el).attr('alt') || undefined });
        }
    });

    if (content) {
        reviewRelease("GeoNet", type, content, link, mediaItems);
    }
}

async function getGeonetNews(): Promise<GeonetFeedItem[]> {
    const res = await fetch(apiUrl);
    if (!res || !res.ok) {
        throw new Error(`Failed to fetch from API, status: ${res?.status}, text: ${await res.text()}`);
    }

    const data: GeonetApiResponse = await res.json();

    if (!data.feed || data.feed.length === 0) {
        throw new Error("No news items found in the API response. The API structure might have changed.");
    }

    return data.feed;
}

async function checkForNewGeonetNews(): Promise<TaskResult> {
    let newsItems;
    try {
        newsItems = await getGeonetNews();
    } catch (error) {
        return { success: false, errorMessage: (error as Error).message };
    }

    for (const item of newsItems.reverse()) {
        if (!seenNewsUrls.has(item.link)) {
            seenNewsUrls.add(item.link);

            if (!isFirstRun) {
                await fetchInformationFromRelease(item.link, item.tag);
            }
        }
    }

    if (isFirstRun) {
        isFirstRun = false;
    }

    return { success: true };
}

export default {
    name: "GeoNet News & Bulletins",
    description: "Fetches the latest news and volcanic activity bulletins from the GeoNet API and scrapes the full content.",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000,
    },
    callback: checkForNewGeonetNews,
} as Task;