import {XMLBuilder, XMLParser} from "npm:fast-xml-parser";
import {fetchNonTextWithHeadlessBrowser} from "./web.ts";
import decodeHtml from "./html-entities.ts";
import impit from "./impit.ts";
import {needsHeadlessBrowserList} from "../tasks/rss/_rss.helper.ts";

export const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: true,
    preserveOrder: true,
    textNodeName: "#text",
    htmlEntities: true,
    processEntities: false
});

const builder = new XMLBuilder({
    unpairedTags: ["hr", "br", "link", "meta", "img", "input"],
    suppressEmptyNode: true,
    format: false,
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "",
    textNodeName: "#text",
});

async function fetchFeed(url: string) {
    if (needsHeadlessBrowserList.includes(url)){
        const escapedHtml = await fetchNonTextWithHeadlessBrowser(url, {waitForRedirect: true, timeoutMs: 30000});
        return parser.parse(decodeHtml(escapedHtml));
    }

    const res = await impit.fetch(url);
    if (!res){
        throw new Error(`Failed to fetch RSS Feed with impit: no content at ${url}`)
    }

    return parser.parse(await res.text())
}

interface XmlNode {
    [key: string]: any;
}

export interface ParsedRssItem {
    guid: string;
    title: string;
    links: { href?: string; [key: string]: any }[];
    description: string;
    [key: string]: any;
}

export async function parseFeed(url: string): Promise<ParsedRssItem[]> {
    const parsedXml = await fetchFeed(url);
    if (!Array.isArray(parsedXml) || parsedXml.length === 0) {
        throw new Error(`Parsed XML for ${url} is not a valid array.`)
    }

    const rootNode = parsedXml.find(node => node.rss || node.feed);
    if (!rootNode) {
        throw new Error(`No <rss> or <feed> root found in ${url}`)
    }

    const rootContent = rootNode.rss || rootNode.feed;
    const channelNode = rootContent.find((node: XmlNode) => node.channel);
    const itemsContainer = channelNode ? channelNode.channel : rootContent;
    const itemNodes = itemsContainer.filter((node: XmlNode) => node.item || node.entry);

    const fieldsToRebuild = ['summary', 'description', 'content', 'title'];
    const finalItems: ParsedRssItem[] = [];

    for (const itemNode of itemNodes.reverse()) {
        const itemPropertiesArray = itemNode.item || itemNode.entry;
        const finalItem: any = { links: [] };

        for (const prop of itemPropertiesArray) {
            const key = Object.keys(prop)[0];
            if (key === '#text') continue;

            const content = prop[key];
            const attributes = prop[':@'];

            if (key === 'link') {
                if (attributes?.href) finalItem.links.push(attributes);
                else if (content?.[0]?.['#text']) finalItem.links.push({ href: content[0]['#text'] });
                continue;
            }

            if (fieldsToRebuild.includes(key)) {
                finalItem[key] = (content.length === 1 && content[0]['#text'] !== undefined)
                    ? content[0]['#text']
                    : builder.build(content).trim();
                continue;
            }

            if (content.length === 1 && content[0]['#text'] !== undefined) {
                finalItem[key] = attributes ? { ...attributes, '#text': content[0]['#text'] } : content[0]['#text'];
            }
        }

        let guidAsString: string | undefined;
        const rawGuid = finalItem.guid;

        if (typeof rawGuid === 'string') {
            guidAsString = rawGuid;
        } else if (typeof rawGuid === 'object' && rawGuid !== null && typeof rawGuid['#text'] === 'string') {
            guidAsString = rawGuid['#text'];
        }

        const primaryLink = finalItem.links[0]?.href;
        const guid = guidAsString || finalItem.id || primaryLink || finalItem.title;

        if (!guid) continue;

        delete finalItem.guid

        finalItems.push({
            guid,
            title: finalItem.title,
            description: finalItem.description || finalItem.summary || '',
            ...finalItem
        });
    }
    return finalItems;
}

export function simplifyXml(node: any): any {
    if (Array.isArray(node)) {
        if (node.length === 1) return simplifyXml(node[0]);
        return node.map(simplifyXml);
    }

    if (typeof node !== 'object' || node === null) {
        return node;
    }

    const keys = Object.keys(node);

    if (keys.length === 1 && keys[0] === "#text") {
        return node["#text"];
    }

    const simplified: Record<string, any> = {};

    for (const key of keys) {
        const value = node[key];

        if (Array.isArray(value)) {
            simplified[key] = value.map(item => simplifyXml(item));
            if (simplified[key].length === 1) {
                simplified[key] = simplified[key][0];
            }
        } else {
            simplified[key] = simplifyXml(value);
        }
    }

    return simplified;
}