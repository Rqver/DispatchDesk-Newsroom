import { Task } from "../types.ts";
import { join, resolve, toFileUrl } from "jsr:@std/path";

export async function loadTasksFromDir(directory: string): Promise<Task[]> {
    const allTasks: Task[] = [];
    for await (const entry of Deno.readDir(directory)) {
        const fullPath = join(directory, entry.name);
        if (entry.isDirectory) {
            allTasks.push(...(await loadTasksFromDir(fullPath)));
        } else if (entry.isFile && (entry.name.endsWith(".task.ts"))) {
            try {
                const absolutePath = resolve(fullPath);
                const fileUrl = toFileUrl(absolutePath);

                const module = await import(fileUrl.href);
                const exportedTask = module.default;

                if (Array.isArray(exportedTask)) {
                    allTasks.push(...exportedTask);
                } else if (exportedTask && typeof exportedTask === 'object') {
                    allTasks.push(exportedTask);
                }
            } catch (e) {
                console.error(`Failed to load task from ${fullPath}:`, e);
            }
        }
    }
    return allTasks;
}

export async function testTask(taskPath: string): Promise<Task[]> {
    const tasks = []

    const absolutePath = resolve(taskPath);
    const fileUrl = toFileUrl(absolutePath)
    const module = await import(fileUrl.href);
    const exportedTask = module.default;
    if (Array.isArray(exportedTask)) {
        tasks.push(...exportedTask);
    } else if (exportedTask && typeof exportedTask === 'object') {
        tasks.push(exportedTask);
    }

    return tasks;
}