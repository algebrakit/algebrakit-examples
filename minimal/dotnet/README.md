# Minimal example: .NET / C#

The smallest working Algebrakit integration. An ASP.NET Core server creates an exercise session with the [Algebrakit .NET SDK](https://github.com/algebrakit/sdk-dotnet) and serves a page where a student can work on the exercise.

## Run it

Requires the [.NET 10 SDK](https://dotnet.microsoft.com/download) and an Algebrakit API key.

```bash
dotnet user-secrets set ALGEBRAKIT_API_KEY <your API key>
dotnet run
```

Open http://localhost:3000. The port is set in [Properties/launchSettings.json](Properties/launchSettings.json).

[User secrets](https://learn.microsoft.com/aspnet/core/security/app-secrets) keep your API key outside this folder, so it can't end up in git. Environment variables work too, and take precedence: if `ALGEBRAKIT_API_KEY` is set in your shell, that value is used instead of the user secret. Optionally, set `ALGEBRAKIT_API_URL` or `ALGEBRAKIT_WIDGET_URL` the same way to use another API or widget URL.

## What you'll see

- **A choice of exercises**, one per question type: a linear equation, a ratio table, drawing a parabola, the area of a triangle and multi-digit subtraction. They all use the same integration code.
- **The exercise**, rendered by the Algebrakit widget. Enter a step, make a mistake, ask for a hint: the feedback comes from Algebrakit.
- **Show solution**, which shows the worked solution of the same session. *Back to exercise* returns to the student's work.
- **Learning events**, streamed from the widget as the student works. `interaction-evaluate` events show how each step was judged (`CORRECT`, `ERROR`, ...). The frequent `*-state-changed` events are hidden until you click *Show all events*.

Each page load creates a new session. The session ID is shown above the event log and printed in the server log.

## How it works

```text
 Browser                      Your server (Program.cs)                   Algebrakit
    │                                     │                                   │
    │ 1. GET /?exercise=…                 │                                   │
    │────────────────────────────────────▶│ CreateSessionAsync(exerciseId)    │
    │                                     │──────────────────────────────────▶│
    │                                     │ session ID                        │
    │                                     │◀──────────────────────────────────│
    │ 2. page with                        │                                   │
    │    <akit-exercise session-id="…">   │                                   │
    │◀────────────────────────────────────│                                   │
    │                                     │                                   │
    │    page loads the widget script     │                                   │
    │    from widgets.algebrakit.com      │                                   │
    │─────────────────────────────────────┼──────────────────────────────────▶│
    │                                     │                                   │
    │ 3. widget API calls to              │ adds x-api-key                    │
    │    /proxy/algebrakit/*              │                                   │
    │────────────────────────────────────▶│──────────────────────────────────▶│
    │◀────────────────────────────────────│◀──────────────────────────────────│
    │                                     │                                   │
```

1. **The server creates a session.** On every page load, the server looks up the chosen exercise in `exercises` and calls `sessionService.CreateSessionAsync()` with its ID. The page shows the session with `<akit-exercise session-id="…"></akit-exercise>`. To try your own exercise, add its ID to `exercises` in [Program.cs](Program.cs).
2. **The page configures the widget before loading it.** `AlgebraKIT = { config: { proxy: { url } } }` must be defined *before* the widget script is loaded, so the widget knows where to send its API calls.
3. **The widget talks to Algebrakit through your server.** Your API key must never reach the browser, so the widget sends its calls to `/proxy/algebrakit/*`. The server attaches the `x-api-key` header and forwards them.
4. **Learning events arrive in the browser.** `AlgebraKIT.addExerciseListener()` reports what the student does. Use them to update your UI. For results you store or grade, ask the API from your server with the session ID: `GetSessionScoreAsync()` or `GetSessionInfoAsync()` on the SDK's `SessionService`.
5. **The solution is the same session in solution mode.** Add the `solution-mode` attribute: `<akit-exercise session-id="…" solution-mode>`. The widget reads its attributes once, so the page replaces the element to switch between the exercise and the solution. The student's work is kept, because it is stored in the session.

| File | What it does |
|---|---|
| [Program.cs](Program.cs) | Creates a session per page load, serves the page, runs the proxy |
| [index.html](index.html) | Page template: widget config, widget script, exercise, event listener, solution toggle. All the Algebrakit code in the browser is here |
| [event-log.js](event-log.js) | Displays the learning events and hides the loading message (not needed for Algebrakit itself) |
| [style.css](style.css) | Page styling (not needed for Algebrakit itself) |
| [AlgebrakitMinimal.csproj](AlgebrakitMinimal.csproj) | Project file: references the `Algebrakit.Sdk` NuGet package |
| [Properties/launchSettings.json](Properties/launchSettings.json) | Port and environment for `dotnet run` |

The browser side (`index.html`, `event-log.js`, `style.css`) is identical in every minimal example. Only the server differs.

## Before you go to production

The proxy in this example forwards **every** request under `/proxy/algebrakit/*` to the Algebrakit API with your key attached, for anyone who can reach the server. That's fine on localhost, but don't deploy it as-is. In a real application:

- only forward the endpoints the widgets need;
- require your own user to be logged in before you forward anything;
- store the session ID per student and assignment, so students can resume and you can fetch results later, instead of creating a new session on every page load;
- decide when students may see the solution: here anyone can, at any time. See the `RequireLockForSolution` option of `CreateSessionRequest`.

User secrets are for development only. In production, provide the API key through environment variables or a secret store such as Azure Key Vault.

To save the widget a round trip, you can put the `Html` that `CreateSessionAsync()` returns in the page instead of the bare `<akit-exercise session-id="…">` element.
