# Esencial — Skill Registry

Index of available skills. Registry contract: this file is an INDEX only. Each skill's
`SKILL.md` is the runtime source of truth — pass exact paths to subagents, never summaries.

Generated: 2026-09-06 · Scan roots: `~/.claude/skills/` (user)

## Skills Index

| Skill | Trigger / Description | Scope | Path |
|-------|----------------------|-------|------|
| artifact-design | Designing artifacts (reports, documents, structured outputs) | user | `/home/ismael/.claude/skills/artifact-design/SKILL.md` |
| artifact-diagramming | Diagrams (mermaid, ASCII architecture/sequence) | user | `/home/ismael/.claude/skills/artifact-diagramming/SKILL.md` |
| branch-pr | Branch naming and PR workflow | user | `/home/ismael/.claude/skills/branch-pr/SKILL.md` |
| chained-pr | Chained/stacked PR slices for large delivery | user | `/home/ismael/.claude/skills/chained-pr/SKILL.md` |
| cognitive-doc-design | Documentation design for cognition | user | `/home/ismael/.claude/skills/cognitive-doc-design/SKILL.md` |
| comment-writer | Writing code comments | user | `/home/ismael/.claude/skills/comment-writer/SKILL.md` |
| dataviz | Data visualization guidelines | user | `/home/ismael/.claude/skills/dataviz/SKILL.md` |
| go-testing | Go test patterns | user | `/home/ismael/.claude/skills/go-testing/SKILL.md` |
| issue-creation | GitHub issue creation | user | `/home/ismael/.claude/skills/issue-creation/SKILL.md` |
| judgment-day | Adversarial multi-judge review protocol | user | `/home/ismael/.claude/skills/judgment-day/SKILL.md` |
| orca-cli | Orca CLI: worktrees, terminals, orchestration, browser | user | `/home/ismael/.claude/skills/orca-cli/SKILL.md` |
| orchestration | Multi-agent orchestration via orca-cli | user | `/home/ismael/.claude/skills/orchestration/SKILL.md` |
| rdd-defect-workflow | RDD defect workflow | user | `/home/ismael/.claude/skills/rdd-defect-workflow/SKILL.md` |
| skill-creator | Creating new skills | user | `/home/ismael/.claude/skills/skill-creator/SKILL.md` |
| skill-improver | Improving existing skills | user | `/home/ismael/.claude/skills/skill-improver/SKILL.md` |
| skill-registry | Rebuild/update this registry | user | `/home/ismael/.claude/skills/skill-registry/SKILL.md` |
| systemic-issue-triage | Triaging systemic issues | user | `/home/ismael/.claude/skills/systemic-issue-triage/SKILL.md` |
| web-design-guidelines | Web UI design guidelines | user | `/home/ismael/.claude/skills/web-design-guidelines/SKILL.md` |
| work-unit-commits | Commit per work unit | user | `/home/ismael/.claude/skills/work-unit-commits/SKILL.md` |

## Project Conventions

| File | Role | Path |
|------|------|------|
| AGENTS.md | Project memory: stack, conventions, known issues | `/home/ismael/orca/workspaces/esencial/nueva-receta/AGENTS.md` |
| DEPLOY.md | Deploy runbook (D1 remote migrations, R2 notes) | `/home/ismael/orca/workspaces/esencial/nueva-receta/DEPLOY.md` |

## Registry Contract

- Subagents MUST load listed `SKILL.md` files when their trigger matches the task.
- Delegators pass exact paths; subagents report `skill_resolution: paths-injected`.
- Skipped from scan: `sdd-*`, `_shared`, `skill-registry` (per convention).
