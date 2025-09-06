import { load } from "npm:cheerio";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import type { Task, TaskResult, ReleaseMedia } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const apiUrl = "https://wp.roymorgan.com/wp-json/rmr/v1/findings-search?page=1&sort_by=date&country[]=new-zealand";
const baseUrl = "https://www.roymorgan.com";

const seenReleaseUrls = new Set<string>();
let isFirstRun = true;

interface RoyMorganRelease {
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
    $('.finding_finding__body_col_left__8EDp9 .blocks_root__JDHG7 > *').each((_idx, element) => {
        const text = $(element).text().trim();
        if (text) {
            contentParts.push(text);
        }
    });

    const content = contentParts.join('\n\n');

    const mediaItems: ReleaseMedia[] = [];
    if (content) {
        reviewRelease("Roy Morgan Research NZ", "Finding", content, link, mediaItems);
    }
}

async function getRoyMorganReleases(): Promise<RoyMorganRelease[]> {
    const res = await fetchWithBrowserHeaders(apiUrl);
    let jsonData;
    if (res instanceof Response){
        if (!res.ok){
            throw new Error(`Did not get an OK response from ${apiUrl}`);
        }
        jsonData = await res.json();
    } else {
        if (!res){
            throw new Error(`Did not get an OK response from ${apiUrl}`);
        }
        jsonData = JSON.parse(res);
    }


    if (!Array.isArray(jsonData)) {
        throw new Error("API response is not an array. The API structure might have changed.");
    }

    const releases: RoyMorganRelease[] = jsonData.map((finding: any) => {
        const { title, slug } = finding;
        if (title && slug) {
            return {
                title,
                url: `${baseUrl}/findings/${slug}`,
            };
        }
        return null;
    }).filter((r): r is RoyMorganRelease => r !== null);


    if (releases.length === 0) {
        throw new Error("No releases found in the API response.");
    }

    return releases;
}

async function checkForNewRoyMorganReleases(): Promise<TaskResult> {
    let releases;
    try {
        releases = await getRoyMorganReleases();
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
    name: "Roy Morgan Research NZ News",
    description: "Scrapes the Roy Morgan Research NZ findings API for new releases and updates.",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000
    },
    callback: checkForNewRoyMorganReleases
} as Task;