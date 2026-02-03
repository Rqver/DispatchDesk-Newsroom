# Dispatch Desk (Newsroom)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

An experimental proof-of-concept of a hands-off media platform, exploring how AI can be used in news aggregation, ranking and presentation of news media.
This repository contains the web scraping, RSS-feed-listening, and story review and generation part of the project. For the frontend, visit [DispatchDesk](https://github.com/Rqver/DispatchDesk).

![Screenshot](https://raw.githubusercontent.com/Rqver/DispatchDesk/refs/heads/main/docs/demo-pics/img.png)

## Why
I have an interest in the news media and wanted to explore where and how AI can and can't be used effectively in this space; There are examples of both in this project. 

## Current Sources

### Economics

- https://x.com/ReserveBankofNZ
- https://www.ppta.org.nz/news-and-media/rss
- https://www.comcom.govt.nz/news-and-media/news-and-events/
- https://exportcredit.treasury.govt.nz/news
- https://www.fma.govt.nz/news/all-releases/media-releases/
- https://www.ikea.com/nz/en/newsroom/
- https://www.insolvency.govt.nz/about/news-and-other-notices
- https://www.ird.govt.nz/media-releases
- https://www.msd.govt.nz/about-msd-and-our-work/newsroom/index.html
- https://www.roymorgan.com/findings
- https://www.stats.govt.nz/insights
- https://www.takeovers.govt.nz/about-the-panel/news

### Emergency, Justice & Health

- https://alerthub.civildefence.govt.nz/rss/pwp
- https://www.fireandemergency.nz/incidents-and-news/news-and-media/rss/
- https://www.gcsb.govt.nz/news/rss
- https://www.nzsis.govt.nz/news/rss
- https://www.pharmac.govt.nz/news-and-resources/news/rss
- https://www.police.govt.nz/rss/news
- https://www.stjohn.org.nz/RSS
- https://www.coastguard.nz/our-story/news-and-media
- https://api.geonet.org.nz/news/geonet
- https://api.geonet.org.nz/quake?MMI=5
- https://www.hdc.org.nz/decisions/latest-decisions/
- https://www.hdc.org.nz/news-resources/news/
- https://www.ipca.govt.nz/Site/publications-and-media/Summaries-of-Police-investigations-overseen-by-the-IPCA.aspx
- https://www.ipca.govt.nz/Site/publications-and-media/2026-Media-Releases/
- https://www.nzdf.mil.nz/media-centre/news/
- https://www.health.govt.nz/news
- https://www.justice.govt.nz/about/news-and-media/news/
- https://www.nzpfu.org.nz/news/

#### Government

- https://www.elections.nz/media-and-news/rss
- https://www.beehive.govt.nz/releases/feed
- https://www.worksafe.govt.nz/about-us/news-and-media/rss
- https://ourauckland.aucklandcouncil.govt.nz/media-centre/
- https://www.dia.govt.nz/press.nsf/index?OpenView
- https://www.mpi.govt.nz/news/
- https://oag.parliament.nz/reports/latest
- https://www.privacy.org.nz/news/statements-media-releases/
- https://www.publicservice.govt.nz/news
- https://www.waitangitribunal.govt.nz/en/news

## Running Locally
### Requirements

- [Deno](https://deno.com/) v2.0 or later.
- An instance of Directus available with the Dispatch Desk Schema Loaded:
  - The schema is available at [snapshot.yaml](snapshot.yaml), and can be imported using `npx directus schema apply ./snapshot.yaml`.
- An OpenAI API Key.
- A [Qdrant](https://qdrant.tech/) instance available.
- (Optional) A Nitter instance available with RSS Feeds (req. for certain sources).
- (Optional) A Mapbox API key (req. for generating images from certain sources).
- (Optional) One or more discord webhooks for various logs.

### Environment Variables
Rename the `.env.example` file to `.env`. The project has various mandatory and required environment variables:

- `OPENAI_API_KEY`: The API key for your OpenAI account.
- `QDRANT_URL`: The URL to your [Qdrant](https://qdrant.tech/) instance. 
- `QDRANT_COLLECTION`: The name of your [Qdrant](https://qdrant.tech/) collection, e.g. `images`.
- `DIRECTUS_URL`: The URL of your Directus instance.
- `DIRECTUS_ACCESS_TOKEN`: The access token for your Directus API Account.
- `DIRECTUS_FILE_PHOTOS_FOLDER`: The ID of the folder where your file photos for Qdrant to store vectors of, are kept.
- (Optional) `NITTER_URL`: The URL to your RSS-enabled Nitter instance.
- (Optional) `MAPBOX_ACCESS_TOKEN`: Your Mapbox API Access Token.
- (Optional): All webhook variables.

### Starting

- Ensure you have [Deno](https://deno.com/) installed.
- Use `deno install` if you haven't already. Ensure you allow additional install scripts to be ran.
- Use `deno task start` to start the project.
 

