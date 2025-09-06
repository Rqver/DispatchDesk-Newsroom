import { load } from "npm:cheerio";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import type { Task, TaskResult, ReleaseMedia } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const diaPressUrl = "https://www.dia.govt.nz/press.nsf/index?OpenView";
const baseUrl = "https://www.dia.govt.nz";

const seenReleaseUrls = new Set<string>();
let isFirstRun = true;

interface DiaPressRelease {
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
    $('div.content p').each((_idx, element) => {
        const text = $(element).text().trim();
        if (text) {
            contentParts.push(text);
        }
    });

    const content = contentParts.join('\n\n');

    const mediaItems: ReleaseMedia[] = [];
    $('div.content img').each((_idx, el) => {
        const relativeLink = $(el).attr('src');
        if (relativeLink) {
            const absoluteLink = new URL(relativeLink, new URL(link).origin).href;
            mediaItems.push({ link: absoluteLink, title: $(el).attr('alt') || undefined });
        }
    });

    if (content) {
        reviewRelease("Department of Internal Affairs", "Press Release", content, link, mediaItems);
    }
}

async function getPressReleases(): Promise<DiaPressRelease[]> {
    const res = await fetchWithBrowserHeaders(diaPressUrl);
    let html;
    if (res instanceof Response){
        if (!res.ok){
            throw new Error(`Did not get an OK response from ${diaPressUrl}`);
        }
        html = await res.text();
    } else {
        if (!res){
            throw new Error(`Did not get an OK response from ${diaPressUrl}`);
        }
        html = res;
    }

    const $ = load(html);
    const releases: DiaPressRelease[] = [];

    $('table tr td font a').each((_, element) => {
        const linkElement = $(element);
        const fullText = linkElement.text().trim();
        const relativeUrl = linkElement.attr("href");

        const titleParts = fullText.split(' -: ');
        if (titleParts.length > 1 && relativeUrl) {
            const title = titleParts[1].trim();
            releases.push({
                title,
                url: new URL(relativeUrl, baseUrl).href,
            });
        }
    });

    if (releases.length === 0) {
        throw new Error("No press releases found on the page. The website structure might have changed.");
    }

    return releases;
}

async function checkForNewDiaReleases(): Promise<TaskResult> {
    let releases;
    try {
        releases = await getPressReleases();
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
    name: "DIA General Press Releases",
    description: "Scrapes the DIA general press release page for new releases and updates.",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000
    },
    callback: checkForNewDiaReleases,
} as Task;
