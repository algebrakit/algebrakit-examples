# AGENTS.md

Guidance for coding assistants working in this repository, or helping someone integrate Algebrakit based on it.

## What this repository is

Runnable examples of an Algebrakit integration. `minimal/` has the same small application in three server languages:

```
minimal/
├── typescript/   server.ts    package.json, .env.example
├── php/          server.php   composer.json, .env.example
└── dotnet/       Program.cs   AlgebrakitMinimal.csproj, Properties/launchSettings.json
                  + in each:   index.html, event-log.js, style.css (identical copies)
```

## How an integration works

1. **The server creates a session** with the Algebrakit SDK and the API key: `createSession` with an exercise ID returns a session ID.
2. **The page shows it** with `<akit-exercise session-id="…"></akit-exercise>`, after setting `AlgebraKIT = { config: { proxy: { url } } }` and loading the widget script from `https://widgets.algebrakit.com`.
3. **The widget calls the Algebrakit API through the server**: requests to `/proxy/algebrakit/*` are forwarded to `https://api.algebrakit.com` with the `x-api-key` header added.
4. **The page listens to learning events** with `AlgebraKIT.addExerciseListener(fn)`. Results that are stored or graded come from the server: `getSessionScore` / `getSessionInfo`.
5. **The solution** is the same session rendered with the `solution-mode` attribute.

SDK calls per language:

| | TypeScript (`@algebrakit/sdk`) | PHP (`algebrakit/sdk-php`) | .NET (`Algebrakit.Sdk`) |
|---|---|---|---|
| Client | `new ApiClient(apiUrl, apiKey)` | `new SessionService($apiKey, null, $apiUrl)` | `new SessionService(httpClient, apiKey)` |
| Create a session | `createSession` | `createSession` | `CreateSessionAsync` |
| Score / info | `getSessionScore` / `getSessionInfo` | `getSessionScore` / `getSessionInfo` | `GetSessionScoreAsync` / `GetSessionInfoAsync` |
| Lock | `lockSession` | `lockOrUnlockSession` | `LockOrUnlockSessionAsync` |

The .NET `SessionService` adds the API key to the `HttpClient`'s default headers, so give it its own `HttpClient`.

## Reference

The examples cover only part of what Algebrakit offers. For anything else, such as widget attributes, configuration options, event names and payloads, or API fields, look it up in the documentation at [docs.algebrakit.com](https://docs.algebrakit.com/) instead of guessing:

- Concepts: [System overview](https://docs.algebrakit.com/pages/210-system-overview/), [Integration approaches](https://docs.algebrakit.com/pages/230-integration-approaches/), [Learning data](https://docs.algebrakit.com/pages/220-learning-data/)
- Server side: [API reference](https://docs.algebrakit.com/pages/310-API/), [SDKs](https://docs.algebrakit.com/pages/320-SDK/), and the machine-readable [OpenAPI spec](https://api.algebrakit.com/openapi/yaml)
- Browser side: [Web components](https://docs.algebrakit.com/pages/410-webcomponents/), [Proxy setup](https://docs.algebrakit.com/pages/420-proxy-setup/), [Configuration](https://docs.algebrakit.com/pages/430-frontend-configuration/), [Learning events](https://docs.algebrakit.com/pages/450-learning-events/)

## Rules

- **The API key never reaches the browser.** Not in HTML, JavaScript, URLs or logs. Browser calls go through the server's proxy, which adds `x-api-key`.
- **Set `AlgebraKIT.config` before loading the widget script.** The widget reads it once, when it loads.
- **The proxy in `minimal/` is for localhost only.** It forwards every path for anyone. When you write code for a real application, forward only the endpoints the widgets use, require the application's own logged-in user, and add a CSRF header through `AlgebraKIT.config.proxy.headers` if the application uses one.
- **Never commit keys.** `.env` is gitignored; .NET uses `dotnet user-secrets`. In .NET, an `ALGEBRAKIT_API_KEY` environment variable overrides the user secret.
- **The widget reads `<akit-exercise>` attributes once.** To switch to `solution-mode`, replace the element with a new one for the same session ID; changing the attribute does nothing.
- **Use the published SDK packages**, not copies of SDK code.

## Conventions in this repository

- **`index.html`, `event-log.js` and `style.css` are byte-identical in every `minimal/*` folder.** Edit one copy, copy it to the other folders, and check:
  ```bash
  for f in index.html event-log.js style.css; do cmp minimal/typescript/$f minimal/php/$f && cmp minimal/typescript/$f minimal/dotnet/$f; done
  ```
- **Placeholders in `index.html`**, filled in by each server: `{{PROXY_URL}}`, `{{WIDGET_URL}}`, `{{STACK}}` (`Node.js / TypeScript`, `PHP` or `.NET / C#`), `{{EXERCISE_NAV}}` and `{{SESSION_ID}}`. When session creation fails, the server replaces the whole `<akit-exercise …></akit-exercise>` element with an error block. Never render it with an empty session ID.
- **The servers mirror each other section by section** (configuration, `EXERCISES`, create session, render page, proxy, routes), so they can be read side by side. Keep the same routes: `GET /?exercise=<slug>`, `/proxy/algebrakit/*`, `GET /style.css`, `GET /event-log.js`. Everything else returns 404, so `.env` and source files are never served.
- **The five example exercises** (slugs, titles and IDs) are the same in all three servers.
- **Keep the examples minimal:** no web frameworks beyond each platform's standard one (Node `http`, PHP's built-in server, ASP.NET Core minimal APIs), and no build step for the browser files.
- **The READMEs share one structure**, including the "How it works" sequence diagram. Keep the diagram's columns aligned when you edit it.

## Run and check locally

| Example | Run | Check |
|---|---|---|
| `minimal/typescript` | `npm install`, `cp .env.example .env`, `npm start` | `npm run typecheck` |
| `minimal/php` | `composer install`, `cp .env.example .env`, `composer start` | `php -l server.php` |
| `minimal/dotnet` | `dotnet user-secrets set ALGEBRAKIT_API_KEY <key>`, `dotnet run` | `dotnet build` |

Each one serves http://localhost:3000. A change works when, for every `?exercise=` in the picker:
- the exercise renders and `exercise-created` appears in the event log;
- *Show solution* and *Back to exercise* work and keep the student's work;
- `/.env` returns 404;
- the page has no horizontal scroll at 375px wide.
