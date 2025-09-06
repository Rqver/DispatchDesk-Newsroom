import { load } from "npm:cheerio";
import type { Task, TaskResult } from "../../../types.ts";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const seenReleaseUrls = new Set<string>();
let isFirstRun = true;

interface IpcaMediaRelease {
    title: string;
    url: string;
}

function buildIpcaUrl(year: number): string {
    return `https://www.ipca.govt.nz/Site/publications-and-media/${year}-Media-Releases/`;
}

async function fetchValidIpcaPage(): Promise<{ html: string }> {
    const currentYear = new Date().getFullYear();
    const yearsToTry = [currentYear, currentYear - 1];

    for (const year of yearsToTry) {
        const url = buildIpcaUrl(year);
        const res = await fetchWithBrowserHeaders(url, {}, true);
        if (res.ok) {
            return { html: await res.text() };
        }
        if (res.status !== 404) {
            throw new Error(`Failed to fetch IPCA page for year ${year}: ${res.status}`);
        }
    }

    throw new Error("Could not find a valid IPCA media releases page for recent years.");
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

    $('#MoSTContent > div > p').each((_idx, element) => {
        const text = $(element).text().trim();
        if (text) {
            contentParts.push(text);
        }
    });

    const content = contentParts.join('\n\n');

    if (content) {
        reviewRelease("IPCA", "Media Release", content, link);
    }
}

async function getIpcaMediaReleases(): Promise<IpcaMediaRelease[]> {
    const { html } = await fetchValidIpcaPage();
    const $ = load(html);
    const releases: IpcaMediaRelease[] = [];
    const baseUrl = "https://www.ipca.govt.nz";

    $("div.MoSTDocumentListRow").each((_, element) => {
        const item = $(element);
        const linkEl = item.find(".MoSTDocumentListHeading a");

        const title = linkEl.text().trim();
        const relativeUrl = linkEl.attr("href");

        if (title && relativeUrl) {
            const url = baseUrl + relativeUrl;
            releases.push({ title, url });
        }
    });

    return releases;
}


async function checkForNewIpcaReleases(): Promise<TaskResult> {
    let releases;
    try {
        releases = await getIpcaMediaReleases();
    } catch (error) {
        return { success: false, errorMessage: (error as Error).message };
    }

    for (const release of releases.reverse()) {
        if (!seenReleaseUrls.has(release.url)) {
            seenReleaseUrls.add(release.url);

            if (!isFirstRun) {
                await fetchInformationFromRelease(release.url);
            }
        }
    }

    if (isFirstRun) {
        isFirstRun = false;
    }

    return { success: true };
}

export default {
    name: "IPCA Media Releases",
    description: "Scrapes the IPCA website for new media releases and their full content.",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000
    },
    callback: checkForNewIpcaReleases,
} as Task;