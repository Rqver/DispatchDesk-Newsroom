import puppeteer from "npm:puppeteer-extra";
import type { Browser } from "npm:puppeteer";
import StealthPlugin from "npm:puppeteer-extra-plugin-stealth";
import { sendWebhook } from "./webhook.ts";
import {config} from "../config.ts";

const POOL_SIZE = 2;
const MAX_BROWSER_USES = 100;
const BROWSER_PROTOCOL_TIMEOUT = 60000;

interface PoolBrowser {
    instance: Browser;
    useCount: number;
    userDataDir: string;
}


class BrowserPoolManager {
    private static instance: BrowserPoolManager;
    private availableBrowsers: PoolBrowser[] = [];
    private inUseBrowsers = new Set<PoolBrowser>();
    private isInitialized = false;
    private isShuttingDown = false;
    private devMode = false;

    private constructor() {}

    public static getInstance(): BrowserPoolManager {
        if (!BrowserPoolManager.instance) {
            BrowserPoolManager.instance = new BrowserPoolManager();
        }
        return BrowserPoolManager.instance;
    }

    private log(message: string){
        if (this.devMode) return;
        sendWebhook({ content: message}, config.webhooks.browserPool);
    }

    private async _launchNewBrowser(): Promise<PoolBrowser> {
        const userDataDir = `/tmp/puppeteer_profile_${Math.random().toString(36).substring(2)}`;

        const launchOptions = this.devMode
            ? {
                headless: false,
                userDataDir,
                args: ["--no-sandbox"],
            }
            : {
                headless: true,
                executablePath: "/usr/bin/chromium",
                userDataDir,
                protocolTimeout: BROWSER_PROTOCOL_TIMEOUT,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-extensions',
                    '--disable-background-networking',
                    '--disable-sync',
                    '--disable-features=site-per-process,Translate,BlinkGenPropertyTrees',
                    '--metrics-recording-only',
                    '--mute-audio',
                ],
            };

        try {
            const browser = await puppeteer.launch(launchOptions);
            return { instance: browser, useCount: 0, userDataDir };
        } catch (err) {
            this.log(`CRITICAL: Failed to launch a new browser. Pool may be depleted. Error: ${err}`);
            throw err;
        }
    }

    public async init(devMode = false): Promise<void> {
        if (this.isInitialized || this.isShuttingDown) return;
        this.isInitialized = true;
        this.devMode = devMode;

        const poolSize = this.devMode ? 1 : POOL_SIZE;
        puppeteer.use(StealthPlugin());

        const launchPromises = Array.from({ length: poolSize }, () => this._launchNewBrowser());
        this.availableBrowsers = await Promise.all(launchPromises);
    }

    public async getBrowser(): Promise<Browser> {
        if (!this.isInitialized) throw new Error("BrowserPoolManager not initialized.");

        while (this.availableBrowsers.length === 0) {
            if (this.isShuttingDown) throw new Error("Pool is shutting down.");
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const poolBrowser = this.availableBrowsers.pop()!;
        this.inUseBrowsers.add(poolBrowser);
        return poolBrowser.instance;
    }

    public disposeBrowser(browser: Browser): void {
        const poolBrowser = this._findInUseBrowser(browser);
        if (poolBrowser) {
            this.inUseBrowsers.delete(poolBrowser);
            const dir = poolBrowser.userDataDir;

            browser.close()
                .catch(e => this.log(`Error closing disposed browser: ${e}`))
                .finally(async () => {
                    try {
                        await Deno.remove(dir, { recursive: true });
                    } catch (e) {
                        this.log(`Error removing userDataDir ${dir}: ${e}`);
                    }
                });
        }

        this._launchNewBrowser()
            .then(newBrowser => this.availableBrowsers.push(newBrowser))
            .catch(err => this.log(`Failed to add replacement browser to pool: ${err}`));
    }



    public releaseBrowser(browser: Browser): void {
        const poolBrowser = this._findInUseBrowser(browser);
        if (!poolBrowser) {
            return;
        }

        this.inUseBrowsers.delete(poolBrowser);
        if (this.isShuttingDown) {
            browser.close().catch(e => this.log(`Error closing browser during shutdown: ${e}`));
            return;
        }

        if (!browser.connected || poolBrowser.useCount >= MAX_BROWSER_USES) {
            this.log(`Recycling browser. Uses: ${poolBrowser.useCount}, Connected: ${browser.connected}`);
            this.disposeBrowser(browser);
        } else {
            poolBrowser.useCount++;
            this.availableBrowsers.push(poolBrowser);
        }
    }

    private _findInUseBrowser(browser: Browser): PoolBrowser | undefined {
        for (const pb of this.inUseBrowsers) {
            if (pb.instance === browser) return pb;
        }
        return undefined;
    }

    public async shutdown(): Promise<void> {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;
        this.log("Shutting down all browser instances...");

        const allBrowsers = [...this.availableBrowsers, ...this.inUseBrowsers];
        const closePromises = allBrowsers.map(pb => pb.instance.close());
        await Promise.all(closePromises).catch(e => this.log(`Error during shutdown: ${e}`));

        this.availableBrowsers = [];
        this.inUseBrowsers.clear();
        this.isInitialized = false;
        this.log("Shutdown complete.");
    }
}

export const browserPool = BrowserPoolManager.getInstance();