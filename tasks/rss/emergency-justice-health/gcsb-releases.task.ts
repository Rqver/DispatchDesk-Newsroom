import { ParsedRssItem } from "../../../util/rss-parser.ts";
import type { ReleaseMedia, Task } from "../../../types.ts";
import {fetchWithHeadlessBrowser} from "../../../util/web.ts";
import { load } from "npm:cheerio";
import { reviewRelease } from "../../../handlers/ai-handler.ts";
import {createRssTask} from "../_rss.helper.ts";

async function fetchInformationFromRelease(link: string) {
    const html = await fetchWithHeadlessBrowser(link);
    if (!html) {
        throw new Error(`Failed to fetch page!`);
    }

    const $ = load(html);
    const contentParts: string[] = [];

    $('.content p').each((_idx, element) => {
        const text = $(element).text().trim();
        if (text) {
            contentParts.push(text);
        }
    });

    const content = contentParts.join('\n\n');

    const mediaItems: ReleaseMedia[] = [];

    if (content) {
        reviewRelease("Government Communications Security Bureau", "Media Release", content, link, mediaItems);
    }
}

async function onNewGCSBRelease(item: ParsedRssItem) {
    if (item.links[0]?.href) {
        await fetchInformationFromRelease(item.links[0].href);
    }
}

export default createRssTask({
    name: "GCSB Releases",
    description: "Listens to and logs media releases of the Government Communications Security Bureau.",
    url: "https://www.gcsb.govt.nz/news/rss",
    needsHeadlessBrowser: true,
    frequencyMs: 2 * 60 * 1000,
    allowedFailures: 4,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000
    },
    onNewItem: onNewGCSBRelease
}) as Task;
