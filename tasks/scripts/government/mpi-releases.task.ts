import { load } from "npm:cheerio";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import type { Task, TaskResult, ReleaseMedia } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const newsUrl = "https://www.mpi.govt.nz/news/";
const baseUrl = "https://www.mpi.govt.nz";

const seenReleaseUrls = new Set<string>();
let isFirstRun = true;

interface MpiMediaRelease {
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
    $('.richtext p').each((_idx, element) => {
        const text = $(element).text().trim();
        if (text) {
            contentParts.push(text);
        }
    });

    const content = contentParts.join('\n\n');

    const mediaItems: ReleaseMedia[] = [];
    $('.richtext img').each((_idx, el) => {
        const relativeLink = $(el).attr('src');
        if (relativeLink) {
            const absoluteLink = new URL(relativeLink, new URL(link).origin).href;
            mediaItems.push({ link: absoluteLink, title: $(el).attr('alt') || undefined });
        }
    });

    if (content) {
        reviewRelease("Ministry for Primary Industries", "News", content, link, mediaItems);
    }
}

async function getMediaReleases(): Promise<MpiMediaRelease[]> {
    const res = await fetchWithBrowserHeaders(newsUrl);
    let html;
    if (res instanceof Response){
        if (!res.ok){
            throw new Error(`Did not get an OK response from ${newsUrl}`);
        }
        html = await res.text();
    } else {
        if (!res){
            throw new Error(`Did not get an OK response from ${newsUrl}`);
        }
        html = res;
    }

    const $ = load(html);
    const releases: MpiMediaRelease[] = [];

    $(".mediarelease-override .snippet").each((_, element) => {
        const articleCard = $(element);
        const linkElement = articleCard.find("a").first();

        const title = linkElement.find("h2").text().trim();
        const relativeUrl = linkElement.attr("href");

        if (title && relativeUrl) {
            releases.push({
                title,
                url: new URL(relativeUrl, baseUrl).href,
            });
        }
    });

    if (releases.length === 0) {
        throw new Error("No media releases found on the page. The website structure might have changed.");
    }

    return releases;
}

async function checkForNewMpiReleases(): Promise<TaskResult> {
    let releases;
    try {
        releases = await getMediaReleases();
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
    name: "MPI News",
    description: "Scrapes the MPI news page for new releases and updates.",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000
    },
    callback: checkForNewMpiReleases,
} as Task;