import { ParsedRssItem } from "../../../util/rss-parser.ts";
import type { Task } from "../../../types.ts";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import { load } from "npm:cheerio";
import { reviewRelease } from "../../../handlers/ai-handler.ts";
import {createRssTask} from "../_rss.helper.ts";

export async function fetchInformationFromRelease(link: string) {
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

    $('.prose.field--name-body p, .prose.field--name-body li').each((_idx, element) => {
        const text = $(element).text().trim();
        if (text) {
            contentParts.push(text);
        }
    });


    const content = contentParts.join('\n\n');

    if (content) {
        reviewRelease("NZ Government", "Press Release", content, link);
    }
}

async function onNewGovernmentRelease(item: ParsedRssItem) {
    if (item.links[0]?.href && item.title) {
        await fetchInformationFromRelease(item.links[0].href);
    }
}

export default createRssTask({
    name: "NZ Government Releases",
    description: "Listens to and logs media releases of the NZ Government.",
    url: "https://www.beehive.govt.nz/releases/feed",
    frequencyMs: 10 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 2 * 60 * 1000
    },
    onNewItem: onNewGovernmentRelease
}) as Task;