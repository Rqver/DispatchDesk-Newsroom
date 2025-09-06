import { createNitterTask } from "../_nitter.helper.ts";
import {ParsedRssItem} from "../../../util/rss-parser.ts";
import {Task} from "../../../types.ts";
import turndownService from "../../../util/turndown.ts";
import {reviewRelease} from "../../../handlers/ai-handler.ts";

async function onNewReserveBankPost(item: ParsedRssItem) {
    const content = turndownService.turndown(item.description);
    if (item.links[0].href){
        reviewRelease("Reserve Bank", "Twitter/X Post", content, item.links[0].href)
    }
}

export default createNitterTask({
    name: "Reserve Bank Posts",
    description: "Monitors @reservebankofnz for new posts",
    username: "reservebankofnz",
    frequencyMs: 2 * 60 * 1000,
    secondaryFrequency: {
        timePeriod: ["22:00", "06:00"],
        frequencyMs: 5 * 60 * 1000,
    },
    onNewItem: onNewReserveBankPost
}) as Task;