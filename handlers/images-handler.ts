import OpenAI from "jsr:@openai/openai";
import { QdrantClient } from "npm:@qdrant/js-client-rest";
import { DirectusImage } from "../types.ts";
import { getImages } from "./directus-api.ts";
import crypto from "node:crypto";
import {config} from "../config.ts";

let openai: OpenAI;
let qdrant: QdrantClient;
export async function initImageHandler(){
    if(!config.features.images || !config.features.ai || !config.features.cms){
        return;
    }

    openai = new OpenAI();
    qdrant = new QdrantClient({ url: config.images.url })
    await indexImages();
}

function metadataHash(img: DirectusImage) {
    const text = [img.title, Array.isArray(img.tags) ? img.tags.join(" ") : ""]
        .join(" ")
        .trim();
    return crypto.createHash("sha256").update(text).digest("hex");
}

async function ensureCollection() {
    const collections = await qdrant.getCollections();
    const exists = collections.collections.some(c => c.name === config.images.collection);

    if (!exists) {
        await qdrant.createCollection(config.images.collection!, {
            vectors: { size: 1536, distance: "Cosine" },
        });
    }
}

export async function indexImages(): Promise<void> {
    if(!config.features.images || !config.features.ai || !config.features.cms){
        return;
    }

    await ensureCollection();
    const images = getImages();

    for (const img of images) {
        const existing = await qdrant.retrieve(config.images.collection!, { ids: [img.id] });
        const currentHash = metadataHash(img);

        if (existing.length > 0 && existing[0].payload?.hash === currentHash) {
            continue;
        }

        const emb = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: [img.title ?? "", Array.isArray(img.tags) ? img.tags.join(" ") : ""].join(" ").trim(),
        });

        await qdrant.upsert(config.images.collection!, {
            points: [
                {
                    id: img.id,
                    vector: emb.data[0].embedding,
                    payload: {
                        url: `https://dash.dispatchdesk.nz/assets/${img.id}`,
                        title: img.title,
                        tags: img.tags,
                        hash: currentHash,
                    },
                },
            ],
        });
    }
}

export async function queryImages(query: string, limit = 5) {
    if(!config.features.images || !config.features.ai || !config.features.cms){
        return;
    }

    const emb = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query,
    });

    return qdrant.search(config.images.collection!, {
        vector: emb.data[0].embedding,
        limit,
    });
}
