# Dispatch Desk: The Newsroom

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

This repository contains the backend data processing, AI and ingestion logic for Dispatch Desk. It is responsible for high-frequency web scraping, RSS Feed/API Monitoring, and automated content review and generation, as well as editorial automation.

This codebase is the "other half" of the project. The complete frontend and backend for the website are open source [here](https://github.com/Rqver/DispatchDesk).

Visit the live site: [dispatchdesk.nz](https://dispatchdesk.nz/) • Read our [mission](https://dispatchdesk.nz/about)

## About
This repository houses an ever-growing number of 'tasks' that scrape content for stories from NZ & Global Sources for stories on Dispatch Desk.
The list of currently active sources is available in the [SOURCES.md](SOURCES.md) file.

When a task finds a new piece of information, it is passed to an AI pipeline that evaluates it for newsworthiness, generates a story, and selects appropriate media before publishing the story to our CMS. The system is designed for and is capable of continuous, unattended operation.

While you are welcome to explore, learn from, fork and run the codebase locally, it is not intended as a turnkey solution for others to deploy.

## Tech Stack
* **Codebase**: Deno v2, Typescript
* **Scraping Libraries**: [impit](https://github.com/apify/impit), [cheerio](https://github.com/cheeriojs/cheerio), [puppeteer](https://github.com/puppeteer/puppeteer) 
* **Integrations**: Qdrant (Vector DB For File Photo Embeddings), OpenAI API 

## The use of AI
The codebase uses three different versions of GPT-5 in an attempt to reduce costs.
* The smallest model, [GPT-5-Nano](https://platform.openai.com/docs/models/gpt-5-nano) is used for quick decisions of whether a story is worth pursuing, and if so, categorization of that story.
* The mini model, [GPT-5-Mini](https://platform.openai.com/docs/models/gpt-5-mini) is responsible for deciding where what stories go on the home page. 
* The full-size [GPT-5](https://platform.openai.com/docs/models/gpt-5) is responsible for writing stories.

We also make use of the OpenAI [text-embedding-3-small](https://platform.openai.com/docs/guides/embeddings) model to pair generated stories with file photos, when an image is not provided in the release.

## Contributing
We welcome contributions of all kinds, from bug reports to feature suggestions and pull requests.

If you're interested in adding a new source to monitor, start by making an issue to discuss it with me first.

### Development Setup
If you'd like to run the project locally, you will need to use Deno (v2.x or later). <br/>
You do not need a .env file to run the application. Where API keys for Open AI, Qdrant Access, Directus, Mapbox, and webhooks are not available, those portions of the program will be gracefully disabled.

#### Testing a Single Task
To test a specific task in isolation:
* Make use of the commented-out testTask call in the scheduler.ts file
* If your task makes use of a headless browser, you will have to launch the browser pool in dev mode by passing (true) as the sole argument when launching the pool in main.ts
