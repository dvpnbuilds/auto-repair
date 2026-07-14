---
name: next-phase
description: Start the next build phase. Trigger: "next phase", "start phase N", "continue building".
---
1. Read PROGRESS.md; confirm the previous phase is audited-pass. If it is not, stop and say so.
2. Read the next phase's scope and "Done when" criteria from PLAN.md.
3. Mark it "in progress" in PROGRESS.md, restate the scope in one paragraph, then build it.
4. Respect RULES.md throughout — especially: server-side-only secrets, structured-JSON LLM outputs, the estimate disclaimer label, and reading the model from OPENROUTER_MODEL.
5. When done, mark the phase "built" in PROGRESS.md and suggest running /audit.
