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

type Expect = {kind: 'deck'} | {kind: 'slot'; p: number; i: number} | {kind: 'buzzer'} | {kind: 'swap-confirm'} | null;
type Quiz = {question: string; choices: {label: string; correct: boolean}[]} | null;

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
  const [caption, setCaption] = useState('LEARN TO PLAY');
  const [message, setMessage] = useState('A tiny, real hand of Kamayuu.');
  const [expect, setExpect] = useState<Expect>(null);
  const [hint, setHint] = useState('');
  const [memoryCountdown, setMemoryCountdown] = useState<number | null>(null);
  const [memorizing, setMemorizing] = useState(false);
  const [inspectPair, setInspectPair] = useState<{p: number; i: number}[] | null>(null);
  const [quiz, setQuiz] = useState<Quiz>(null);
  const [quizFeedback, setQuizFeedback] = useState('');
  const [done, setDone] = useState(false);
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
  function say(cap: string, msg: string, step?: string) {
    setCaption(cap);
    setMessage(msg);
    if (step) setStepLabel(step);
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
  function waitForTap(target: Expect, hintText: string, epoch: number) {
    guard(epoch);
    setExpect(target);
    setHint(hintText);
    return new Promise<void>((resolve) => {
      resolverRef.current = () => {
        setExpect(null);
        setHint('');
        resolverRef.current = null;
        resolve();
      };
    });
  }
  function tapSlot(p: number, i: number) {
    if (quiz) return;
    if (expect?.kind === 'slot' && expect.p === p && expect.i === i) resolverRef.current?.();
    else if (expect) nudge();
  }
  function tapDeck() {
    if (quiz) return;
    if (expect?.kind === 'deck') resolverRef.current?.();
    else if (expect) nudge();
  }
  function tapBuzzer() {
    if (quiz) return;
    if (expect?.kind === 'buzzer') resolverRef.current?.();
    else if (expect) nudge();
  }
  function tapSwapConfirm() {
    if (expect?.kind === 'swap-confirm') resolverRef.current?.();
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

  async function runScript(epoch: number) {
    await paint();
    guard(epoch);

    // ---- Step 1: the objective + memory ----
    say('GET THE LOWEST TOTAL', 'That is the whole game. Lowest score wins.', 'intro');
    await wait(1900, epoch);
    guard(epoch);
    say('YOU ONLY SEE THESE CARDS NOW', 'Remember them.', 'initial_memory');
    setMemorizing(true);
    await Promise.all([flip('p0-2', engineRef.current.players[0].slots[2], epoch), flip('p0-3', engineRef.current.players[0].slots[3], epoch)]);
    for (let n = 5; n > 0; n--) {
      guard(epoch);
      setMemoryCountdown(n);
      await wait(1000, epoch);
    }
    setMemoryCountdown(null);
    await Promise.all([flip('p0-2', null, epoch), flip('p0-3', null, epoch)]);
    setMemorizing(false);
    commitState(planFor({type: 'remember'}).state);

    // ---- Step 2: first safe move ----
    guard(epoch);
    say('YOUR TURN', 'Draw a card.', 'draw');
    await waitForTap({kind: 'deck'}, 'Tap the deck.', epoch);
    await drawBeat(0, epoch);
    say('YOU REMEMBER A HIGHER CARD HERE', 'Replace it.', 'safe_replace');
    await waitForTap({kind: 'slot', p: 0, i: 2}, 'Tap your remembered card (bottom-left).', epoch);
    await replaceBeat(0, 2, epoch);
    say('NICE', 'You lowered a card you knew.', 'safe_replace');
    await wait(1100, epoch);

    // ---- Kai's quick filler turn ----
    guard(epoch);
    say("KAI'S TURN", 'A quick move.', 'draw');
    await drawBeat(1, epoch);
    await discardBeat(1, epoch);

    // ---- Step 3: hidden cards and risk (bad risk) ----
    guard(epoch);
    say('YOUR TURN AGAIN', 'Draw a card.', 'risk_intro');
    await waitForTap({kind: 'deck'}, 'Tap the deck.', epoch);
    await drawBeat(0, epoch);
    say('YOU KNOW ONE CARD IS HIGH', 'But these two are mysteries. Unknown does not mean bad — it means a gamble.', 'risk_intro');
    await wait(2200, epoch);
    guard(epoch);
    say('TRY THE RISK', 'Replace a card you have never seen.', 'bad_risk');
    await waitForTap({kind: 'slot', p: 0, i: 0}, 'Tap a mystery card (top-left).', epoch);
    {
      const {oldCard} = await replaceBeat(0, 0, epoch);
      say('OUCH', `That hidden card was ${label(oldCard)} — worth ${value(oldCard)} points. You never know what a hidden card is until you risk it.`, 'bad_risk');
      await wait(2400, epoch);
    }

    // ---- Kai's quick filler turn ----
    guard(epoch);
    say("KAI'S TURN", 'A quick move.', 'bad_risk');
    await drawBeat(1, epoch);
    await discardBeat(1, epoch);

    // ---- Step 3b: good risk ----
    guard(epoch);
    say('ONE MORE MYSTERY', 'Draw again.', 'good_risk');
    await waitForTap({kind: 'deck'}, 'Tap the deck.', epoch);
    await drawBeat(0, epoch);
    say('RISK IT AGAIN', 'Replace your last unknown card.', 'good_risk');
    await waitForTap({kind: 'slot', p: 0, i: 1}, 'Tap your other mystery card (top-right).', epoch);
    {
      const {oldCard} = await replaceBeat(0, 1, epoch);
      say('GREAT RISK', `You dumped a ${label(oldCard)} — worth ${value(oldCard)} points. That gamble paid off.`, 'good_risk');
      await wait(2000, epoch);
    }
    guard(epoch);
    say('UNKNOWN MEANS A GAMBLE', 'Not good. Not bad. A gamble.', 'good_risk');
    await wait(1700, epoch);

    // ---- Step 4: memory check (pure UI, no engine transition) ----
    guard(epoch);
    await runQuiz(epoch);

    // ---- Kai sets up the match ----
    guard(epoch);
    say("KAI'S TURN", 'Watch the discard.', 'throw');
    await drawBeat(1, epoch);
    await replaceBeat(1, 0, epoch);

    // ---- Step 5: match / throw ----
    guard(epoch);
    say('MATCH!', 'You have the same card. Throw it.', 'throw');
    await waitForTap({kind: 'slot', p: 0, i: 3}, 'Tap your matching card (bottom-right).', epoch);
    await matchBeat(3, epoch);
    say('PERFECT', 'Matching the discard removes one of your cards.', 'throw');
    await wait(1500, epoch);

    // ---- Step 6a: Jack — peek (continues the same turn) ----
    guard(epoch);
    say('YOUR TURN CONTINUES', 'Draw again.', 'peek');
    await waitForTap({kind: 'deck'}, 'Tap the deck.', epoch);
    await drawBeat(0, epoch);
    say('JACK — PEEK', 'Look at one of your cards.', 'peek');
    await waitForTap({kind: 'slot', p: 0, i: 2}, 'Tap one of your cards to peek.', epoch);
    await peekBeat(2, epoch);
    say('ONLY YOU SAW THAT', 'A red Jack always lets you check a card.', 'peek');
    await wait(1700, epoch);

    // ---- Kai filler ----
    guard(epoch);
    say("KAI'S TURN", 'A quick move.', 'peek');
    await drawBeat(1, epoch);
    await discardBeat(1, epoch);

    // ---- Step 6b: Red Queen — swap ----
    guard(epoch);
    say('YOUR TURN', 'Draw again.', 'swap');
    await waitForTap({kind: 'deck'}, 'Tap the deck.', epoch);
    await drawBeat(0, epoch);
    say('RED QUEEN — SWAP', 'Pick one of your cards, then an opponent.', 'swap');
    await waitForTap({kind: 'slot', p: 0, i: 0}, 'Tap one of your cards.', epoch);
    say('NOW PICK KAI', 'Same position, their board.', 'swap');
    await waitForTap({kind: 'slot', p: 1, i: 0}, "Tap Kai's matching card.", epoch);
    {
      const mine = engineRef.current.players[0].slots[0];
      const theirs = engineRef.current.players[1].slots[0];
      const plan = planFor({type: 'inspect', target: 1, i: 0});
      el('p0-0').classList.add('destination');
      el('p1-0').classList.add('destination');
      setInspectPair([{p: 0, i: 0}, {p: 1, i: 0}]);
      await Promise.all([flip('p0-0', mine, epoch), flip('p1-0', theirs, epoch)]);
      commitState(plan.state);
      say('TRADE OR KEEP', `Yours is ${label(mine)}. Theirs is ${label(theirs)}. Take the better one.`, 'swap');
      await wait(1900, epoch);
      guard(epoch);
      say('TAKE THEIRS', 'It is the lower card.', 'swap');
      await waitForTap({kind: 'swap-confirm'}, 'Tap "Trade cards".', epoch);
      const swapPlan = planFor({type: 'swap'});
      await Promise.all([fly('p0-0', 'p1-0', mine, epoch, 950, 46), fly('p1-0', 'p0-0', theirs, epoch, 950, -46)]);
      await wait(400, epoch);
      await Promise.all([flip('p0-0', null, epoch), flip('p1-0', null, epoch)]);
      el('p0-0').classList.remove('destination');
      el('p1-0').classList.remove('destination');
      setInspectPair(null);
      commitState(swapPlan.state);
    }

    // ---- Kai filler ----
    guard(epoch);
    say("KAI'S TURN", 'A quick move.', 'swap');
    await drawBeat(1, epoch);
    await discardBeat(1, epoch);

    // ---- Step 7: call Kamayuu ----
    guard(epoch);
    say('THINK YOU ARE THE LOWEST?', 'Call Kamayuu.', 'kamayuu_call');
    await waitForTap({kind: 'buzzer'}, 'Tap the buzzer.', epoch);
    {
      const plan = planFor({type: 'buzz'});
      sfx('buzz');
      const buz = tableRef.current?.querySelector('.buzzer') as HTMLElement | null;
      if (buz) await animate(buz, [{transform: 'translateY(0)'}, {transform: 'translateY(8px)', offset: 0.2}, {transform: 'translateY(-2px)', offset: 0.6}, {transform: 'translateY(0)'}], 460, epoch);
      commitState(plan.state);
    }
    say('EVERYONE ELSE GETS ONE FINAL TURN', 'Your hand is set — passing the rest of your turn.', 'kamayuu_call');
    await wait(1700, epoch);
    guard(epoch);
    commitState(planFor({type: 'pass'}).state);

    say("KAI'S FINAL TURN", 'One last move.', 'kamayuu_call');
    await drawBeat(1, epoch);
    await discardBeat(1, epoch);

    guard(epoch);
    say('LAST CALL', 'Every hand is locked in. Revealing now.', 'final_reveal');
    await wait(1300, epoch);

    // ---- Final reveal (flip everything using the planned end state, THEN commit) ----
    const finalPlan = planFor({type: 'finish'});
    say('THE FINAL REVEAL', 'The table tells the truth.', 'final_reveal');
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
    setQuiz({question: 'What was in your bottom-left position at the very start?', choices});
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
    setQuizFeedback(correct ? 'Exactly. Memory matters.' : 'Not quite — it was 10♠. The game tracks every card; only you track what you have seen.');
    const t = setTimeout(() => resolverRef.current?.(), correct ? 1200 : 2000);
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
        className={'slot' + (isExpected ? ' eligible tutorial-target' : '') + (!card ? ' empty' : '')}
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
        <div className="round-label">LEARN TO PLAY</div>

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

        <div className="status" role="status" aria-live="polite">
          <span>{caption}</span>
          <p>{message}</p>
          {memorizing && memoryCountdown !== null && (
            <div className="memory-timer"><i style={{width: `${(memoryCountdown / 5) * 100}%`}} /><b>{memoryCountdown}</b></div>
          )}
        </div>

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

        {hint && <div className="tutorial-hint" role="status">{hint}</div>}

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
