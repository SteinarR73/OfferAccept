import { InvalidStateTransitionError, TerminalStateError } from '../errors/domain.errors';

// Generic finite state machine.
//
// Usage:
//   const machine = new StateMachine<OfferStatus>(
//     { DRAFT: ['SENT'], SENT: ['ACCEPTED', 'REVOKED', ...] },
//     ['ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED'],
//     'Offer',
//   );
//
//   machine.assertTransition(offer.status, 'SENT');  // throws on invalid
//
// The transition map is a partial record: states not listed as keys have no
// outgoing transitions (they are effectively terminal even if not declared as such).

export class StateMachine<TState extends string> {
  constructor(
    private readonly transitions: Readonly<Partial<Record<TState, readonly TState[]>>>,
    private readonly terminalStates: readonly TState[],
    private readonly entityName?: string,
  ) {}

  isTerminal(state: TState): boolean {
    return this.terminalStates.includes(state);
  }

  canTransition(from: TState, to: TState): boolean {
    if (this.isTerminal(from)) return false;
    const allowed = this.transitions[from];
    return allowed?.includes(to) ?? false;
  }

  // Throws InvalidStateTransitionError or TerminalStateError if the transition is not allowed.
  assertTransition(from: TState, to: TState): void {
    if (this.isTerminal(from)) {
      throw new TerminalStateError(from, this.entityName);
    }
    if (!this.canTransition(from, to)) {
      throw new InvalidStateTransitionError(from, to, this.entityName);
    }
  }

  // Returns all states reachable from the given state in one step.
  allowedTransitions(from: TState): readonly TState[] {
    if (this.isTerminal(from)) return [];
    return this.transitions[from] ?? [];
  }
}
