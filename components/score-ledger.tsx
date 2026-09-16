'use client';
import type {ReactNode} from 'react';

export interface LedgerPlayer {
  name: string;
  total: number;
  cards: number;
  penalty: number;
  eliminated: boolean;
  winner: boolean;
  you: boolean;
}

interface ScoreLedgerProps {
  players: LedgerPlayer[];
  winnerNames: string[];
  winningTotal: number;
  note?: string;
  children?: ReactNode;
}

// The end-of-hand tally, drawn as a parchment scorekeeper's sheet laid on the
// table: a brass rod along the top, a wax seal for the winner, dotted leaders
// between each name and its total. Shared by the live game and the tutorial.
export default function ScoreLedger({players, winnerNames, winningTotal, note, children}: ScoreLedgerProps) {
  const shared = winnerNames.length > 1;
  const verb = shared ? 'share' : winnerNames[0] === 'You' ? 'take' : 'takes';
  return (
    <section className="results ledger" aria-label="Match results">
      <div className="ledger-wrap">
      {/* The seal sits outside the sheet so the sheet's torn-edge clip-path can't cut it off. */}
      <div className="ledger-seal" aria-hidden="true"><span>♛</span></div>
      <div className="ledger-sheet">
        <p className="ledger-eyebrow">{shared ? 'Shared victory' : 'The tally'}</p>
        <h2 className="ledger-headline"><em>{winnerNames.join(' & ')}</em> {verb} the hand</h2>
        <p className="ledger-sub">{winningTotal} points · lowest at the table</p>
        <ol className="ledger-rows">
          {players.map((p, i) => (
            <li key={i} className={'ledger-row' + (p.winner ? ' is-winner' : '') + (p.eliminated ? ' is-out' : '')}>
              <span className="ledger-name">
                {p.name}
                {p.you && p.name !== 'You' && <i>you</i>}
                <small>{p.eliminated ? 'six cards' : `${p.cards} card${p.cards === 1 ? '' : 's'}${p.penalty ? ` · +${p.penalty}` : ''}`}</small>
              </span>
              <span className="ledger-leader" aria-hidden="true" />
              <b className="ledger-total">{p.eliminated ? 'OUT' : p.total}</b>
            </li>
          ))}
        </ol>
        {note && <p className="ledger-note">{note}</p>}
        <div className="ledger-actions">{children}</div>
      </div>
      </div>
    </section>
  );
}
