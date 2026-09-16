'use client';
// A short, scripted, PLAYABLE tutorial. It runs the real rules engine
// (lib/engine.mjs) against a hand-authored deck order, so every action the
// player performs is a genuine, rule-accurate transition — nothing here
// reimplements or approximates Kamayuu's rules. The opponent's turns are
// hardcoded (not AI-chosen) so the lesson always lands the same way.
//
// This table is fully isolated from the real game: its own local state, its
// own DOM refs, its own audio instance. It never touches Home's `game`
// state, never opens a Supabase room, and never writes match results or
// normal stats. Exiting or refreshing mid-tutorial cannot corrupt a real game.
//
// Teaching surfaces (see the Ledger & Lacquer section of globals.css):
//  - lesson(): a parchment card the player dismisses — used whenever a rule
//    needs a sentence or two, so a first-time player is never left guessing.
//  - waitForTap(): a brass coach toast in the table's centre band naming the
//    one thing to tap next; the target itself pulses. Non-blocking.
//  - narrate(): the lacquer variant of that toast for the opponent's moves.
//
// Animation discipline mirrors app/page.tsx: a transition() is planned, every
// visual step plays out using the pre-transition ("before") and planned
// ("after") snapshots, and only once everything has visually settled does
// commitState() publish the new state to React — so a re-render never yanks
// a card back to face-down mid-reveal.
import {useEffect, useRef, useState} from 'react';
import {transition, value, isPower, positionName, label} from '@/lib/engine.mjs';
import {TableAudio} from '@/lib/audio.mjs';
import {Card, cardHTML, preloadCardArt} from '@/lib/card-render';
import {track} from '@/lib/analytics';
import ScoreLedger from '@/components/score-ledger';

const SUIT: Record<string, string> = {S: '♠', H: '♥', C: '♣', D: '♦'};
const mkCard = (code: string) => {
  const rank = code.slice(0, -1), s = code.slice(-1);
  return {id: rank + SUIT[s], rank, suit: SUIT[s]};
};

// Every card this script ever deals or draws, placed at the END of the deck
// array in reverse order so the real engine's `deck.pop()` yields them in
// exactly this sequence — nothing bypasses the engine's own draw logic.
const DEALT_YOU = ['KD', 'KS', '10S', '8C']; // top-left, top-right, bottom-left(known), bottom-right(known)
const DEALT_KAI = ['8D', '5H', '9C', '7S'];
const INITIAL_DISCARD = '9H';
const SCRIPTED_DRAWS = ['2D', '4S', '6H', '5D', '3D', '3C', 'JH', '4H', 'QD', '4D', '6S'];

const STEPS = ['Win', 'Remember', 'Draw', 'Risk', 'Throw', 'Powers', 'Call'];

function buildInitialState() {
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const all: string[] = [];
  for (const s of ['S', 'H', 'C', 'D']) for (const r of ranks) all.push(r + s);
  const used = new Set([...DEALT_YOU, ...DEALT_KAI, INITIAL_DISCARD, ...SCRIPTED_DRAWS]);
  const filler = all.filter((code) => !used.has(code));
  const deckCodes = [...filler, ...[...SCRIPTED_DRAWS].reverse()];
  const state: any = {
    seed: 0,
    players: [
      {name: 'You', slots: DEALT_YOU.map(mkCard), penalty: 0, eliminated: false},
      {name: 'Kai', slots: DEALT_KAI.map(mkCard), penalty: 0, eliminated: false},
    ],
    knowledge: [
      [[null, null, null, null], [null, null, null, null]],
      [[null, null, null, null], [null, null, null, null]],
    ],
    deck: deckCodes.map(mkCard),
    discard: [mkCard(INITIAL_DISCARD)],
    discardOwners: {},
    held: null, source: null, pending: null,
    phase: 'memory', active: 0, turn: 0, round: 1,
    caller: null, remaining: [],
    difficulty: 'hard', winners: [], totals: [],
  };
  state.knowledge[0][0][2] = state.players[0].slots[2];
  state.knowledge[0][0][3] = state.players[0].slots[3];
  state.knowledge[1][1][2] = state.players[1].slots[2];
  state.knowledge[1][1][3] = state.players[1].slots[3];
  return state;
}

type Expect = {kind: 'deck'} | {kind: 'slot'; p: number; i: number} | {kind: 'buzzer'} | {kind: 'swap-confirm'} | {kind: 'continue'} | null;
type Quiz = {question: string; choices: {label: string; correct: boolean}[]} | null;
type Lesson = {eyebrow: string; title: string; body: string; cta: string; cards?: {card: any; label: string}[]} | null;
type Coach = {title: string; body?: string; tone: 'brass' | 'lacquer'} | null;

class Stopped extends Error {}

export interface KamayuuTutorialProps {
  onExit: () => void;
  onPlayFirstGame: () => void;
  sound?: boolean;
  haptics?: boolean;
  motion?: boolean;
}

export default function KamayuuTutorial({onExit, onPlayFirstGame, sound = true, haptics = true, motion = false}: KamayuuTutorialProps) {
  const [engine, setEngine] = useState<any>(() => buildInitialState());
  const [rev, setRev] = useState(0);
  const [expect, setExpect] = useState<Expect>(null);
  const [lesson, setLesson] = useState<Lesson>(null);
  const [coach, setCoach] = useState<Coach>(null);
  const [memoryCountdown, setMemoryCountdown] = useState<number | null>(null);
  const [inspectPair, setInspectPair] = useState<{p: number; i: number}[] | null>(null);
  const [quiz, setQuiz] = useState<Quiz>(null);
  const [quizFeedback, setQuizFeedback] = useState('');
  const [done, setDone] = useState(false);
  const [step, setStep] = useState(1);
  const [stepLabel, setStepLabel] = useState('intro');

  const engineRef = useRef(engine);
  const tableRef = useRef<HTMLElement | null>(null);
  const audioRef = useRef<any>(null);
  // An ever-incrementing token, never reset to a shared "not aborted" value.
  // React StrictMode double-invokes effects in dev (mount, cleanup, mount
  // again), synchronously, before the first run's script has reached its
  // first real await — a plain boolean flag can't tell "aborted" apart from
  // "aborted, then reset for the new run", so the first (stale) run would
  // wrongly keep going alongside the second and race it for the same state.
  // Each run captures its own epoch and every guard() compares against
  // whatever is currently active; only the most recent run ever matches.
  const epochRef = useRef(0);
  const timers = useRef<Set<any>>(new Set());
  const anims = useRef<Set<Animation>>(new Set());
  const resolverRef = useRef<(() => void) | null>(null);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    epochRef.current += 1;
    const myEpoch = epochRef.current;
    audioRef.current = new TableAudio();
    audioRef.current.enabled = sound;
    audioRef.current.haptics = haptics;
    reducedMotionRef.current = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    void preloadCardArt();
    track('tutorial_started');
    runScript(myEpoch).catch((err) => {
      if (!(err instanceof Stopped)) console.error(err);
    });
    return () => {
      epochRef.current += 1;
      resolverRef.current = null;
      timers.current.forEach(clearTimeout);
      anims.current.forEach((a) => a.cancel());
      audioRef.current?.ctx?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function guard(epoch: number) {
    if (epoch !== epochRef.current) throw new Stopped();
  }
  function sfx(kind: string, pan = 0) {
    audioRef.current?.play(kind, pan);
  }
  function wait(ms: number, epoch: number) {
    guard(epoch);
    const scale = reducedMotionRef.current ? 0.25 : motion ? 0.65 : 1;
    return new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        timers.current.delete(t);
        resolve();
      }, ms * scale);
      timers.current.add(t);
    });
  }
  function paint() {
    return new Promise<void>((done) => {
      const bail = setTimeout(done, 120);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        clearTimeout(bail);
        done();
      }));
    });
  }
  function el(loc: string) {
    const e = tableRef.current?.querySelector(`[data-loc="${loc}"]`) as HTMLElement | null;
    if (!e) throw new Stopped();
    return e;
  }
  function content(loc: string) {
    return el(loc).querySelector('.card-content') as HTMLElement;
  }
  function put(loc: string, c: any = null, empty = false) {
    const e = content(loc);
    e.style.visibility = 'visible';
    e.innerHTML = empty ? '' : cardHTML(c);
  }
  function hide(loc: string) {
    content(loc).style.visibility = 'hidden';
  }
  async function animate(node: HTMLElement, frames: Keyframe[], duration: number, epoch: number) {
    guard(epoch);
    const scale = reducedMotionRef.current ? 0.25 : motion ? 0.65 : 1;
    const a = node.animate(frames, {duration: duration * scale, easing: 'cubic-bezier(.22,.7,.25,1)', fill: 'forwards'});
    anims.current.add(a);
    try {
      await a.finished;
      guard(epoch);
    } finally {
      anims.current.delete(a);
      a.cancel();
    }
  }
  async function flip(loc: string, c: any, epoch: number, hideAgain = false, privatePeek = false) {
    const host = content(loc);
    sfx('flip');
    await animate(host, [{transform: 'translateY(0) rotateY(0)'}, {transform: 'translateY(-7px) rotateY(90deg)'}], 150, epoch);
    put(loc, c);
    await animate(host, [{transform: 'translateY(-7px) rotateY(-90deg)'}, {transform: 'translateY(-5px) rotateY(0)'}], 180, epoch);
    if (hideAgain) {
      await wait(privatePeek ? 1400 : 500, epoch);
      await flip(loc, null, epoch);
    }
  }
  async function fly(from: string, to: string, c: any, epoch: number, duration = 550, arc = 0) {
    guard(epoch);
    const a = el(from).getBoundingClientRect(), b = el(to).getBoundingClientRect();
    hide(from);
    const node = document.createElement('div');
    node.className = 'flying-card';
    node.setAttribute('aria-hidden', 'true');
    node.innerHTML = cardHTML(c);
    Object.assign(node.style, {position: 'fixed', left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px', zIndex: '80', pointerEvents: 'none', transformOrigin: '0 0'});
    document.body.appendChild(node);
    const dx = b.left - a.left, dy = b.top - a.top, sx = b.width / a.width, sy = b.height / a.height;
    sfx('slide');
    try {
      await animate(node, [
        {transform: 'translate(0,0) rotate(0deg) scale(1)', filter: 'drop-shadow(0 3px 3px #0008)'},
        {transform: `translate(${dx * 0.47 + arc}px,${dy * 0.47 - 20}px) rotate(${arc ? Math.sign(arc) * 9 : -5}deg) scale(${(1 + sx) / 2},${(1 + sy) / 2})`, filter: 'drop-shadow(0 16px 11px #000a)', offset: 0.48},
        {transform: `translate(${dx}px,${dy}px) rotate(0deg) scale(${sx},${sy})`, filter: 'drop-shadow(0 4px 4px #0009)'},
      ], duration, epoch);
      put(to, c);
      sfx('impact');
    } finally {
      node.remove();
    }
  }
  /** Computes the next state WITHOUT publishing it — the caller animates using
   *  the still-current `engineRef.current` ("before") and this plan's `state`
   *  ("after"), then calls commitState() once everything has settled. */
  function planFor(action: any) {
    return transition(engineRef.current, action);
  }
  function commitState(state: any) {
    engineRef.current = state;
    setEngine(state);
    setRev((v) => v + 1);
  }
  function stage(n: number, id: string) {
    setStep(n);
    setStepLabel(id);
  }
  /** Opponent narration: a lacquer toast in the centre band. Non-blocking;
   *  replaced by whatever surface the next beat shows. */
  function narrate(title: string, body?: string) {
    setCoach({title, body, tone: 'lacquer'});
  }
  /** A parchment lesson card the player reads at their own pace. */
  function teach(card: NonNullable<Lesson>, epoch: number) {
    guard(epoch);
    setCoach(null);
    setLesson(card);
    return new Promise<void>((resolve) => {
      setExpect({kind: 'continue'});
      resolverRef.current = () => {
        setLesson(null);
        setExpect(null);
        resolverRef.current = null;
        resolve();
      };
    });
  }
  /** A brass coach toast naming the one thing to tap; the target pulses. */
  function waitForTap(target: Expect, title: string, body: string | undefined, epoch: number) {
    guard(epoch);
    setExpect(target);
    setCoach({title, body, tone: 'brass'});
    return new Promise<void>((resolve) => {
      resolverRef.current = () => {
        setExpect(null);
        setCoach(null);
        resolverRef.current = null;
        resolve();
      };
    });
  }
  function tapSlot(p: number, i: number) {
    if (quiz || lesson) return;
    if (expect?.kind === 'slot' && expect.p === p && expect.i === i) resolverRef.current?.();
    else if (expect) nudge();
  }
  function tapDeck() {
    if (quiz || lesson) return;
    if (expect?.kind === 'deck') resolverRef.current?.();
    else if (expect) nudge();
  }
  function tapBuzzer() {
    if (quiz || lesson) return;
    if (expect?.kind === 'buzzer') resolverRef.current?.();
    else if (expect) nudge();
  }
  function tapSwapConfirm() {
    if (expect?.kind === 'swap-confirm') resolverRef.current?.();
  }
  function tapContinue() {
    if (expect?.kind === 'continue') {
      sfx('flip');
      resolverRef.current?.();
    }
  }
  function nudge() {
    sfx('fail');
    const node = tableRef.current;
    node?.classList.add('tutorial-shake');
    setTimeout(() => node?.classList.remove('tutorial-shake'), 260);
  }
  function skip() {
    track('tutorial_skipped', {meta: {step: stepLabel}});
    onExit();
  }

  // ---- reusable beats --------------------------------------------------
  /** A full draw: plans the transition, flies the card in (face-up for your
   *  own draws and public power cards; face-down otherwise), then commits. */
  async function drawBeat(forPlayer: 0 | 1, epoch: number) {
    const plan = planFor({type: 'draw', player: forPlayer === 1 ? 1 : undefined});
    const drawn = plan.state.held;
    const visible = forPlayer === 0 || !!isPower(drawn);
    if (visible) sfx(isPower(drawn) === 'peek' ? 'peek' : isPower(drawn) === 'swap' ? 'swap' : 'slide');
    await fly('deck', `held${forPlayer}`, visible ? drawn : null, epoch, 380);
    commitState(plan.state);
    return drawn;
  }
  /** Discard the held card: reveal it (removed cards are always public), then
   *  send it to the pile. */
  async function discardBeat(forPlayer: 0 | 1, epoch: number) {
    const before = engineRef.current;
    const heldCard = before.held;
    const plan = planFor({type: 'discard'});
    await flip(`held${forPlayer}`, heldCard, epoch);
    await fly(`held${forPlayer}`, 'discard', heldCard, epoch, 380);
    commitState(plan.state);
  }
  /** Replace one of `p`'s cards with the held card, mirroring the real game's
   *  choreography: old card flies out and reveals, new card flies in (shown
   *  only if it's your own board or the card was already public), then the
   *  old card moves on to discard. */
  async function replaceBeat(p: 0 | 1, i: number, epoch: number, opts: {publicCard?: boolean} = {}) {
    const before = engineRef.current;
    const heldCard = before.held;
    const oldCard = before.players[p].slots[i];
    const pos = `p${p}-${i}`, reveal = `reveal${p}`, held = `held${p}`;
    const plan = planFor({type: 'replace', i});
    el(pos).classList.add('destination');
    await fly(pos, reveal, null, epoch, 340);
    await flip(reveal, oldCard, epoch);
    if (value(oldCard) === 0) {
      sfx('zero');
      await wait(650, epoch);
    } else await wait(260, epoch);
    const showNew = p === 0 || !!opts.publicCard;
    await fly(held, pos, showNew ? heldCard : null, epoch, 600, p === 0 ? (i <= 1 ? -14 : 14) : 0);
    if (showNew) await flip(pos, null, epoch);
    await fly(reveal, 'discard', oldCard, epoch, 520);
    el(pos).classList.remove('destination');
    commitState(plan.state);
    return {oldCard, heldCard};
  }
  /** Throw a match: reveal the thrown card, then send it to discard. Assumes
   *  the match is a hit — this script never scripts a miss. */
  async function matchBeat(i: number, epoch: number) {
    const before = engineRef.current;
    const pos = `p0-${i}`;
    const cardAtPos = before.players[0].slots[i];
    el(pos).classList.add('destination');
    await fly(pos, 'reveal0', null, epoch, 220);
    await flip('reveal0', cardAtPos, epoch);
    await wait(240, epoch);
    const plan = planFor({type: 'match', player: 0, i});
    await fly('reveal0', 'discard', plan.state.discard.at(-1), epoch, 340);
    put(pos, null, true);
    el(pos).classList.remove('destination');
    commitState(plan.state);
    sfx('success');
  }
  /** Jack: peek at one of your own cards (privately — flips up, then back down). */
  async function peekBeat(i: number, epoch: number) {
    const before = engineRef.current;
    const heldCard = before.held;
    const c = before.players[0].slots[i];
    const pos = `p0-${i}`;
    const plan = planFor({type: 'peek', i});
    el(pos).classList.add('destination');
    await flip(pos, c, epoch, true, true);
    el(pos).classList.remove('destination');
    await fly('held0', 'discard', heldCard, epoch, 340);
    commitState(plan.state);
  }
  /** Kai draws and throws the draw straight away — a filler turn. */
  async function kaiFiller(epoch: number) {
    guard(epoch);
    narrate("Kai's turn", 'Kai draws a card and throws it on the discard pile.');
    await drawBeat(1, epoch);
    await discardBeat(1, epoch);
    await wait(500, epoch);
  }

  async function runScript(epoch: number) {
    await paint();
    guard(epoch);

    // ---- Step 1: how to win ----
    stage(1, 'intro');
    await teach({
      eyebrow: 'How to win',
      title: 'Lowest total wins.',
      body: 'Every card is worth points — its number, or 11 for a Jack, 12 for a Queen, 13 for a King. Two exceptions: Aces are 1, and red Kings are worth nothing at all. When the hand ends, everyone adds up their cards. The smallest total wins.',
      cta: 'Deal me in',
      cards: [
        {card: mkCard('AS'), label: '1 point'},
        {card: mkCard('7H'), label: '7 points'},
        {card: mkCard('QC'), label: '12 points'},
        {card: mkCard('KD'), label: '0 points'},
      ],
    }, epoch);

    // ---- Step 2: the memory mechanic ----
    stage(2, 'initial_memory');
    await teach({
      eyebrow: 'Your hand',
      title: 'Four cards. You only ever see two.',
      body: 'Your cards stay face-down in four fixed positions all hand long. Right now you may look at your bottom two — for a few seconds. After that they turn back over, and nothing will remind you what they were. Fix them in your memory.',
      cta: 'Show me my two',
    }, epoch);
    setCoach({title: 'Remember these two', body: 'They flip back over in 6', tone: 'brass'});
    await Promise.all([flip('p0-2', engineRef.current.players[0].slots[2], epoch), flip('p0-3', engineRef.current.players[0].slots[3], epoch)]);
    for (let n = 6; n > 0; n--) {
      guard(epoch);
      setMemoryCountdown(n);
      setCoach({title: 'Remember these two', body: `They flip back over in ${n}`, tone: 'brass'});
      await wait(1000, epoch);
    }
    setMemoryCountdown(null);
    setCoach(null);
    await Promise.all([flip('p0-2', null, epoch), flip('p0-3', null, epoch)]);
    commitState(planFor({type: 'remember'}).state);

    // ---- Step 3: draw and replace ----
    stage(3, 'draw');
    await teach({
      eyebrow: 'Your turn',
      title: 'Every turn starts with a draw.',
      body: 'Take the top card from the deck. Then you choose: swap it in for one of your four cards, or throw it straight onto the discard pile. Whatever you take out of your hand goes face-up on that pile, for everyone to see.',
      cta: 'Draw',
    }, epoch);
    await waitForTap({kind: 'deck'}, 'Tap the deck', 'Take a card.', epoch);
    await drawBeat(0, epoch);
    {
      const drawn = engineRef.current.held;
      const known = engineRef.current.players[0].slots[2];
      await teach({
        eyebrow: 'Your draw',
        title: `You drew a ${drawn.rank} — a great card.`,
        body: `Your bottom-left card is the ${known.rank} you memorised. A ${drawn.rank} is worth far less, so swap it in: the ${known.rank} leaves your hand for the discard pile, and the ${drawn.rank} takes its exact position.`,
        cta: 'Show me',
      }, epoch);
    }
    await waitForTap({kind: 'slot', p: 0, i: 2}, 'Tap your bottom-left card', 'Swap the 2 in for the 10.', epoch);
    {
      const {oldCard, heldCard} = await replaceBeat(0, 2, epoch);
      await teach({
        eyebrow: 'Nice',
        title: `Your total just dropped by ${value(oldCard) - value(heldCard)}.`,
        body: `The ${oldCard.rank} is gone, the ${heldCard.rank} sits where it was. Improving a card you know is the safest move in the game — you can see exactly how much it helps.`,
        cta: 'Continue',
      }, epoch);
    }

    await kaiFiller(epoch);

    // ---- Step 4: hidden cards and risk ----
    stage(4, 'risk_intro');
    await waitForTap({kind: 'deck'}, 'Tap the deck', 'Your turn again.', epoch);
    await drawBeat(0, epoch);
    await teach({
      eyebrow: 'The gamble',
      title: 'Your top two cards are a mystery.',
      body: `You have never seen them — and you are still allowed to swap one out for this ${engineRef.current.held.rank}. The catch: you only learn what you threw away once it is gone. It might be terrible. It might be the best card in the game. Try it.`,
      cta: "I'll risk it",
    }, epoch);
    stage(4, 'bad_risk');
    await waitForTap({kind: 'slot', p: 0, i: 0}, 'Tap your top-left card', 'Swap the 6 in — blind.', epoch);
    {
      const {oldCard} = await replaceBeat(0, 0, epoch);
      await teach({
        eyebrow: 'Ouch',
        title: `That was a red King — worth ${value(oldCard)}.`,
        body: 'The best card in the whole deck, and you traded it away for a 6. That is the risk: a hidden card can be gold, and you never know until it is gone.',
        cta: 'Noted',
      }, epoch);
    }

    await kaiFiller(epoch);

    stage(4, 'good_risk');
    await waitForTap({kind: 'deck'}, 'Tap the deck', 'One more mystery to go.', epoch);
    await drawBeat(0, epoch);
    await teach({
      eyebrow: 'One more mystery',
      title: 'Try the other hidden card.',
      body: `Same gamble, other position. Swap the ${engineRef.current.held.rank} in for whatever is hiding top-right.`,
      cta: 'Risk it',
    }, epoch);
    await waitForTap({kind: 'slot', p: 0, i: 1}, 'Tap your top-right card', 'Swap the 3 in — blind.', epoch);
    {
      const {oldCard} = await replaceBeat(0, 1, epoch);
      await teach({
        eyebrow: 'Great risk',
        title: `That was a black King — worth ${value(oldCard)}.`,
        body: 'The worst card in the deck, gone. Now you know all four of your cards. Hidden does not mean bad, and it does not mean good. Hidden means a gamble.',
        cta: 'Got it',
      }, epoch);
    }

    // ---- Memory check (pure UI, no engine transition) ----
    await runQuiz(epoch);

    // ---- Step 5: match / throw ----
    stage(5, 'throw');
    guard(epoch);
    narrate("Kai's turn", 'Kai swaps a card. Watch what lands on the discard pile.');
    await drawBeat(1, epoch);
    await replaceBeat(1, 0, epoch);
    await wait(400, epoch);
    await teach({
      eyebrow: 'A match',
      title: 'Kai just threw away an 8. You have an 8.',
      body: 'Your bottom-right card — the other one you memorised. Whenever the top of the discard pile shows the same number as one of your cards, you may throw yours onto it, at any moment, even during someone else\'s turn. It leaves your hand for good: fewer cards, fewer points.',
      cta: 'Throw it',
    }, epoch);
    await waitForTap({kind: 'slot', p: 0, i: 3}, 'Tap your bottom-right card', "Throw your 8 onto Kai's 8.", epoch);
    await matchBeat(3, epoch);
    await teach({
      eyebrow: 'Perfect',
      title: 'One card gone. Three left.',
      body: 'Matching costs nothing and does not use up your turn. Throw a card that does not match, though, and it is shown to everyone and you pick up the discard as a penalty — so only throw when you are sure.',
      cta: 'Continue',
    }, epoch);

    // ---- Step 6a: Jack — peek (continues the same turn) ----
    stage(6, 'peek');
    await waitForTap({kind: 'deck'}, 'Tap the deck', 'It is still your turn — you still get to draw.', epoch);
    await drawBeat(0, epoch);
    await teach({
      eyebrow: 'A power card',
      title: 'A red Jack lets you peek.',
      body: 'Some cards do something when you draw them from the deck. A red Jack lets you secretly look at one of your own cards. Then the Jack is thrown away — it never joins your hand.',
      cta: 'Peek',
    }, epoch);
    await waitForTap({kind: 'slot', p: 0, i: 2}, 'Tap one of your cards', 'Only you will see it.', epoch);
    await peekBeat(2, epoch);
    narrate('Only you saw that', 'The Jack goes to the discard pile.');
    await wait(1600, epoch);

    await kaiFiller(epoch);

    // ---- Step 6b: Red Queen — swap ----
    stage(6, 'swap');
    await waitForTap({kind: 'deck'}, 'Tap the deck', 'Your turn.', epoch);
    await drawBeat(0, epoch);
    await teach({
      eyebrow: 'A power card',
      title: 'A red Queen lets you trade.',
      body: "Pick one of your cards, then the same position on Kai's board. You get to see both faces — then decide whether to swap them or keep yours. Take whichever is lower.",
      cta: 'Trade',
    }, epoch);
    await waitForTap({kind: 'slot', p: 0, i: 0}, 'Tap your top-left card', 'The card you might trade away.', epoch);
    await waitForTap({kind: 'slot', p: 1, i: 0}, "Now tap Kai's top-left card", 'Same position, their board.', epoch);
    {
      const mine = engineRef.current.players[0].slots[0];
      const theirs = engineRef.current.players[1].slots[0];
      const plan = planFor({type: 'inspect', target: 1, i: 0});
      el('p0-0').classList.add('destination');
      el('p1-0').classList.add('destination');
      setInspectPair([{p: 0, i: 0}, {p: 1, i: 0}]);
      await Promise.all([flip('p0-0', mine, epoch), flip('p1-0', theirs, epoch)]);
      commitState(plan.state);
      await waitForTap({kind: 'swap-confirm'}, 'Tap “Trade cards”', `Yours is a ${mine.rank}, theirs is a ${theirs.rank}. A ${theirs.rank} beats a ${mine.rank} — take it.`, epoch);
      const swapPlan = planFor({type: 'swap'});
      await Promise.all([fly('p0-0', 'p1-0', mine, epoch, 950, 46), fly('p1-0', 'p0-0', theirs, epoch, 950, -46)]);
      await wait(400, epoch);
      await Promise.all([flip('p0-0', null, epoch), flip('p1-0', null, epoch)]);
      el('p0-0').classList.remove('destination');
      el('p1-0').classList.remove('destination');
      setInspectPair(null);
      commitState(swapPlan.state);
      await teach({
        eyebrow: 'Traded',
        title: `The ${mine.rank} is Kai's problem now.`,
        body: `Your total dropped by ${value(mine) - value(theirs)}. One more thing worth knowing: powers only work on cards drawn from the deck. A Jack or Queen picked up from the discard pile is just points.`,
        cta: 'Continue',
      }, epoch);
    }

    await kaiFiller(epoch);

    // ---- Step 7: call Kamayuu ----
    stage(7, 'kamayuu_call');
    {
      const mine = engineRef.current.players[0].slots.filter(Boolean);
      const sum = mine.reduce((n: number, c: any) => n + value(c), 0);
      await teach({
        eyebrow: 'Calling Kamayuu',
        title: `You know your whole hand: ${mine.map((c: any) => value(c)).join(' + ')} = ${sum}.`,
        body: 'When you believe your total is the lowest at the table, press the buzzer. Everyone else gets one final turn, then every card is turned face-up. Call too early and someone lower beats you — it is always a judgment call. Right now, yours is a good one.',
        cta: 'Press it',
      }, epoch);
    }
    await waitForTap({kind: 'buzzer'}, 'Press the buzzer', 'Call Kamayuu.', epoch);
    {
      const plan = planFor({type: 'buzz'});
      sfx('buzz');
      const buz = tableRef.current?.querySelector('.buzzer') as HTMLElement | null;
      if (buz) await animate(buz, [{transform: 'translateY(0)'}, {transform: 'translateY(8px)', offset: 0.2}, {transform: 'translateY(-2px)', offset: 0.6}, {transform: 'translateY(0)'}], 460, epoch);
      commitState(plan.state);
    }
    narrate('Kamayuu!', 'Everyone else gets one last turn. Your hand is set, so the rest of yours is passed.');
    await wait(2200, epoch);
    guard(epoch);
    commitState(planFor({type: 'pass'}).state);

    narrate("Kai's final turn", 'One last move.');
    await drawBeat(1, epoch);
    await discardBeat(1, epoch);

    guard(epoch);
    narrate('Last call', 'Every card is about to be turned face-up.');
    await wait(1500, epoch);

    // ---- Final reveal (flip everything using the planned end state, THEN commit) ----
    const finalPlan = planFor({type: 'finish'});
    narrate('The final reveal', 'The table tells the truth.');
    for (let p = 0; p < finalPlan.state.players.length; p++) {
      for (let i = 0; i < finalPlan.state.players[p].slots.length; i++) {
        const c = finalPlan.state.players[p].slots[i];
        if (c) {
          await flip(`p${p}-${i}`, c, epoch);
          sfx(value(c) === 0 ? 'zero' : 'flip');
          await wait(130, epoch);
        }
      }
      await wait(220, epoch);
    }
    sfx(finalPlan.state.winners.includes(0) ? 'win' : 'lose');
    await wait(450, epoch);
    setCoach(null);
    commitState(finalPlan.state);
    track('tutorial_completed');
    setDone(true);
  }

  async function runQuiz(epoch: number) {
    const choices = [
      {label: '10♠', correct: true},
      {label: 'Q♣', correct: false},
      {label: '7♦', correct: false},
    ];
    setCoach(null);
    setQuiz({question: 'Memory check — what was your bottom-left card when the hand began?', choices});
    await new Promise<void>((resolve) => {
      resolverRef.current = () => resolve();
    });
    guard(epoch);
    setQuiz(null);
    setQuizFeedback('');
  }
  function answerQuiz(correct: boolean) {
    if (!quiz) return;
    sfx(correct ? 'success' : 'fail');
    setQuizFeedback(correct ? 'Exactly. Memory matters.' : 'It was the 10♠. The game never reminds you — only you keep track.');
    const t = setTimeout(() => resolverRef.current?.(), correct ? 1300 : 2200);
    timers.current.add(t);
  }

  // ---------------------------------------------------------------- render
  const p0 = engine.players[0], p1 = engine.players[1];
  const finished = engine.phase === 'finished';

  function renderSlot(p: 0 | 1, i: number, card: any) {
    const isExpected = expect?.kind === 'slot' && expect.p === p && expect.i === i;
    const inspected = !!inspectPair?.some((x) => x.p === p && x.i === i);
    const showFace = (finished || inspected) && !!card;
    return (
      <button
        key={i}
        data-position={['TL', 'TR', 'BL', 'BR'][i]}
        data-loc={`p${p}-${i}`}
        className={'slot' + (isExpected ? ' eligible tutorial-target' : '') + (!card ? ' empty' : '') + (memoryCountdown !== null && p === 0 && i >= 2 ? ' memorizing' : '')}
        disabled={!isExpected}
        onClick={() => tapSlot(p, i)}
        aria-label={`${p === 0 ? 'Your' : 'Kai’s'} ${positionName(i)}${!card ? ' empty' : showFace ? ' ' + label(card) : ' face down'}`}
      >
        <Card rev={rev} empty={!card} card={showFace ? card : null} />
      </button>
    );
  }

  return (
    <main className="game-shell tutorial-shell">
      <section ref={tableRef as any} className={'table' + (engine.caller !== null ? ' final-round' : '')} data-phase={engine.phase} aria-label="Kamayuu tutorial table">
        <header className="table-header">
          <div className="brand"><span>KAMAYUU · LEARN TO PLAY</span></div>
          <button className="text-action tutorial-skip" onClick={skip}>Skip tutorial</button>
        </header>
        <div className="round-label tutorial-progress" aria-label={`Step ${step} of ${STEPS.length}: ${STEPS[step - 1]}`}>
          <span>STEP {step} OF {STEPS.length}</span>
          <b>{STEPS[step - 1]}</b>
          <i aria-hidden="true">{STEPS.map((_, n) => <em key={n} className={n < step ? 'on' : ''} />)}</i>
        </div>

        <section className={'player player-2' + (engine.active === 1 ? ' active' : '')} aria-label="Kai's board">
          <div className="player-label"><span className="avatar avatar-1">K</span><span className="player-name">Kai</span><i>{p1.slots.filter(Boolean).length}</i></div>
          <div className="card-grid">
            {[3, 2, 1, 0].map((i) => renderSlot(1, i, p1.slots[i]))}
          </div>
          <div data-loc="held1" className="decision-slot"><Card rev={rev} empty={!(engine.active === 1 && engine.held)} card={null} /></div>
          <div data-loc="reveal1" className="reveal-slot"><Card rev={rev} empty /></div>
        </section>

        <div className="piles">
          <div>
            <button data-loc="deck" className={'pile deck' + (expect?.kind === 'deck' ? ' available tutorial-target' : '')} disabled={expect?.kind !== 'deck'} onClick={tapDeck} aria-label="Draw from deck">
              <Card rev={rev} />
            </button>
            <span>DECK</span>
          </div>
          <div>
            <button data-loc="discard" className="pile discard" disabled aria-label="Discard pile">
              <Card rev={rev} empty={!engine.discard.length} card={engine.discard.at(-1)} />
            </button>
            <span>DISCARD</span>
          </div>
        </div>

        {coach && (
          <div className={'coach-toast ' + coach.tone} role="status" aria-live="polite">
            <b>{coach.title}</b>
            {coach.body && <span>{coach.body}</span>}
          </div>
        )}

        {expect?.kind === 'swap-confirm' && (
          <div className="swap-confirm"><button className="primary" onClick={tapSwapConfirm}>Trade cards</button></div>
        )}

        <section className={'player player-0' + (engine.active === 0 ? ' active' : '')} aria-label="Your board">
          <div className="player-label"><span className="avatar avatar-0">✧</span><span className="player-name">You</span><i>{p0.slots.filter(Boolean).length}</i></div>
          <div className="card-grid">
            {[0, 1, 2, 3].map((i) => renderSlot(0, i, p0.slots[i]))}
          </div>
          <div data-loc="held0" className="decision-slot"><Card rev={rev} empty={!(engine.active === 0 && engine.held)} card={engine.active === 0 ? engine.held : null} /></div>
          <div data-loc="reveal0" className="reveal-slot"><Card rev={rev} empty /></div>
        </section>

        <div className="buzzer-area">
          <button className={'buzzer' + (expect?.kind === 'buzzer' ? ' tempting tutorial-target' : '')} disabled={expect?.kind !== 'buzzer'} onClick={tapBuzzer} aria-label="Call Kamayuu">
            <span>♛</span>
          </button>
          <b>{engine.caller !== null ? 'FINAL ROUND' : 'KAMAYUU'}</b>
        </div>

        {quiz && (
          <div className="tutorial-quiz" role="dialog" aria-label="Memory check">
            <p className="tutorial-quiz-q">{quiz.question}</p>
            {!quizFeedback ? (
              <div className="tutorial-quiz-choices">
                {quiz.choices.map((c) => (
                  <button key={c.label} className="text-action" onClick={() => answerQuiz(c.correct)}>{c.label}</button>
                ))}
              </div>
            ) : (
              <p className="tutorial-quiz-feedback">{quizFeedback}</p>
            )}
          </div>
        )}

        {lesson && (
          <div className="lesson-card" role="dialog" aria-labelledby="lesson-title">
            <div className="lesson-sheet">
              <p className="lesson-eyebrow">{lesson.eyebrow}</p>
              <h3 id="lesson-title" className="lesson-title">{lesson.title}</h3>
              {lesson.cards && (
                <div className="lesson-cards" aria-hidden="true">
                  {lesson.cards.map((c, n) => (
                    <figure key={n}>
                      <div className="lesson-mini" dangerouslySetInnerHTML={{__html: cardHTML(c.card)}} />
                      <figcaption>{c.label}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
              <p className="lesson-body">{lesson.body}</p>
              <button className="ink-btn" onClick={tapContinue}>{lesson.cta}</button>
            </div>
          </div>
        )}

        {done && (
          <ScoreLedger
            winnerNames={engine.winners.map((p: number) => engine.players[p].name)}
            winningTotal={engine.totals[engine.winners[0]]}
            note="Remember. Replace. Risk. Throw. Call."
            players={engine.players.map((pl: any, i: number) => ({
              name: pl.name,
              total: engine.totals[i],
              cards: pl.slots.filter(Boolean).length,
              penalty: pl.penalty,
              eliminated: !!pl.eliminated,
              winner: engine.winners.includes(i),
              you: i === 0,
            }))}
          >
            <button className="primary" onClick={onPlayFirstGame}>Play your first game</button>
            <button className="text-action" onClick={onExit}>Back to menu</button>
          </ScoreLedger>
        )}
      </section>
    </main>
  );
}
