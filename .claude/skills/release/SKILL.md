---
name: release
description: Cut an npm release for the ost-tools project. Use when the user asks to cut a release, publish a new version, or run /release <major|minor|patch>.
---

## Task

Cut a **$ARGUMENTS** release (major, minor, or patch).

1. Verify the branch is `main` and working tree is clean. If not, stop and tell the user.

2. Bump the version — this automatically runs lint, tests, commits, and pushes with tags:
   ```
   bun pm version $ARGUMENTS
   ```
   If lint or tests fail, stop and report the errors.

3. Log in to npm:
   ```
   npm login
   ```

4. Publish:
   ```
   npm publish
   ```

5. Report the new version and confirm it's live.
