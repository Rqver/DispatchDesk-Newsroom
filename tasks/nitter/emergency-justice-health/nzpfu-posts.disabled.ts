import { createNitterTask } from "../_nitter.helper.ts";
import {ParsedRssItem} from "../../../util/rss-parser.ts";
import {Task} from "../../../types.ts";
import turndownService from "../../../util/turndown.ts";
import {reviewRelease} from "../../../handlers/ai-handler.ts";


// This often has valuable information but the posts just lack so much context the AI model writes a terrible story. Disabled for now

const reject = ["thepost.co.nz", "stuff.co.nz", "rnz.co.nz", "nzherald", "odt.co.nz"]
async function onNewNZPFUPost(item: ParsedRssItem) {
    const content = turndownService.turndown(item.description);
    if (reject.some(r => content.includes(r))) return;

    if (item.links[0].href){
        reviewRelease("NZ Professional Firefighters Union", "Twitter/X Post", content, item.links[0].href)
    }
}

export default createNitterTask({
    name: "NZPFU Posts",
    description: "Monitors @NZPFU for new posts",
    username: "NZPFU",
    frequencyMs: 3 * 60 * 1000,
    onNewItem: onNewNZPFUPost
}) as Task;