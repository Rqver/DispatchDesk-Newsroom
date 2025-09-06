import { load } from "npm:cheerio";
import type { Task, TaskResult } from "../../../types.ts";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const ipcaSummariesUrl = "https://www.ipca.govt.nz/Site/publications-and-media/Summaries-of-Police-investigations-overseen-by-the-IPCA.aspx";

const seenSummaryUrls = new Set<string>();
let isFirstRun = true;

interface IpcaInvestigationSummary {
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

    $('#MoSTContent > p').each((_idx, element) => {
        const text = $(element).text().trim();
        if (text) {
            contentParts.push(text);
        }
    });

    const content = contentParts.join('\n\n');

    if (content) {
        reviewRelease("IPCA", "Police Investigation Summary", content, link);
    }
}

async function getIpcaInvestigationSummaries(): Promise<IpcaInvestigationSummary[]> {
    const res = await fetchWithBrowserHeaders(ipcaSummariesUrl);
    let html;
    if (res instanceof Response){
        if (!res.ok){
            throw new Error(`Did not get an OK response from ${ipcaSummariesUrl}`);
        }
        html = await res.text();
    } else {
        if (!res){
            throw new Error(`Did not get an OK response from ${ipcaSummariesUrl}`);
        }
        html = res;
    }

    const $ = load(html);
    const summaries: IpcaInvestigationSummary[] = [];
    const baseUrl = "https://www.ipca.govt.nz";

    $("div.MoSTDocumentList").first().find("div.MoSTDocumentListRow").each((_, element) => {
        const item = $(element);
        const linkEl = item.find(".MoSTDocumentListHeading a");

        const title = linkEl.text().trim();
        const relativeUrl = linkEl.attr("href");

        if (title && relativeUrl) {
            const url = baseUrl + relativeUrl;
            summaries.push({ title, url });
        }
    });

    return summaries;
}

async function checkForNewIpcaSummaries(): Promise<TaskResult> {
    let summaries;
    try {
        summaries = await getIpcaInvestigationSummaries();
    } catch (error) {
        return { success: false, errorMessage: (error as Error).message };
    }

    for (const summary of summaries.reverse()) {
        if (!seenSummaryUrls.has(summary.url)) {
            seenSummaryUrls.add(summary.url);

            if (!isFirstRun) {
                await fetchInformationFromRelease(summary.url);
            }
        }
    }

    if (isFirstRun) {
        isFirstRun = false;
    }

    return { success: true };
}

export default {
    name: "IPCA Police Investigation Summaries",
    description: "Scrapes the IPCA website for new summaries of Police investigations and their full content.",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000
    },
    callback: checkForNewIpcaSummaries,
} as Task;