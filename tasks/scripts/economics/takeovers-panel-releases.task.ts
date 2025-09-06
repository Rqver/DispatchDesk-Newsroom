import { load } from "npm:cheerio";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";
import type { Task, TaskResult} from "../../../types.ts";

const pageUrl = "https://www.takeovers.govt.nz/about-the-panel/news";
const baseUrl = "https://www.takeovers.govt.nz";

const seenReleaseUrls = new Set<string>();
let isFirstRun = true;

interface MediaRelease {
    title: string;
    url:string;
}

async function fetchInformationFromRelease(link: string){
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

    $('.article-content .content p').each((_idx, element) => {
        const text = $(element).text().trim();
        if (text) {
            contentParts.push(text);
        }
    });

    const content = contentParts.join('\n\n');

    if (content){
        reviewRelease("Takeovers Panel", "News Release", content, link, []);
    }
}

async function getMediaReleases(): Promise<MediaRelease[]> {
    const res = await fetchWithBrowserHeaders(pageUrl);
    let html;
    if (res instanceof Response){
        if (!res.ok){
            throw new Error(`Did not get an OK response from ${pageUrl}`);
        }
        html = await res.text();
    } else {
        if (!res){
            throw new Error(`Did not get an OK response from ${pageUrl}`);
        }
        html = res;
    }

    const $ = load(html);
    const releases: MediaRelease[] = [];

    $("li.menu-item.current.togglable ul.child-list li.menu-item a").each((_, element) => {
        const link = $(element);

        const title = link.text().trim();
        const relativeUrl = link.attr("href");

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

async function checkForNewReleases(): Promise<TaskResult> {
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
    name: "Takeovers Panel News",
    frequencyMs: 2 * 60 * 1000,
    allowedFailures: 5,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000
    },
    callback: checkForNewReleases,
} as Task;