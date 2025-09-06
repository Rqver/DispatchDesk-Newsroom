import {Task, TaskResult} from "../../types.ts";
import { ParsedRssItem, parseFeed } from "../../util/rss-parser.ts";

const seenGuidsByUrl = new Map<string, Set<string>>();
const initialRunCompleted = new Map<string, boolean>();
export const needsHeadlessBrowserList: string[] = []

type RssTaskParams = Omit<Task, "callback"> & {
    url: string;
    onNewItem: (item: ParsedRssItem) => Promise<void>;
    debug?: boolean;
    needsHeadlessBrowser?: boolean
};

export function createRssTask(params: RssTaskParams): Task {
    const { url, onNewItem, debug = false, needsHeadlessBrowser = false, ...rest } = params;
    if (needsHeadlessBrowser){
        needsHeadlessBrowserList.push(url);
    }

    if (!seenGuidsByUrl.has(url)) {
        seenGuidsByUrl.set(url, new Set());
        initialRunCompleted.set(url, false);
    }

    const callback = async (): Promise<TaskResult> => {
        const seenGuids = seenGuidsByUrl.get(url)!;
        const isFirstRun = !initialRunCompleted.get(url);

        let items;
        try {
            items = await parseFeed(url);
        } catch (error){
            return {success: false, errorMessage: error as string}
        }

        if (isFirstRun && !debug) {
            for (const item of items) {
                seenGuids.add(item.guid);
            }
        } else {
            for (const item of items) {
                if (!seenGuids.has(item.guid)) {
                    seenGuids.add(item.guid);
                    try {
                        await onNewItem(item);
                    } catch (error) {
                        return {success: false, errorMessage: error as string}
                    }
                }
            }
        }

        if (isFirstRun) {
            initialRunCompleted.set(url, true);
        }

        return {success: true}
    };

    return {
        ...rest,
        resourceType: needsHeadlessBrowser ? 'browser' : 'default',
        callback,
    };
}