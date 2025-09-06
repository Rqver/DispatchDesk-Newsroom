import { createRssTask } from "../_rss.helper.ts";
import {ParsedRssItem, parser, simplifyXml} from "../../../util/rss-parser.ts";
import type { Task } from "../../../types.ts";
import decodeHtml from "../../../util/html-entities.ts";
import {normalizeArrayToObject} from "../../../util/array.ts";
import {convertPolygonsToGeoJSON} from "../../../util/geography.ts";
import {config} from "../../../config.ts";
import {reviewRelease} from "../../../handlers/ai-handler.ts";

async function onNewEMA(item: ParsedRssItem) {
    const unescapedDetails = decodeHtml(item.encoded);
    const parsedXML = parser.parse(unescapedDetails);
    const simplifiedXML = simplifyXml(parsedXML);
    const simplifiedObject = normalizeArrayToObject(simplifiedXML);
    const alert = simplifiedObject.alert;

    let image;
    if (config.features.mapping){
        const polygon = alert.info.area.polygon
        const polygonArray = Array.isArray(polygon) ? polygon : [polygon];
        const geoJSON = convertPolygonsToGeoJSON(polygonArray);
        image = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/geojson(${encodeURIComponent(JSON.stringify(geoJSON))})/auto/1280x700?access_token=${config.mapping.accessToken}`
    }

    const media = image ? [{link: image, title: "Map of the area the EMA was sent to"}] : undefined;

    reviewRelease("NZ Emergency Management", "Emergency Mobile Alert Broadcast", `${alert.info.headline.toUpperCase()} | Event: ${alert.info.event} | Certainty: ${alert.info.certainty} | Severity: ${alert.info.severity} | Sender: ${alert.info.senderName} | Content: ${alert.info.description}`, "https://alerthub.civildefence.govt.nz/rss/pwp", media)
}

export default createRssTask({
    name: "Civil Defence Emergency Mobile Alerts",
    description: "Listens to and logs emergency mobile alerts from civil defence",
    url: "https://alerthub.civildefence.govt.nz/rss/pwp",
    frequencyMs: 10 * 1000,
    onNewItem: onNewEMA
}) as Task;