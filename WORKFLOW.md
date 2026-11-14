# Team Workflow Guide

Read this once at the start (5 minutes). It explains how our repo is organized and how we all work together, even though each of us uses a different AI coding agent.

## The big idea

Think of a restaurant kitchen. Each of us is a chef at our own station (our laptop). We never shout across the room. All coordination goes through the **ticket rail and the shared recipe book: this repo**. One person (the **integrator**) tastes everything before it goes out.

Agents never talk to each other. They only read from and write to the repo. That is why it doesn't matter whether your agent is Claude, Codex, Gemini, or Cursor: if the context is in the repo, any agent can pick up where another left off.

**Rule #1: the repo is the memory, not the chat.** Chat history is disposable. If something matters, it goes in a file and gets committed.

## Repo structure

```
.
├── AGENTS.md        # The brief every agent reads on startup (CLAUDE.md and GEMINI.md import it)
├── TEAM_PLAN.md     # Roles, stack, science decisions, timeline
├── PLAN.md          # Task checklist with owners + status, and a "Current state" table at the top
├── DECISIONS.md     # One line per decision and why. Read before changing a choice.
├── HANDOFF.md       # Written when an agent is about to run out of usage (see below)
├── WORKFLOW.md      # This file
├── contracts/       # Data schemas, API spec, mock data: our frozen meeting point   [P1]
├── pipeline/        # ingest/ + sandbox_inputs/ [P2], harmonize/ [P3]
├── backend/         # FastAPI                                                      [P4]
├── frontend/        # React app [P5]; src/features/sandbox/ [P6]
├── data/            # raw/ (gitignored) and processed/<region>/
└── tests/           # Contract tests: "does everyone still speak the same format?"
```

**Each person owns separate folders**, so agents rarely edit the same files and merges stay boring.

## Roles

| Role | Who | Responsibility |
|---|---|---|
| Module owner | Each of us (P2–P6) | Works only inside their folder, on their own branch |
| Integrator | P1 | Merges branches, runs the full app, keeps `PLAN.md` honest, owns `contracts/` |

## Ground rules

1. **Stay in your lane.** Edit only the folder you own. Need a change elsewhere? Ask the owner or the integrator.
2. **Interfaces are frozen early.** The files in `contracts/` are our contract. Only P1 changes them, after telling the affected people.
3. **Commit small and often**, with descriptive messages. Git history is free context for the next agent.
4. **One branch per person** (`feat/<role>-<topic>`, e.g. `feat/p3-calibration`). Never push directly to `main`.
5. **Tests before push.** Run the tests or smoke script. If they fail, fix before pushing.
6. **Log decisions.** Any non-obvious choice goes in `DECISIONS.md` as one line with the reason ("chose SQLite over Postgres: no setup time").
7. **Secrets never go in the repo.** Use a local `.env` (gitignored) and your own API keys.

## The work loop (repeat all hackathon)

1. **Pull** `main` and rebase your branch.
2. **Prime your agent** with:
   > Read AGENTS.md, PLAN.md, DECISIONS.md and HANDOFF.md, then run `git log -10` and the tests. Summarize your understanding before changing anything.
3. **Work** on the next unchecked task for your module in `PLAN.md`.
4. **Run tests** after every change; loop on fixes until they pass.
5. **Commit** after each passing task.
6. **Update** `PLAN.md` (tick the task, refresh "Current state") and `DECISIONS.md` (any new choice).
7. **Push and open a PR** (`gh pr create`) every 30 to 60 minutes. The integrator merges when CI/tests pass.

Steps 1 and 3 to 7 are things your agent can do on its own. Put them in `AGENTS.md` as an "after every task" checklist.

## When your agent is running out of usage

Think of a hospital shift change: the outgoing nurse updates the patient chart instead of replaying 12 hours of conversation.

At roughly **80 to 90% usage** (don't wait until it dies), tell your agent:

> Write HANDOFF.md: what's done, what's in progress (files + current state), what's broken, the next 3 steps, and any gotchas. Then commit.

Then start the next agent (a teammate's, or a different tool on your laptop) with the priming prompt from step 2 above. Making it summarize first is like the incoming nurse reading back the chart: misunderstandings surface before they turn into bad code.

Don't paste whole chat logs into the next agent. They're noisy and waste its context window.

## Which agent for what

Spend your strongest model on architecture and tricky bugs. Use cheaper or faster ones for boilerplate, UI, and tests, so your best budget lasts the whole event.

## Safety with full-access mode

Auto-approve / full-access modes (e.g. `--dangerously-skip-permissions`, `--yolo`) are a big speed boost, but permissions are set by **you in the tool's config, not by prompting the model**. If you use them:

- Run the agent inside a **container, VM, or throwaway dev environment**, not your main machine.
- Use **separate API keys with spending limits** and no production credentials.
- Keep it **inside the project folder**; never let it touch your home directory or other repos.
- Work on branches and commit often, so a bad command is one `git reset` away.

## What stays human

- Deciding priorities and what will impress the judges
- Resolving real conflicts between two modules
- The final integration check and the demo run
- Noticing an agent is near its limit and triggering the handoff

## Quick checklist

- [ ] I read `AGENTS.md`, `PLAN.md`, `DECISIONS.md`
- [ ] I know which folder I own and which branch I'm on
- [ ] My agent runs in a sandbox with its own keys
- [ ] I commit small, push every 30 to 60 minutes
- [ ] I update `PLAN.md` and `DECISIONS.md` as I go
- [ ] I trigger the handoff at 80 to 90% usage
