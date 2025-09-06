import { ParsedRssItem } from "../../../util/rss-parser.ts";
import type { ReleaseMedia, Task } from "../../../types.ts";
import { load } from "npm:cheerio";
import { reviewRelease } from "../../../handlers/ai-handler.ts";
import {fetchWithHeadlessBrowser} from "../../../util/web.ts";
import {createRssTask} from "../_rss.helper.ts";

async function fetchInformationFromRelease(link: string) {
    const html = await fetchWithHeadlessBrowser(link);
    if (!html) {
        throw new Error(`Failed to fetch page!`);
    }

    const $ = load(html);

    const contentParts: string[] = [];

    $('.article__wrapper p.ng-binding.ng-scope').each((_idx, element) => {
        const text = $(element).text().trim();
        if (text) {
            contentParts.push(text);
        }
    });

    const content = contentParts.join('\n\n');

    const mediaItems: ReleaseMedia[] = [];

    if (content) {
        reviewRelease("Fire and Emergency New Zealand", "Media Release", content, link, mediaItems);
    }
}

async function onNewFENZRelease(item: ParsedRssItem) {
    if (item.links[0]?.href) {
        await fetchInformationFromRelease(item.links[0].href);
    }
}

export default createRssTask({
    name: "FENZ Releases",
    description: "Listens to and logs media releases from FENZ",
    needsHeadlessBrowser: true,
    url: "https://www.fireandemergency.nz/incidents-and-news/news-and-media/rss/",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000
    },
    onNewItem: onNewFENZRelease
}) as Task;