---
name: update-release-notes
description: This skill should be used when the user asks to "update release notes", "fix release notes", "clean up release notes", "add release notes", "write release notes", or mentions anything related to updating GitHub release descriptions.
---

# Update Release Notes

This skill updates GitHub release notes to contain only user-facing items. It removes internal changes (CI/CD, GitHub Actions, documentation for contributors, dependency bumps, etc.) and adds notes for releases that are missing them.

## When to Use

Activate when the user requests updating, cleaning up, or adding release notes for GitHub releases.

## Scope Selection

**STOP — Ask the user before proceeding.**

Present the user with a choice:

- **All releases** — Review and update notes for every release
- **Latest release only** — Update notes for the most recent tag

Wait for the user's answer before continuing.

## Workflow

### Step 1: List Tags and Releases

```bash
git tag --sort=-v:refname
GH_PAGER=cat gh release list --repo <owner>/<repo> --limit 50
```

Determine which tags have corresponding GitHub releases.

### Step 2: Get Current Release Notes

For releases in scope (all or latest), fetch existing notes:

```bash
GH_PAGER=cat gh release view <tag> --repo <owner>/<repo>
```

Note which releases have empty notes vs. existing notes that need cleanup.

### Step 3: Get Commit Deltas

For each release in scope, get the commits between consecutive tags:

```bash
# First release (from beginning of history)
git --no-pager log --oneline <first-tag>

# Subsequent releases
git --no-pager log --oneline <previous-tag>..<current-tag>
```

### Step 4: Draft User-Facing Notes

For each release, analyze commits and draft notes containing **only user-facing changes**.

**Include:**
- New features and capabilities
- Bug fixes that affect user experience
- Performance improvements users would notice
- UI/UX changes
- Major dependency upgrades that affect behavior (e.g., Electron version bump)

**Exclude:**
- CI/CD and GitHub Actions workflow changes
- GitHub Actions version bumps (e.g., "Bump actions/checkout from 4 to 6")
- Dependabot PRs for non-user-facing dependencies
- Documentation updates (README, copilot instructions, skill files)
- Code refactors with no user-visible effect
- Build configuration changes (notarization setup, bundling config)
- Merge commits
- Version bump commits (e.g., "0.6.4")

**Rewrite commit messages** into clean, user-friendly descriptions. Do not copy raw commit messages verbatim. For example:
- `feat: Add toggle word wrap functionality with Alt+Z shortcut and update config` → `Add toggle word wrap (Alt+Z)`
- `fix: Pin @github/copilot-sdk to 0.1.21 to fix broken streaming and window spawning in 0.1.23` → `Fix broken streaming responses and window spawning`

**Format** using markdown sections:

```markdown
### Features

- Feature description

### Bug Fixes

- Fix description
```

Omit empty sections. If a release has only fixes, omit the Features heading and vice versa.

### Step 5: Update Releases

For each release, push the updated notes:

```bash
GH_PAGER=cat gh release edit <tag> --repo <owner>/<repo> --notes '<notes>'
```

## Example

Task: User says "update release notes for the latest release"

**Scope:** Latest release only (confirmed with user)

**Step 1:** Find latest tag: `v0.6.4`

**Step 2:** Check existing notes — empty

**Step 3:** Get commits:
```bash
$ git --no-pager log --oneline v0.6.3..v0.6.4
45ffc06 0.6.4
6b858c9 Fix SDK spawning new Electron window by overriding process.execPath
```

**Step 4:** Draft notes (skip version commit, rewrite fix):
```markdown
### Bug Fixes

- Fix agent spawning new Electron window instead of responding
```

**Step 5:** Push:
```bash
GH_PAGER=cat gh release edit v0.6.4 --notes '### Bug Fixes

- Fix agent spawning new Electron window instead of responding'
```

## Checklist

Before pushing any release note update:
- [ ] Confirmed scope with user (all or latest)
- [ ] Retrieved current notes for releases in scope
- [ ] Got commit deltas for each release
- [ ] Filtered to user-facing items only
- [ ] Rewrote commit messages into clean descriptions
- [ ] Omitted empty sections
- [ ] Pushed updated notes via `gh release edit`
