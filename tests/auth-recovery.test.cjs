const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const ts = require('typescript');

function load(file, overrides) {
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(resolve(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', source)(
    name => overrides[name] ?? require(name), module, module.exports,
  );
  return module.exports;
}
const tick = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const user = { id: 'test-user', email: 'user@example.test', user_metadata: { role: 'sales' } };
function harness(t, options = {}) {
  const storage = new Map();
  const listeners = new Map();
  const timers = new Map();
  let timerId = 0;
  const browserStorage = {
    getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k),
    get length() { return storage.size; }, key: i => [...storage.keys()][i] ?? null,
  };
  const window = {
    localStorage: browserStorage, sessionStorage: browserStorage,
    location: { pathname: '/deals', search: '?view=open', replace: url => { window.destination = url; } },
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name),
    setInterval: () => 1, clearInterval: () => {},
  };
  t.mock.method(global, 'setTimeout', (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; });
  t.mock.method(global, 'clearTimeout', id => timers.delete(id));
  const oldWindow = global.window, oldDocument = global.document;
  global.window = window;
  global.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  t.after(() => { global.window = oldWindow; global.document = oldDocument; });
  const states = [], refs = [], effects = [];
  let stateIndex = 0, refIndex = 0, eventCallback;
  const react = {
    createContext: () => ({ Provider: 'provider' }), useContext: () => {},
    useCallback: fn => fn,
    useState: initial => { const index = stateIndex++; if (!(index in states)) states[index] = initial; return [states[index], value => states[index] = value]; },
    useRef: initial => refs[refIndex++] ?? (refs[refIndex - 1] = { current: initial }),
    useEffect: fn => effects.push(fn),
  };
  const client = { auth: {
    getSession: options.getSession ?? (async () => ({ data: { session: { user } } })),
    signOut: options.signOut ?? (async () => ({})),
    onAuthStateChange: cb => { eventCallback = cb; return { data: { subscription: { unsubscribe() {} } } }; },
  } };
  const { AuthProvider } = load('components/auth-provider.tsx', {
    react,
    '@/lib/local-auth-shared': { LOCAL_AUTH_TOKEN_KEY: 'smarttrade-auth-token' },
    '@/lib/protected-admin': { getEffectiveUserRole: role => role },
    '@/lib/supabase': { getSupabaseClient: () => client, fetchProfile: options.fetchProfile ?? (async () => ({ role: 'sales' })) },
  });
  const render = () => { stateIndex = 0; refIndex = 0; return AuthProvider({ children: 'protected' }); };
  render();
  effects[0]();
  return { states, window, storage, listeners, timers, render, client, startIdle: () => { render(); effects.at(-1)(); }, event: (...args) => eventCallback(...args) };
}

test('restored Safari page checks the session and clears an expired user', async t => {
  const h = harness(t);
  await tick();
  assert.equal(h.states[0].id, user.id);
  h.client.auth.getSession = async () => ({ data: { session: null } });
  h.listeners.get('pageshow')({ persisted: true });
  await tick();
  assert.equal(h.states[0], null);
  assert.equal(h.states[3], false);
});

test('a stalled profile request cannot leave the initial auth screen loading forever', async t => {
  const h = harness(t, { fetchProfile: () => new Promise(() => {}) });
  await tick();
  assert.equal(h.states[3], true);
  for (const timer of [...h.timers.values()]) if (timer.ms === 10000) timer.fn();
  await tick();
  assert.equal(h.states[3], false);
});

test('late session response cannot restore the user after logout', async t => {
  const h = harness(t);
  await tick();
  let resolveSession;
  h.client.auth.getSession = () => new Promise(resolve => resolveSession = resolve);
  h.listeners.get('focus')();
  await h.render().props.value.signOut();
  resolveSession({ data: { session: { user } } });
  await tick();
  assert.equal(h.states[0], null);
  assert.equal(h.states[2], null);
  assert.equal(h.states[3], false);
});

test('failed logout and inaccessible storage still clear auth state', async t => {
  const h = harness(t, { signOut: async () => { throw new Error('offline'); } });
  await tick();
  Object.defineProperty(h.window, 'localStorage', { get() { throw new Error('SecurityError'); } });
  Object.defineProperty(h.window, 'sessionStorage', { get() { throw new Error('SecurityError'); } });
  await h.render().props.value.signOut();
  assert.equal(h.states[0], null);
  assert.equal(h.states[3], false);
});

test('auth guard renders progress and uses a fresh document for expired sessions', t => {
  const effects = [];
  let auth = { user: null, loading: true };
  const oldWindow = global.window;
  let destination;
  global.window = { location: { pathname: '/deals', search: '?view=open', replace: url => destination = url } };
  t.after(() => global.window = oldWindow);
  const { AuthGuard } = load('components/auth-guard.tsx', {
    react: { useEffect: fn => effects.push(fn) },
    'next/navigation': { usePathname: () => '/deals' },
    '@/components/auth-provider': { useAuth: () => auth },
  });
  const { renderToStaticMarkup } = require('react-dom/server');
  assert.match(renderToStaticMarkup(AuthGuard({ children: 'secret' })), /Je sessie wordt gecontroleerd/);
  assert.doesNotMatch(renderToStaticMarkup(AuthGuard({ children: 'secret' })), /secret/);
  auth = { user: null, loading: false };
  AuthGuard({ children: 'secret' });
  effects.at(-1)();
  assert.equal(destination, '/login?returnTo=%2Fdeals%3Fview%3Dopen');
});

test('successful empty session removes the stale local token', async t => {
  const stored = new Map([['smarttrade-auth-token', 'expired']]);
  const oldWindow = global.window;
  global.window = { localStorage: { getItem: key => stored.get(key), removeItem: key => stored.delete(key) } };
  t.after(() => global.window = oldWindow);
  t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ data: { session: null } }) }));
  const { getLocalBrowserClient } = load('lib/local-browser-client.ts', {
    '@/lib/local-auth-shared': { LOCAL_AUTH_TOKEN_KEY: 'smarttrade-auth-token' },
  });
  await getLocalBrowserClient().auth.getSession();
  assert.equal(stored.has('smarttrade-auth-token'), false);
});

test('returning after ten idle hours reaches login even when logout fails', async t => {
  const h = harness(t, { signOut: async () => { throw new Error('network unavailable'); } });
  await tick();
  h.startIdle();
  h.storage.set('smarttrade-last-activity-at', String(Date.now() - 10 * 60 * 60 * 1000 - 1));
  h.listeners.get('focus')();
  await tick();
  assert.equal(h.window.destination, '/login?timeout=1');
  assert.equal(h.states[0], null);
  assert.equal(h.states[3], false);
});
