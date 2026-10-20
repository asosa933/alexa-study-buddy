// The Study Buddy agent: understands an utterance (multi-intent, with dialog
// state), plans a sequence of tool calls, runs them through the MCP-shaped
// registry and turns the results into Alexa-style speech + a visual card.
import { DECKS, DECK_ALIASES } from './decks.js';
import { createTools, toolsList, normalize } from './tools.js';

const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, 'twenty five': 25, thirty: 30, forty: 40, 'forty five': 45, fifty: 50, sixty: 60, ninety: 90 };
const PRAISE = ['Nice!', 'Correct!', 'Yes!', 'Spot on.', 'Exactly.'];

function findDeck(t) {
  if (/\bmy (own )?(words|cards|deck)\b/.test(t)) return 'my words';
  for (const [deck, aliases] of Object.entries(DECK_ALIASES)) if (aliases.some((a) => new RegExp('\\b' + a + '\\b').test(t))) return deck;
  return null;
}
function findMinutes(t) {
  const h = t.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b/); if (h) return Math.round(parseFloat(h[1]) * 60);
  if (/\b(an|one) hour\b/.test(t)) return 60; if (/\bhalf an hour\b/.test(t)) return 30;
  const m = t.match(/(\d+)\s*(-\s*)?(minutes?|mins?|m)\b/); if (m) return parseInt(m[1], 10);
  for (const [w, n] of Object.entries(NUM).sort((a, b) => b[0].length - a[0].length)) if (new RegExp('\\b' + w + ' (minute|min)').test(t)) return n;
  return null;
}
function findCount(t) {
  const m = t.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(questions?|cards?|words?|verbs?|capitals?)\b/);
  if (!m) return null; return /\d/.test(m[1]) ? parseInt(m[1], 10) : NUM[m[1]];
}

/** Split "quiz me on verbs and then start a timer" into clauses. */
export function splitClauses(text) {
  return text.split(/\s*(?:,?\s*and then\s+|,?\s*then\s+|;\s*|\.\s+(?=[a-z]))/i).map((s) => s.trim()).filter(Boolean);
}

/** Natural-language understanding → list of { tool, args } (or a chit-chat intent). */
export function understand(raw, state) {
  const steps = [];
  for (const clause of splitClauses(raw.trim())) {
    const t = clause.toLowerCase().replace(/^(alexa|hey alexa|ok)[, ]+/, '').replace(/[?!]/g, '').trim();
    const inQuiz = !!state.quiz;
    if (/^(help|what can you do)/.test(t)) { steps.push({ intent: 'help' }); continue; }
    if (/\b(my name is|call me|i am|i'm)\s+([a-z][a-z'-]{1,20})$/i.test(clause.trim()) && !inQuiz) {
      const name = clause.trim().match(/(?:my name is|call me|i am|i'm)\s+([A-Za-z][A-Za-z'-]{1,20})$/i)[1];
      steps.push({ tool: 'set_name', args: { name: name[0].toUpperCase() + name.slice(1) } }); continue;
    }
    if (/\b(remember|save|add)\b.*\b(means|is|=)\b/.test(t) && !inQuiz) {
      const m = clause.match(/(?:remember|save|add)(?: that| a card| the word)?\s+["“']?(.+?)["”']?\s+(?:means|is|=)\s+["“']?(.+?)["”']?$/i);
      if (m) { steps.push({ tool: 'add_card', args: { term: m[1].trim().toLowerCase(), meaning: m[2].trim().toLowerCase() } }); continue; }
    }
    if (inQuiz) {
      if (/^(stop|end|quit|cancel|exit)( the)?( quiz)?$/.test(t)) { steps.push({ tool: 'stop_quiz', args: {} }); continue; }
      if (/^(skip|pass|i don'?t know|no idea|tell me|next)$/.test(t)) { steps.push({ tool: 'skip_question', args: {} }); continue; }
      if (/^(repeat|say (it|that) again|again|what was the question)$/.test(t)) { steps.push({ tool: 'repeat_question', args: {} }); continue; }
      if (!/\b(timer|progress|plan)\b/.test(t)) { steps.push({ tool: 'check_answer', args: { answer: clause.replace(/^(it'?s|the answer is)\s+/i, '') } }); continue; }
    }
    if (/\b(how am i doing|progress|stats|streak|how much have i studied)\b/.test(t)) { steps.push({ tool: 'get_progress', args: {} }); continue; }
    if (/\b(time left|how long|how much time)\b/.test(t)) { steps.push({ tool: 'timer_status', args: {} }); continue; }
    if (/\b(stop|cancel)\b.*\btimer\b/.test(t)) { steps.push({ tool: 'stop_timer', args: {} }); continue; }
    if (/\b(plan|organi[sz]e|schedule)\b/.test(t) || /\bi have\b.*\b(hour|minute|min)/.test(t)) {
      steps.push({ tool: 'plan_session', args: { minutes: Math.max(10, findMinutes(t) || 60), topic: findDeck(t) || undefined } }); continue;
    }
    if (/\b(timer|pomodoro|focus|break)\b/.test(t)) {
      const label = /\bbreak\b/.test(t) && !/\bfocus\b/.test(t) ? 'break' : 'focus';
      steps.push({ tool: 'start_timer', args: { minutes: findMinutes(t) || (label === 'break' ? 5 : 25), label } }); continue;
    }
    if (/\b(review|revise|missed|mistakes|due)\b/.test(t)) { steps.push({ tool: 'start_quiz', args: { deck: findDeck(t) || 'any', count: findCount(t) || 5, mode: 'review' } }); continue; }
    if (/\b(quiz|test|practi[cs]e|ask me|study|drill|learn)\b/.test(t) || (findDeck(t) && !/\bwhat\b/.test(t))) {
      steps.push({ tool: 'start_quiz', args: { deck: findDeck(t) || (state.pendingDeckChoice ? 'irregular verbs' : null), count: findCount(t) || 5, mode: 'new' } }); continue;
    }
    if (/^(yes|yeah|sure|ok|okay|yep|let'?s go|go ahead|do it)$/.test(t) && state.offer) { steps.push(...state.offer); continue; }
    if (/^(no|nope|not now|later|no thanks)$/.test(t) && state.offer) { steps.push({ intent: 'decline' }); continue; }
    if (/^(thanks|thank you|bye|goodbye|good night)/.test(t)) { steps.push({ intent: 'bye' }); continue; }
    steps.push({ intent: 'fallback', text: clause });
  }
  return steps;
}

export class StudyBuddy {
  constructor({ memory, timer, rnd = Math.random, onTrace = () => {} }) {
    this.memory = memory; this.timer = timer; this.state = { quiz: null, offer: null }; this.onTrace = onTrace;
    this.tools = createTools({ memory, state: this.state, timer, rnd });
  }
  get toolsList() { return toolsList(this.tools); }
  call(name, args) {
    const tool = this.tools.find((t) => t.name === name);
    const request = { jsonrpc: '2.0', method: 'tools/call', params: { name, arguments: args } };
    const result = tool.handler(args);
    this.onTrace({ request, result });
    return result;
  }
  /** proactive greeting, used when the device "wakes" */
  greet() {
    const p = this.call('get_progress', {});
    const hi = p.name ? `Welcome back, ${p.name}.` : 'Hi, I\'m your Study Buddy.';
    if (p.due > 0) {
      this.state.offer = [{ tool: 'start_quiz', args: { deck: 'any', count: Math.min(5, p.due), mode: 'review' } }];
      return { speech: `${hi} You have ${p.due} card${p.due > 1 ? 's' : ''} to review from last time${p.weakest[0] ? `, including "${p.weakest[0]}"` : ''}. Want to review them now?`, card: { title: 'Ready to review', lines: [`${p.due} due card${p.due > 1 ? 's' : ''}`, `🔥 ${p.streak}-day streak`] }, expectsReply: true };
    }
    return { speech: `${hi} Tell me how much time you have, or say "quiz me on irregular verbs".`, card: { title: 'Study Buddy', lines: ['“I have an hour to study”', '“Quiz me on phrasal verbs”', '“Start a 25 minute focus timer”'] }, expectsReply: true };
  }
  /** a timer finished: the agent speaks first */
  onTimerDone({ label, minutes }) {
    if (label === 'focus') {
      this.memory.addMinutes(minutes);
      const missed = this.state.lastQuiz?.missed?.length || this.memory.dueCards().length;
      this.state.offer = missed ? [{ tool: 'start_quiz', args: { deck: 'any', count: 5, mode: 'review' } }] : [{ tool: 'start_timer', args: { minutes: 5, label: 'break' } }];
      return { speech: `Time's up! Great focus. ${missed ? `Before your break, want a 1-minute review of the ${missed} card${missed > 1 ? 's' : ''} you missed?` : 'Shall I start a 5 minute break?'}`, card: { title: '⏰ Focus block done', lines: [`+${minutes} min studied`] }, expectsReply: true };
    }
    this.state.offer = [{ tool: 'start_timer', args: { minutes: 25, label: 'focus' } }];
    return { speech: 'Break\'s over. Ready for another 25 minute focus block?', card: { title: '☕ Break over', lines: [] }, expectsReply: true };
  }
  handle(text) {
    const steps = understand(text, this.state);
    const said = []; let card = null; let expectsReply = false;
    const prevOffer = this.state.offer; this.state.offer = null;
    for (const step of steps) {
      if (step.intent) {
        const r = this.chat(step, prevOffer); said.push(r.speech); card = r.card || card; expectsReply = r.expectsReply || expectsReply; continue;
      }
      if (step.tool === 'start_quiz' && !step.args.deck) {
        this.state.pendingDeckChoice = true;
        said.push('Sure. Which topic: irregular verbs, phrasal verbs, capitals, or JavaScript?');
        card = { title: 'Pick a topic', lines: Object.values(DECKS).map((d) => d.title) }; expectsReply = true; continue;
      }
      this.state.pendingDeckChoice = false;
      const res = this.call(step.tool, step.args);
      const r = this.render(step.tool, step.args, res); said.push(r.speech); card = r.card || card; expectsReply = r.expectsReply || expectsReply;
    }
    if (this.state.quiz) expectsReply = true;
    return { speech: said.join(' '), card, expectsReply, steps };
  }
  chat(step, prevOffer) {
    switch (step.intent) {
      case 'help': return { speech: 'I can quiz you with spaced repetition, plan a study session, run focus timers, save new words, and track your progress. Try: "I have 45 minutes to study English".', card: { title: 'Things to try', lines: ['“I have 45 minutes to study”', '“Quiz me on capitals”', '“Remember that ubiquitous means everywhere”', '“How am I doing?”'] }, expectsReply: true };
      case 'decline': return { speech: 'No problem. Just say "review" whenever you\'re ready.' };
      case 'bye': return { speech: `Good work today${this.memory.data.name ? ', ' + this.memory.data.name : ''}. See you next session!` };
      default: return { speech: 'Sorry, I didn\'t get that. You can say "quiz me on irregular verbs", "start a 25 minute timer", or "help".', expectsReply: true };
    }
  }
  qSpeech(n) { return `Question ${n.number} of ${n.total}: ${n.hint} ${n.question}?`; }
  qCard(n, extra = []) { return { title: `${n.deck} · ${n.number}/${n.total}`, big: n.question, lines: [n.hint, ...extra], progress: (n.number - 1) / n.total }; }
  render(tool, args, r) {
    switch (tool) {
      case 'start_quiz':
        if (!r.ok && r.reason === 'nothing_due') {
          this.state.offer = [{ tool: 'start_quiz', args: { deck: 'irregular verbs', count: 5, mode: 'new' } }];
          return { speech: 'You have nothing due for review. Nice! Want five new irregular verbs instead?', expectsReply: true };
        }
        if (!r.ok) return { speech: args.deck === 'my words' ? 'Your personal deck is empty. Say something like "remember that ubiquitous means everywhere".' : 'I couldn\'t find that deck.' };
        return { speech: `${r.mode === 'review' ? 'Let\'s review the cards you missed.' : `Okay, ${r.total} questions.`} ${this.qSpeech(r)}`, card: this.qCard(r), expectsReply: true };
      case 'check_answer': case 'skip_question': {
        if (!r.ok) return { speech: 'There\'s no quiz running. Say "quiz me" to start one.' };
        const fb = tool === 'skip_question' ? `The answer is "${r.expected}".` : r.correct ? `${PRAISE[(r.score ?? r.next?.number ?? 0) % PRAISE.length]}${r.close ? ` I'll count it — it's spelled "${r.expected}".` : ''}` : `Not quite, it's "${r.expected}". I'll bring that one back soon.`;
        if (r.finished) {
          const pct = r.score / r.total;
          const busy = this.timer.status().running;
          this.state.offer = r.missed.length && !busy ? [{ tool: 'start_timer', args: { minutes: 25, label: 'focus' } }] : null;
          const verdict = pct === 1 ? 'Perfect score!' : pct >= 0.6 ? 'Good job.' : 'Keep going, that\'s how memory works.';
          return { speech: `${fb} That's the end: ${r.score} out of ${r.total}. ${verdict}${r.missed.length ? ` I saved ${r.missed.length} card${r.missed.length > 1 ? 's' : ''} for your next review.${busy ? ' Keep going, your focus timer is still running.' : ' Want a 25 minute focus timer now?'}` : ''}`, card: { title: `Score ${r.score}/${r.total}`, lines: r.missed.length ? ['To review:', ...r.missed] : ['🎉 All correct'], progress: 1, good: r.correct }, expectsReply: !!this.state.offer };
        }
        return { speech: `${fb} ${this.qSpeech(r.next)}`, card: this.qCard(r.next, [r.correct ? `✅ ${r.question} → ${r.expected}` : `❌ ${r.question} → ${r.expected}`]), expectsReply: true };
      }
      case 'repeat_question': return r.ok ? { speech: this.qSpeech(r), card: this.qCard(r), expectsReply: true } : { speech: 'There\'s no question right now.' };
      case 'stop_quiz': return { speech: r.ok ? `Quiz stopped. You got ${r.score} of ${r.answered}.` : 'There\'s no quiz running.' };
      case 'start_timer': return { speech: `${r.label === 'break' ? 'Break' : 'Focus'} timer started: ${r.minutes} minute${r.minutes > 1 ? 's' : ''}.${r.label === 'focus' ? ' I\'ll stay quiet until it ends.' : ' Stretch and drink some water.'}`, card: { title: r.label === 'break' ? '☕ Break' : '🎯 Focus', lines: [`${r.minutes} min`] } };
      case 'timer_status': return { speech: r.running ? `About ${Math.ceil(r.secondsLeft / 60)} minute${Math.ceil(r.secondsLeft / 60) > 1 ? 's' : ''} left on your ${r.label} timer.` : 'No timer is running.' };
      case 'stop_timer': return { speech: r.ok ? 'Timer cancelled.' : 'No timer is running.' };
      case 'plan_session': {
        const focus = r.blocks.filter((b) => b.type === 'focus');
        this.state.offer = [{ tool: 'start_quiz', args: { deck: args.topic || (r.firstTask.startsWith('review') ? 'any' : 'irregular verbs'), count: 5, mode: r.firstTask.startsWith('review') ? 'review' : 'new' } }, { tool: 'start_timer', args: { minutes: focus[0].minutes, label: 'focus' } }];
        return { speech: `Here's your plan for ${args.minutes} minutes: ${focus.length} focus block${focus.length > 1 ? 's' : ''} of ${focus[0].minutes} minutes with short breaks. We'll start with a quick warm-up quiz to ${r.firstTask}, then your first focus timer. Ready?`, card: { title: `📋 ${args.minutes}-min plan`, lines: [`Warm-up: ${r.firstTask}`, ...r.blocks.map((b) => `${b.type === 'focus' ? '🎯 Focus' : '☕ Break'} ${b.minutes} min`), ...(r.weak.length ? [`Weak spots: ${r.weak.join(', ')}`] : [])] }, expectsReply: true };
      }
      case 'add_card': return { speech: `Got it: "${r.term}" means "${r.meaning}". Your personal deck has ${r.deckSize} card${r.deckSize > 1 ? 's' : ''}. Say "quiz me on my words" to practise.`, card: { title: '➕ Saved to My words', big: r.term, lines: [r.meaning] } };
      case 'get_progress': return { speech: `${r.name ? r.name + ', you' : 'You'}'re on a ${r.streak}-day streak with ${r.minutes} focus minutes. You've practised ${r.seen} cards and ${r.mastered} are getting solid. ${r.due ? `${r.due} are due for review` : 'Nothing is due right now'}${r.weakest.length ? `, and your trickiest one is "${r.weakest[0]}"` : ''}.`, card: { title: '📈 Progress', lines: [`🔥 Streak: ${r.streak} day${r.streak === 1 ? '' : 's'}`, `⏱️ Focus: ${r.minutes} min`, `🧠 Practised: ${r.seen} · solid: ${r.mastered}`, `🔁 Due: ${r.due}`, ...(r.weakest.length ? [`Trickiest: ${r.weakest.join(', ')}`] : [])] } };
      case 'set_name': return { speech: `Nice to meet you, ${r.name}! I'll remember that.` };
      default: return { speech: 'Done.' };
    }
  }
}
