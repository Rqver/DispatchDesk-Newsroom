export function normalizeArrayToObject(arr: any[]): any {
    const result: any = {};

    for (const item of arr) {
        const [key, value] = Object.entries(item)[0];
        if (result[key]) {
            if (Array.isArray(result[key])) {
                result[key].push(value);
            } else {
                result[key] = [result[key], value];
            }
        } else {
            result[key] = value;
        }
    }

    for (const key in result) {
        if (Array.isArray(result[key]) && result[key].every(v => typeof v === "object" && v !== null && !Array.isArray(v))) {
            result[key] = normalizeArrayToObject(result[key]);
        }
    }

    return result;
}