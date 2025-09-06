import { load } from "npm:cheerio";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import type { Task, TaskResult, ReleaseMedia } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const decisionsUrl = "https://www.hdc.org.nz/decisions/latest-decisions/";
const baseUrl = "https://www.hdc.org.nz";

const seenDecisionUrls = new Set<string>();
let isFirstRun = true;

interface HdcDecision {
    title: string;
    details: string;
    url: string;
}

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

    $('.c-rte__body-text > div > *').each((_idx, element) => {
        const $el = $(element);

        if ($el.is('ul, ol')) {
            const listItems = $el.find('li').map((_, li) => {
                return `- ${$(li).text().trim().replace(/\s\s+/g, ' ')}`;
            }).get();
            if (listItems.length > 0) {
                contentParts.push(listItems.join('\n'));
            }
        } else {
            const text = $el.text().trim();
            if (text) {
                contentParts.push(text.replace(/\s\s+/g, ' '));
            }
        }
    });

    const content = contentParts.join('\n\n');

    const mediaItems: ReleaseMedia[] = [];

    if (content) {
        reviewRelease("Health & Disability Commissioner", "Decision", content, link, mediaItems);
    }
}


async function getHdcDecisions(): Promise<HdcDecision[]> {
    const res = await fetchWithBrowserHeaders(decisionsUrl);
    let html;
    if (res instanceof Response){
        if (!res.ok){
            throw new Error(`Did not get an OK response from ${decisionsUrl}`);
        }
        html = await res.text();
    } else {
        if (!res){
            throw new Error(`Did not get an OK response from ${decisionsUrl}`);
        }
        html = res;
    }

    const $ = load(html);
    const decisionItems: HdcDecision[] = [];

    $('section.c-rte').each((_, element) => {
        const item = $(element);
        const anchor = item.find("h3 > a");

        if (anchor.length === 0) return;

        const title = anchor.text().trim();
        const details = item.find("h4").text().trim();
        const relativeUrl = anchor.attr("href");

        if (title && details && relativeUrl) {
            const url = new URL(relativeUrl, baseUrl).href;
            decisionItems.push({
                title,
                details,
                url
            });
        }
    });

    if (decisionItems.length === 0) {
        throw new Error("No decision items found on the page. The website structure might have changed.");
    }

    return decisionItems;
}

async function checkForNewHdcDecisions(): Promise<TaskResult> {
    let decisionItems;
    try {
        decisionItems = await getHdcDecisions();
    } catch (error) {
        return { success: false, errorMessage: (error as Error).message };
    }

    for (const item of decisionItems.reverse()) {
        if (!seenDecisionUrls.has(item.url)) {
            seenDecisionUrls.add(item.url);

            if (!isFirstRun) {
                await fetchInformationFromRelease(item.url);
            }
        }
    }

    if (isFirstRun) {
        isFirstRun = false;
    }

    return { success: true };
}

export default {
    name: "HDC Latest Decisions",
    description: "Scrapes the Health & Disability Commissioner website for new decisions.",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000,
    },
    callback: checkForNewHdcDecisions,
} as Task;
