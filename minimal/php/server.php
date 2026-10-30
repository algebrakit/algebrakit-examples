<?php
/**
 * Algebrakit minimal example - PHP
 * ================================
 * Creates an Algebrakit exercise session using the SDK and serves it as an
 * interactive web page with learning event logging.
 *
 * This file is a router script for PHP's built-in web server. It handles these routes:
 * - GET /?exercise=<slug>          — creates a new session for that exercise and serves the page (index.html)
 * - /proxy/algebrakit/*            — forwards widget API calls to Algebrakit with the API key attached
 * - GET /style.css, /event-log.js  — page styling and event log display
 *
 * To run:
 *   composer install
 *   cp .env.example .env   (then add your API key to .env)
 *   composer start
 *
 * Then open http://localhost:3000 in your browser.
 */

require __DIR__ . '/vendor/autoload.php';

use Algebrakit\SDK\Models\Requests\CreateSessionRequest;
use Algebrakit\SDK\Models\Shared\ExerciseById;
use Algebrakit\SDK\Services\SessionService;
use Dotenv\Dotenv;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;

// Load environment variables from .env file
Dotenv::createImmutable(__DIR__)->safeLoad();

// A variable set in the environment wins over the value in .env
function env(string $name, string $default = ''): string
{
    return getenv($name) ?: ($_ENV[$name] ?? $default);
}

// Configuration
define('API_KEY', env('ALGEBRAKIT_API_KEY'));
define('API_URL', env('ALGEBRAKIT_API_URL', 'https://api.algebrakit.com'));
define('WIDGET_URL', env('ALGEBRAKIT_WIDGET_URL', 'https://widgets.algebrakit.com'));
const PROXY_PREFIX = '/proxy/algebrakit';

// Example exercises, one per question type. The integration is the same for all of them.
// The page shows one at a time: /?exercise=<slug>
const EXERCISES = [
    ['slug' => 'linear-equation', 'title' => 'Linear equation', 'exerciseId' => 'fa42e943-8213-41a6-8a91-8c22a929ffe9'],
    ['slug' => 'ratio-table', 'title' => 'Ratio table', 'exerciseId' => '1e3d0964-4769-41fa-9a8a-86639fb53d53'],
    ['slug' => 'parabola', 'title' => 'Draw a parabola', 'exerciseId' => 'f5a894f8-4b67-4fe3-8423-6033e90ea56f'],
    ['slug' => 'triangle-area', 'title' => 'Area of a triangle', 'exerciseId' => 'eb21b44a-d846-4182-8a00-8f564386f11d'],
    ['slug' => 'subtraction', 'title' => 'Subtract multi-digit numbers', 'exerciseId' => '489d0c1a-147f-47bc-86cb-6d7c8a90fe15'],
];

// Static files used by the page (styling and event log display only)
const STATIC_FILES = ['/style.css', '/event-log.js'];

/**
 * @return array{sessionId: ?string, error: ?string}
 */
function createExerciseSession(string $exerciseId): array
{
    try {
        $sessionService = new SessionService(API_KEY, baseUrl: API_URL);
        $response = $sessionService->createSession(
            new CreateSessionRequest(exercises: [new ExerciseById($exerciseId, 'latest')])
        );
        $session = ($response[0]->success ?? false) ? ($response[0]->sessions[0] ?? null) : null;

        if ($session) {
            return ['sessionId' => $session->sessionId, 'error' => null];
        }
        return ['sessionId' => null, 'error' => $response[0]->msg ?? 'Unknown error creating session'];
    } catch (Throwable $e) {
        return ['sessionId' => null, 'error' => $e->getMessage()];
    }
}

function renderPage(?string $slug): string
{
    $exercise = EXERCISES[0];
    foreach (EXERCISES as $e) {
        if ($e['slug'] === $slug) {
            $exercise = $e;
        }
    }
    $session = createExerciseSession($exercise['exerciseId']);

    $exerciseNav = implode("\n", array_map(
        fn ($e) => sprintf(
            '<a href="/?exercise=%s"%s>%s</a>',
            $e['slug'],
            $e === $exercise ? ' aria-current="page"' : '',
            htmlspecialchars($e['title'])
        ),
        EXERCISES
    ));

    $page = str_replace(
        ['{{PROXY_URL}}', '{{WIDGET_URL}}', '{{STACK}}', '{{EXERCISE_NAV}}'],
        [PROXY_PREFIX, WIDGET_URL, 'PHP', $exerciseNav],
        file_get_contents(__DIR__ . '/index.html')
    );

    if ($session['error'] !== null) {
        error_log("Session creation failed: {$session['error']}");
        // No session: show the error instead of the <akit-exercise> element
        return str_replace(
            '<akit-exercise session-id="{{SESSION_ID}}"></akit-exercise>',
            '<div class="error"><strong>Could not create a session.</strong> ' . htmlspecialchars($session['error']) .
                '<p>Check ALGEBRAKIT_API_KEY in .env and the server log.</p></div>',
            $page
        );
    }

    error_log("Created session {$session['sessionId']} ({$exercise['title']})");
    return str_replace('{{SESSION_ID}}', $session['sessionId'], $page);
}

// Proxy: forwards widget requests to the Algebrakit API with the API key attached.
// WARNING: this forwards every path, for anyone who can reach this server. That is fine
// on localhost, but do not deploy it as-is: in production, only forward the endpoints the
// widgets need and require your own user to be logged in.
function forwardToAlgebrakit(string $path): void
{
    $client = new Client(['base_uri' => API_URL, 'http_errors' => false]);
    try {
        $response = $client->request($_SERVER['REQUEST_METHOD'], $path, [
            'headers' => [
                'Content-Type' => $_SERVER['CONTENT_TYPE'] ?? 'application/json',
                'x-api-key' => API_KEY,
            ],
            'body' => file_get_contents('php://input'),
        ]);
    } catch (GuzzleException $e) {
        error_log('Proxy error: ' . $e->getMessage());
        http_response_code(502);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Proxy error', 'message' => $e->getMessage()]);
        return;
    }

    http_response_code($response->getStatusCode());
    if ($response->hasHeader('Content-Type')) {
        header('Content-Type: ' . $response->getHeaderLine('Content-Type'));
    }
    echo $response->getBody();
}

if (API_KEY === '' || API_KEY === 'your_api_key_here') {
    $message = 'ALGEBRAKIT_API_KEY is not set or is still the placeholder. Copy .env.example to .env and set ALGEBRAKIT_API_KEY.';
    error_log("Error: $message");
    http_response_code(500);
    header('Content-Type: text/plain');
    echo "Error: $message\n";
    exit;
}

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

if (str_starts_with($path, PROXY_PREFIX)) {
    forwardToAlgebrakit(substr($_SERVER['REQUEST_URI'], strlen(PROXY_PREFIX))); // strip prefix
} elseif ($method === 'GET' && $path === '/') {
    // A new session per page load: in a real application, create one session per student
    // and assignment, store its ID, and reuse it so the student can resume.
    header('Content-Type: text/html; charset=utf-8');
    echo renderPage($_GET['exercise'] ?? null);
} elseif ($method === 'GET' && in_array($path, STATIC_FILES, true)) {
    return false; // let PHP's built-in server send the file
} else {
    http_response_code(404);
    header('Content-Type: text/plain');
    echo 'Not found';
}
