// Built-in study decks. Each card: q (prompt), a (accepted answers, first is canonical).
export const DECKS = {
  'irregular verbs': {
    title: 'English irregular verbs',
    hint: 'Say the past simple.',
    cards: [
      { q: 'go', a: ['went'] }, { q: 'buy', a: ['bought'] }, { q: 'think', a: ['thought'] },
      { q: 'bring', a: ['brought'] }, { q: 'catch', a: ['caught'] }, { q: 'teach', a: ['taught'] },
      { q: 'write', a: ['wrote'] }, { q: 'choose', a: ['chose'] }, { q: 'fly', a: ['flew'] },
      { q: 'swim', a: ['swam'] }, { q: 'begin', a: ['began'] }, { q: 'forget', a: ['forgot'] },
    ],
  },
  'phrasal verbs': {
    title: 'Phrasal verbs',
    hint: 'Say the phrasal verb that matches.',
    cards: [
      { q: 'to postpone', a: ['put off'] }, { q: 'to tolerate', a: ['put up with'] },
      { q: 'to discover by chance', a: ['come across'] }, { q: 'to stop doing a habit', a: ['give up'] },
      { q: 'to continue', a: ['carry on', 'go on'] }, { q: 'to investigate', a: ['look into'] },
      { q: 'to recover from an illness', a: ['get over'] }, { q: 'to cancel (an event)', a: ['call off'] },
    ],
  },
  'capitals': {
    title: 'European capitals',
    hint: 'Say the capital city.',
    cards: [
      { q: 'Portugal', a: ['lisbon'] }, { q: 'Austria', a: ['vienna'] }, { q: 'Poland', a: ['warsaw'] },
      { q: 'Hungary', a: ['budapest'] }, { q: 'Ireland', a: ['dublin'] }, { q: 'Greece', a: ['athens'] },
      { q: 'Sweden', a: ['stockholm'] }, { q: 'Czechia', a: ['prague'] },
    ],
  },
  'javascript': {
    title: 'JavaScript basics',
    hint: 'Answer in a word or two.',
    cards: [
      { q: 'keyword for a variable you cannot reassign', a: ['const'] },
      { q: 'array method that returns a new array with each item transformed', a: ['map'] },
      { q: 'operator that checks value AND type equality', a: ['===', 'triple equals', 'strict equality'] },
      { q: 'type of the value null, according to typeof', a: ['object'] },
      { q: 'method that turns a JSON string into an object', a: ['json.parse', 'parse'] },
      { q: 'keyword that pauses an async function until a promise settles', a: ['await'] },
    ],
  },
};

export const DECK_ALIASES = {
  'phrasal verbs': ['phrasal'],
  'irregular verbs': ['irregular', 'verbs', 'past simple', 'past tense', 'english verbs'],
  'capitals': ['capital', 'capitals', 'geography', 'europe', 'cities'],
  'javascript': ['javascript', 'js', 'coding', 'programming'],
};
