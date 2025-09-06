import { ParsedRssItem } from "../../../util/rss-parser.ts";
import type { ReleaseMedia, Task } from "../../../types.ts";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import { load } from "npm:cheerio";
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

    $('.entry-content > p').each((_idx, element) => {
        const text = $(element).text().trim();
        if (text) {
            contentParts.push(text);
        }
    });

    let content = contentParts.join('\n\n');

    const boilerplate = "By the authority vested in me as President by the Constitution and the laws of the United States of America, it is hereby ordered:";
    if (content.startsWith(boilerplate)) {
        content = content.substring(boilerplate.length).trim();
    }

    const mediaItems: ReleaseMedia[] = [];

    if (content) {
        reviewRelease("The White House", "Executive Order", content, link, mediaItems);
    }
}


async function onNewExecutiveOrder(item: ParsedRssItem) {
    if (item.links[0]?.href) {
        await fetchInformationFromRelease(item.links[0].href);
    }
}

export default createRssTask({
    name: "White House Executive Orders",
    description: "Listens to, scrapes, and logs new executive orders issued by The White House.",
    url: "https://www.whitehouse.gov/presidential-actions/executive-orders/feed/",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
      timePeriod: ["22:00", "06:00"],
      frequencyMs: 5 * 60 * 1000
    },
    onNewItem: onNewExecutiveOrder
}) as Task;