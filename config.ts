function areAllVarsPresent(keys: string[]): boolean {
    return keys.every(key => Deno.env.get(key));
}

const qdrantKeys = ['QDRANT_URL', 'QDRANT_COLLECTION'];
const isQdrantEnabled = areAllVarsPresent(qdrantKeys);

const openAIKeys = ['OPENAI_API_KEY'];
const isAIEnabled = areAllVarsPresent(openAIKeys);

const directusKeys = ['DIRECTUS_URL', 'DIRECTUS_ACCESS_TOKEN', 'DIRECTUS_FILE_PHOTOS_FOLDER']
const isDirectusEnabled = areAllVarsPresent(directusKeys);

const nitterKeys = ['NITTER_URL'];
const isNitterEnabled = areAllVarsPresent(nitterKeys);

const mapBoxKeys = ['MAPBOX_ACCESS_TOKEN'];
const isMapBoxEnabled = areAllVarsPresent(mapBoxKeys);

const webhooksKeys = ['PUBLISHING_SUCCESS_WEBHOOK', 'PUBLISHING_FAILURE_WEBHOOK', 'PUBLISHING_DRAFT_SUCCESS_WEBHOOK', 'TASK_FAILURE_WEBHOOK', 'BROWSER_POOL_WEBHOOK', 'REJECTED_STORY_WEBHOOK'];
const isWebhooksEnabled = areAllVarsPresent(webhooksKeys);

export const config = {
    features: {
        images: isQdrantEnabled,
        ai: isAIEnabled,
        cms: isDirectusEnabled,
        nitter: isNitterEnabled,
        mapping: isMapBoxEnabled,
        webhooks: isWebhooksEnabled,
    },

    images: {
      url: Deno.env.get('QDRANT_URL'),
      collection: Deno.env.get('QDRANT_COLLECTION')
    },

    ai: {
        apiKey: Deno.env.get('OPENAI_API_KEY')
    },

    cms: {
        url: Deno.env.get('DIRECTUS_URL'),
        accessToken: Deno.env.get('DIRECTUS_ACCESS_TOKEN'),
        filePhotosFolder: Deno.env.get('DIRECTUS_FILE_PHOTOS_FOLDER')
    },

    nitter: {
        url: Deno.env.get('NITTER_URL')
    },

    mapping: {
        accessToken: Deno.env.get('MAPBOX_ACCESS_TOKEN')
    },

    webhooks: {
        publishingSuccess: Deno.env.get('PUBLISHING_SUCCESS_WEBHOOK'),
        publishingFailure: Deno.env.get('PUBLISHING_FAILURE_WEBHOOK'),
        publishingDraftSuccess: Deno.env.get('PUBLISHING_DRAFT_SUCCESS_WEBHOOK'),
        taskFailure: Deno.env.get('TASK_FAILURE_WEBHOOK'),
        browserPool: Deno.env.get('BROWSER_POOL_WEBHOOK'),
        rejectedStory: Deno.env.get('REJECTED_STORY_WEBHOOK')
    }
};
