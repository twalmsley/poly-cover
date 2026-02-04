# Plan Issue Fix

This command fetches a GitHub issue, creates a detailed plan for fixing it, and posts the plan as a comment on the issue.

## Usage
The user should provide an issue number (e.g., "plan fix for issue #42" or "plan issue 42").

## Steps

1. **Get the issue number from the user's request** - Extract the issue number from their message. If not provided, ask for it.

2. **Fetch issue details** using `gh issue view <number> --json title,body,number,state,labels,author,createdAt,updatedAt` to get comprehensive issue information.

3. **Analyze the issue**:
   - Read the issue title and body to understand what needs to be fixed
   - Check the codebase to understand the relevant code areas
   - Identify the root cause and affected components
   - Consider edge cases and testing requirements

4. **Create a detailed fix plan** that includes:
   - **Problem Summary**: Brief description of what needs to be fixed
   - **Root Cause Analysis**: Why the issue exists
   - **Proposed Solution**: Step-by-step approach to fix the issue
   - **Affected Components**: Files, classes, and modules that need changes
   - **Testing Strategy**: What tests need to be added or updated
   - **Implementation Steps**: Detailed breakdown of the work required
   - **Risk Assessment**: Potential side effects or breaking changes

5. **Format the plan as a markdown comment** with clear sections and code blocks where appropriate.

6. **Post the plan as a comment** on the issue using:
   ```
   gh issue comment <number> --body-file <temp-file>
   ```
   Or use `--body` with the formatted plan text.

7. **Confirm completion** - Let the user know the plan has been posted to the issue.

## Example Output Format

The plan comment should follow this structure:

```markdown
## Fix Plan for Issue #<number>

### Problem Summary
[Brief description]

### Root Cause Analysis
[Why this issue exists]

### Proposed Solution
[High-level approach]

### Affected Components
- File: `path/to/file.java`
- Class: `ClassName`
- [Other components]

### Testing Strategy
- [ ] Unit tests for [component]
- [ ] Integration tests for [scenario]
- [ ] Edge case: [description]

### Implementation Steps
1. [Step 1]
2. [Step 2]
3. [Step 3]

### Risk Assessment
- [Potential risks and mitigations]
```
