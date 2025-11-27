import { parseDate } from "npm:chrono-node";

export function validateDate(date: string): boolean {
    const dt = parseDate(date, new Date(), { forwardDate: false })
    if(!dt) return false;

    const format = new Intl.DateTimeFormat("en-NZ", {
        timeZone: "Pacific/Auckland",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    });

    const todayStr = format.format(new Date());
    const inputStr = format.format(dt);

    return todayStr === inputStr;
}