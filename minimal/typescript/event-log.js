// Event log for the demo page: renders Algebrakit learning events as an expandable list,
// and hides the loading message once the exercise is created.
// Nothing here is needed for Algebrakit itself; index.html passes each event to logEvent().

const list = document.getElementById('event-list');
const toggle = document.getElementById('toggle-noise');
const sessionLabel = document.getElementById('session-id');
let hiddenCount = 0;

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

// "*-state-changed" events fire constantly; hide them unless asked for.
function isNoise(name) {
    return name.endsWith('-state-changed');
}

function updateToggle() {
    const showAll = list.classList.contains('show-all');
    toggle.textContent = showAll ? 'Hide state changes' : 'Show all events (' + hiddenCount + ' hidden)';
}
toggle.addEventListener('click', function () {
    list.classList.toggle('show-all');
    updateToggle();
});
updateToggle();

// interaction-evaluate reports how the student's input was judged
function statusBadge(evt) {
    const item = evt.event === 'interaction-evaluate' && evt.data && evt.data.items && evt.data.items[0];
    if (!item) return null;
    const kind = item.status === 'ERROR' ? 'bad' : (item.status === 'CORRECT' || item.status === 'FINISHED') ? 'good' : '';
    return el('span', 'badge ' + kind, item.status);
}

function logEvent(evt) {
    // The exercise has rendered: hide the "Loading exercise…" message
    if (evt.event === 'exercise-created') {
        document.getElementById('exercise').classList.add('ready');
    }

    if (evt.sessionId && !sessionLabel.title) {
        sessionLabel.textContent = 'session ' + evt.sessionId.slice(0, 8) + '…';
        sessionLabel.title = evt.sessionId;
    }

    const noise = isNoise(evt.event);
    const entry = el('li', 'event' + (noise ? ' noise' : '') + (evt.event.endsWith('-finished') ? ' finished' : ''));
    const header = el('button', 'event-header');
    header.type = 'button';
    header.setAttribute('aria-expanded', 'false');

    const name = el('span', 'event-name', evt.event);
    const badge = statusBadge(evt);
    if (badge) name.append(badge);
    header.append(el('span', 'event-toggle', '▶'), name, el('span', 'event-time', new Date().toLocaleTimeString()));

    const data = Object.assign({}, evt);
    delete data.event;
    header.addEventListener('click', function () {
        header.setAttribute('aria-expanded', entry.classList.toggle('expanded'));
    });

    entry.append(header, el('pre', 'event-data', JSON.stringify(data, null, 2)));
    list.append(entry);
    list.scrollTop = list.scrollHeight;

    if (noise) {
        hiddenCount++;
        updateToggle();
    }
}
