---
name: edit-accrew-file
description: This skill should be used when editing any file in the Accrew codebase, including "modify", "update", "change", "fix", "add to", or "refactor" any source file. Activate before calling replace_string_in_file or multi_replace_string_in_file on any Accrew file.
---

# Edit Accrew File

This skill enforces the WHY-comment workflow when editing files in the Accrew codebase.

## Why This Exists

Accrew files contain `WHY:` comments that document non-obvious decisions and bug fixes. Editing without reading these comments leads to re-introducing bugs or breaking subtle invariants.

## Workflow

**STOP — Complete Step 1 before calling any edit tool.**

### Step 1: Search for WHY Comments

Before editing, run `grep_search` for `WHY:` in the target file:

```
grep_search(query="WHY:", includePattern="path/to/file.tsx", isRegexp=false)
```

This is mandatory. Reading the file does not count — the explicit search ensures WHY comments are surfaced.

### Step 2: Review Results

If WHY comments exist:
- Read each one
- Understand what problem it prevents
- Consider whether the planned edit affects the documented behavior

If no WHY comments exist, proceed to Step 3.

### Step 3: Make the Edit

Call `replace_string_in_file` or `multi_replace_string_in_file` with the change.

### Step 4: Add WHY Comment (When Applicable)

After fixing a bug or making a non-obvious change, add a WHY comment:

```typescript
// WHY: [Problem description] — [What breaks without this]
```

Add a WHY comment when:
- Fixing any bug
- Changing the order of operations
- Editing code that already has a WHY comment (update or preserve it)
- Adding a workaround or special case
- Writing code that handles timing, async, or race conditions

## Example

Task: Sort sessions by most recent in Sidebar.tsx

**Step 1:** Search for WHY comments
```
grep_search(query="WHY:", includePattern="src/components/Sidebar.tsx", isRegexp=false)
```

**Step 2:** Review results (none found)

**Step 3:** Make the edit — add sorting

**Step 4:** Add WHY comment explaining the sort order

```typescript
// WHY: Sort by updatedAt descending — most recently active session should appear at top
const recentSessions = sessions
  .filter(s => s.status !== 'archived')
  .sort((a, b) => b.updatedAt - a.updatedAt)
```

## Checklist

Before every edit:
- [ ] Ran `grep_search` for `WHY:` in target file
- [ ] Read and understood any existing WHY comments
- [ ] Verified edit won't break documented invariants
- [ ] Added WHY comment if fixing a bug or making non-obvious change
