# Chapter 1: The Terminal - Theory & Mental Models

*by Sage*

---

Let me tell you something that took me longer to admit than it should have: the terminal is not hard. It just looks hard, because the first time you see a blinking cursor in a black window with no menu, no hints, nothing, your brain goes "this was designed by people who hate me." It wasn't. It was designed by people who wanted composability more than they wanted comfort. Once you understand the three or four ideas underneath everything, it clicks. This course is those ideas.

The missions will give you the reps. This is the theory that makes the reps stick.

---

## The Shell: A Program That Runs Programs

The single most clarifying thing you can learn about the terminal is this: **bash is just a program**. Not magic, not the operating system itself - a program, like any other, that happens to read commands and execute them.

Its full name is the Bourne-Again SHell - a historical in-joke that does not matter right now. What matters is what it does: it runs a loop. Bash reads a line from you, parses it, executes it, prints the result, and waits for the next line. That loop has a name: **REPL** - Read, Evaluate, Print, Loop. Every interactive shell session you ever open is an instance of that loop running until you type `exit`.

```
$ echo "hello, cosmos"
hello, cosmos
$
```

The `$` is bash's prompt - its way of saying "I finished the last thing; what's next?" Some prompts show your username and current directory; the exact format is configurable and varies by machine. The content is always the same: *your turn*.

Bash also runs in **non-interactive mode** - this is what happens when you run a shell script. No prompts, no waiting. It reads commands from the file, runs them top to bottom, and exits. Same interpreter, different mode.

> **Gotcha:** When bash starts, it reads one or more configuration files - `.bashrc`, `.bash_profile`, etc. - depending on how you launched it. Aliases and environment variables you set in those files are available interactively. They are *not* automatically available to scripts unless you source them explicitly. This trips everyone up eventually.

---

## The Filesystem Tree

The second fundamental idea: **everything is a file in a tree**.

The Linux filesystem starts at `/` - the root. Every file and directory on the system lives somewhere under that root, forming one giant inverted tree. There are no drive letters, no separate "volumes" in normal operation - everything hangs off `/`.

```
/
├── bin/        (executable programs)
├── etc/        (configuration files)
├── home/
│   └── daymari/    (your home directory)
│       ├── work/
│       └── .bashrc
├── tmp/        (temporary files)
└── var/
    └── log/    (log files - you'll be here a lot)
```

Every shell session has a **working directory** - the folder it is "inside" right now. Commands that take file arguments interpret them relative to this location unless you tell them otherwise.

**Absolute paths** start with `/` and describe the full location from the root:
```
/home/daymari/work/orders.csv
```

**Relative paths** start from wherever you are right now:
```
work/orders.csv      # from /home/daymari
../work/orders.csv   # from /home/daymari/other
```

Three shorthand symbols you will use constantly:
- `.` - the current directory
- `..` - the parent directory
- `~` - your home directory (`/home/yourusername` on Linux, `/Users/yourusername` on macOS)

```bash
cd ~          # go home
cd ..         # go up one level
cd ../sibling # go up, then into sibling/
ls .          # list current directory (same as plain ls)
```

> **Gotcha:** `cd` with no arguments takes you home. `cd -` takes you back to wherever you were before. That second one is genuinely useful when you jump to `/var/log` to check something and then want to get back.

---

## Reading, Listing, and Manipulating Files

### Listing: ls

`ls` lists directory contents. Most of the work in a terminal session starts here: you get somewhere and then look around.

The plain `ls` lists filenames. The useful `ls` is `ls -la`:

```
$ ls -la ~/work
total 24
drwxr-xr-x  3 daymari staff  96 Jun 15 09:12 .
drwxr-xr-x 18 daymari staff 576 Jun 15 09:10 ..
-rw-r--r--  1 daymari staff 412 Jun 15 09:11 orders.csv
-rw-r--r--  1 daymari staff 892 Jun 15 09:12 app.log
drwxr-xr-x  2 daymari staff  64 Jun 15 09:10 archive
```

The columns, left to right: **permissions**, **number of hard links**, **owner**, **group**, **size in bytes**, **last modified**, **name**. We will talk about permissions in a dedicated section. The flags:

- `-l` - long format (the columns above)
- `-a` - show hidden files (entries starting with `.`)
- `-h` - human-readable sizes (`4.2K` instead of `4312`)
- `-t` - sort by modification time, newest first
- `-R` - recursive: list subdirectories too

### Reading files: cat, head, tail, less

**`cat`** (short for concatenate) reads a file and dumps it to your screen. It was designed to *concatenate* multiple files together, but it doubles as the quickest way to read a short file:

```bash
cat app.log
cat file1.txt file2.txt   # concatenate both to stdout
```

For long files, `cat` floods your terminal. Use these instead:

**`head -n 20 app.log`** - first 20 lines. Without `-n`, defaults to 10. For any file you've just received and have no idea about, `head` is your first instinct.

**`tail -n 50 app.log`** - last 50 lines. The critical flag is `-f` (follow): `tail -f app.log` streams new lines as they are written. Reading log files is 80% of the job; `tail -f` is how you read a live log.

**`less`** - a pager. Opens the file interactively. Arrow keys or `j`/`k` to scroll, `q` to quit, `/pattern` to search forward. For anything longer than a screenful, `less` beats `cat`.

### Manipulating files: cp, mv, rm, mkdir

```bash
mkdir reports             # create a directory
mkdir -p a/b/c            # create the whole path, no error if it exists

cp orders.csv backup/     # copy file into directory
cp -r src/ dst/           # copy directory recursively

mv orders.csv archive/    # move (also used for rename)
mv old-name.txt new-name.txt

rm stale.log              # delete file (no undo - gone)
rm -r old-dir/            # delete directory and everything inside
```

> **Gotcha:** `rm` has no trash. There is no undo. The file is gone. `rm -rf /` would erase the entire filesystem - which is why modern systems have guards against it, but the principle remains: treat `rm -r` like you are handling live wires. Verify the path first. A useful habit: `ls` the thing you are about to delete before deleting it.

---

## Standard Streams, Redirection, and Pipes

This is the idea that makes the Unix terminal what it is. Everything else is syntax; this is philosophy.

### The three streams

Every process that runs on a Unix system gets three channels by default:

| Name | Short | File descriptor | Default |
|------|-------|----------------|---------|
| Standard input | stdin | 0 | keyboard |
| Standard output | stdout | 1 | terminal screen |
| Standard error | stderr | 2 | terminal screen |

When you run `grep error app.log`, grep reads from `app.log` (overriding stdin) and writes matches to stdout, which your terminal displays. If it hits a problem - say, the file doesn't exist - it writes the error message to stderr, which *also* goes to your terminal by default, but through a separate channel.

The reason for the separation: it lets you redirect normal output without losing error messages. You will be grateful for this during your first 2 AM outage.

### Redirection

You can point these streams somewhere other than the screen or keyboard:

```bash
ls -l > listing.txt      # stdout → file (overwrite)
ls -l >> listing.txt     # stdout → file (append)
grep ERROR app.log 2> errors.txt   # stderr → file
grep ERROR app.log > out.txt 2>&1  # both stdout and stderr → same file
wc -l < listing.txt      # stdin ← file
```

The `2>&1` deserves a moment: it means "redirect file descriptor 2 (stderr) to wherever file descriptor 1 (stdout) currently points." The order matters: `> out.txt 2>&1` works; `2>&1 > out.txt` does not do what you think.

### Pipes: the composability engine

A **pipe** (`|`) connects the stdout of one command directly to the stdin of the next. No temporary file, no copying - the kernel manages a buffer between the two processes, which run concurrently.

```bash
ls /etc | head -3
cat app.log | grep ERROR | wc -l
ps aux | grep python | grep -v grep
```

The Unix design philosophy behind pipes: build small programs that do one thing well, and compose them. `grep` doesn't count lines - `wc` does. `ls` doesn't filter - `grep` does. String them together and you get powerful one-liners from simple pieces.

```bash
# How many distinct IP addresses hit our server today?
grep "GET" access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head -10
```

Each command does one job. The pipe is the glue.

> **Gotcha:** A pipe only carries stdout. If a command writes errors to stderr, those will *not* pass through the pipe - they will appear in your terminal while the pipe carries normal output to the next command. Add `2>&1` before the pipe if you need errors to travel with the data: `command 2>&1 | next-command`.

---

## Searching: Globs vs Regex, find vs grep

Two different things are often confused here: **glob patterns** and **regular expressions**. They look similar and serve related purposes, but they operate at different levels.

### Glob patterns - the shell's own wildcard

Globs are expanded by the *shell itself*, before any command sees its arguments:

- `*` - any sequence of characters (excluding `/`)
- `?` - any single character
- `[abc]` - any one of the listed characters

```bash
ls *.log          # shell expands to: ls app.log error.log access.log
rm archive/*.csv
cp config.[0-9]* backup/
```

The shell expands the glob and passes the resulting file list to the command. The command never sees the `*`. This is why `echo *.log` works without any special tools - bash expands it.

> **Gotcha:** If no files match a glob pattern, the default behavior in bash is to pass the literal string to the command (so `ls *.xyz` when no `.xyz` files exist will error with "cannot access '*.xyz'"). Set `nullglob` if you want an empty match instead.

### Regular expressions - grep's pattern language

Regex is a more powerful pattern language used *inside* commands to match text. The key mental model: globs are for *filenames in the shell*, regex is for *content inside files* (or text generally).

```bash
grep "ERROR" app.log          # literal match
grep "ERR[OAU]R" app.log      # character class
grep "^2024" app.log          # ^ anchors to start of line
grep "timeout$" app.log       # $ anchors to end of line
grep -E "ERR(OR|OR2)" app.log # -E for extended regex (alternation)
grep -i "error" app.log       # -i for case-insensitive
grep -n "ERROR" app.log       # -n prints line numbers
grep -r "secret" ./config/    # -r searches directory recursively
grep -v "DEBUG" app.log       # -v inverts: show lines that DON'T match
grep -l "ERROR" *.log         # -l lists only filenames that match
grep -c "ERROR" app.log       # -c counts matching lines
```

Grep supports two regex dialects by default. Basic Regular Expressions (BRE) require backslash-escaping metacharacters like `+`, `?`, `|`. Extended Regular Expressions (ERE, via `-E`) use them unescaped. Use `-E` when your pattern has alternation (`|`) or grouping - it's cleaner.

### find - navigating by metadata

Where `grep` searches *inside* files, `find` searches *for* files by their attributes: name, type, size, modification time.

```bash
find . -name "*.log"                  # files ending in .log, anywhere below .
find /etc -type f -name "*.conf"      # regular files (not dirs) named *.conf
find . -type d -name "archive"        # directories named "archive"
find . -mtime -7                      # modified in the last 7 days
find . -size +10M                     # larger than 10 megabytes
find . -name "*.tmp" -delete          # find and delete in one step
find . -name "*.log" -exec wc -l {} \;  # run wc -l on each match
```

The `{}` in `-exec` is a placeholder for the matched file. The `\;` terminates the command.

> **Gotcha:** `find -exec cmd {} \;` runs the command once per file. `find -exec cmd {} +` groups all matches and passes them to the command at once - much faster for large result sets. The `+` form is preferred when the command accepts multiple arguments.

---

## Processes and the Permission Model

### What a process is

A **process** is a running instance of a program. When you run `grep ERROR app.log`, the kernel creates a process: allocates memory, loads the binary, assigns it a unique **Process ID (PID)**, and starts execution. When the command finishes, the process dies and the PID is freed.

`ps` shows you what's running:

```bash
ps aux      # all processes, user-oriented format
ps -ef      # all processes, full-format (POSIX)
ps -p 1234  # just PID 1234
```

The `aux` output:

```
USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
daymari   1432  0.0  0.1  12312  2048 pts/0    S    09:10   0:00 bash
daymari   2011  0.2  0.4  88432 12480 ?        Sl   09:15   0:02 python3 monitor.py
```

The `STAT` column tells you the state: `R` (running), `S` (sleeping, waiting for input or a timer), `Z` (zombie - finished but not yet collected by its parent), `T` (stopped). Most processes you see will be `S` - waiting for something.

To end a process:

```bash
kill 2011          # send SIGTERM (polite: "please stop")
kill -9 2011       # send SIGKILL (forceful: process cannot ignore this)
pkill python3      # kill by name instead of PID
```

`SIGTERM` gives the process a chance to clean up. `SIGKILL` cannot be caught or ignored - the kernel terminates the process immediately. Use SIGTERM first; reach for `-9` only when the process is truly stuck.

### The Unix permission model

Every file on the system has an owner, a group, and a set of permission bits for three categories of users: the **owner** (u), the **group** (g), and **everyone else** (o).

```
-rwxr-xr-- 1 daymari devops 4096 Jun 15 09:12 deploy.sh
```

Breaking down the permissions string `-rwxr-xr--`:
- First character: file type (`-` for regular file, `d` for directory, `l` for symlink)
- Next three: **owner** permissions - `rwx` (read, write, execute)
- Next three: **group** permissions - `r-x` (read, no write, execute)
- Last three: **other** permissions - `r--` (read only)

**`chmod`** changes these bits. Two notations:

Symbolic:
```bash
chmod +x deploy.sh          # add execute for all (u, g, o)
chmod u+x deploy.sh         # add execute for owner only
chmod g-w sensitive.conf    # remove write from group
chmod o= private.key        # remove all permissions from others
```

Octal: each permission is a number (r=4, w=2, x=1), summed per category:
```bash
chmod 755 deploy.sh     # rwxr-xr-x  - owner: rwx, group+other: r-x
chmod 644 config.yaml   # rw-r--r--  - owner: rw, others: r only
chmod 600 private.key   # rw-------  - owner: rw, nobody else can touch it
```

The octal shorthand is fast once it's in muscle memory. `755` for executables and directories. `644` for regular config files. `600` for private keys.

> **Gotcha:** For a directory, the `x` bit means something different: *permission to enter it* (traverse it). A directory with `r` but not `x` lets you list its contents but not `cd` into it or read files inside. A directory with `x` but not `r` lets you access files by exact name if you know them, but not list the contents. Both bits together is what you almost always want.

---

## Making the Shell Yours: Environment, Aliases, and Scripts

### Environment variables

Every process runs inside an **environment** - a collection of key-value pairs it inherits from its parent. The shell is no different. Print your current environment:

```bash
env           # print all environment variables
printenv PATH # print just one
echo $PATH    # same, using shell expansion
```

Set a variable for the current shell session:
```bash
MY_VAR=hello
echo $MY_VAR   # hello
```

**Export** it to make it available to child processes (programs you run from this shell):
```bash
export MY_VAR=hello
export DATABASE_URL="postgres://localhost/mydb"
```

An unexported variable stays local to the shell. If you set `MY_VAR=hello` without `export` and then run a Python script that reads `os.environ['MY_VAR']`, it will not find it.

### PATH: where bash looks for programs

`PATH` is the most important environment variable. It is a colon-separated list of directories where bash looks for executables when you type a command name:

```bash
echo $PATH
# /usr/local/bin:/usr/bin:/bin:/home/daymari/bin
```

When you type `python3`, bash walks this list left to right and runs the first `python3` it finds. If you install a tool into a directory that is not in `PATH`, bash cannot find it and you get "command not found."

Adding a directory to PATH:
```bash
export PATH="$HOME/bin:$PATH"   # prepend ~/bin so it's checked first
```

### Aliases

An **alias** is a shorthand that the shell expands before executing:

```bash
alias ll='ls -la'
alias gs='git status'
alias k='kubectl'
```

After defining these, typing `ll` runs `ls -la`. Aliases defined at the command line last only for the session. Put them in `~/.bashrc` to make them permanent.

> **Gotcha:** Aliases are expanded by bash, not by the programs you pipe to. `sudo ll` will not work - `sudo` runs programs, not bash aliases. The workaround: `alias sudo='sudo '` (trailing space) tells bash to also alias-expand the next word after `sudo`.

### Shell scripts

A shell script is a text file containing bash commands, run as a program. The minimal script:

```bash
#!/bin/bash
echo "Cosmos Corp deploy starting..."
```

The first line - `#!/bin/bash` - is the **shebang**. The kernel reads it and knows which interpreter to use for this file. Without it, behavior depends on the calling shell and is inconsistent.

To run a script, it must be executable:

```bash
chmod +x deploy.sh
./deploy.sh
```

The `./` prefix tells the shell to look in the current directory. If you just type `deploy.sh`, bash searches `PATH` and will not find it there.

A few concepts that scale from this minimal script to any bash script you'll ever read:

- **Variables**: `NAME="Daymari"` then `echo "Hello, $NAME"`
- **Exit codes**: every command exits with a number; `0` means success, non-zero means failure. `$?` holds the last exit code.
- **Conditionals**: `if [ $? -eq 0 ]; then echo "OK"; else echo "FAILED"; fi`
- **Loops**: `for file in *.log; do wc -l "$file"; done`

Scripts let you turn a sequence of commands you run repeatedly into something you can name, share, and version-control. That progression - manual command → alias → function → script - is the natural arc of automation work.

---

## Common Pitfalls

A short list of things that will bite you sooner rather than later:

**Spaces in file names.** The shell uses whitespace to split arguments. `rm my file.txt` tries to remove two files: `my` and `file.txt`. Quote paths with spaces: `rm "my file.txt"` or `rm my\ file.txt`.

**`>` overwrites without warning.** `ls > output.txt` replaces `output.txt` completely if it exists. Use `>>` to append, or check `noclobber` (`set -o noclobber`) to make bash refuse to overwrite with `>`.

**`rm -rf` is irreversible.** There is no recycle bin. The file is unlinked from the filesystem immediately. Verify the path before running. A typo in the path is a bad day.

**stderr is invisible to pipes.** Errors print to your terminal, not to the next command in the pipe. This is correct behavior, but it surprises newcomers.

**Exit codes matter.** Most automation scripts check whether commands succeeded. If your script runs `cp source dest` and the copy fails silently (you didn't check `$?`), the next step will operate on stale data and you will debug in the wrong place. The habit: `set -e` at the top of scripts to make them exit on the first failure.

---

## How This Connects to the Missions

The seven missions in this chapter are the hands-on side of everything above. They follow the same arc as this course:

- **Mission 1 (first-steps)** - the working directory and the filesystem tree: `pwd`, `ls`, `cd`.
- **Mission 2 (reading-files)** - stdin/stdout and the file-reading tools: `cat`, `head`, `tail`, `less`.
- **Mission 3 (manipulating-files)** - `cp`, `mv`, `rm`, `mkdir`; building real structure.
- **Mission 4 (pipes-redirection)** - the composability engine: `|`, `>`, `>>`, `<`.
- **Mission 5 (search)** - `grep` for content, `find` for files; globs vs regex.
- **Mission 6 (processes-permissions)** - `ps`, `kill`, `chmod`; who's running, who's allowed.
- **Mission 7 (env-aliases-scripts)** - `export`, `alias`, the shebang, making the shell yours.

Each mission gives you one controlled scenario to apply one cluster of ideas. Do them in order - they layer deliberately.

The mental model to carry through all of it: **the shell is a composable toolkit, not a monolith**. You are not supposed to memorize every flag. You are supposed to learn the pattern: small tools, clear inputs and outputs, connected by pipes and redirects. Once that clicks, any tool you encounter is learnable in five minutes of reading the man page.

---

## Further Reading - Official Docs

The sources this course was verified against. Bookmark the first two; you will return to them.

- **GNU Bash Reference Manual** - the authoritative reference for everything bash: syntax, pipelines, redirection, expansion, aliases, scripts, startup files.
  https://www.gnu.org/software/bash/manual/bash.html

- **GNU Coreutils Manual** - documents `ls`, `cat`, `head`, `tail`, `cp`, `mv`, `rm`, `mkdir`, `chmod`, `env`, `printenv`, and dozens of other standard tools.
  https://www.gnu.org/software/coreutils/manual/coreutils.html

- **grep(1) man page** - complete reference for grep flags, regex syntax, BRE vs ERE, and performance caveats.
  https://man7.org/linux/man-pages/man1/grep.1.html

- **find(1) man page** - full reference for predicates, operators, `-exec` vs `-execdir`, symlink handling.
  https://man7.org/linux/man-pages/man1/find.1.html

- **pipe(7) man page** - the kernel-level explanation of how pipes work: the buffer, blocking behavior, PIPE_BUF atomicity.
  https://man7.org/linux/man-pages/man7/pipe.7.html

- **ps(1) man page** - process states, output columns, `aux` vs `-ef` format differences.
  https://man7.org/linux/man-pages/man1/ps.1.html

- **chmod(1) man page** - symbolic and octal notation, directory permission semantics, the symlink caveat.
  https://man7.org/linux/man-pages/man1/chmod.1.html

- **ls(1) man page** - all flags, long-format column meanings.
  https://man7.org/linux/man-pages/man1/ls.1.html

- **cat(1) man page** - flags, concatenation model.
  https://man7.org/linux/man-pages/man1/cat.1.html
