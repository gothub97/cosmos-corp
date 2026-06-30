# Chapter 2 Course: The Codebase - Git from the Ground Up

*Sage settles into the chair across from you with a coffee and no slides.*

> "This week is git. Not 'git basics' in the three-command sense - the real
> model. Understand what git is actually doing and every command stops being
> magic. Misunderstand it and you'll be afraid to merge for the rest of your
> career. We're not doing that."

---

## Why a mental model matters

Most people learn git the wrong way: they memorise commands. `git add`, `git commit`, `git push`. It works until it doesn't, and when it breaks they panic because they have no idea what's happening underneath.

Here is the one sentence that replaces the panic: **git is a tool that takes snapshots of your files and connects those snapshots in a graph.** That's it. Every command you'll ever run is either making a snapshot, moving between snapshots, or comparing snapshots.

Hold that sentence and the rest of this chapter lands properly.

---

## The object model: what git actually stores

When you run `git commit`, git does not save a diff. It takes a **picture of every tracked file at that moment** and stores it. If a file hasn't changed, git is smart enough to just store a link to the previous identical copy rather than duplicating it - but conceptually you can think of each commit as a complete, self-contained photograph of your project.

Each of these objects - files, directories, commits - is stored by the SHA-1 hash of its content. That 40-character hex string you see everywhere (`24b9da6552252243aa493b52f8696cd6d3b00373`) is just a fingerprint. Change one byte and you get a completely different hash. This means:

- **You cannot silently corrupt a git repository.** Git knows if anything has changed.
- **Commits are immutable.** You can never modify a commit; you can only create new ones.

A commit object itself contains four things:

1. A pointer to a **tree** - the snapshot of the directory structure at that moment.
2. The **author** name, email, and timestamp.
3. The **commit message** you typed.
4. A pointer to the **parent commit** (or parents, for a merge).

That parent pointer is what gives you history. Follow the parent chain backwards from any commit and you reconstruct the entire story of the project.

```
C1 ← C2 ← C3 ← C4
```

This chain is called a **commit graph**, or more formally, a Directed Acyclic Graph (DAG). "Directed" because the arrows only point one way. "Acyclic" because you can't loop back.

> **Reference:** Pro Git §1.3 "What is Git?" and §10.2 "Git Objects" - [https://git-scm.com/book/en/v2/Getting-Started-What-is-Git%3F](https://git-scm.com/book/en/v2/Getting-Started-What-is-Git%3F)

---

## HEAD: where you are

`HEAD` is a pointer that answers the question: *where am I right now?*

In normal use, `HEAD` points to your current **branch**, which in turn points to the most recent commit on that branch. When you make a new commit, the branch pointer moves forward, and HEAD follows.

```
HEAD → main → C4
```

You can also put HEAD into "detached" state - pointing directly to a commit instead of a branch. This happens when you check out a specific commit by SHA. It's not dangerous if you understand it, but it's a strange place to be if you stumble into it by accident.

---

## The three trees

This is the concept that makes everything else make sense. Git manages three distinct states of your files at all times:

| Tree | What it is | How you update it |
|------|-----------|-------------------|
| **Working directory** | The actual files on disk - what you see in your editor | Edit files normally |
| **Staging area (Index)** | A proposed snapshot-in-progress | `git add` |
| **HEAD** | The last committed snapshot | `git commit` |

Think of it as three layers:

```
Working directory  →  Staging area  →  HEAD (repository)
   (edit files)       (git add)          (git commit)
```

And you can move data backwards too:

```
HEAD  →  Staging area  →  Working directory
       (git restore --staged)  (git restore)
```

**Why does the staging area exist?** Because your work is rarely clean. You might fix three unrelated things in one afternoon. The staging area lets you compose exactly the right snapshot before you commit - include the lines you want, exclude the debug logging you added temporarily. One commit per logical change, even if your working directory is a mess.

> **Reference:** Pro Git §1.3 "The Three States" - [https://git-scm.com/book/en/v2/Getting-Started-What-is-Git%3F](https://git-scm.com/book/en/v2/Getting-Started-What-is-Git%3F)

---

## init, add, commit: the basic loop

```bash
git init                    # create a new empty repository in the current directory
git add README.md           # move README.md from working dir into staging area
git add .                   # stage everything in the current directory
git commit -m "first pass"  # snapshot the staging area, create a commit
```

`git add` doesn't mean "add this file to the project forever." It means "add the current state of this file to the next snapshot I'm about to take." If you modify the file again after running `git add`, you need to run `git add` again - the staging area doesn't track the file dynamically.

Two commands for seeing what's going on:

```bash
git status           # which files are modified, staged, untracked
git diff             # what changed in working directory vs staging area
git diff --staged    # what changed in staging area vs last commit
```

`git diff --staged` (sometimes written `--cached`) is the one people forget. Before you commit, run it. It shows you exactly what's going into the snapshot.

### .gitignore

Some files should never be in the repository: compiled binaries, editor swap files, `.env` files with secrets, `node_modules`. A `.gitignore` file tells git to pretend these don't exist.

```
*.log           # all log files
build/          # the entire build directory
.env            # local secrets - never commit these
```

Pattern rules: lines starting with `#` are comments, `*` is a wildcard, `/` at the end means directory, `!` negates a rule. The file goes in your repository and is committed like any other file, so your whole team gets the same ignore rules.

> **Reference:** Pro Git §2.2 "Recording Changes to the Repository" - [https://git-scm.com/book/en/v2/Git-Basics-Recording-Changes-to-the-Repository](https://git-scm.com/book/en/v2/Git-Basics-Recording-Changes-to-the-Repository)

---

## Branches: cheap, private, and disposable

> "Here's the secret to not being scared of git: branches are cheap, and
> branches are private until you push."
> - Sage, Mission 3

A **branch is a movable pointer to a commit** - nothing more. Creating one is just writing a 41-byte file (the SHA of the commit it points to, plus a newline). Instantaneous. Free.

```bash
git branch feature/intake-form     # create a branch pointing at current commit
git switch feature/intake-form     # move HEAD to that branch
# or in one step:
git switch -c feature/intake-form
```

When you make a new commit on the branch, the pointer moves forward:

```
main     → C3
feature  → C4 → (parent: C3)
```

When you `git switch main`, git updates your working directory to match the snapshot that `main` points to. Files change. The feature work is not gone - it's still in the commit graph, just not visible in your working tree right now.

> "Want to try something risky? Make a branch. Hate it? Delete the branch.
> The main line of work never noticed."

You can run `git log --oneline --graph --all` to see the full commit graph across all branches. This command is your map.

> **Reference:** Pro Git §3.1 "Branches in a Nutshell" - [https://git-scm.com/book/en/v2/Git-Branching-Branches-in-a-Nutshell](https://git-scm.com/book/en/v2/Git-Branching-Branches-in-a-Nutshell)

---

## Merge: bringing branches back together

You've done work on a feature branch. It's time to bring it into `main`. That's `git merge`.

### Fast-forward merge

The simplest case: `main` hasn't moved since you branched off.

```
main     → C2
feature  → C3 → C4
```

There's no divergent work to reconcile. Git just moves `main` forward to `C4`:

```
main     → C4
feature  → C4
```

```bash
git switch main
git merge feature/intake-form
# output: Fast-forward
```

No merge commit. History stays linear.

### Three-way merge

The harder case: `main` has moved on while you were working on your branch. Both lines of work have commits the other doesn't have.

```
      C3 ─── C4   (main)
     /
C2
     \
      C5 ─── C6   (feature)
```

Git can't just move a pointer. It has to combine the work. It looks at three snapshots:

1. The **common ancestor** (C2 - where the branches diverged)
2. The **tip of `main`** (C4)
3. The **tip of `feature`** (C6)

Git computes what changed from C2→C4 and from C2→C6, then applies both sets of changes to produce a new snapshot. That snapshot becomes a **merge commit** (C7) with two parents:

```
      C3 ─── C4 ───── C7   (main, HEAD)
     /                /
C2                   /
     \              /
      C5 ─── C6 ───
```

```bash
git switch main
git merge feature/intake-form
# output: Merge made by the 'recursive' strategy.
```

> **Reference:** Pro Git §3.2 "Basic Branching and Merging" - [https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging](https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging)

---

## Remotes: the distributed model

Everything above happens entirely on your machine. Git is a fully distributed version control system - each clone is a complete, independent repository with the full history. The "server" is just another repository you and your team have agreed to use as the coordination point.

### Cloning

```bash
git clone https://github.com/cosmos-corp/systems.git
```

This creates a local copy of the remote repository, downloads the full history, and sets up a remote named `origin` pointing at the URL. It also sets up your local `main` branch to track `origin/main`.

### Fetch vs pull

```bash
git fetch origin     # download new commits from remote; do NOT touch working tree
git pull             # fetch + merge in one step
```

`git fetch` is the safe one. It updates your *knowledge* of the remote (the `origin/main` pointer) without touching your files or your local branches. You can look at what came in before deciding what to do with it.

`git pull` is the convenient one. It's roughly `git fetch` followed by `git merge origin/main`. Fine when you know what you're doing.

### Push

```bash
git push origin main
```

This uploads your local commits to the remote. **It can be rejected.** If someone else pushed commits while you were working, the remote's history has diverged from yours. Git will tell you:

```
! [rejected]   main -> main (non-fast-forward)
```

This is not an error. It's git refusing to destroy someone else's work. The message means: *the remote has commits you don't have locally.* Fix it with the fetch-first workflow:

```bash
git fetch origin
git merge origin/main   # or: git rebase origin/main
git push origin main
```

Fetch their work, integrate it, then push the combined result.

### The tracking relationship

When you clone, `main` and `origin/main` start identical. Over time they drift as you commit locally and others push remotely. `git status` will tell you if you're ahead, behind, or both:

```
Your branch is behind 'origin/main' by 3 commits, and can be fast-forwarded.
```

> **Reference:** Pro Git §2.5 "Working with Remotes" - [https://git-scm.com/book/en/v2/Git-Basics-Working-with-Remotes](https://git-scm.com/book/en/v2/Git-Basics-Working-with-Remotes)

---

## Conflicts: the moment people panic (don't)

Conflicts happen when git's three-way merge can't automatically combine two changes - specifically when two commits modify **the same region of the same file** in incompatible ways.

> "The first conflict you ever resolve is the scariest. After this,
> they're annoying but boring."
> - Sage, Mission 6

When a conflict occurs, git marks the file like this:

```
<<<<<<< HEAD
Captain Q joined the crew.
=======
Storm joined the crew.
>>>>>>> feature/new-pilot
```

- Everything between `<<<<<<< HEAD` and `=======` is what your current branch has.
- Everything between `=======` and `>>>>>>> feature/new-pilot` is what the incoming branch has.

To resolve: **edit the file to the result you want**, then remove all three marker lines. Git doesn't care how you do it - keep one version, keep both, write something new entirely. You are the one who knows what the right answer is.

After editing:

```bash
git add manifest.txt    # mark this conflict as resolved
git commit              # complete the merge commit
```

`git status` is your friend during a conflict. It shows which files are unresolved. `git merge --abort` throws the whole merge away and returns you to where you were before you typed `git merge`.

> **Reference:** Pro Git §3.2 "Basic Branching and Merging - Basic Merge Conflicts" - [https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging](https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging)

---

## Rebase: replaying commits onto a new base

`git merge` preserves history exactly as it happened - parallel lines of work, merge commits and all. `git rebase` rewrites history to tell a cleaner story.

Here's what rebase does:

1. Finds the common ancestor between your branch and the target branch.
2. Extracts the changes introduced by each of your commits (as patches).
3. Temporarily sets your branch to match the target.
4. Replays your commits on top, one by one, creating *new* commits with new SHAs.

```
Before rebase:
      C3 ─── C4   (main)
     /
C2
     \
      C5 ─── C6   (feature)

After: git rebase main  (from feature branch)
      C3 ─── C4   (main)
               \
                C5' ─── C6'   (feature)
```

C5 and C6 are gone. C5' and C6' are new commits with the same *changes* but different SHAs and parents. The history now looks linear - as if you had started your feature after C4 all along.

The practical benefit: when you open a pull request after rebasing, reviewers see a clean set of commits that apply directly onto the current `main` without a tangle of merge commits.

### Interactive rebase

```bash
git rebase -i HEAD~3    # rewrite the last 3 commits interactively
```

This opens an editor showing one line per commit. You can:

- `pick` - keep the commit as-is
- `squash` - meld this commit into the previous one
- `reword` - change the commit message
- `drop` - delete this commit entirely

This is how you turn three `wip`, `more wip`, `fix typo` commits into one clean `Add onboarding flow` before sharing your branch.

### The golden rule

> **Do not rebase commits that exist outside your local repository and that
> people may have based work on.**

Rebase creates new commits with new SHAs. If you rebase and force-push a branch that teammates have already pulled, their local history diverges from the new remote history. Git will see the old commits and the new commits as different things, producing a confusing tangle when they next pull.

Safe: rebase your local feature branch before you push it the first time.

Unsafe: rebase commits already pushed to a shared branch, unless you've coordinated with your entire team.

> **Reference:** Pro Git §3.6 "Rebasing" - [https://git-scm.com/book/en/v2/Git-Branching-Rebasing](https://git-scm.com/book/en/v2/Git-Branching-Rebasing)

---

## Undoing things: reset, revert, restore

Three commands. Three distinct undo strategies. The naming is unfortunate - they're all different operations that happen to sound similar.

Ask yourself: **what do I want to undo, and where does that undo need to live?**

| What you want to undo | Command | What it touches |
|----------------------|---------|-----------------|
| A file edit in working tree | `git restore <file>` | Working directory only |
| A staged `git add` | `git restore --staged <file>` | Staging area only |
| A commit, keeping the changes | `git reset --soft HEAD~1` | HEAD pointer only |
| A commit, unstaging everything | `git reset HEAD~1` | HEAD + staging area |
| A commit, discarding everything | `git reset --hard HEAD~1` | HEAD + staging + working dir |
| A commit already pushed | `git revert <SHA>` | Adds a new "undo" commit |

### restore

Discards working directory edits for a file. Irreversible - the changes are gone, not staged, not committed, just gone. Use it when you've made a mess of a file and want the last committed version back.

```bash
git restore notes.md
```

### reset

Moves the branch pointer and optionally updates the staging area and working directory.

- `--soft`: moves the branch pointer only. Your changes land back in the staging area.
- `--mixed` (default): moves the pointer and clears the staging area. Your changes land in the working directory as unstaged edits.
- `--hard`: moves the pointer, clears staging, and discards working directory changes. **This one loses data.**

```bash
git reset --soft HEAD~1    # undo commit, keep changes staged
git reset HEAD~1           # undo commit, keep changes in working dir
git reset --hard HEAD~1    # undo commit and discard all changes
```

> `git reflog` is your safety net if you panic after a `--hard` reset.
> It records every place HEAD has pointed recently. You can usually recover.

### revert

`git revert` is the safe undo for commits that have already been pushed. It **does not rewrite history**. Instead, it looks at what a commit changed and creates a new commit that does the opposite.

```bash
git revert abc1234    # creates a new "Revert ..." commit
```

The original bad commit stays in the history. This is intentional - it gives teammates a clear record that something was reversed and why. Use `revert` for public branches, `reset` only for local work.

> **Reference:** Pro Git §7.7 "Reset Demystified" - [https://git-scm.com/book/en/v2/Git-Tools-Reset-Demystified](https://git-scm.com/book/en/v2/Git-Tools-Reset-Demystified)

> **Reference:** Git reference - git-reset, git-revert, git-restore - [https://git-scm.com/docs](https://git-scm.com/docs)

---

## The PR flow: how teams work

Pull requests are not a git feature - they're a collaboration layer built on top of git by platforms like GitHub. But the underlying mechanics are pure git.

The standard loop at most teams:

```
1. Create a branch off main
2. Commit your work on that branch
3. Push the branch to the remote (git push -u origin feature/my-thing)
4. Open a pull request on GitHub - this is just a way to say "I'd like to
   merge my branch into main; please review it"
5. Teammates review; you push more commits to address feedback
6. Someone approves and merges (git merge or git rebase + merge on the server)
7. Delete the branch - it's been absorbed into main
```

The `-u` flag on the first push (`git push -u origin feature/my-thing`) sets up the tracking relationship. After that, `git push` and `git pull` on that branch know where to go without you specifying.

If the review takes a while and `main` moves on, you have two options before merging:

- `git merge main` (while on your feature branch) - pulls main's changes into your branch.
- `git rebase main` - replays your commits on top of current main, giving reviewers a clean diff.

Either works. Teams tend to standardize on one.

> "No surprises. You've done every individual step before. Just chain them."
> - Sage, Mission 9

> **Reference:** Pro Git §5.2 "Contributing to a Project" - [https://git-scm.com/book/en/v2/Distributed-Git-Contributing-to-a-Project](https://git-scm.com/book/en/v2/Distributed-Git-Contributing-to-a-Project)

---

## Common pitfalls

**"I can't push and I don't know why."** Almost always a non-fast-forward rejection. Run `git fetch`, then `git log --oneline --graph --all` to see what the remote has that you don't. Merge or rebase, then push.

**"I merged into the wrong branch."** Use `git revert` on the merge commit if it's been pushed. If it hasn't, `git reset --hard HEAD~1` rewinds to before the merge.

**"I committed to main instead of my feature branch."** `git reset --soft HEAD~1` puts the changes back in staging, then `git switch -c feature/the-right-branch` and commit there.

**"I forgot to add a file to the last commit."** Stage the file, then `git commit --amend`. This rewrites the last commit - only do this if you haven't pushed it yet.

**"I'm in detached HEAD state."** You've checked out a commit directly. Create a branch to save your work: `git switch -c rescue-branch`. Then you're back to normal.

---

## How this connects to the missions

Each mission this chapter practices one concept in isolation, then the chapter's final mission chains them all together.

| Mission | Core concept |
|---------|-------------|
| 01 init-add-commit | The basic loop: working dir → staging → HEAD |
| 02 diff-and-gitignore | Reading the three trees; excluding files |
| 03 branches | Branches as pointers; switching and the working tree |
| 04 merge-fast-forward | Linear and divergent merges; when each applies |
| 05 remotes-and-clone | Distributed model; fetch vs pull; push rejection |
| 06 conflicts | Why they happen; markers; resolving by hand |
| 07 rebase | Replaying commits; interactive squash; the golden rule |
| 08 reset-revert-restore | Three undo strategies; which to use when |
| 09 pr-flow | The full professional loop end to end |

The theory here is the foundation. The missions are the reps. Do enough reps and the commands stop feeling like incantations and start feeling like obvious consequences of the model.

---

## Further reading - official docs

These are the sources this course is grounded in. When you want to go deeper on any topic, start here.

- **Pro Git, §1.3 - What is Git? (Snapshot model, SHA, three states)**
  https://git-scm.com/book/en/v2/Getting-Started-What-is-Git%3F

- **Pro Git, §2.2 - Recording Changes (add, commit, diff, .gitignore)**
  https://git-scm.com/book/en/v2/Git-Basics-Recording-Changes-to-the-Repository

- **Pro Git, §2.5 - Working with Remotes (clone, fetch, pull, push)**
  https://git-scm.com/book/en/v2/Git-Basics-Working-with-Remotes

- **Pro Git, §3.1 - Branches in a Nutshell (commit objects, HEAD, branch pointers)**
  https://git-scm.com/book/en/v2/Git-Branching-Branches-in-a-Nutshell

- **Pro Git, §3.2 - Basic Branching and Merging (fast-forward, 3-way merge, conflicts)**
  https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging

- **Pro Git, §3.6 - Rebasing (rebase mechanics, interactive rebase, golden rule)**
  https://git-scm.com/book/en/v2/Git-Branching-Rebasing

- **Pro Git, §5.2 - Contributing to a Project (PR/collaboration flow, fetch-first)**
  https://git-scm.com/book/en/v2/Distributed-Git-Contributing-to-a-Project

- **Pro Git, §7.7 - Reset Demystified (the three trees, reset --soft/mixed/hard)**
  https://git-scm.com/book/en/v2/Git-Tools-Reset-Demystified

- **Git reference manual (all commands)**
  https://git-scm.com/docs
