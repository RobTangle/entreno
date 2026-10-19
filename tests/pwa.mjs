// headless chrome: npm install playwright && node tests/pwa.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const PORT = 4177;
const URL = `http://127.0.0.1:${PORT}/index.html`;
const KEY = 'entreno.v1';

const errors = [];
function fail(msg) {
  console.error('FAIL:', msg);
  errors.push(msg);
}
function assert(cond, msg) {
  if (!cond) fail(msg);
  else console.log('ok:', msg);
}

function track(page) {
  const logs = [];
  logs.dialogs = [];
  page.on('pageerror', (err) => logs.push('pageerror: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') logs.push('console: ' + msg.text());
  });
  page.on('dialog', async (d) => {
    logs.dialogs.push(d.message());
    if (/entreno en curso|dar por hecho/i.test(d.message())) {
      await d.accept();
      return;
    }
    logs.push('dialog: ' + d.message());
    await d.dismiss();
  });
  return logs;
}

async function readState(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
}

async function startServer() {
  const child = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
    cwd: '/workspace',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(URL);
      if (res.ok) return child;
    } catch (_) {}
    await delay(100);
  }
  child.kill();
  throw new Error('server did not start');
}

async function freshFlow(browser) {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  const logs = track(page);
  await page.goto(URL, { waitUntil: 'load' });

  await page.getByText('sentadilla, remo y swing', { exact: true }).waitFor();
  await page.getByText('peso muerto, zancada y glúteos', { exact: true }).waitFor();
  assert(await page.getByText('fuerza A', { exact: false }).count() === 0, 'fresh load has no legacy fuerza A name');

  const primer = page.locator('[data-primer]');
  await primer.waitFor();
  const primerText = await primer.innerText();
  assert(/5 minutos/i.test(primerText), 'antes de empezar mentions a 5 minute warm-up');
  assert(/reserva/i.test(primerText), 'antes de empezar mentions reps in reserve');
  assert(/progres/i.test(primerText), 'antes de empezar mentions gradual progress');

  const state = await readState(page);
  assert(state.schema === 2, 'fresh state is schema 2');
  const a = state.routines.find((r) => r.name === 'sentadilla, remo y swing');
  const b = state.routines.find((r) => r.name === 'peso muerto, zancada y glúteos');
  assert(a && b, 'both default routines are stored');
  assert(a.exercises[0].name === 'sentadilla goblet' && a.exercises[0].sets === 4 && a.exercises[0].reps === '12', 'routine A keeps the goblet prescription');
  assert(b.exercises.map((e) => e.name).join(',') === [
    'peso muerto rumano',
    'zancada hacia atrás',
    'press de piso',
    'remo con banda',
    'puente de glúteos',
    'dead bug',
  ].join(','), 'routine B exercise order');
  const pmr = b.exercises[0];
  assert(pmr.sets === 4 && pmr.reps === '10' && pmr.weight === '14' && pmr.rest === 75, 'peso muerto rumano 14kg 4x10 rest 75');
  const zanc = b.exercises[1];
  assert(zanc.sets === 3 && zanc.reps === '8' && String(zanc.weight).includes('8') && zanc.rest === 60 && /pierna/i.test(zanc.note), 'zancada 2x8kg 3x8 por pierna rest 60');
  const piso = b.exercises[2];
  assert(piso.sets === 4 && piso.reps === '10' && String(piso.weight).includes('8') && piso.rest === 60, 'press de piso 2x8kg 4x10 rest 60');
  const banda = b.exercises[3];
  assert(banda.sets === 3 && banda.reps === '15' && banda.rest === 45 && !banda.weight, 'remo con banda 3x15 rest 45');
  const puente = b.exercises[4];
  assert(puente.sets === 3 && puente.reps === '15' && puente.weight === '14' && puente.rest === 45, 'puente 14kg 3x15 rest 45');
  const bug = b.exercises[5];
  assert(bug.sets === 3 && bug.reps === '10' && bug.rest === 45 && /lado/i.test(bug.note), 'dead bug 3x10 por lado rest 45');

  const sumA = a.warmup.reduce((n, d) => n + d.secs, 0);
  const sumB = b.warmup.reduce((n, d) => n + d.secs, 0);
  assert(sumA >= 300 && sumA <= 360, `routine A warm-up is 5-6 min (${sumA}s)`);
  assert(sumB >= 300 && sumB <= 360, `routine B warm-up is 5-6 min (${sumB}s)`);
  const namesA = a.warmup.map((d) => d.name).join(' | ');
  assert(namesA.includes('jumping jacks o trote en el lugar'), 'A warm-up starts with jumping jacks or jog');
  assert(namesA.includes('círculos de cadera por lado'), 'A warm-up has hip circles');
  assert(namesA.includes('sentadillas sin peso lentas'), 'A warm-up has bodyweight squats');
  assert(/bisagras de cadera/i.test(namesA) && /good morning/i.test(namesA), 'A warm-up has hip hinges');
  assert(/pull-apart/i.test(namesA) && /círculos de brazos/i.test(namesA), 'A warm-up has arm circles and pull-aparts');
  assert(namesA.includes('flexiones inclinadas o en rodillas'), 'A warm-up has easy push-ups');
  assert(/swings livianos/i.test(namesA) && /8 kg/i.test(namesA), 'A warm-up has light 8kg swings');
  assert(!/dead bug/i.test(namesA) && !/zancada/i.test(namesA), 'A warm-up does not borrow B patterns');
  const namesB = b.warmup.map((d) => d.name).join(' | ');
  assert(namesB.includes('trote en el lugar') && !/jumping jacks/i.test(namesB), 'B warm-up starts with a jog');
  assert(namesB.includes('puentes de glúteos sin peso'), 'B warm-up has glute bridges');
  assert(namesB.includes('bisagras de cadera sin peso'), 'B warm-up has hinges');
  assert(/zancadas hacia atrás sin peso/i.test(namesB), 'B warm-up has reverse lunges');
  assert(namesB.includes('pull-aparts con banda'), 'B warm-up has band pull-aparts');
  assert(namesB.includes('flexiones inclinadas'), 'B warm-up has incline push-ups');
  assert(/dead bugs por lado/i.test(namesB), 'B warm-up has dead bugs');
  assert(!/swing/i.test(namesB) && !/sentadilla/i.test(namesB), 'B warm-up does not borrow A patterns');
  assert(a.warmup.every((d) => d.cue && d.cue.length > 8), 'each A drill has a one-line cue');
  assert(b.warmup.every((d) => d.cue && d.cue.length > 8), 'each B drill has a one-line cue');
  const squatDrill = a.warmup.find((d) => d.name.includes('sentadillas sin peso'));
  assert(squatDrill.guide === 'sentadilla goblet', 'bodyweight squat drill links to the goblet sheet');
  const bugDrill = b.warmup.find((d) => /dead bug/i.test(d.name));
  assert(bugDrill.guide === 'dead bug', 'dead bug drill links to its sheet');

  await page.locator('.howto').first().click();
  const sheet = page.locator('[data-sheet="guide"]');
  await sheet.waitFor();
  const sheetText = await sheet.innerText();
  assert(/para que rinda/i.test(sheetText), 'guide shows para que rinda');
  assert(/para no lastimarte/i.test(sheetText), 'guide shows para no lastimarte');
  assert(/kettlebell kings/i.test(sheetText), 'guide keeps the source credit');
  const img = sheet.locator('img');
  const width = await img.evaluate((el) => (el.complete && el.naturalWidth) || new Promise((resolve, reject) => {
    el.addEventListener('load', () => resolve(el.naturalWidth), { once: true });
    el.addEventListener('error', () => reject(new Error('image failed')), { once: true });
  }));
  assert(width > 200, 'guide image loaded');
  assert((await img.getAttribute('src')).includes('01-sentadilla-goblet'), 'goblet card is the sentadilla image');
  const href = await sheet.locator('a').getAttribute('href');
  const decoded = decodeURIComponent(href);
  assert(href.startsWith('https://www.youtube.com/results?search_query='), 'youtube search url');
  assert(decoded.includes('sentadilla goblet') && decoded.includes('kettlebell tecnica'), 'youtube query uses the exercise name');
  await img.click();
  await page.locator('.zoom img').waitFor();
  assert(true, 'tap zooms the card');
  await page.locator('.zoom').click();
  await page.locator('[data-sheet="guide"] button', { hasText: 'cerrar' }).click();
  await sheet.waitFor({ state: 'hidden' });

  await page.getByRole('button', { name: 'editar' }).first().click();
  await page.locator('.ex .howto').first().click();
  await page.locator('[data-sheet="guide"]').waitFor();
  assert((await page.locator('[data-sheet="guide"] img').getAttribute('src')).includes('sentadilla'), 'edit view opens the exercise sheet');
  await page.locator('[data-sheet="guide"] button', { hasText: 'cerrar' }).click();
  await page.getByRole('button', { name: '←' }).click();

  const cardA = page.locator('.card', { hasText: 'sentadilla, remo y swing' });
  await cardA.getByRole('button', { name: /empezar/ }).click();
  await page.locator('[data-warmup]').waitFor();
  assert(/entrada en calor/i.test(await page.locator('[data-warmup]').innerText()), 'workout starts in the warm-up');
  assert(/jumping jacks o trote/i.test(await page.locator('[data-warmup]').innerText()), 'first A drill is on screen');
  const t1 = await page.locator('#timer').innerText();
  await delay(1200);
  const t2 = await page.locator('#timer').innerText();
  assert(t1 !== t2, `warm-up timer ticks (${t1} -> ${t2})`);
  await page.getByRole('button', { name: 'siguiente' }).click();
  await page.getByRole('button', { name: 'siguiente' }).click();
  assert(/sentadillas sin peso/i.test(await page.locator('[data-warmup]').innerText()), 'siguiente advances to the squat drill');
  await page.locator('[data-warmup] .howto').click();
  assert((await page.locator('[data-sheet="guide"] img').getAttribute('src')).includes('sentadilla'), 'warm-up drill opens the linked sheet');
  await page.locator('[data-sheet="guide"] button', { hasText: 'cerrar' }).click();
  await page.getByRole('button', { name: /saltar entrada en calor/ }).click();
  await page.locator('[data-warmup]').waitFor({ state: 'hidden' });
  assert(/sentadilla goblet/i.test(await page.locator('.exname').innerText()), 'skip lands on the first work exercise');
  assert(/serie 1/i.test(await page.locator('#app').innerText()), 'skip happens before the first set');
  await page.locator('.howto').first().click();
  assert((await page.locator('[data-sheet="guide"] img').getAttribute('src')).includes('sentadilla'), 'workout mode opens the current exercise sheet');
  await page.locator('[data-sheet="guide"] button', { hasText: 'cerrar' }).click();
  const mid = await readState(page);
  assert(mid.history.length === 0, 'skipping the warm-up does not write history');

  await page.getByRole('button', { name: '←', exact: true }).click();
  await page.locator('.card', { hasText: 'peso muerto, zancada y glúteos' }).getByRole('button', { name: /empezar/ }).click();
  await page.locator('[data-warmup]').waitFor();
  assert(/trote en el lugar/i.test(await page.locator('[data-warmup]').innerText()), 'routine B starts with its own jog');
  assert(!/jumping jacks/i.test(await page.locator('[data-warmup]').innerText()), 'routine B does not run routine A drills');

  const swText = await (await fetch(`http://127.0.0.1:${PORT}/sw.js`)).text();
  assert(/networkFirst/.test(swText) && /navigate/.test(swText), 'service worker is network-first for documents');
  assert(/img\//.test(swText), 'service worker caches images');
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const out = [];
    for (const key of keys) {
      const cache = await caches.open(key);
      for (const req of await cache.keys()) out.push(req.url);
    }
    return out;
  });
  assert(cached.some((u) => u.includes('/img/01-sentadilla-goblet')), 'goblet image is cached for offline');
  await context.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  const offlineText = await page.locator('#app').innerText();
  assert(/entrada en calor|rutinas/i.test(offlineText), 'offline reload still shows the app');
  await context.setOffline(false);

  assert(logs.length === 0, 'fresh flow has no console errors: ' + logs.join(' | '));
  await context.close();
}

async function migrationFlow(browser) {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  const logs = track(page);
  const old = {
    routines: [{
      id: 'rA',
      name: 'fuerza A (kettlebells)',
      exercises: [{
        id: 'e1', name: 'sentadilla goblet', sets: 5, mode: 'reps', reps: '8', secs: 0, weight: '20', rest: 90, note: 'editado',
      }],
    }],
    history: [{
      id: 'h1',
      date: '2026-01-02T15:04:00.000Z',
      routine: 'fuerza A (kettlebells)',
      minutes: 32,
      exercises: [{ name: 'sentadilla goblet', sets: [{ reps: '8', kg: '20' }] }],
    }],
    equipment: 'mis kettlebells',
    active: null,
  };
  await page.addInitScript((payload) => {
    if (!localStorage.getItem('entreno.v1')) localStorage.setItem('entreno.v1', JSON.stringify(payload));
  }, old);
  await page.goto(URL, { waitUntil: 'load' });
  await page.getByText('sentadilla, remo y swing', { exact: true }).waitFor();
  await page.getByText('peso muerto, zancada y glúteos', { exact: true }).waitFor();

  let state = await readState(page);
  assert(state.schema === 2, 'migration bumps schema to 2');
  assert(state.equipment === 'mis kettlebells', 'migration keeps equipment');
  assert(state.history.length === 1 && state.history[0].id === 'h1', 'migration keeps history entries');
  assert(state.history[0].routine === 'fuerza A (kettlebells)', 'migration does not rewrite history names');
  assert(state.history[0].minutes === 32, 'migration keeps history details');
  assert(state.routines.length === 2, 'missing B routine is added once');
  const a = state.routines.find((r) => r.id === 'rA');
  assert(a && a.name === 'sentadilla, remo y swing', 'fuerza A (kettlebells) is renamed');
  assert(a.exercises.length === 1 && a.exercises[0].id === 'e1', 'user exercises are not replaced');
  assert(a.exercises[0].sets === 5 && a.exercises[0].weight === '20' && a.exercises[0].note === 'editado', 'user sets, load and note stay');
  assert(a.warmup.some((d) => /swings livianos/i.test(d.name)), 'existing A routine receives the A warm-up');
  const b = state.routines.find((r) => r.name === 'peso muerto, zancada y glúteos');
  assert(b && b.exercises.length === 6 && b.warmup.some((d) => /dead bug/i.test(d.name)), 'added B routine includes its warm-up');

  await page.getByRole('button', { name: 'historial' }).click();
  assert(/fuerza A \(kettlebells\)/i.test(await page.locator('#app').innerText()), 'history screen still shows the original routine name');

  await page.getByRole('button', { name: 'rutinas' }).click();
  await page.locator('.card', { hasText: 'sentadilla, remo y swing' }).getByRole('button', { name: 'editar' }).click();
  await page.locator('[data-edit-wu]').first().click();
  await page.locator('#wu_name').fill('trote suave de prueba');
  await page.locator('[data-save-wu]').click();
  state = await readState(page);
  assert(state.routines.find((r) => r.id === 'rA').warmup[0].name === 'trote suave de prueba', 'warm-up drills are editable');
  assert(state.history[0].id === 'h1' && state.history[0].routine === 'fuerza A (kettlebells)', 'editing a warm-up does not touch history');

  await page.reload({ waitUntil: 'load' });
  state = await readState(page);
  assert(state.routines.length === 2, 'reload does not add another B routine');
  assert(state.history.length === 1 && state.history[0].id === 'h1', 'reload keeps history');
  const kept = state.routines.find((r) => r.id === 'rA');
  assert(kept && kept.warmup[0].name === 'trote suave de prueba', 'edited warm-up survives reload');
  assert(state.routines.find((r) => r.id === 'rA').exercises[0].note === 'editado', 'reload does not restore default exercises');

  assert(logs.length === 0, 'migration flow has no console errors: ' + logs.join(' | '));
  await context.close();
}

async function fuerzaBFlow(browser) {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  const logs = track(page);
  const old = {
    routines: [
      {
        id: 'a',
        name: 'fuerza A',
        exercises: [{ id: 'ae', name: 'swing', sets: 2, mode: 'reps', reps: '20', secs: 0, weight: '14', rest: 60, note: 'mio' }],
      },
      {
        id: 'b',
        name: 'fuerza B (kettlebells)',
        exercises: [{ id: 'bx', name: 'mi ejercicio raro', sets: 2, mode: 'reps', reps: '5', secs: 0, weight: '6', rest: 30, note: 'no tocar' }],
      },
    ],
    history: [{
      id: 'h9',
      date: '2026-02-02T12:00:00.000Z',
      routine: 'fuerza B (kettlebells)',
      minutes: 18,
      exercises: [{ name: 'mi ejercicio raro', sets: [{ reps: '5', kg: '6' }] }],
    }],
    equipment: 'banda',
    active: null,
  };
  await page.addInitScript((payload) => {
    if (!localStorage.getItem('entreno.v1')) localStorage.setItem('entreno.v1', JSON.stringify(payload));
  }, old);
  await page.goto(URL, { waitUntil: 'load' });
  const state = await readState(page);
  assert(state.routines.length === 2, 'existing fuerza B is renamed instead of duplicated');
  const a = state.routines.find((r) => r.id === 'a');
  const b = state.routines.find((r) => r.id === 'b');
  assert(a.name === 'sentadilla, remo y swing', 'fuerza A is renamed');
  assert(a.exercises[0].note === 'mio' && a.exercises.length === 1, 'fuerza A exercises stay');
  assert(a.warmup.some((d) => /sentadillas sin peso/i.test(d.name)), 'renamed A gets the squat warm-up');
  assert(b.name === 'peso muerto, zancada y glúteos', 'fuerza B... is renamed');
  assert(b.exercises.length === 1 && b.exercises[0].id === 'bx' && b.exercises[0].note === 'no tocar', 'fuerza B exercises stay');
  assert(b.warmup.some((d) => /puentes de glúteos sin peso/i.test(d.name)), 'renamed B gets the glute warm-up');
  assert(!b.warmup.some((d) => /swing/i.test(d.name)), 'renamed B does not get swing drills');
  assert(state.history[0].routine === 'fuerza B (kettlebells)' && state.history[0].id === 'h9', 'fuerza B history text stays');
  assert(logs.length === 0, 'fuerza B flow has no console errors: ' + logs.join(' | '));
  await context.close();
}

function miniRoutine(circuit) {
  return {
    schema: 2,
    equipment: 'test',
    history: [{ id: 'prev', date: '2026-03-01T12:00:00.000Z', routine: 'viejo', minutes: 10, exercises: [{ name: 'swing', sets: [{ reps: '5', kg: '8' }] }] }],
    active: null,
    routines: [{
      id: 't',
      name: 'prueba series',
      circuit: !!circuit,
      warmup: [],
      exercises: [
        { id: 'a', name: 'sentadilla goblet', sets: 2, mode: 'reps', reps: '10', secs: 0, weight: '14', rest: 30, note: '' },
        { id: 'b', name: 'remo a una mano', sets: 1, mode: 'reps', reps: '8', secs: 0, weight: '14', rest: 20, note: '' },
        { id: 'c', name: 'swing', sets: 2, mode: 'reps', reps: '12', secs: 0, weight: '14', rest: 30, note: '' },
      ],
    }],
  };
}

async function openMini(browser, seed) {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  const logs = track(page);
  await page.addInitScript((payload) => {
    if (!localStorage.getItem('entreno.v1')) localStorage.setItem('entreno.v1', JSON.stringify(payload));
  }, seed);
  await page.goto(URL, { waitUntil: 'load' });
  await page.getByRole('button', { name: /empezar/ }).click();
  await page.locator('.exname').waitFor();
  return { context, page, logs };
}

async function skipRest(page) {
  await page.getByRole('button', { name: 'saltar', exact: true }).click();
  await page.locator('[data-set-done]').waitFor();
}

async function straightMode(browser) {
  const { context, page, logs } = await openMini(browser, miniRoutine(false));
  const app = () => page.locator('#app').innerText();
  assert(!(await app()).includes('vuelta 1 de'), 'straight mode does not show rounds');
  assert((await page.locator('[data-circuit]').getAttribute('data-circuit')) === 'off', 'modo circuito starts off');
  const serie = page.locator('[data-set-done]');
  const hecho = page.locator('[data-exercise-done]');
  await serie.waitFor();
  await hecho.waitFor();
  assert(((await serie.getAttribute('class')) || '').includes('ok'), 'serie hecha stays the primary button');
  assert(!((await hecho.getAttribute('class')) || '').includes('ok'), 'ejercicio hecho is secondary');
  assert(/ejercicio hecho → siguiente/.test(await hecho.innerText()), 'ejercicio hecho label');
  await page.locator('[data-prev]').waitFor();
  await page.locator('[data-next]').waitFor();
  await page.locator('[data-next]').click();
  assert(/remo a una mano/i.test(await page.locator('.exname').innerText()), 'siguiente ejercicio moves forward');
  await page.locator('[data-prev]').click();
  assert(/sentadilla goblet/i.test(await page.locator('.exname').innerText()), 'ejercicio anterior moves back');
  await serie.click();
  await skipRest(page);
  assert(/sentadilla goblet/i.test(await page.locator('.exname').innerText()), 'straight mode stays on the exercise after one set');
  assert(/serie 2 de 2/i.test(await app()), 'second set of the same exercise');
  await page.locator('[data-set-done]').click();
  await skipRest(page);
  assert(/remo a una mano/i.test(await page.locator('.exname').innerText()), 'straight mode moves on only after every set');
  const before = logs.dialogs.length;
  await page.locator('[data-exercise-done]').click();
  assert(logs.dialogs.slice(before).some((m) => /queda 1 serie/i.test(m)), 'confirm when sets remain');
  assert(/swing/i.test(await page.locator('.exname').innerText()), 'ejercicio hecho goes to the next exercise');
  await page.locator('[data-set-done]').click();
  await skipRest(page);
  await page.locator('[data-exercise-done]').click();
  await page.getByText(/bien ahí/i).waitFor();
  const state = await readState(page);
  assert(state.history[0].routine === 'prueba series', 'the finished session is saved first');
  const saved = state.history.find((h) => h.routine === 'prueba series');
  const names = saved.exercises.map((e) => e.name);
  assert(names.join(',') === 'sentadilla goblet,swing', 'skipped exercise is not logged as work');
  assert(saved.exercises[0].sets.length === 2 && saved.exercises[1].sets.length === 1, 'straight history keeps only sets that were done');
  assert(saved.exercises.every((e) => e.sets.every((s) => !s.skip && s.reps)), 'history sets have no skip markers');
  assert(state.history.some((h) => h.id === 'prev' && h.routine === 'viejo' && h.exercises[0].sets[0].reps === '5'), 'previous history entry is intact');
  assert(logs.length === 0, 'straight mode has no console errors: ' + logs.join(' | '));
  await context.close();
}

async function circuitMode(browser) {
  const { context, page, logs } = await openMini(browser, miniRoutine(false));
  await page.locator('[data-circuit="off"]').click();
  assert((await page.locator('[data-circuit]').getAttribute('data-circuit')) === 'on', 'modo circuito can be switched on at the start');
  assert(/vuelta 1 de 2/i.test(await page.locator('#app').innerText()), 'circuit header shows vuelta 1 of max sets');
  let stored = await readState(page);
  assert(stored.routines[0].circuit === true, 'the toggle is saved on the routine');
  const name = async () => page.locator('.exname').innerText();
  await page.locator('[data-set-done]').click();
  await skipRest(page);
  assert(/remo a una mano/i.test(await name()), 'circuit serie hecha moves to the next exercise');
  assert(/vuelta 1 de 2/i.test(await page.locator('#app').innerText()), 'still round 1');
  await page.locator('[data-set-done]').click();
  await skipRest(page);
  assert(/swing/i.test(await name()), 'circuit continues across the round');
  await page.locator('[data-set-done]').click();
  await skipRest(page);
  assert(/vuelta 2 de 2/i.test(await page.locator('#app').innerText()), 'second round starts');
  assert(/sentadilla goblet/i.test(await name()), 'round 2 returns to the first exercise');
  assert(!/remo a una mano/i.test(await name()), 'the 1-set exercise is not up in round 2');
  await page.locator('[data-set-done]').click();
  await skipRest(page);
  assert(/swing/i.test(await name()), 'round 2 skips the shorter exercise');
  assert(/vuelta 2 de 2/i.test(await page.locator('#app').innerText()), 'still round 2 on the last exercise');
  await page.locator('[data-set-done]').click();
  await page.getByText(/bien ahí/i).waitFor();
  const state = await readState(page);
  const saved = state.history.find((h) => h.routine === 'prueba series');
  const byName = Object.fromEntries(saved.exercises.map((e) => [e.name, e.sets.length]));
  assert(byName['sentadilla goblet'] === 2 && byName['remo a una mano'] === 1 && byName.swing === 2, 'circuit history logs one set per visit');
  assert(saved.exercises.every((e) => e.sets.every((s) => !s.skip && String(s.reps) !== '')), 'circuit history has only real sets');
  assert(state.history.some((h) => h.id === 'prev' && h.routine === 'viejo'), 'circuit finish does not rewrite older history');
  assert(logs.dialogs.length === 0, 'circuit serie hecha does not ask to skip sets');
  assert(logs.length === 0, 'circuit mode has no console errors: ' + logs.join(' | '));
  await context.close();
}

const server = await startServer();
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  await freshFlow(browser);
  await migrationFlow(browser);
  await fuerzaBFlow(browser);
  await straightMode(browser);
  await circuitMode(browser);
} finally {
  await browser.close();
  server.kill();
}

if (errors.length) {
  console.error(`\n${errors.length} assertion(s) failed`);
  process.exit(1);
}
console.log('\nall assertions passed');
