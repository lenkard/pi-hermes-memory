# Issue tracker: GitHub

Issues and planning artifacts for this repository live as GitHub issues on `lenkard/pi-hermes-memory`. Use the `gh` CLI for operations.

## Conventions

- **Create an issue:** `gh issue create --title "..." --body "..."`; use a heredoc for multiline bodies.
- **Read an issue:** `gh issue view <number> --comments` and fetch its labels.
- **List issues:** `gh issue list --state open --json number,title,body,labels,comments` with appropriate filters.
- **Comment:** `gh issue comment <number> --body "..."`.
- **Apply or remove labels:** `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- **Close:** `gh issue close <number> --comment "..."`.

Run commands inside this clone or pass `--repo lenkard/pi-hermes-memory` explicitly. When a skill says to publish to the issue tracker, create a GitHub issue. When a skill says to fetch an issue, read its full body and comments.

## Pull requests as a triage surface

**PRs as a request surface: no.** External pull requests do not enter the issue-triage workflow automatically.

GitHub shares one number space across issues and pull requests. If a bare number is ambiguous, try `gh pr view <number>` and fall back to `gh issue view <number>`.

## Wayfinding operations

The Wayfinder map is one issue labelled `wayfinder:map`; its decision tickets are child issues.

- **Map:** create an issue with the destination, notes, decisions so far, not-yet-specified fog, and out-of-scope sections.
- **Child ticket:** link an issue as a GitHub sub-issue and apply one of `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`. If sub-issues are unavailable, place the child in a task list on the map and add `Part of #<map>` to the child.
- **Blocking:** use GitHub native issue dependencies when available. The dependency endpoint requires the blocker issue's numeric database ID, not its visible issue number. If dependencies are unavailable, add `Blocked by: #<number>` to the child body.
- **Frontier:** open, unblocked, unassigned child issues are available to work.
- **Claim:** assign a ticket before doing work: `gh issue edit <number> --add-assignee @me`.
- **Resolve:** post the answer as a resolution comment, close the ticket, and append a one-line linked gist to the map's Decisions-so-far section.
