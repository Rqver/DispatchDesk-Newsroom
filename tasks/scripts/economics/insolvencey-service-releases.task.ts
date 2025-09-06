import { load } from "npm:cheerio";
import { fetchWithBrowserHeaders } from "../../../util/web.ts";
import type { ReleaseMedia, Task, TaskResult } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const pageUrl = "https://www.insolvency.govt.nz/about/news-and-other-notices";
const baseUrl = "https://www.insolvency.govt.nz";

const seenUrls = new Set<string>();
let isFirstRun = true;

interface NewsArticle {
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

    const contentParts: string[] = [];
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

    $('article.content > *').each((_idx, element) => {
        const $el = $(element);

        if ($el.is('h1') || $el.is('.news__meta')) {
            return;
        }

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

    const content = contentParts.join('\n\n').trim();

    const mediaItems: ReleaseMedia[] = [];
    $('article.content img').each((_idx, el) => {
        const $img = $(el);
        const relativeLink = $img.attr('src');
        if (relativeLink) {
            if (!imageExtensions.some(ext => relativeLink.toLowerCase().endsWith(ext))) {
                return;
            }

            const absoluteLink = new URL(relativeLink, baseUrl).href;
            const title = $img.attr('alt')?.trim();

            mediaItems.push({ link: absoluteLink, title: title || undefined });
        }
    });

    if (content) {
        reviewRelease("Insolvency and Trustee Service", "Press Release", content, link, mediaItems);
    }
}

async function getNewsArticles(): Promise<NewsArticle[]> {
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
    const articles: NewsArticle[] = [];

    $("article.blog-entry").each((_, element) => {
        const articleElement = $(element);
        const linkElement = articleElement.find("h2.news__article-heading a.news__link");

        const title = linkElement.text().trim();
        const relativeUrl = linkElement.attr("href");

        if (title && relativeUrl) {
            articles.push({
                title,
                url: new URL(relativeUrl, baseUrl).href,
            });
        }
    });

    if (articles.length === 0) {
        throw new Error("No news articles found on the page. The website structure might have changed.");
    }

    return articles;
}

async function checkForNewArticles(): Promise<TaskResult> {
    let articles;
    try {
        articles = await getNewsArticles();
    } catch (error) {
        return { success: false, errorMessage: (error as Error).message };
    }

    for (const article of articles.reverse()) {
        if (!seenUrls.has(article.url)) {
            seenUrls.add(article.url);

            if (!isFirstRun) {
                await fetchInformationFromRelease(article.url);
            }
        }
    }

    if (isFirstRun) {
        isFirstRun = false;
    }

    return { success: true };
}

export default {
    name: "Insolvency and Trustee Service News",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000
    },
    callback: checkForNewArticles,
} as Task;