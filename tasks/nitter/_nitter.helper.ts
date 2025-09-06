import { Task, TaskResult } from "../../types.ts";
import { ParsedRssItem } from "../../util/rss-parser.ts";
import {createRssTask} from "../rss/_rss.helper.ts";
import {config} from "../../config.ts";

/*
There is a very small number of Twitter/X accounts on our nitter instance, so we want to rate limit these tasks to a maximum of 1 per 4 seconds, as to not upset Twitter
Overwriting the callback that the scheduler uses with this queue means we can keep the scheduler as simple as possible
 */

const NITTER_REQUEST_INTERVAL_MS = 4000;

type QueuedNitterTask = {
    execute: () => Promise<TaskResult>;
    resolve: (result: TaskResult) => void;
    taskName: string;
};

const nitterTaskQueue: QueuedNitterTask[] = [];
let isProcessingQueue = false;

async function processNitterQueue() {
    if(!config.features.nitter){
        return
    }

    if (isProcessingQueue || nitterTaskQueue.length === 0) {
        return;
    }

    isProcessingQueue = true;

    while (nitterTaskQueue.length > 0) {
        const taskToRun = nitterTaskQueue.shift();
        if (!taskToRun) continue;


        try {
            const result = await taskToRun.execute();
            taskToRun.resolve(result);
        } catch (e) {
            const errorResult = { success: false, errorMessage: e instanceof Error ? e.message : String(e) };
            taskToRun.resolve(errorResult);
        }

        if (nitterTaskQueue.length > 0) {
            await new Promise(resolve => setTimeout(resolve, NITTER_REQUEST_INTERVAL_MS));
        }
    }

    isProcessingQueue = false;
}


type NitterTaskParams = Omit<Task, "callback"> & {
    username: string;
    onNewItem: (item: ParsedRssItem) => Promise<void>;
    nitterInstance?: string;
    debug?: boolean;
};

export function createNitterTask(params: NitterTaskParams): Task {
    const {
        username,
        nitterInstance = config.nitter.url || "",
        onNewItem,
        ...rest
    } = params;

    const url = `${nitterInstance.replace(/\/$/, "")}/${username}/rss`;

    const rssTask = createRssTask({
        ...rest,
        url: url,
        onNewItem: onNewItem,
    });

    const rateLimitedCallback = (): Promise<TaskResult> => {
        return new Promise((resolve) => {
            nitterTaskQueue.push({
                execute: rssTask.callback,
                resolve: resolve,
                taskName: params.name,
            });

            processNitterQueue();
        });
    };

    return {
        ...rssTask,
        callback: rateLimitedCallback,
    };
}