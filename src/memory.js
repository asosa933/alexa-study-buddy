// Persistent learner memory with Leitner spaced repetition (boxes 1-5).
const KEY = 'asb.memory.v1';
const INTERVAL_DAYS = [0, 0, 1, 3, 7, 14]; // index = box
const DAY = 86400000;

export class Memory {
  constructor(storage = globalThis.localStorage, now = () => Date.now()) {
    this.storage = storage; this.now = now; this.load();
  }
  load() {
    try { this.data = JSON.parse(this.storage?.getItem(KEY)) || null; } catch { this.data = null; }
    if (!this.data) this.data = { name: null, cards: {}, sessions: [], minutes: 0, streakDays: [], lastSeen: null, reminders: [] };
  }
  save() { this.storage?.setItem(KEY, JSON.stringify(this.data)); }
  reset() { this.data = null; this.storage?.removeItem(KEY); this.load(); }
  cardId(deck, q) { return deck + '::' + q; }
  card(deck, q) { return this.data.cards[this.cardId(deck, q)] || { box: 1, due: 0, right: 0, wrong: 0 }; }
  grade(deck, q, correct) {
    const c = this.card(deck, q);
    c.box = correct ? Math.min(5, c.box + 1) : 1;
    c.due = this.now() + INTERVAL_DAYS[c.box] * DAY;
    correct ? c.right++ : c.wrong++;
    this.data.cards[this.cardId(deck, q)] = c;
    this.markToday(); this.save(); return c;
  }
  markToday() {
    const d = new Date(this.now()).toISOString().slice(0, 10);
    if (!this.data.streakDays.includes(d)) this.data.streakDays.push(d);
  }
  streak() {
    const set = new Set(this.data.streakDays); let n = 0; let t = this.now();
    while (set.has(new Date(t).toISOString().slice(0, 10))) { n++; t -= DAY; }
    return n;
  }
  /** cards that were seen before and are due now, or were answered wrong */
  dueCards(deckName = null) {
    const out = [];
    for (const [id, c] of Object.entries(this.data.cards)) {
      const [deck, q] = id.split('::');
      if (deckName && deck !== deckName) continue;
      if (c.due <= this.now()) out.push({ deck, q, ...c });
    }
    return out.sort((a, b) => a.box - b.box || b.wrong - a.wrong);
  }
  weakest(limit = 3) {
    return Object.entries(this.data.cards)
      .map(([id, c]) => ({ id, deck: id.split('::')[0], q: id.split('::')[1], ...c }))
      .filter((c) => c.wrong > 0).sort((a, b) => (b.wrong - b.right) - (a.wrong - a.right)).slice(0, limit);
  }
  addMinutes(m) { this.data.minutes += m; this.markToday(); this.save(); }
}
