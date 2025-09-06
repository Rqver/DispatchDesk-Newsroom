import { Task } from "./types.ts";
import { loadTasksFromDir, testTask } from "./util/task-loader.ts";
import { sendWebhook } from "./util/webhook.ts";
import {config} from "./config.ts";

const BROWSER_CONCURRENCY_LIMIT = 1;
const DEFAULT_CONCURRENCY_LIMIT = 5;
const TICK_INTERVAL_MS = 1000;
const BACKOFF_BASE_MS = 120000;
const MAX_BACKOFF_MS = 3600000;

export class Scheduler {
    private tasks: Task[] = [];
    private timerId: number | null = null;

    private browserTaskQueue: Task[] = [];
    private defaultTaskQueue: Task[] = [];
    private queuedTaskSet = new Set<Task>();
    private activeBrowserWorkers = 0;
    private activeDefaultWorkers = 0;


    constructor() {
    }

    async loadTasks(directory: string): Promise<void> {
        this.tasks = await loadTasksFromDir(directory);
        // this.tasks = await testTask("tasks/scripts/economics/ikea-releases.task.ts")
        console.log(`[Scheduler] Loaded ${this.tasks.length} tasks.`);
    }

    public start(): void {
        if (this.timerId !== null || this.tasks.length === 0) return;

        this.levelTaskSchedule();
        this.scheduleNextTick();
    }

    private levelTaskSchedule(): void {
        const now = Date.now();
        const tasksByFrequency = new Map<number, Task[]>();

        this.tasks.forEach(task => {
            const freq = this.getTaskFrequency(task);
            if (!tasksByFrequency.has(freq)) tasksByFrequency.set(freq, []);
            tasksByFrequency.get(freq)!.push(task);
        });

        tasksByFrequency.forEach((group, frequencyMs) => {
            group.forEach((task, index) => {
                const stagger = Math.floor((index / group.length) * frequencyMs);
                task.nextRun = now + stagger;
            });
        });
    }

    private scheduleNextTick(): void {
        this.timerId = setTimeout(() => this.tick(), TICK_INTERVAL_MS);
    }

    private tick(): void {
        const now = Date.now();
        const dueTasks = this.tasks.filter((task) => (task.nextRun ?? 0) <= now);

        if (dueTasks.length > 0) {
            for (const task of dueTasks) {
                  if (!this.queuedTaskSet.has(task)) {
                      task.nextRun = now + this.getTaskFrequency(task);
                      this.queuedTaskSet.add(task);
                      if (task.resourceType === 'browser') {
                          this.browserTaskQueue.push(task);
                      } else {
                          this.defaultTaskQueue.push(task);
                      }
                }
            }
        }

        this.launchWorkers();
        this.scheduleNextTick();
    }

    private launchWorkers(): void {
        while (this.activeBrowserWorkers < BROWSER_CONCURRENCY_LIMIT && this.browserTaskQueue.length > 0) {
            this.activeBrowserWorkers++;
            const task = this.browserTaskQueue.shift()!;
            this.queuedTaskSet.delete(task);

            this.executeTask(task).finally(() => {
                this.activeBrowserWorkers--;
                this.launchWorkers();
            });
        }

        while (this.activeDefaultWorkers < DEFAULT_CONCURRENCY_LIMIT && this.defaultTaskQueue.length > 0) {
            this.activeDefaultWorkers++;
            const task = this.defaultTaskQueue.shift()!;
            this.queuedTaskSet.delete(task);

            this.executeTask(task).finally(() => {
                this.activeDefaultWorkers--;
                this.launchWorkers();
            });
        }
    }


    private async executeTask(task: Task): Promise<void> {
        console.log(`Executing task ${task.name}`);
        task.consecutiveFailures = task.consecutiveFailures || 0;

        const result = await task.callback();
        const allowedFailures = task.allowedFailures || 0;

        if (!result.success) {
            task.consecutiveFailures++;
            const backoffDelay = Math.min(BACKOFF_BASE_MS * 2 ** (task.consecutiveFailures - 1), MAX_BACKOFF_MS);
            task.nextRun = Date.now() + backoffDelay;

            const backoffMinutes = (backoffDelay / 1000 / 60).toFixed(2);

            if (task.consecutiveFailures > allowedFailures) {
                const webhookMessage = `> ** Task Failure: ${task.name}**\n\`\`\`${result.errorMessage}\`\`\`\nThis is the ${this.ordinal(task.consecutiveFailures)} consecutive failure. Backing off for **${backoffMinutes} minutes**.`;
                await sendWebhook({ content: webhookMessage }, config.webhooks.taskFailure);
            }
        } else if (task.consecutiveFailures > allowedFailures) {
            await sendWebhook({ content: `Task ${task.name} has recovered after ${task.consecutiveFailures} consecutive failure(s).` }, config.webhooks.taskFailure);
            task.consecutiveFailures = 0;
        }
    }


    private getTaskFrequency(task: Task): number {
        if (task.secondaryFrequency) {
            const { timePeriod, frequencyMs, daysOfWeek } = task.secondaryFrequency;
            const now = new Date();

            if (daysOfWeek) {
                const weekdayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
                const today = weekdayMap[now.getDay()];
                if (!daysOfWeek.includes(today)) {
                    return task.frequencyMs;
                }
            }

            const [start, end] = timePeriod.map(t => {
                const [h, m] = t.split(":").map(Number);
                const d = new Date(now);
                d.setHours(h, m, 0, 0);
                return d;
            });

            const isWithinRange = end < start
                ? now >= start || now < end // wraps around midnight
                : now >= start && now < end;

            if (isWithinRange) {
                return frequencyMs;
            }
        }

        return task.frequencyMs;
    }

    private ordinal(n: number): string {
        const s = ["th", "st", "nd", "rd"];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }
}