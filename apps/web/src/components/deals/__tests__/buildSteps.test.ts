import { buildSteps } from '../AcceptanceStatusCard';
import type { OfferStatusValue } from '@offeraccept/types';

// Helper: extract the data fields we care about, ignoring the React icon node.
function stepsData(status: OfferStatusValue) {
  return buildSteps(status).map(({ id, label, state }) => ({ id, label, state }));
}

describe('buildSteps', () => {
  it('DRAFT: 3 steps — created done, sent active, awaiting pending', () => {
    const steps = stepsData('DRAFT');
    expect(steps).toEqual([
      { id: 'created', label: 'Deal created',        state: 'done'    },
      { id: 'sent',    label: 'Sent to customer',    state: 'active'  },
      { id: 'awaiting',label: 'Awaiting acceptance', state: 'pending' },
    ]);
  });

  it('SENT: 3 steps — created done, sent done, awaiting active', () => {
    const steps = stepsData('SENT');
    expect(steps).toEqual([
      { id: 'created', label: 'Deal created',        state: 'done'   },
      { id: 'sent',    label: 'Sent to customer',    state: 'done'   },
      { id: 'awaiting',label: 'Awaiting acceptance', state: 'active' },
    ]);
  });

  it('ACCEPTED: 4 steps — last two are "Accepted" done + "Certificate issued" done', () => {
    const steps = stepsData('ACCEPTED');
    expect(steps).toHaveLength(4);
    expect(steps[2]).toEqual({ id: 'awaiting', label: 'Accepted',          state: 'done' });
    expect(steps[3]).toEqual({ id: 'certificate', label: 'Certificate issued', state: 'done' });
  });

  it('DECLINED: 3 steps — awaiting is "Closed" with active state', () => {
    const steps = stepsData('DECLINED');
    expect(steps).toHaveLength(3);
    expect(steps[2]).toEqual({ id: 'awaiting', label: 'Closed', state: 'active' });
  });

  it('REVOKED: 3 steps — awaiting is "Closed" with active state', () => {
    const steps = stepsData('REVOKED');
    expect(steps).toHaveLength(3);
    expect(steps[2]).toEqual({ id: 'awaiting', label: 'Closed', state: 'active' });
  });

  it('EXPIRED: 3 steps — awaiting is "Closed" with active state', () => {
    const steps = stepsData('EXPIRED');
    expect(steps).toHaveLength(3);
    expect(steps[2]).toEqual({ id: 'awaiting', label: 'Closed', state: 'active' });
  });

  it('only ACCEPTED adds a certificate step', () => {
    const statuses: OfferStatusValue[] = ['DRAFT', 'SENT', 'DECLINED', 'REVOKED', 'EXPIRED'];
    for (const s of statuses) {
      expect(buildSteps(s).find((step) => step.id === 'certificate')).toBeUndefined();
    }
    expect(buildSteps('ACCEPTED').find((step) => step.id === 'certificate')).toBeDefined();
  });
});
