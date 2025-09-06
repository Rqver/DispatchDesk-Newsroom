import {Scheduler} from "./scheduler.ts";
import {initAIModel, refreshHomePage}  from "./handlers/ai-handler.ts";
import {fetchInitialDirectusData} from "./handlers/directus-api.ts";
import {indexImages, initImageHandler} from "./handlers/images-handler.ts";
import {browserPool} from "./util/browser-pool.ts";

async function main() {
    await fetchInitialDirectusData()
    await initImageHandler();

    initAIModel();

    await browserPool.init();

    const scheduler = new Scheduler();
    await scheduler.loadTasks("tasks")
    scheduler.start()
}


async function shutdownApp() {
    await browserPool.shutdown();
    Deno.exit(0);
}
Deno.addSignalListener("SIGINT", shutdownApp);

main()

Deno.cron("Refresh directus data", "*/15 * * * *", async () => {
    await fetchInitialDirectusData();
    await indexImages();
});


// We could do this via webhooks for stories etc. but this project doesn't have a web server, so I'd rather not add one if it doesn't need it.
// We automatically do this after AI/this project publishes a new story, this is a catcher for stories that are published by humans.
Deno.cron("Refresh Home Page", "*/1 * * * *", async () => {
    await refreshHomePage();
})
