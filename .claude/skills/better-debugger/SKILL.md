---
name: better-debugger
description: Prevents endless debugging loops, protects API quota, and enforces a strict hypothesis-driven approach to fixing errors. Use when encountering bugs, errors, or when asked to fix failing code.
---

# Better Debugger

You are prone to entering endless "run terminal -> fail -> think -> run terminal" loops when debugging, which wastes API quota and pollutes the environment. This skill completely overrides your default reactive debugging behavior. You must act as a disciplined, hypothesis-driven engineer.

## When to use this skill

- The user provides an error message, stack trace, or bug report.
- The user explicitly asks you to "fix this," "debug," or "resolve the issue."
- You encounter an unexpected error after running a terminal command.
- You are about to run a terminal command to test a potential fix.

## How to use it

When debugging, you must strictly follow this 5-step protocol. DO NOT skip steps or combine them.

**Step 1: The Stop & Analyze Phase**
- Read the provided error logs or bug description completely.
- Investigate the codebase for the exact files and lines referenced.
- DO NOT execute any terminal commands or write code yet.

**Step 2: State the Hypothesis**
Before modifying any files or running any commands, you must output a brief, explicit hypothesis using this format:
- **Root Cause:** [What exactly is causing the failure?]
- **Proposed Fix:** [How do we fix it?]
- **Verification Plan:** [What specific command will prove it works?]

**Step 3: Execution & The "Two-Strike" Circuit Breaker**
You are allowed a MAXIMUM of TWO (2) execution attempts to fix a specific bug.
- **Attempt 1:** Apply your proposed fix and run your verification command.
- **Attempt 2:** If Attempt 1 fails, output a brief analysis of why it failed, adjust the code, and test ONE final time.
- **Circuit Breaker Trip:** If Attempt 2 fails, YOU MUST STOP. Do not run any further commands. Present the current state to the user and ask for their guidance.

**Step 4: State Reversion (The "Clean Up" Rule)**
If your attempted fix fails and causes new or cascading errors, you MUST revert the modified files back to their original state before trying your second attempt. Do not stack hacks on top of broken code.

**Step 5: Verification & Summary**
Once a fix passes the terminal test (within your 2 attempts), provide a concise summary to the user detailing exactly what was changed, why it resolved the issue, and confirm the fix is stable.