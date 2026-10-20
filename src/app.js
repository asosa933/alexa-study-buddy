import { StudyBuddy } from './agent.js';
import { Memory } from './memory.js';
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
if (params.has('fast')) $('fast').checked = true;
if (params.has('mute')) $('voice').checked = false;

class Timer {
  constructor(onTick, onDone) { this.onTick = onTick; this.onDone = onDone; this.t = null; }
  start(minutes, label) {
    this.stop(); this.minutes = minutes; this.label = label;
    const scale = $('fast').checked ? 2000 : 60000;
    this.end = Date.now() + minutes * scale; this.scale = scale;
    this.t = setInterval(() => { const left = this.end - Date.now(); if (left <= 0) { this.stop(); this.onDone({ label, minutes }); } else this.onTick(this.status()); }, 200);
    this.onTick(this.status());
  }
  status() { if (!this.t) return { running: false }; return { running: true, label: this.label, minutes: this.minutes, secondsLeft: Math.max(0, Math.round((this.end - Date.now()) / this.scale * 60)) }; }
  stop() { clearInterval(this.t); this.t = null; this.onTick({ running: false }); }
}
const chip = $('timerChip');
const timer = new Timer((s) => {
  chip.hidden = !s.running; if (!s.running) return;
  const m = Math.floor(s.secondsLeft / 60), sec = String(s.secondsLeft % 60).padStart(2, '0');
  chip.textContent = `${s.label === 'break' ? '☕' : '🎯'} ${m}:${sec}`; chip.className = s.label;
}, (info) => respond(buddy.onTimerDone(info)));

const memory = new Memory(localStorage);
const buddy = new StudyBuddy({ memory, timer, onTrace: ({ request, result }) => {
  const d = document.createElement('div');
  d.innerHTML = `<b>→ ${request.params.name}</b> ${esc(JSON.stringify(request.params.arguments))}\n← ${esc(JSON.stringify(result))}`;
  $('trace').append(d); $('trace').scrollTop = 1e9;
} });
window.__buddy = buddy;
$('toolsList').textContent = JSON.stringify(buddy.toolsList, null, 2);
function esc(s) { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function log(who, text) { const d = document.createElement('div'); d.className = 'msg ' + who; d.textContent = text; $('log').append(d); $('log').scrollTop = 1e9; }

function showCard(card) {
  if (!card) return;
  $('cardTitle').textContent = card.title || ''; $('cardBig').textContent = card.big || '';
  $('cardLines').innerHTML = ''; for (const l of card.lines || []) { const li = document.createElement('li'); li.textContent = l; $('cardLines').append(li); }
  $('cardBar').style.width = ((card.progress ?? 0) * 100) + '%';
}
let listenAfter = false;
function respond(r) {
  log('alexa', r.speech); $('caption').textContent = r.speech; showCard(r.card); setChips();
  listenAfter = r.expectsReply;
  if ($('voice').checked && 'speechSynthesis' in window) {
    speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(r.speech); u.lang = 'en-US'; u.rate = 1.05;
    $('ring').className = 'ring speaking';
    u.onend = () => { $('ring').className = 'ring'; if (listenAfter && micActive) startRec(); };
    speechSynthesis.speak(u);
  } else { $('ring').className = 'ring speaking'; setTimeout(() => ($('ring').className = 'ring'), 900); }
}
function say(text) { if (!text.trim()) return; log('user', text); respond(buddy.handle(text)); }
$('say').addEventListener('submit', (e) => { e.preventDefault(); const v = $('utter').value; $('utter').value = ''; say(v); });

function setChips() {
  const s = buddy.state; let list;
  if (s.quiz) list = ['skip', 'repeat', 'stop quiz'];
  else if (s.offer) list = ['yes', 'no thanks'];
  else list = ['I have an hour to study', 'Quiz me on phrasal verbs', 'Start a 25 minute focus timer', 'Remember that ubiquitous means everywhere', 'How am I doing?', 'Review my mistakes'];
  $('chips').innerHTML = ''; for (const c of list) { const b = document.createElement('button'); b.type = 'button'; b.textContent = c; b.onclick = () => say(c); $('chips').append(b); }
}

// optional speech recognition (Web Speech API, Chrome/Edge)
const SR = window.SpeechRecognition || window.webkitSpeechRecognition; let rec = null; let micActive = false;
function startRec() { if (!SR) return; rec = new SR(); rec.lang = 'en-US'; rec.interimResults = false; $('ring').className = 'ring listening';
  rec.onresult = (e) => say(e.results[0][0].transcript); rec.onend = () => { if ($('ring').className.includes('listening')) $('ring').className = 'ring'; }; rec.start(); }
$('mic').onclick = () => { if (!SR) { alert('Speech recognition is not available in this browser. You can type instead.'); return; } micActive = !micActive; $('mic').classList.toggle('on', micActive); if (micActive) startRec(); else rec?.stop(); };
$('reset').onclick = () => { memory.reset(); buddy.state.quiz = null; buddy.state.offer = null; $('log').innerHTML = ''; $('trace').innerHTML = ''; respond(buddy.greet()); };
setInterval(() => ($('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })), 1000);
respond(buddy.greet());
