// Algebrakit minimal example - .NET / C#
// ======================================
// Creates an Algebrakit exercise session using the SDK and serves it as an
// interactive web page with learning event logging.
//
// The server handles these routes:
// - GET /?exercise=<slug>          — creates a new session for that exercise and serves the page (index.html)
// - /proxy/algebrakit/*            — forwards widget API calls to Algebrakit with the API key attached
// - GET /style.css, /event-log.js  — page styling and event log display
//
// To run:
//   dotnet user-secrets set ALGEBRAKIT_API_KEY <your API key>
//   dotnet run
//
// Then open http://localhost:3000 in your browser.

using System.Net;
using AlgebrakitSDK.Models.Requests;
using AlgebrakitSDK.Models.Shared;
using AlgebrakitSDK.Services;

var builder = WebApplication.CreateBuilder(args);

// Configuration: from user secrets (dotnet user-secrets) or environment variables
var apiKey = builder.Configuration["ALGEBRAKIT_API_KEY"];
var apiUrl = builder.Configuration["ALGEBRAKIT_API_URL"] ?? "https://api.algebrakit.com";
var widgetUrl = builder.Configuration["ALGEBRAKIT_WIDGET_URL"] ?? "https://widgets.algebrakit.com";
const string ProxyPrefix = "/proxy/algebrakit";

if (string.IsNullOrEmpty(apiKey) || apiKey == "your_api_key_here")
{
    Console.Error.WriteLine("\nError: ALGEBRAKIT_API_KEY is not set or is still the placeholder.");
    Console.Error.WriteLine("Run `dotnet user-secrets set ALGEBRAKIT_API_KEY <your API key>`.\n");
    Environment.Exit(1);
}

// Example exercises, one per question type. The integration is the same for all of them.
// The page shows one at a time: /?exercise=<slug>
ExerciseOption[] exercises =
[
    new("linear-equation", "Linear equation", "fa42e943-8213-41a6-8a91-8c22a929ffe9"),
    new("ratio-table", "Ratio table", "1e3d0964-4769-41fa-9a8a-86639fb53d53"),
    new("parabola", "Draw a parabola", "f5a894f8-4b67-4fe3-8423-6033e90ea56f"),
    new("triangle-area", "Area of a triangle", "eb21b44a-d846-4182-8a00-8f564386f11d"),
    new("subtraction", "Subtract multi-digit numbers", "489d0c1a-147f-47bc-86cb-6d7c8a90fe15"),
];

var app = builder.Build();
var root = app.Environment.ContentRootPath;
var template = File.ReadAllText(Path.Combine(root, "index.html"));
var sessionService = new SessionService(apiKey!, apiUrl);

async Task<(string? SessionId, string? Error)> CreateExerciseSession(string exerciseId)
{
    try
    {
        var response = await sessionService.CreateSessionAsync(new CreateSessionRequest
        {
            Exercises = [new ExerciseById { ExerciseId = exerciseId, Version = "latest" }],
        });
        var item = response.FirstOrDefault();
        var session = item is { Success: true } ? item.Sessions.FirstOrDefault() : null;

        return session != null
            ? (session.SessionId, null)
            : (null, item?.Msg ?? "Unknown error creating session");
    }
    catch (Exception e)
    {
        return (null, e.Message);
    }
}

async Task<string> RenderPage(string? slug)
{
    var exercise = exercises.FirstOrDefault(e => e.Slug == slug) ?? exercises[0];
    var (sessionId, error) = await CreateExerciseSession(exercise.ExerciseId);

    var exerciseNav = string.Join("\n", exercises.Select(e =>
        $"<a href=\"/?exercise={e.Slug}\"{(e == exercise ? " aria-current=\"page\"" : "")}>{WebUtility.HtmlEncode(e.Title)}</a>"));

    var page = template
        .Replace("{{PROXY_URL}}", ProxyPrefix)
        .Replace("{{WIDGET_URL}}", widgetUrl)
        .Replace("{{STACK}}", ".NET / C#")
        .Replace("{{EXERCISE_NAV}}", exerciseNav);

    if (error != null)
    {
        app.Logger.LogWarning("Session creation failed: {Error}", error);
        // No session: show the error instead of the <akit-exercise> element
        return page.Replace(
            "<akit-exercise session-id=\"{{SESSION_ID}}\"></akit-exercise>",
            $"<div class=\"error\"><strong>Could not create a session.</strong> {WebUtility.HtmlEncode(error)}" +
            "<p>Check ALGEBRAKIT_API_KEY in your user secrets and the server log.</p></div>");
    }

    app.Logger.LogInformation("Created session {SessionId} ({Title})", sessionId, exercise.Title);
    return page.Replace("{{SESSION_ID}}", sessionId);
}

// Proxy: forwards widget requests to the Algebrakit API with the API key attached.
// WARNING: this forwards every path, for anyone who can reach this server. That is fine
// on localhost, but do not deploy it as-is: in production, only forward the endpoints the
// widgets need and require your own user to be logged in.
var proxyClient = new HttpClient { BaseAddress = new Uri(apiUrl) };

app.Map(ProxyPrefix + "/{**path}", async (HttpContext ctx) =>
{
    var path = ctx.Request.Path.Value![ProxyPrefix.Length..] + ctx.Request.QueryString; // strip prefix
    var request = new HttpRequestMessage(new HttpMethod(ctx.Request.Method), path);
    request.Headers.Add("x-api-key", apiKey);

    if (!HttpMethods.IsGet(ctx.Request.Method) && !HttpMethods.IsHead(ctx.Request.Method))
    {
        request.Content = new StreamContent(ctx.Request.Body);
        request.Content.Headers.ContentType =
            new System.Net.Http.Headers.MediaTypeHeaderValue(ctx.Request.ContentType ?? "application/json");
    }

    try
    {
        var response = await proxyClient.SendAsync(request);
        ctx.Response.StatusCode = (int)response.StatusCode;
        ctx.Response.ContentType = response.Content.Headers.ContentType?.ToString();
        await response.Content.CopyToAsync(ctx.Response.Body);
    }
    catch (HttpRequestException e)
    {
        app.Logger.LogError("Proxy error: {Message}", e.Message);
        ctx.Response.StatusCode = 502;
        await ctx.Response.WriteAsJsonAsync(new { error = "Proxy error", message = e.Message });
    }
});

// A new session per page load: in a real application, create one session per student
// and assignment, store its ID, and reuse it so the student can resume.
app.MapGet("/", async (string? exercise) =>
    Results.Content(await RenderPage(exercise), "text/html; charset=utf-8"));

// Static files used by the page (styling and event log display only)
app.MapGet("/style.css", () => Results.File(Path.Combine(root, "style.css"), "text/css"));
app.MapGet("/event-log.js", () => Results.File(Path.Combine(root, "event-log.js"), "text/javascript"));

app.Run();

record ExerciseOption(string Slug, string Title, string ExerciseId);
