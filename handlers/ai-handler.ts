import OpenAI from 'jsr:@openai/openai';
import {ReleaseMedia, Story} from "../types.ts";
import {
    fetchFeaturedStories,
    fetchLatestStories,
    getCategoryNames,
    publishStory,
    updateFeaturedStories
} from "./directus-api.ts";
import {queryImages} from "./images-handler.ts";
import {sendWebhook} from "../util/webhook.ts";
import {config} from "../config.ts";

let client: OpenAI;
export function initAIModel(){
    if (!config.features.ai){
        return;
    }

    client = new OpenAI();
}

// Util to strip excess spaces and newlines out of a string. Decreases AI token use.
function compact(text: string): string {
    return text.replace(/\s+/g, " ").trim();
}

export async function reviewRelease(agency: string, type: string, content: string, link: string, media?: ReleaseMedia[], reviewChannel?: boolean) {
    if(!config.features.ai){
        return console.log({agency, type, content, link, media, reviewChannel});
    }

    const cachedPrompt = `
        Your task is to establish if this is a news-worthy story for Dispatch Desk.
        Dispatch Desk is a new zealand news agency. We cover NZ news and significant important global news.
        Sometimes an article might be a plain ad, or government promotion/spin, or not newsworthy for other reasons.
        If you deem this release to not be worthy of news, reply with "--NO--". If you deem it news worthy, reply with "--YES--".
        If you deem the story newsworthy, you must pick one, maximum 2 categories from the provided list, that match the story. Do Not make up categories.
        Return the categories in the form categories: comma,separated,list. The 'government' category is exclusively for the NZ Government.
    `
    const reviewPrompt = `
        ${cachedPrompt}
        Allowed Categories: ${getCategoryNames()}
        ${type} from ${agency}:
            ${content}
    `

    const reviewResponse = await client.responses.create({
        model: 'gpt-5-nano',
        input: compact(reviewPrompt).toLowerCase()
    })

    const output = reviewResponse.output_text;
    if (output.trim().toUpperCase().includes("--NO--")) {
        sendWebhook({content: link + "\n" + content}, "https://discord.com/api/webhooks/1411640407250571284/--oBUQn5gM0B3rY47Dbq5T1Q0cdIxrVdsuJcrOgRpFyWZvCzoi_U0UUc2Y9aV354gswS")
        return;
    }

    const categoriesMatch = output.match(/categories:\s*(.+)/i);
    const categories = categoriesMatch ? categoriesMatch[1].split(',').map(c => c.trim()) : [];

    generateStory(agency, type, content, categories, media ? media : undefined, reviewChannel, link);
}

async function generateStory(agency: string, type: string, content: string, categories: string[], media?: ReleaseMedia[], reviewChannel?: boolean, link?: string) {
    if(!config.features.ai){
        return console.log({agency, type, content, link, media, reviewChannel});
    }

    const cachedPrompt = `
        Your task is to generate a news story for Dispatch Desk.
        Dispatch Desk is a NZ news agency. We cover NZ news and important global news.
        Instructions for the news story:
            - Above all else, treat the readers like competent, intelligent adults.
            - Don't add adjectives like "tragic", or change/editorialize wording in an article in an attempt to add impact.
            - Make a concerted effort to not write like an LLM. Write in a natural, human, descriptive tone.
            - Sometimes, a bigger news story will be buried within a release. E.g. a release about a gang warrant being issued including the fact someone was shot at. The shooting is the story, with the gang warrant secondary.
            - Try to generate titles that have the information that is most interesting to the public. Don't sensationalize titles, but do make them interesting, not mundane or boring.
            - As this is a New Zealand news agency, you generally don't need to refer to "New Zealand". I.e., it is not NZ Police it is just Police.
            - Releases will be propaganda-like, especially from the government. Don't play into how "amazing" or game changing something is.
            - Don't make the tagline purely informative. Do use words like The, and form a sentence, not a string of semicolon-separated points.
            - Always assume that the release knows better than you. Calling out a lack of information etc. is fine, but if the police release says someone is going to X, trust that the police know better than you thinking they should go to Y, etc.
            - You are an LLM so the date might be difficult for you to understand. Don't call out a perceived incorrect date.
            - Generate a title, and present it in the form: TITLE: TITLE. 
            - Generate a tagline, and present it in the form TAGLINE: TAGLINE.
            - Generate a story, and present it in the form STORY: Story. 
            - Don't prefix the story with the location.
    `

    const storyPrompt = `
        ${cachedPrompt}
        This is a ${type} from ${agency}
        Today's date in NZT is ${new Date().toLocaleDateString()}
        ${type}: 
            ${content}; 
    `

    const storyResponse = await client.responses.create({
        model: 'gpt-5',
        input: compact(storyPrompt)
    });

    const output = storyResponse.output_text;

    const titleMatch = output.match(/TITLE:\s*([\s\S]*?)\n\s*TAGLINE:/);
    const taglineMatch = output.match(/TAGLINE:\s*([\s\S]*?)\n\s*STORY:/);
    const storyMatch = output.match(/STORY:\s*([\s\S]*)/);

    if (titleMatch && titleMatch[1] && taglineMatch && taglineMatch[1] && storyMatch && storyMatch[1]) {
        const story: Story = {
            title: titleMatch[1].trim(),
            tagline: taglineMatch[1].trim(),
            content: storyMatch[1].trim(),
            categories: categories,
            reviewChannel: reviewChannel ? reviewChannel : false,
            link: link,
            media: media ? media : undefined,
        }

        pickMedia(story);
    }
}

async function pickMedia(story: Story) {
    if (!config.features.ai || !config.features.images || !config.features.cms){
        return console.log(story)
    }

    if (story.media && story.media.length > 0) {
        if (story.media.length === 1) {
            return publishStory(story);
        }

        const [first, ...rest] = story.media;
        rest.forEach(m => {
            story.content += `\n\n<img src="${m.link}"${m.title ? ` alt="${m.title}"` : ""}>`;
        });

        story.media = [first];
        return publishStory(story);
    }

    const searchText = [story.title, story.tagline, story.categories?.join(" ")].join(" ");
    const results = await queryImages(searchText, 1);

    if (results && results.length > 0) {
        const top = results[0];
        story.media = [{
            link: top.payload?.url as string,
            title: top.payload?.title as string ?? ""
        }];
    }

    return publishStory(story);
}

function formatStories(stories: any[]): string[] {
    return stories.map(s => `${s.id} | ${s.publish_date} | ${s.title} | ${s.tagline}`);
}

let lastLatestStories: {id: number}[] = [];
export async function refreshHomePage(){
    if (!config.features.cms || !config.features.ai){
        return;
    }

    const cachedPrompt = `
        Your task is to pick what stories go where on the Dispatch Desk Home Page.
        Dispatch Desk is a New Zealand News agency. We get a large number of stories.
        Below is a list of the available positions on the home page:
        All stories display the category, title and tagline. 
        
        main_story: Large picture with text at the top of the page.
        top_story_one: Slightly smaller but still large picture with text at the top of the page.
        secondary_story_one: Small story in a row of three underneath the main two.
        secondary_story_two: Small story in a row of three underneath the main two.
        secondary_story_three: Small story in a row of three underneath the main two.
        special_separator_story: Optional, large text-only story that spans the width of the page.
        additional_story_one: Image and text in a block, below the special separator story.
        additional_story_two: Image and text in a block, below the special separator story.
        additional_story_three: Image and text in a block, below the special separator story.
        additional_story_four: Image and text in a block, below the first row of additional stories.
        additional_story_five: Image and text in a block, below the first row of additional stories.
        additional_story_six: Image and text in a block, below the first row of additional stories.
        
        Below is the list of the latest stories from the last two days, presented in the form ID | Publish Date | Title | Tagline. For each slot on the page, return the id, each on a new line e.g.:
        main_story: 44
        top_story_one: 50
        
        There is not room for every story, so prioritize high impact stories, and newer stories.
        
        The current layout of story allocation is below, to give you an idea and to avoid changing everything all at once. 
        Sometimes we get multiple stories published about the same thing, from different sources. Only put one on the home page.
        You have been given this prompt because a new story was added to the latest stories list.
    `

    const currentLayout = await fetchFeaturedStories();
    const latestStories = await fetchLatestStories();
    const latestIds = new Set(latestStories.map(s => s.id));
    const lastIds = new Set(lastLatestStories?.map(s => s.id) ?? []);

    const hasNew = [...latestIds].some(id => !lastIds.has(id));
    if (!hasNew) return;

    lastLatestStories = latestStories;

    const refreshPrompt = `
        ${cachedPrompt};
        
        current layout:
        ${JSON.stringify(currentLayout)};
        
        latest stories:
        ${formatStories(latestStories)}
    `

    const response = await client.responses.create({
        model: 'gpt-5-mini',
        input: compact(refreshPrompt)
    });

    const output = response.output_text;
    const result: Record<string, number> = {};
    const lines = output.split("\n").map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
        const [slot, id] = line.split(":").map(s => s.trim());
        if (slot && id && !isNaN(Number(id))) {
            result[slot] = Number(id);
        }
    }

    updateFeaturedStories(result);
}
