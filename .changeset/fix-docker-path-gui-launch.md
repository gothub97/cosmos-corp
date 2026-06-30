---
"cosmos-corp": patch
---

Fix the mission terminal failing to attach with "Unable to spawn docker ... not
found in PATH" when the app is launched from Finder or the Dock. macOS gives
GUI-launched apps a minimal PATH that omits where the docker CLI lives, so the
backend now hardens PATH at startup and resolves the docker binary to an
absolute path for the interactive PTY.
