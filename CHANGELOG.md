# cosmos-corp

## 0.2.1

### Patch Changes

- bf13a9c: Fix the mission terminal failing to attach with "Unable to spawn docker ... not
  found in PATH" when the app is launched from Finder or the Dock. macOS gives
  GUI-launched apps a minimal PATH that omits where the docker CLI lives, so the
  backend now hardens PATH at startup and resolves the docker binary to an
  absolute path for the interactive PTY.

## 0.2.0

### Minor Changes

- d994f88: First-launch onboarding, Chapter 4 (FluxCD), per-chapter theory courses, the Sage
  mentor character + app icon, and a versioned player profile. Sets up Changesets-based
  versioning and an automated macOS build-and-release pipeline.
