import { load } from "npm:cheerio";
import {fetchWithBrowserHeaders, fetchWithHeadlessBrowser} from "../../../util/web.ts";
import type {Task, TaskResult, ReleaseMedia} from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const statsNzUrl = "https://www.stats.govt.nz/insights/?categoryFiltersID=138&filters=News&sort=4";
const baseUrl = "https://www.stats.govt.nz";

const seenInsightUrls = new Set<string>();
let isFirstRun = true;

interface StatsNzInsight {
    title: string;
    description: string;
    url: string;
}

interface StatsNzRawPage {
    Title: string;
    PageLink: string;
    MetaDescription?: string;
    FeaturedText?: string;
}

async function fetchInformationFromRelease(link: string){
    const html = await fetchWithHeadlessBrowser(link, {
        waitForSelector: "div.row",
    });

    if (!html) {
        throw new Error("Failed to get page content using headless browser.")
    }

    const $ = load(html);
    const contentParts: string[] = [];

    $('article.u-max-width-content .typography p').each((_idx, element) => {
        const text = $(element).text().trim();
        if (text) {
            contentParts.push(text);
        }
    });

    const content = contentParts.join('\n\n');

    const mediaItems: ReleaseMedia[] = [];
    $('article.u-max-width-content img').each((_idx, el) => {
        const relativeLink = $(el).attr('src');
        if (relativeLink) {
             const absoluteLink = new URL(relativeLink, new URL(link).origin).href;
             mediaItems.push({link: absoluteLink, title: $(el).attr('alt') || undefined})
        }
    });

    if (content){
        reviewRelease("Stats NZ", "Insight", content, link, mediaItems);
    }
}


async function getInsights(): Promise<StatsNzInsight[]> {
    const res = await fetchWithBrowserHeaders(statsNzUrl);
    let html;
    if (res instanceof Response){
        if (!res.ok){
            throw new Error(`Did not get an OK response from ${statsNzUrl}`);
        }
        html = await res.text();
    } else {
        if (!res){
            throw new Error(`Did not get an OK response from ${statsNzUrl}`);
        }
        html = res;
    }

    const $ = load(html);
    const insights: StatsNzInsight[] = [];

    const dataElement = $('#pageViewData');
    const dataValue = dataElement.attr('data-value');

    if (!dataValue) {
        throw new Error("Could not find the pageViewData element or it's data-value attribute.")
    }

    const data = JSON.parse(dataValue);
    const pages: StatsNzRawPage[] = data?.PaginatedBlockPages;

    if (!Array.isArray(pages)) {
        throw new Error(`Parsed JSON does not contain expected PaginatedBlockPages array: ${data}`)
    }

    for (const page of pages) {
        const title = page.Title?.trim();
        const relativeUrl = page.PageLink;

        let description = page.MetaDescription?.trim() ?? "";
        if (!description && page.FeaturedText) {
            description = load(page.FeaturedText).text().trim();
        }

        if (title && relativeUrl) {
            insights.push({
                title,
                description,
                url: new URL(relativeUrl, baseUrl).href,
            });
        }
    }

    return insights;
}

async function checkForNewStatsNzInsights(): Promise<TaskResult> {
    let insights;
    try {
        insights = await getInsights();
    } catch (error){
        return {success: false, errorMessage: error as string}
    }

    for (const insight of insights.reverse()) {
        if (!seenInsightUrls.has(insight.url)) {
            seenInsightUrls.add(insight.url);

            if (!isFirstRun) {
                await fetchInformationFromRelease(insight.url);
            }
        }
    }

    if (isFirstRun) {
        isFirstRun = false;
    }

    return {success: true}
}

export default {
    name: "Stats NZ Insights",
    description: "Scrapes the Stats NZ insights page for new releases and updates.",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000
    },
    callback: checkForNewStatsNzInsights,
} as Task;