# Unduck

Unduck resolves DuckDuckGo-style bangs in your browser instead of making a server-side redirect request.

Open your instance's homepage (`/`) and use the search-engine URL shown there. It uses the page's actual origin, so a self-hosted instance never sends searches to a hard-coded public host. For example, an instance at `https://search.example.com` uses:

```text
https://search.example.com/?q=%s
```

## Development

Use a current Node.js LTS release and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Vite. To build and preview the production application:

```sh
pnpm build
pnpm preview
```

Run the redirect, validation, and cache tests with `pnpm test`.

The production output is `dist/`. Deploy it at the origin root, not a subpath. The included nginx configuration serves `/`, `/list`, and `/list/` as app routes, including searches such as `/?q=hello`. Missing JSON and asset files return 404 instead of app HTML. HTML, definitions, and assets use `Cache-Control: no-cache` with nginx's static-file ETags for revalidation; no immutable caching is assumed for arbitrary filenames.

## Definitions

Definitions live in `public/bangs/bangs.json` during development and are served at `/bangs/bangs.json`. The file is a JSON array containing only these fields per entry:

```json
[
  { "t": "g", "d": "www.google.com", "u": "https://www.google.com/search?q={{{s}}}" },
  { "t": "w", "d": "en.wikipedia.org", "u": "https://en.wikipedia.org/wiki/Special:Search?search={{{s}}}" }
]
```

- `t`: bang trigger without the leading `!`, such as `g` for `!g`.
- `d`: destination domain, used for a bang without a search query (for example, `!w` opens `https://en.wikipedia.org/`).
- `u`: search URL template, with `{{{s}}}` replaced by the encoded query.

Use safe HTTP or HTTPS destination URLs, never `javascript:`, `data:`, or other schemes. Upstream root-relative templates such as `/search?q={{{s}}}` resolve against `https://duckduckgo.com`, not your instance's origin or the `d` field.

The supplied file contains only `g`, `jdoc`, `cgpt`, `wen`, `wde`, `imdb`, `gen`, `gh`, and `ddg`. Keep the `g` entry: it is the default for searches without a bang. Keep valid JSON and the required fields when editing; the example above illustrates the schema, not the full dataset.

The catalogue was originally sourced from [DuckDuckGo's bang list](https://duckduckgo.com/bang.js), with custom entries added. Category, popularity, and display-name metadata have been removed.

## Refresh And Offline Use

Searches use saved definitions from browser Cache Storage first. If no definitions have been saved yet, the first search downloads `/bangs/bangs.json`. Runtime downloads use `fetch` with `cache: "no-cache"` to revalidate against the server rather than silently reusing a stale HTTP-cache response.

Only opening `/list` (or `/list/`) automatically refreshes definitions. The homepage links to this page, which renders every bang without filtering or pagination so you can use your browser's Find command. Opening the homepage `/` does not refresh definitions, and subsequent searches keep using the browser's saved definitions. After changing the server's file, visit `/list` in **each browser/profile** that should receive the update. Updating the file does not push it to browsers.

Use HTTPS in production, or localhost for local development: Cache Storage and PWA/service-worker features require a secure context. Plain HTTP on a remote host or LAN IP does not provide those guarantees. A first visit or first search needs network access to obtain the app and definitions. Offline use requires both to have been successfully cached beforehand; clearing browser storage removes that state. The destination search engine still needs network access to return results.

## Docker

Build the image from this checkout:

```sh
docker build -t unduck .
```

Mount a host **directory** containing `bangs.json`, not the individual file. For example, this uses the repository's `public/bangs` directory:

```sh
docker run -d --name unduck \
  -p 8080:80 \
  --mount "type=bind,source=$(pwd)/public/bangs,target=/usr/share/nginx/html/bangs,readonly" \
  unduck
```

Open `http://localhost:8080/` and use the search-engine URL displayed there. For remote use, put the container behind an HTTPS reverse proxy and open the public HTTPS origin.

For a separate configuration directory, replace `$(pwd)/public/bangs` with its absolute path and ensure it contains a readable `bangs.json` before starting the container. The directory mount hides the image's bundled definitions. Mounting the directory allows editors or scripts to atomically replace `bangs.json` with a rename; a single-file bind mount can remain attached to the old file.

Edit or atomically replace the host directory's `bangs.json` without restarting the container or rebuilding the image. Then visit `/list` in each browser to refresh its saved definitions. Without the mount, the image uses the definitions bundled at build time.
