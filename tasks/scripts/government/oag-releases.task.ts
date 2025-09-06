import { load } from "npm:cheerio";
import type { Task, TaskResult, ReleaseMedia } from "../../../types.ts";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const oagUrl = "https://oag.parliament.nz/reports/latest";
const baseUrl = "https://oag.parliament.nz";

const seenReportUrls = new Set<string>();
let isFirstRun = true;

interface OagReport {
    title: string;
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
    $('#content-core > *').each((_idx, element) => {
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
    $('#content-core img').each((_idx, el) => {
        const relativeLink = $(el).attr('src');
        if (relativeLink) {
            const absoluteLink = new URL(relativeLink, new URL(link).origin).href;
            mediaItems.push({ link: absoluteLink, title: $(el).attr('alt') || undefined });
        }
    });

    if (content) {
        reviewRelease("Office of the Auditor-General", "Report", content, link, mediaItems);
    }
}

async function getOagReports(): Promise<OagReport[]> {
    const res = await fetchWithBrowserHeaders(oagUrl);
    let html;
    if (res instanceof Response){
        if (!res.ok){
            throw new Error(`Did not get an OK response from ${oagUrl}`);
        }
        html = await res.text();
    } else {
        if (!res){
            throw new Error(`Did not get an OK response from ${oagUrl}`);
        }
        html = res;
    }

    const $ = load(html);
    const reports: OagReport[] = [];

    $('div.entries article.entry').each((_i, el) => {
        const article = $(el);
        const title = article.find('header a').text().trim();
        const relativeUrl = article.find('header a').attr('href');

        if (title && relativeUrl) {
            reports.push({
                title,
                url: new URL(relativeUrl, baseUrl).href,
            });
        } else {
            console.error(`Failed to parse a report, missing title or URL: ${article.html()}`);
        }
    });

    if (reports.length === 0) {
        throw new Error("No reports found on the page. The page structure may have changed.")
    }

    return reports;
}

async function checkForNewOagReports(): Promise<TaskResult> {
    let reports;
    try {
        reports = await getOagReports();
    } catch (error) {
        return { success: false, errorMessage: (error as Error).message };
    }

    for (const report of reports.reverse()) {
        if (!seenReportUrls.has(report.url)) {
            seenReportUrls.add(report.url);

            if (!isFirstRun) {
                await fetchInformationFromRelease(report.url);
            }
        }
    }

    if (isFirstRun) {
        isFirstRun = false;
    }

    return { success: true };
}

export default {
    name: "OAG Latest Reports",
    description: "Scrapes the OAG website for new reports and updates.",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000
    },
    callback: checkForNewOagReports
} as Task;