import { marked } from "npm:marked";
import { DateTime } from "npm:luxon";
import { Category, DirectusImage, Story } from "../types.ts";
import {sendWebhook} from "../util/webhook.ts";
import { refreshHomePage } from "./ai-handler.ts";
import {config} from "../config.ts";

async function directusFetch<T>(endpoint: string): Promise<T> {
    if (!config.features.cms){
        return {} as T;
    }

    const response = await fetch(`${config.cms.url}${endpoint}`);

    if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    if (json.errors) {
        throw new Error(`Directus API error: ${JSON.stringify(json.errors)}`);
    }

    return json.data as T;
}

let categoriesCache: Category[] = [];
let imagesCache: DirectusImage[] = [];

export async function fetchCategories(): Promise<Category[]> {
    if (categoriesCache.length > 0) return categoriesCache;

    categoriesCache = await directusFetch<Category[]>(
        "/items/categories?limit=-1&fields=id,name,slug"
    );

    return categoriesCache;
}

export async function fetchFeaturedStories() {
    const data = await directusFetch<any>(`/items/featured_stories`);
    if (!data) return null;
    return data;
}

export async function fetchLatestStories() {
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const data = await directusFetch<any[]>(
        `/items/stories?filter[status][_eq]=PUBLISHED&filter[publish_date][_gte]=${twoDaysAgo.toISOString()}&sort=-publish_date&fields=id,title,tagline,publish_date`
    );

    return data ?? [];
}


const IMAGE_FOLDER_ID = "fbb2ba94-59e0-4803-a611-232cddffeff9";
export async function fetchImages(): Promise<DirectusImage[]> {
    if (imagesCache.length > 0) return imagesCache;

    imagesCache = await directusFetch<DirectusImage[]>(
        `/files?filter[folder][_eq]=${IMAGE_FOLDER_ID}` +
        `&limit=-1&fields=id,title,description,tags`
    );

    return imagesCache;
}

export async function fetchInitialDirectusData(): Promise<void> {
    await Promise.all([fetchCategories(), fetchImages()]);
}

export function getCategoryNames(): string[] {
    return categoriesCache.map((c) => c.name);
}

function getCategoryIdByName(name: string) {
    const category = categoriesCache.find(c => c.name.toLowerCase() === name.toLowerCase());
    return category ? category.id : null;
}

export function getImages(): DirectusImage[] {
    return imagesCache;
}

async function handleMedia(media: { link: string; title?: string }) {
    if (media.link.includes(config.cms.url!)) {
        const uuidMatch = media.link.match(/\/([0-9a-fA-F-]{36})$/);
        if (uuidMatch) return uuidMatch[1];
    }

    const formData = new FormData();
    formData.append("title", media.title || "");
    formData.append("description", "Supplied");
    formData.append("file", await fetch(media.link).then(r => r.blob()));

    const uploadResponse = await fetch(`${config.cms.url}/files`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${config.cms.accessToken}` },
        body: formData,
    });

    const json = await uploadResponse.json();
    return json.data.id;
}

export async function publishStory(story: Story) {
    if(!config.features.cms){
        return console.log(story);
    }

    let headerMediaId: string | undefined;
    if (story.media?.length) {
        headerMediaId = await handleMedia(story.media[0]);
    }

    const storyObject = JSON.stringify({
        title: story.title,
        tagline: story.tagline,
        status: story.reviewChannel ? "DRAFT" : "PUBLISHED",
        publish_date: DateTime.now().setZone("Pacific/Auckland").toFormat("yyyy-LL-dd HH:mm:ss"),
        body: marked(story.content),
        ai_written: "true",
        original_source: story.link,
        header_media: headerMediaId
    })

    const response = await fetch(`${config.cms.url}/items/stories`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.cms.accessToken}`,
        },
        body: storyObject
    });

    const json = await response.json();
    if (json.errors){
        sendWebhook({content: `ERROR PUBLISHING: \`\`\`${json.errors[0].message}\`\`\`\n${storyObject}`}, config.webhooks.publishingFailure)
        return
    }

    const storyId = json.data.id;
    const categories = story.categories.map(c => getCategoryIdByName(c));

    const res = await fetch(`${config.cms.url}/items/stories_categories`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.cms.accessToken}`,
        },
        body: JSON.stringify(
            categories.map(categoryId => ({ stories_id: storyId, categories_id: categoryId }))
        ),
    });

    if(!res.ok){
        sendWebhook({content: `Error Updating Categories: ${res}`}, config.webhooks.publishingFailure)
    }

    if (story.reviewChannel){
        sendWebhook({ content: `https://dash.dispatchdesk.nz/admin/content/stories/${storyId}`}, config.webhooks.publishingDraftSuccess)
    } else {
        sendWebhook({ content: `https://dispatchdesk.nz/story/${json.data.slug}`}, config.webhooks.publishingSuccess)
    }

    setTimeout(function(){
        refreshHomePage();
    }, 1000)
}

export async function updateFeaturedStories(slots: Record<string, number>){
    if(!config.features.cms){
        return;
    }

    const response = await fetch(`${config.cms.url}/items/featured_stories`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.cms.accessToken}`,
        },
        body: JSON.stringify(slots),
    });

    const json = await response.json();
    if (json.errors) {
        sendWebhook({content: `ERROR UPDATING FEATURED STORIES: \`\`\`${json.errors[0].message}\`\`\`\n${JSON.stringify(slots)}`}, config.webhooks.publishingFailure);
        throw new Error(json.errors[0].message);
    }

    sendWebhook({content: "Updated home page layout https://dispatchdesk.nz/"}, config.webhooks.publishingSuccess)
}



