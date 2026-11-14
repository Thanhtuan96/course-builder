# studio-background-service Specification

## Purpose

Lets Professor Studio run unattended on macOS: it starts at login from a LaunchAgent, always answers
on the same loopback URL and pairing URL, and the learner can check whether it runs, stop it, or turn
auto-start off again.

## Requirements

### Requirement: Auto-start installs a macOS LaunchAgent

`skillforce studio --autostart on` SHALL write `~/Library/LaunchAgents/com.ronin-skillforce.studio.plist`
and load it for the current user with `launchctl bootstrap gui/<uid>`. The plist SHALL set
`RunAtLoad` to true, `KeepAlive` to restart only on an unsuccessful exit, and both `StandardOutPath`
and `StandardErrorPath` to `${PROFESSOR_HOME:-~/.professor}/logs/studio.log`. The log directory SHALL
exist before the agent is loaded.

#### Scenario: First install writes and loads the agent

- **WHEN** a learner runs `skillforce studio --autostart on` on macOS and the ports are free
- **THEN** a plist exists at `~/Library/LaunchAgents/com.ronin-skillforce.studio.plist` with label
  `com.ronin-skillforce.studio`, `RunAtLoad` true, `KeepAlive` set to restart only on an unsuccessful
  exit, and stdout and stderr pointing at `<PROFESSOR_HOME>/logs/studio.log`
- **AND** `launchctl bootstrap gui/<uid> <plist>` is called once with that plist path

#### Scenario: Installing again replaces the existing agent

- **WHEN** a learner runs `--autostart on` while the agent is already installed
- **THEN** the plist is rewritten with the current settings and another `bootstrap` is attempted only
  after the previous registration is removed
- **AND** the command succeeds instead of failing with "already bootstrapped"

#### Scenario: The agent runs the installed Node and CLI directly

- **WHEN** the plist is written
- **THEN** its `ProgramArguments` are the absolute path of the running Node executable, the absolute
  path of the installed `bin/cli.js`, and the arguments `studio --no-open --strict-port --port <port>
  --api-port <apiPort>`
- **AND** no argument contains `npx`

#### Scenario: The learner's home is honoured

- **WHEN** `PROFESSOR_HOME` is set to a non-default directory
- **THEN** the log paths in the plist, the log directory and the state file all live under that
  directory, and the plist passes the same `PROFESSOR_HOME` to the agent

### Requirement: Auto-start removal leaves no LaunchAgent

`skillforce studio --autostart off` SHALL unload the agent with `launchctl bootout gui/<uid>/<label>`
and delete the plist. It SHALL be safe to run when nothing is installed.

#### Scenario: Turning auto-start off

- **WHEN** a learner runs `--autostart off` while the agent is installed
- **THEN** `launchctl bootout gui/<uid>/com.ronin-skillforce.studio` is called
- **AND** the plist no longer exists

#### Scenario: Turning auto-start off when it was never on

- **WHEN** a learner runs `--autostart off` and no plist exists
- **THEN** the command reports that auto-start was already off and exits successfully
- **AND** no error is shown for the missing agent

### Requirement: Auto-start is refused on non-macOS platforms

On any platform other than macOS, `--autostart on|off` SHALL print that auto-start is only supported
on macOS yet, exit 1, and write nothing.

#### Scenario: Linux or Windows learner tries auto-start

- **WHEN** `skillforce studio --autostart on` runs with `process.platform` not `darwin`
- **THEN** the output says auto-start is not supported on this platform yet
- **AND** the exit code is 1 and no plist, log directory or state file is written

### Requirement: Auto-start requires a stable install path

Auto-start SHALL refuse to install when the CLI entry point is not a usable absolute path or lives in
an npx cache (a path containing `/_npx/`), and SHALL tell the learner to install globally with
`npm i -g ronin-skillforce`.

#### Scenario: Refusing an npx cache path

- **WHEN** `--autostart on` runs from a CLI entry point such as
  `~/.npm/_npx/abc123/node_modules/ronin-skillforce/bin/cli.js`
- **THEN** the command exits 1 with a message that names the npx cache as the reason and asks for
  `npm i -g ronin-skillforce`
- **AND** no plist is written and no `launchctl` command runs

#### Scenario: Accepting a global install

- **WHEN** `--autostart on` runs from a global install path such as
  `/usr/local/lib/node_modules/ronin-skillforce/bin/cli.js`
- **THEN** the plist is written and loaded

### Requirement: LaunchAgent ports are fixed at install time

`--autostart on` SHALL resolve the Studio port and the bridge port once, from `--port` / `--api-port`
when given and from the defaults otherwise, and write the resolved values into the plist. It SHALL
fail, without writing anything, when a chosen port is busy at that moment, and name the flag to use
for picking a free port instead of silently moving.

#### Scenario: Pinning the defaults

- **WHEN** `--autostart on` runs with no port flags and both default ports are free
- **THEN** the plist pins the Studio port and the bridge port to their default values

#### Scenario: Pinning explicit ports

- **WHEN** `--autostart on` runs with `--port 5190 --api-port 3005` and both ports are free
- **THEN** the plist pins `5190` and `3005`

#### Scenario: A busy port at install time fails with a hint

- **WHEN** `--autostart on` runs and a port it would pin is already in use on loopback
- **THEN** the command exits 1 with a message naming the busy port and the `--port` / `--api-port`
  flag to choose a free one
- **AND** no plist is written and the agent is not loaded

### Requirement: A pinned port never moves at login

`skillforce studio --strict-port` SHALL never auto-pick another port. When a requested port is busy,
including a default port that would otherwise fall back to the next free one, the run SHALL fail and
print the reason, so the URL and pairing URL from the agent stay unchanged.

#### Scenario: Strict mode refuses to auto-pick

- **WHEN** `skillforce studio --strict-port` starts and the default Studio port is busy
- **THEN** the command fails with a message naming the busy port and exits non-zero
- **AND** no other port is chosen and no server is started

#### Scenario: Strict mode starts normally when ports are free

- **WHEN** `skillforce studio --strict-port --no-open` starts and both ports are free
- **THEN** Studio starts on exactly those ports

#### Scenario: Foreground behaviour is unchanged without the flag

- **WHEN** `skillforce studio` starts with a busy default port and no `--strict-port`
- **THEN** it still moves to the next free port with a notice, as before

### Requirement: The running Studio records its state

A `studio` run started in the background SHALL write `${PROFESSOR_HOME:-~/.professor}/studio.json`
containing the pid, both ports, the studio URL, the bridge URL and `startedAt` once the server is
healthy, and SHALL remove it on a clean exit.

#### Scenario: State file appears after a healthy start

- **WHEN** `skillforce studio --no-open` becomes healthy
- **THEN** `${PROFESSOR_HOME}/studio.json` contains that process's pid, the Studio and bridge ports,
  the `http://127.0.0.1:` URLs and a start timestamp

#### Scenario: State file is removed on a clean exit

- **WHEN** the running Studio stops through `--stop` or Ctrl+C
- **THEN** the state file no longer exists

### Requirement: `--status` reports Studio state without starting anything

`skillforce studio --status` SHALL print whether Studio is running, the Studio URL, the pairing URL,
the autostart state and the log path, and SHALL NOT start a server or install anything. A run counts
as running only when the recorded pid is alive and the bridge answers the Studio health check on
`127.0.0.1`. The pairing token SHALL appear only inside the pairing URL; any other line SHALL show it
masked.

#### Scenario: Status while Studio runs

- **WHEN** `--status` runs while the pid from the state file is alive and the health check succeeds
- **THEN** the output reports Studio as running with its pid and Studio URL, the pairing URL, the
  autostart state (`on` or `off`) and the log path

#### Scenario: Status when nothing runs

- **WHEN** `--status` runs and there is no state file or the recorded pid is gone
- **THEN** the output reports Studio as not running, still shows the autostart state and log path,
  and exits without starting anything

#### Scenario: Status with a stale state file

- **WHEN** `--status` runs, the recorded pid is alive but the Studio health check does not answer
- **THEN** the output says the server is not answering and does not claim Studio is running

### Requirement: `--stop` stops only a Studio process

`skillforce studio --stop` SHALL stop Studio with
`launchctl kill SIGTERM gui/<uid>/com.ronin-skillforce.studio` when autostart is on, and otherwise
SIGTERM the pid recorded in the state file. Before signalling a pid it SHALL verify the process
command line contains `cli.js` and `studio`; a pid that fails that check SHALL NOT be signalled.

#### Scenario: Stopping with auto-start on

- **WHEN** `--stop` runs while the LaunchAgent is installed
- **THEN** `launchctl kill SIGTERM gui/<uid>/com.ronin-skillforce.studio` is called and the command
  reports Studio as stopped

#### Scenario: Stopping a manually started Studio

- **WHEN** `--stop` runs without a LaunchAgent and the state file records a live Studio pid
- **THEN** that pid receives SIGTERM and the state file is removed

#### Scenario: Refusing a foreign pid

- **WHEN** the pid in the state file belongs to a process whose command line is not a Studio CLI
  invocation
- **THEN** the command reports that it will not stop that process, exits 1, and sends no signal

#### Scenario: Stopping when nothing runs

- **WHEN** `--stop` runs and no Studio process is recorded
- **THEN** the command reports that Studio is not running and exits successfully

### Requirement: System calls are shell-free and testable

Every `launchctl`, `ps` and signal call SHALL run through argument arrays without a shell, and the
autostart and stop paths SHALL accept injected implementations so tests never load a real LaunchAgent
or signal a real process.

#### Scenario: Tests run without touching launchd

- **WHEN** the autostart and stop functions are called with injected `execFile`-style and signal
  implementations
- **THEN** only the injected implementations are used and no real `launchctl`, `ps` or `kill` runs
