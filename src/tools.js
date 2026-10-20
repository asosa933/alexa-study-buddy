// MCP-shaped tool registry. Each tool has a name, description and JSON-Schema
// inputSchema (the same shape an MCP server returns from tools/list), plus a
// local handler. The agent only talks to the world through these tools.
import { DECKS } from './decks.js';

export const normalize = (s) => String(s || '').toLowerCase()
  .replace(/[’']/g, "'").replace(/[^a-z0-9=.+'\s]/g, ' ').replace(/\b(the|a|an|it's|it is|i think|maybe|um|uh)\b/g, ' ')
  .replace(/\s+/g, ' ').trim();

function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
/** returns 'exact' | 'close' | false — "close" tolerates one typo / speech-recognition slip */
export function matchAnswer(given, accepted) {
  const g = normalize(given);
  for (const a of accepted) {
    const n = normalize(a);
    if (g === n || g.split(' ').includes(n) && n.split(' ').length === 1 && g.split(' ').length <= 3) return 'exact';
    if (n.length >= 4 && lev(g, n) <= 1) return 'close';
  }
  return false;
}

const shuffle = (arr, rnd) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function createTools(ctx) {
  // ctx: { memory, state, timer, rnd }
  const { memory, state } = ctx;
  const deckCards = (name) => name === 'my words' ? (memory.data.customCards || []) : (DECKS[name]?.cards || []);
  const deckTitle = (name) => name === 'my words' ? 'My words' : DECKS[name]?.title || name;
  const ask = () => {
    const q = state.quiz; const c = q.queue[q.i];
    return { question: c.q, number: q.i + 1, total: q.queue.length, deck: deckTitle(c.deck), hint: c.deck === 'my words' ? 'What does it mean?' : (DECKS[c.deck]?.hint || '') };
  };

  const tools = [
    {
      name: 'start_quiz',
      description: 'Start a spoken quiz. mode "review" uses only cards that are due or were missed before (spaced repetition).',
      inputSchema: { type: 'object', properties: {
        deck: { type: 'string', enum: [...Object.keys(DECKS), 'my words', 'any'] },
        count: { type: 'integer', minimum: 1, maximum: 12, default: 5 },
        mode: { type: 'string', enum: ['new', 'review'], default: 'new' } }, required: ['deck'] },
      handler({ deck, count = 5, mode = 'new' }) {
        let pool;
        if (mode === 'review') {
          pool = memory.dueCards(deck === 'any' ? null : deck).map((c) => {
            const card = deckCards(c.deck).find((x) => x.q === c.q); return card && { ...card, deck: c.deck };
          }).filter(Boolean);
          if (!pool.length) return { ok: false, reason: 'nothing_due' };
        } else {
          if (deck === 'any') deck = 'irregular verbs';
          const cards = deckCards(deck);
          if (!cards.length) return { ok: false, reason: 'empty_deck', deck };
          // prefer cards never seen or in low boxes
          pool = shuffle(cards, ctx.rnd).sort((a, b) => memory.card(deck, a.q).box - memory.card(deck, b.q).box).map((c) => ({ ...c, deck }));
        }
        const queue = pool.slice(0, Math.min(count, pool.length));
        state.quiz = { queue, i: 0, right: 0, missed: [], mode, deck };
        return { ok: true, mode, ...ask() };
      },
    },
    {
      name: 'check_answer',
      description: 'Grade the learner\'s answer to the current quiz question and update spaced-repetition memory.',
      inputSchema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] },
      handler({ answer }) {
        const q = state.quiz; if (!q) return { ok: false, reason: 'no_quiz' };
        const c = q.queue[q.i]; const m = matchAnswer(answer, c.a);
        memory.grade(c.deck, c.q, !!m);
        if (m) q.right++; else q.missed.push(c);
        q.i++;
        const res = { ok: true, correct: !!m, close: m === 'close', expected: c.a[0], question: c.q };
        if (q.i >= q.queue.length) { res.finished = true; res.score = q.right; res.total = q.queue.length; res.missed = q.missed.map((x) => x.q + ' → ' + x.a[0]); state.lastQuiz = q; state.quiz = null; }
        else res.next = ask();
        return res;
      },
    },
    {
      name: 'skip_question',
      description: 'Reveal the answer of the current question and move on (counts as missed).',
      inputSchema: { type: 'object', properties: {} },
      handler() { return tools.find((t) => t.name === 'check_answer').handler({ answer: '\u0000' }); },
    },
    {
      name: 'repeat_question',
      description: 'Repeat the current quiz question.',
      inputSchema: { type: 'object', properties: {} },
      handler() { return state.quiz ? { ok: true, ...ask() } : { ok: false, reason: 'no_quiz' }; },
    },
    {
      name: 'stop_quiz',
      description: 'End the current quiz early.',
      inputSchema: { type: 'object', properties: {} },
      handler() { const q = state.quiz; state.quiz = null; return q ? { ok: true, score: q.right, answered: q.i } : { ok: false, reason: 'no_quiz' }; },
    },
    {
      name: 'start_timer',
      description: 'Start a focus (or break) countdown timer.',
      inputSchema: { type: 'object', properties: { minutes: { type: 'number', minimum: 1, maximum: 120 }, label: { type: 'string', enum: ['focus', 'break'], default: 'focus' } }, required: ['minutes'] },
      handler({ minutes, label = 'focus' }) { ctx.timer.start(minutes, label); return { ok: true, minutes, label }; },
    },
    {
      name: 'timer_status',
      description: 'How much time is left on the timer.',
      inputSchema: { type: 'object', properties: {} },
      handler() { return ctx.timer.status(); },
    },
    {
      name: 'stop_timer',
      description: 'Cancel the running timer.',
      inputSchema: { type: 'object', properties: {} },
      handler() { const s = ctx.timer.status(); ctx.timer.stop(); return { ok: s.running, ...s }; },
    },
    {
      name: 'plan_session',
      description: 'Split the available study time into Pomodoro focus/break blocks, choosing what to study from memory (due and weak cards first).',
      inputSchema: { type: 'object', properties: { minutes: { type: 'integer', minimum: 10, maximum: 240 }, topic: { type: 'string' } }, required: ['minutes'] },
      handler({ minutes, topic }) {
        const blocks = []; let left = minutes;
        const focus = minutes >= 50 ? 25 : Math.max(10, Math.round(minutes * 0.8 / 5) * 5);
        while (left > 0) {
          const f = Math.min(focus, left); blocks.push({ type: 'focus', minutes: f }); left -= f;
          if (left >= 5) { const b = blocks.filter((x) => x.type === 'focus').length % 4 === 0 ? 15 : 5; blocks.push({ type: 'break', minutes: Math.min(b, left) }); left -= Math.min(b, left); }
        }
        const due = memory.dueCards();
        const weak = memory.weakest(3);
        const first = due.length ? `review ${due.length} due card${due.length > 1 ? 's' : ''}` : (topic ? `new ${topic} cards` : 'new irregular verbs');
        state.plan = { blocks, first, created: Date.now() };
        return { ok: true, blocks, firstTask: first, weak: weak.map((w) => w.q) };
      },
    },
    {
      name: 'add_card',
      description: 'Save a new flashcard to the learner\'s personal "my words" deck.',
      inputSchema: { type: 'object', properties: { term: { type: 'string' }, meaning: { type: 'string' } }, required: ['term', 'meaning'] },
      handler({ term, meaning }) {
        const list = memory.data.customCards ||= [];
        const ex = list.find((c) => c.q === term);
        if (ex) ex.a = [meaning]; else list.push({ q: term, a: [meaning] });
        memory.save(); return { ok: true, term, meaning, deckSize: list.length };
      },
    },
    {
      name: 'get_progress',
      description: 'Summarize learning progress: streak, minutes studied, mastered cards, weakest cards, cards due.',
      inputSchema: { type: 'object', properties: {} },
      handler() {
        const all = Object.values(memory.data.cards);
        return { ok: true, streak: memory.streak(), minutes: Math.round(memory.data.minutes), seen: all.length,
          mastered: all.filter((c) => c.box >= 3).length, due: memory.dueCards().length,
          weakest: memory.weakest(3).map((w) => w.q), name: memory.data.name };
      },
    },
    {
      name: 'set_name',
      description: 'Remember the learner\'s first name.',
      inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      handler({ name }) { memory.data.name = name; memory.save(); return { ok: true, name }; },
    },
  ];
  return tools;
}

/** MCP tools/list response for the registry (shown in the "Agent trace" panel and docs). */
export const toolsList = (tools) => ({ tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
