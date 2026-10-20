import assert from 'node:assert/strict';
import { StudyBuddy, understand, splitClauses } from '../src/agent.js';
import { Memory } from '../src/memory.js';
import { matchAnswer } from '../src/tools.js';
import { DECKS } from '../src/decks.js';
const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
let pass = 0; const t = (name, fn) => { fn(); pass++; console.log('PASS', name); };
let now = Date.parse('2026-10-20T08:00:00Z');
const timerLog = []; const timer = { start: (m, l) => timerLog.push([m, l]), status: () => ({ running: false }), stop: () => {} };
const mk = (s = store()) => new StudyBuddy({ memory: new Memory(s, () => now), timer, rnd: () => 0.42 });

t('answer matching', () => {
  assert.equal(matchAnswer('went', ['went']), 'exact');
  assert.equal(matchAnswer("I think it's went", ['went']), 'exact');
  assert.equal(matchAnswer('brougt', ['brought']), 'close');
  assert.equal(matchAnswer('goed', ['went']), false);
  assert.equal(matchAnswer('Put Off', ['put off']), 'exact');
});
t('clause splitting', () => assert.deepEqual(splitClauses('quiz me on capitals and then start a 10 minute timer'), ['quiz me on capitals', 'start a 10 minute timer']));
t('NLU', () => {
  assert.equal(understand('I have 45 minutes to study', { })[0].args.minutes, 45);
  assert.equal(understand('start a twenty five minute timer', {})[0].args.minutes, 25);
  assert.equal(understand('quiz me on phrasal verbs, 3 questions', {})[0].args.deck, 'phrasal verbs');
  assert.equal(understand('give me 3 questions on js', {})[0].args.count, 3);
  assert.equal(understand('remember that ubiquitous means everywhere', {})[0].args.term, 'ubiquitous');
});
t('full multi-turn quiz with spaced repetition', () => {
  const b = mk();
  let r = b.handle('quiz me on irregular verbs, 3 questions');
  assert.match(r.speech, /Question 1 of 3/); assert.ok(r.expectsReply);
  const qs = b.state.quiz.queue;
  r = b.handle(DECKS['irregular verbs'].cards.find((c) => c.q === qs[0].q).a[0]); assert.match(r.speech, /Question 2 of 3/);
  r = b.handle('no idea'); assert.match(r.speech, /The answer is/);
  r = b.handle('banana'); assert.match(r.speech, /1 out of 3/); assert.equal(b.state.quiz, null);
  assert.equal(b.memory.dueCards().length, 2);
  r = b.handle('yes'); assert.deepEqual(timerLog.at(-1), [25, 'focus']);
  // next day: proactive greeting offers review of missed cards
  now += 86400000;
  const g = b.greet(); assert.match(g.speech, /3 cards to review|2 cards to review/);
  r = b.handle('yes'); assert.match(r.speech, /review the cards you missed/);
});
t('plan session then accept chains quiz + timer', () => {
  const b = mk(); const r = b.handle('I have an hour to study');
  assert.match(r.speech, /2 focus blocks of 25 minutes/);
  const r2 = b.handle('sure'); assert.match(r2.speech, /Question 1 of 5/); assert.match(r2.speech, /Focus timer started: 25/);
});
t('multi-intent in one utterance', () => {
  const b = mk(); const r = b.handle('my name is Alessio'); assert.match(r.speech, /Alessio/);
  const r2 = b.handle('remember that ubiquitous means everywhere then quiz me on my words');
  assert.match(r2.speech, /Saved|Got it/); assert.match(r2.speech, /ubiquitous\?/);
  const r3 = b.handle('everywhere'); assert.match(r3.speech, /1 out of 1/);
});
t('memory persists across reloads', () => {
  const s = store(); const b = mk(s); b.handle('call me Sara'); b.handle('quiz me on capitals, 2 questions'); b.handle('x'); b.handle('y');
  const b2 = mk(s); assert.match(b2.greet().speech, /Welcome back, Sara\. You have 2 cards/);
  assert.match(b2.handle('how am I doing').speech, /practised 2 cards/);
});
t('fallback + help + pick topic', () => {
  const b = mk(); assert.match(b.handle('what is the weather').speech, /didn't get that/);
  assert.match(b.handle('quiz me').speech, /Which topic/);
  assert.equal(b.toolsList.tools.length, 12);
});
console.log(`${pass} tests passed`);
