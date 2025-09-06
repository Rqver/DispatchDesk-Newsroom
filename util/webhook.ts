import {config} from "../config.ts";

function truncateMessage(msg: string) {
    const suffix = '... (TRUNCATED BY DISPATCH DESK)';
    const maxLength = 2000;

    if (msg.length <= maxLength) {
        return msg;
    }

    return msg.slice(0, maxLength - suffix.length) + suffix;
}

export async function sendWebhook(payload: object, webhookUrl: string | undefined){
    if (!config.features.webhooks || !webhookUrl){
        return;
    }

    if (payload.content){
        payload.content = truncateMessage(payload.content)
    }

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            console.error(`Error sending webhook: ${response.status} ${await response.text()}`);
        }
    } catch (error) {
        console.error(`Failed to send message:`, error);
    }
}
