import { load } from "npm:cheerio";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import type { Task, TaskResult } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const comcomUrl = "https://comcom.govt.nz/news-and-media/media-releases";
const baseUrl = "https://comcom.govt.nz";

const seenReleaseUrls = new Set<string>();
let isFirstRun = true;

interface ComcomMediaRelease {
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

    const title = $('h1.internal__title').text().trim();
    const contentParts: string[] = [];

    const introText = $('.intro-text p').text().trim();
    if (introText) {
        contentParts.push(introText);
    }

    $('.main-content > p, .main-content > h4').each((_idx, element) => {
        const text = $(element).text().trim();
        if (text) {
            contentParts.push(text);
        }
    });

    const content = contentParts.join('\n\n');


    if (content && title) {
        reviewRelease("Commerce Commission", "Media Release", content, link);
    }
}

async function getMediaReleases(): Promise<ComcomMediaRelease[]> {
    const res = await fetchWithBrowserHeaders(comcomUrl);
    let html;
    if (res instanceof Response){
        if (!res.ok){
            throw new Error(`Did not get an OK response from ${comcomUrl}`);
        }
        html = await res.text();
    } else {
        if (!res){
            throw new Error(`Did not get an OK response from ${comcomUrl}`);
        }
        html = res;
    }

    const $ = load(html);
    const releases: ComcomMediaRelease[] = [];

    $("div.media-release-item").each((_, element) => {
        const item = $(element);
        const titleEl = item.find("h4 a");

        const title = titleEl.text().trim();
        const redirectHref = titleEl.attr("href");

        let url: string | undefined;
        if (redirectHref) {
            try {
                const fullRedirectUrl = new URL(redirectHref, baseUrl);
                const targetUrl = fullRedirectUrl.searchParams.get('url');
                if (targetUrl) {
                    url = targetUrl;
                }
            } catch (e) {
                console.error(`Failed to parse URL from href: ${redirectHref}: ${e}`);
            }
        }

        if (title && url) {
            releases.push({ title, url });
        }
    });

    return releases;
}

async function checkForNewComcomReleases(): Promise<TaskResult> {
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
    name: "Commerce Commission Media Releases",
    description: "Scrapes the ComCom website for new media releases and their full content.",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000
    },
    callback: checkForNewComcomReleases,
} as Task;