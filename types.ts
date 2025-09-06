// Directus Types
export interface Story {
    title: string;
    tagline: string;
    content: string;
    categories: string[];
    media?: ReleaseMedia[];
    reviewChannel?: boolean;
    link?: string;
}

export interface Category {
    id: number
    name: string
    slug: string
}

export interface ReleaseMedia {
    link: string;
    title?: string;
}

export interface DirectusImage {
    id: string;
    title?: string;
    description?: string;
    tags?: string[];
    filename_download: string;
}

// Task Types
export interface SecondaryFrequency {
    /** The time period the secondary frequency will be in effect. example: ["22:00", "06:00"]*/
    timePeriod: [string, string];

    /** The frequency, in MS of how often the task is run while the secondary frequency is in effect. */
    frequencyMs: number;

    /** The days of the week the secondary frequency will apply on (optional). example: ["wed", "sat"]*/
    daysOfWeek?: string[];
}

export interface TaskResult {
    success: boolean,
    errorMessage?: string,
}

export interface Task {
    /** The name of the task, used in error messages and logging */
    name: string;

    /** Optional, if the task requires a headless browser it will be split into a different scheduler with a lower concurrency */
    resourceType?: 'browser' | 'default';

    /** The number of allowed failures before a task is logged as failing. Highly temperamental tasks will need a higher allowedFailures */
    allowedFailures?: number;

    /** An optional description of what the task is doing */
    description?: string;

    /** The frequency, in MS of how often the task is run */
    frequencyMs: number;

    /** The secondary frequency of the task (i.e. for off-peak hours)*/
    secondaryFrequency?: SecondaryFrequency;

    /** The tasks execution. Must return a TaskResult */
    callback: () => Promise<TaskResult>;

    /** Set by the program */
    nextRun?: number;

    /** Set by the program */
    consecutiveFailures?: number;
}



