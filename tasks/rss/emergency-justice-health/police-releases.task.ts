import { ParsedRssItem } from "../../../util/rss-parser.ts";
import type {ReleaseMedia, Task} from "../../../types.ts";
import {fetchWithBrowserHeaders} from "../../../util/web.ts";
import {load} from "npm:cheerio";
import {reviewRelease} from "../../../handlers/ai-handler.ts";
import {createRssTask} from "../_rss.helper.ts";

async function fetchInformationFromRelease(link: string){
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

    $('.field-name-body > *').each((_idx, element) => {
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

    let content = contentParts.join('\n\n');

    content = content.replace(/\bENDS\b[\s\S]*$/i, "").trim();

    const mediaItems: ReleaseMedia[] = [];
    $('.news-article__related-download').each((_idx, el) => {
        const linkElement = $(el).find('a.news-article__related-download-link');
        const title = linkElement.text().trim();
        const relativeLink = linkElement.attr('href');

        const absoluteLink = relativeLink ? new URL(relativeLink, new URL(link).origin).href : 'No link found';

        mediaItems.push({link: absoluteLink, title: title || undefined})
    });

    if (content){
        reviewRelease("New Zealand Police", "Press Release", content, link, mediaItems);
    }
}


async function onNewPoliceRelease(item: ParsedRssItem) {
    if (item.links[0].href){
        fetchInformationFromRelease(item.links[0].href)
    }
}

export default createRssTask({
    name: "NZ Police Releases",
    description: "Listens to and logs media releases of the NZ Police.",
    url: "https://www.police.govt.nz/rss/news",
    frequencyMs: 10 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 60 * 1000
    },
    onNewItem: onNewPoliceRelease
}) as Task;