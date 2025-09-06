import type { Task, TaskResult } from "../../../types.ts";
import {reviewRelease} from "../../../handlers/ai-handler.ts";

const apiUrl = "https://api.geonet.org.nz/quake?MMI=5";

const seenQuakeIDs = new Set<string>();
let isFirstRun = true;

interface GeonetQuakeProperties {
    publicID: string;
    time: string;
    depth: number;
    magnitude: number;
    mmi: number;
    locality: string;
    quality: "best" | "good" | "caution" | "deleted";
}

interface GeonetQuakeFeature {
    type: "Feature";
    properties: GeonetQuakeProperties;
}

interface GeonetApiResponse {
    features: GeonetQuakeFeature[];
}

async function getGeonetQuakes(): Promise<GeonetQuakeFeature[]> {
    const res = await fetch(apiUrl);
    if (!res || !res.ok) {
        throw new Error(`Failed to fetch from API, status: ${res?.status}, text: ${await res.text()}`);
    }

    const data: GeonetApiResponse = await res.json();

    if (!data.features) {
        throw new Error("No 'features' key found in the API response. The API structure might have changed.");
    }

    return data.features.filter(q => q.properties.quality === 'best');
}

async function checkForNewGeonetQuakes(): Promise<TaskResult> {
    let quakeFeatures;
    try {
        quakeFeatures = await getGeonetQuakes();
    } catch (error) {
        return { success: false, errorMessage: (error as Error).message };
    }

    for (const feature of quakeFeatures.reverse()) {
        const props = feature.properties;
        if (!seenQuakeIDs.has(props.publicID)) {
            seenQuakeIDs.add(props.publicID);

            if (!isFirstRun) {
                reviewRelease("Geonet", "Earthquake Notification", `Magnitude: ${props.magnitude} | Locality: ${props.locality} | Depth: ${props.depth}km | Time: ${props.time} NZT`, `https://www.geonet.org.nz/earthquake/${props.publicID}`);
            }
        }
    }

    if (isFirstRun) {
        isFirstRun = false;
    }

    return { success: true };
}

export default {
    name: "GeoNet Quakes (MMI 5+)",
    description: "Monitors the GeoNet API for new earthquakes with a reported MMI of 5 or greater.",
    frequencyMs:  60 * 1000,
    callback: checkForNewGeonetQuakes
} as Task;