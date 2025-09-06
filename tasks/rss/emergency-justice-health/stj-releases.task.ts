import { load } from "npm:cheerio";
import { ParsedRssItem } from "../../../util/rss-parser.ts";
import type { ReleaseMedia, Task } from "../../../types.ts";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";
import {createRssTask} from "../_rss.helper.ts";

const baseUrl = "https://stjohn.org.nz";

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
    $('article.clearfix div p').each((_idx, element) => {
        const text = $(element).text().trim();
        if (text) {
            contentParts.push(text);
        }
    });

    let content = contentParts.join('\n\n');
    content = content.replace(/\bENDS\b[\s\S]*$/i, "").trim();

    const mediaItems: ReleaseMedia[] = [];
    $('article.clearfix img').each((_idx, el) => {
        const relativeLink = $(el).attr('src');
        if (relativeLink) {
            const absoluteLink = new URL(relativeLink, new URL(link).origin).href;
            mediaItems.push({ link: absoluteLink, title: $(el).attr('alt') || undefined });
        }
    });

    if (content) {
        reviewRelease("St John Ambulance", "Media Release", content, link, mediaItems);
    }
}

async function onNewStjRelease(item: ParsedRssItem) {
    if (item.links[0].href) {
        const fullUrl = new URL(item.links[0].href, baseUrl).href;
        await fetchInformationFromRelease(fullUrl);
    }
}

export default createRssTask({
    name: "Hato Hone St John Media Releases",
    description: "Listens to and logs media releases from Hato Hone St John.",
    url: "https://www.stjohn.org.nz/RSS",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000
    },
    onNewItem: onNewStjRelease
}) as Task;