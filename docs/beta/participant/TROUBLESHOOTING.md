# Troubleshooting

## Before you start: bridge and pairing token

Studio prints a pairing token when you start it with the `studio` command. The browser needs that
token to talk to the local bridge, so copy it from the terminal into the pairing screen. If the
browser says the token is wrong, restart Studio and paste the freshly printed token; a token from an
earlier run is not reused.

## Studio will not start or the port is taken

Only one Studio instance can hold the default port. If a second instance fails to start, stop the
first one, or start the new one with a different port and open that address instead. Check the
terminal output for the address Studio actually bound before assuming the browser is at fault.

## What the local runner can and may not do

The local runner executes commands in a scratch directory of its own. It does not install packages
and it does not reach the network. If a command needs a dependency, install it yourself in your
project first; if a command needs the internet, run it in your own terminal.

## Exporting a beta report

Open Studio, go to Settings, and choose Export beta report. Studio writes a local JSON file named
`professor-beta-report-<participantId>-d<day>.json`. Send that file by hand; it is not uploaded
anywhere. Export on Day 7 and again on Day 14.

## When to ask for help

Send the terminal output, the Studio version and the step you were on. Do not try a workaround that
loosens a safety setting. Never widen the allowed browser origins and never disable the agent's permission prompts to make something work. Ask for help instead.
