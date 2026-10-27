# Minimal example: PHP

The smallest working Algebrakit integration. A PHP server creates an exercise session with the [Algebrakit PHP SDK](https://github.com/algebrakit/sdk-php) and serves a page where a student can work on the exercise.

## Run it

Requires PHP 8.0 or newer, [Composer](https://getcomposer.org) and an Algebrakit API key.

```bash
composer install
cp .env.example .env    # then set ALGEBRAKIT_API_KEY in .env
composer start
```

Open http://localhost:3000. To use another port, change it in the `start` script in [composer.json](composer.json).

`composer start` runs PHP's built-in web server with [server.php](server.php) as the router script: `php -S localhost:3000 server.php`.

## What you'll see

- **A choice of exercises**, one per question type: a linear equation, a ratio table, drawing a parabola, the area of a triangle and multi-digit subtraction. They all use the same integration code.
- **The exercise**, rendered by the Algebrakit widget. Enter a step, make a mistake, ask for a hint: the feedback comes from Algebrakit.
- **Show solution**, which shows the worked solution of the same session. *Back to exercise* returns to the student's work.
- **Learning events**, streamed from the widget as the student works. `interaction-evaluate` events show how each step was judged (`CORRECT`, `ERROR`, ...). The frequent `*-state-changed` events are hidden until you click *Show all events*.

Each page load creates a new session. The session ID is shown above the event log and printed in the server log.

## How it works

```
Browser                         Your server (server.php)             Algebrakit
───────                         ────────────────────────             ──────────
GET /?exercise=… ────────────▶  1. createSession(exerciseId) ──────▶ api.algebrakit.com
                                   ◀──────────────── session ID ───
       ◀─────── 2. page with <akit-exercise session-id="…">
3. widget script loads from widgets.algebrakit.com
4. widget calls /proxy/algebrakit/* ──▶ adds x-api-key ────────────▶ api.algebrakit.com
```

1. **The server creates a session.** On every page load, the server looks up the chosen exercise in `EXERCISES` and calls `$sessionService->createSession()` with its ID. The page shows the session with `<akit-exercise session-id="…"></akit-exercise>`. To try your own exercise, add its ID to `EXERCISES` in [server.php](server.php).
2. **The page configures the widget before loading it.** `AlgebraKIT = { config: { proxy: { url } } }` must be defined *before* the widget script is loaded, so the widget knows where to send its API calls.
3. **The widget talks to Algebrakit through your server.** Your API key must never reach the browser, so the widget sends its calls to `/proxy/algebrakit/*`. The server attaches the `x-api-key` header and forwards them.
4. **Learning events arrive in the browser.** `AlgebraKIT.addExerciseListener()` reports what the student does. Use them to update your UI. For results you store or grade, ask the API from your server with the session ID: `getSessionScore()` or `getSessionInfo()` on the SDK's `SessionService`.
5. **The solution is the same session in solution mode.** Add the `solution-mode` attribute: `<akit-exercise session-id="…" solution-mode>`. The widget reads its attributes once, so the page replaces the element to switch between the exercise and the solution. The student's work is kept, because it is stored in the session.

| File | What it does |
|---|---|
| [server.php](server.php) | Creates a session per page load, serves the page, runs the proxy |
| [index.html](index.html) | Page template: widget config, widget script, exercise, event listener, solution toggle. All the Algebrakit code in the browser is here |
| [event-log.js](event-log.js) | Displays the learning events and hides the loading message (not needed for Algebrakit itself) |
| [style.css](style.css) | Page styling (not needed for Algebrakit itself) |
| [.env.example](.env.example) | API key and optional URLs |

The browser side (`index.html`, `event-log.js`, `style.css`) is identical in every minimal example. Only the server differs.

## Before you go to production

The proxy in this example forwards **every** request under `/proxy/algebrakit/*` to the Algebrakit API with your key attached, for anyone who can reach the server. That's fine on localhost, but don't deploy it as-is. In a real application:

- only forward the endpoints the widgets need;
- require your own user to be logged in before you forward anything;
- store the session ID per student and assignment, so students can resume and you can fetch results later, instead of creating a new session on every page load;
- decide when students may see the solution: here anyone can, at any time. See the `requireLockForSolution` option of `CreateSessionRequest`.

PHP's built-in web server is for development only. Behind Apache or nginx with PHP-FPM, send all requests to your front controller and let the web server serve the static files.

To save the widget a round trip, you can put the `html` that `createSession()` returns in the page instead of the bare `<akit-exercise session-id="…">` element.
