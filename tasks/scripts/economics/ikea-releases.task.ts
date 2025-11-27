import { load } from "npm:cheerio";
import { fetchWithBrowserHeaders, fetchWithHeadlessBrowser } from "../../../util/web.ts";
import type { Task, TaskResult, ReleaseMedia } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";
import { validateDate } from "../../../util/time.ts";
import { sendWebhook } from "../../../util/webhook.ts";
import { config } from "../../../config.ts";

const newsUrl = "https://www.ikea.com/nz/en/newsroom/";

const seenReleaseUrls = new Set<string>();
let isFirstRun = true;

interface IkeaRelease {
    title: string;
    url: string;
}

async function fetchInformationFromRelease(link: string): Promise<void> {
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

    const dateText = $('div[data-pub-type="article-hero"] a').first().closest('span').next('span').text().trim();
    if (!dateText || !validateDate(dateText)) {
        return sendWebhook({ content: `Invalid Date: ${link}` }, config.webhooks.rejectedStory);
    }

    const contentParts: string[] = [];
    $('div[data-pub-type="text"]').children().each((_idx, element) => {
        const text = $(element).text().trim();
        if (text) {
            contentParts.push(text);
        }
    });

    const content = contentParts.join('\n\n');

    const mediaItems: ReleaseMedia[] = [];
    $('article img').each((_idx, el) => {
        const src = $(el).attr('src');
        if (src) {
            mediaItems.push({ link: src, title: $(el).attr('alt') || undefined });
        }
    });

    if (content) {
        reviewRelease("IKEA", "Newsroom", content, link, mediaItems);
    }
}

async function getIkeaReleases(): Promise<IkeaRelease[]> {
    const html = await fetchWithHeadlessBrowser(newsUrl, {
        waitForSelector: ".pub__gallery",
    });

    if (!html) {
        throw new Error(`Failed to get page content for ${newsUrl} using headless browser.`);
    }

    const $ = load(html);
    const releases: IkeaRelease[] = [];

    $(".pub__gallery ul > li").each((_, element) => {
        const articleCard = $(element);
        const linkElement = articleCard.find("a.pub__content-card__headers");

        const title = linkElement.find("h2.pub__content-card__title").text().trim();
        const url = linkElement.attr("href");

        if (title && url) {
            releases.push({
                title,
                url,
            });
        }
    });

    if (releases.length === 0) {
        throw new Error("No media releases found on the page. The website structure might have changed.");
    }

    return releases;
}

async function checkForNewIkeaReleases(): Promise<TaskResult> {
    let releases;
    try {
        releases = await getIkeaReleases();
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
    name: "IKEA Newsroom",
    description: "Scrapes the IKEA newsroom for new releases and updates",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000,
    },
    callback: checkForNewIkeaReleases,
} as Task;