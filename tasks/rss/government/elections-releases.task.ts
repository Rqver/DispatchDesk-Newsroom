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
    $('.page__content > *').each((_idx, element) => {
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

    const content = contentParts.join('\n\n');

    const mediaItems: ReleaseMedia[] = [];
    $('.page__content img').each((_idx, el) => {
        const relativeLink = $(el).attr('src');
        if (relativeLink) {
            const absoluteLink = new URL(relativeLink, new URL(link).origin).href;
            mediaItems.push({ link: absoluteLink, title: $(el).attr('alt') || undefined });
        }
    });

    if (content) {
        reviewRelease("Electoral Commission", "Media Release", content, link, mediaItems);
    }
}

async function onNewElectionsRelease(item: ParsedRssItem) {
    if (item.links[0].href) {
        await fetchInformationFromRelease(item.links[0].href);
    }
}

export default createRssTask({
    name: "Elections NZ Releases",
    description: "Listens to and logs new releases from Elections NZ.",
    url: "https://www.elections.nz/media-and-news/rss",
    frequencyMs: 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 3 * 60 * 1000
    },
    onNewItem: onNewElectionsRelease
}) as Task;