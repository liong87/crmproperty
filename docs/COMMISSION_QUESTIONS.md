# Commission — what we still need to know

The data model is built and the arithmetic is tested. What is missing is not code, it is
**the agency's actual rules**. This is the list to take to whoever knows — the outgoing
agency, the developers, and whoever pays the agents today.

Most answers become configuration. Three of them (marked **SCHEMA**) would need new
tables, so they are worth asking early rather than discovering later.

---

## 1. What the commission is calculated ON

- [ ] Is the developer's commission a flat percentage of the unit price, or does it vary
      by project, by phase, or by how fast the phase is selling?
- [ ] **Is it calculated on the LIST price or the NETT price after rebate?** These differ
      by real money on every deal. The system stores both on a unit type and has to be
      told which one feeds the commission.
- [ ] Does a bumi discount change the base, or is commission always on the undiscounted price?
- [ ] Is commission ever paid on a unit that is later cancelled — and if so, is it clawed back?

## 2. How the developer pays the agency

- [ ] At which milestones does money actually arrive? (Typically some at booking or SPA
      stamping, some at loan disbursement, the balance at completion.)
- [ ] What percentage at each milestone?
- [ ] **How long after each milestone does payment realistically land?** The system uses
      this to chase — the honest number, not the number in the contract.
- [ ] Does this differ per developer? Teladan Setia and Faithview may not pay alike, in
      which case we need one scheme per developer rather than one for the agency.

## 3. How the agency splits it with agents

- [ ] What does the agency keep, and what does the agent get?
- [ ] Does the split differ by agent seniority or tier? If a senior agent gets a better
      rate than a new joiner, we need one scheme per tier.
- [ ] Is there a separate share for the SETTER (who booked the appointment) and the
      CLOSER (who ran the presentation), or does the closing agent take the whole agent share?
- [ ] **SCHEMA** — does a team leader or manager earn an override on their team's deals?
      Nothing supports this today.

## 4. Co-broke

- [ ] How often does it actually happen?
- [ ] Is the co-broke share taken off the GROSS commission, or split out of the agency's
      portion, or out of the agent's?
- [ ] Is it always 50/50, or negotiated per deal?
- [ ] Is the co-broke always from another agency, or sometimes one of our own agents?
      (The system currently assumes another agency — a name, not an account.)

## 5. When the AGENT gets paid

- [ ] Does the agent get paid only after the developer pays the agency, or on a fixed
      monthly cycle regardless?
- [ ] If the developer pays in stages, does the agent get their share in the same stages?
- [ ] **Fast commission** — the previous agency had a "Fast Comm Application". What is it
      exactly: the agency advancing the agent early? At what fee or discount? Who approves it?
- [ ] **SCHEMA** — nothing supports advances or their fees today.

## 6. Deductions and tax

- [ ] **SCHEMA** — is anything deducted before the agent is paid? Admin fee, marketing
      levy, repayment of an advance? None of this exists in the model.
- [ ] Is agency commission subject to SST, and is the agent's share inclusive or exclusive?
- [ ] Are agents employees or independent contractors, and does the agency withhold anything?
      (Affects what a commission statement has to show, not just the arithmetic.)

## 7. Records

- [ ] What does an agent expect to SEE — a running total, a statement per deal, a monthly
      statement?
- [ ] Who reconciles what the developer actually paid against what was expected, and how
      do they do it today?
- [ ] What does the accountant need out of this at year end?

---

## Why it is worth answering before building

Sections 1 to 5 are configuration once answered — schemes, rates, stages. The four
**SCHEMA** items are not: team-leader overrides, commission advances, and deductions each
need new tables, and adding them after real commissions exist means migrating live money
records rather than empty ones.

The cheapest sequence is to answer this list first, then build once.
