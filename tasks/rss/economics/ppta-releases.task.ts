import { load } from "npm:cheerio";
import { ParsedRssItem } from "../../../util/rss-parser.ts";
import type { ReleaseMedia, Task } from "../../../types.ts";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";
import {createRssTask} from "../_rss.helper.ts";

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
    $('.u-content p').each((_idx, element) => {
        const text = $(element).text().trim();
        if (text) {
            contentParts.push(text);
        }
    });

    const intro = $('.page-header__intro p').text().trim();
    if (intro) {
        contentParts.unshift(intro);
    }

    const content = contentParts.join('\n\n');

    const mediaItems: ReleaseMedia[] = [];
    $('.featured-image img').each((_idx, el) => {
        const relativeLink = $(el).attr('src');
        if (relativeLink) {
            const absoluteLink = new URL(relativeLink, new URL(link).origin).href;
            mediaItems.push({ link: absoluteLink, title: $(el).attr('alt') || undefined });
        }
    });

    if (content) {
        reviewRelease("Post Primary Teachers Association", "Media Release", content, link, mediaItems);
    }
}

async function onNewPPTARelease(item: ParsedRssItem) {
    if (item.links[0].href) {
        await fetchInformationFromRelease(item.links[0].href);
    }
}

export default createRssTask({
    name: "PPTA Releases",
    description: "Listens to and logs media releases from the Post Primary Teachers Association.",
    url: "https://www.ppta.org.nz/news-and-media/rss",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000
    },
    onNewItem: onNewPPTARelease
}) as Task;