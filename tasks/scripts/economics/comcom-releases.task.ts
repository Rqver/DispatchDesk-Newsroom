import { load } from "npm:cheerio";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import type { Task, TaskResult } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";
import { validateDate } from "../../../util/time.ts";
import { sendWebhook } from "../../../util/webhook.ts";
import { config } from "../../../config.ts";

const baseUrl = "https://www.comcom.govt.nz";
const comcomUrl = `${baseUrl}/news-and-media/news-and-events/`;

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

    const dateText = $('.hero__date .hero__date--bold').text().trim();

    if (!dateText || !validateDate(dateText)) {
        return sendWebhook({ content: `Invalid Date: ${link}` }, config.webhooks.rejectedStory);
    }

    const title = $('.hero__title').text().trim();

    const contentParts: string[] = [];

    const introText = $('.hero__summary').text().trim();
    if (introText) {
        contentParts.push(introText);
    }

    $('.content-block__content').find('p, h2, h3, h4, ul li').each((_idx, element) => {
        const el = $(element);

        const text = el.text().trim();
        if (!text) return;

        if (text.startsWith("Share this:")) return;

        contentParts.push(text);
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

    $("div.card").each((_, element) => {
        const item = $(element);

        const titleEl = item.find(".card__title .card__link");
        const title = titleEl.text().trim();
        const href = titleEl.attr("href");

        let url: string | undefined;
        if (href) {
            try {
                url = new URL(href, baseUrl).href;
            } catch (e) {
                console.error(`Failed to parse URL from href: ${href}: ${e}`);
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