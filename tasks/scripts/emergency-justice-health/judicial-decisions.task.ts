import {fetchPdfContent, fetchWithBrowserHeaders} from "../../../util/web.ts";
import type { Task, TaskResult } from "../../../types.ts";
import { reviewRelease } from "../../../handlers/ai-handler.ts";

const baseUrl = "https://www.justice.govt.nz";

const seenDecisionUrls = new Set<string>();
let isFirstRun = true;

interface JudgmentItem {
    caseName: string;
    url: string;
}

const supressionOrderDisclaimer = `THIS IS A REAL JUDICIAL DECISION INVOLVING A REAL PERSON IN NEW ZEALAND. DO NOT INCLUDE THE NAMES OF ANY INDIVIDUALS IN THE STORY YOU GENERATE, REGARDLESS OF NAME SUPPRESSION. ASSIGN PSEUDONYMS/LETTERS RATHER THAN USING REAL NAMES. COURT DECISIONS THAT ARE NOT IN THE PUBLIC INTEREST ARE NOT TO BE CONSIDERED NEWS.`

async function getJusticeDecisions(): Promise<JudgmentItem[]> {
    const currentYear = new Date().getFullYear();
    const apiUrl = `https://www.justice.govt.nz/jdo-search-api/?court=All&location=All&judge=&counsel=&caseName=&fileNumber=&citation=&judgmentDate=%5B%27${currentYear}-1-1T00%3A00%3A00Z%27%2C%27${currentYear}-12-31T23%3A59%3A59Z%27%5D&minuteReference=&searchTerms=&page=1&sort=judgmentdate+desc`;

    const res = await fetchWithBrowserHeaders(apiUrl, {}, true);
    if (!res.ok) {
        throw new Error(`Failed to fetch judgments API, status: ${res.status}`);
    }

    const data = await res.json();
    if (!data.results || !Array.isArray(data.results)) {
        throw new Error("No 'results' array found in the API response. The API structure may have changed.");
    }

    return data.results;
}

async function checkForNewJusticeDecisions(): Promise<TaskResult> {
    let decisionItems: JudgmentItem[];
    try {
        decisionItems = await getJusticeDecisions();
    } catch (error) {
        return { success: false, errorMessage: (error as Error).message };
    }

    await Promise.all(decisionItems.map(async (item) => {
        const absoluteUrl = new URL(item.url, baseUrl).href;

        if (!seenDecisionUrls.has(absoluteUrl)) {
            seenDecisionUrls.add(absoluteUrl);

            if (!isFirstRun) {
                const content = await fetchPdfContent(absoluteUrl);
                if (content) {
                    const fullContent = `${supressionOrderDisclaimer}\n${item.caseName}\n\n${content}`;
                    reviewRelease("Ministry of Justice", "Judicial Decision", fullContent, absoluteUrl, [], true);
                } else {
                    console.warn(`Could not retrieve content for: ${item.caseName} at ${absoluteUrl}`);
                }
            }
        }
    }));

    if (isFirstRun) {
        isFirstRun = false;
    }

    return { success: true };
}

export default {
    name: "NZ Justice Judgments",
    description: "Monitors the Ministry of Justice website for new judicial decisions.",
    frequencyMs: 5 * 60 * 1000,
    callback: checkForNewJusticeDecisions,
} as Task;