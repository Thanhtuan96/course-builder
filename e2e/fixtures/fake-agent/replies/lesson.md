# Your first Bash script

## Objectives

You will be able to run a bash script, read its exit code, and make it signal success.

## Explanation

A script is a file that the shell executes line by line. The exit code is how a script tells the
outside world whether it succeeded: `0` means success, anything else means failure.

## Worked example

A one-line script that prints a message:

```bash
echo "hello"
```

The `echo` builtin writes the text and the script exits with the previous command's status.

## Exercise

Open the workspace and run the script once to see the failing exit code. Then replace the failing
line so the script prints the completion message and exits successfully.

```bash
#!/usr/bin/env bash
# Replace the echo line below so the script prints the completion message.
echo "TODO: finish the exercise"
exit 1
```

Run the script with the Run button. A green `exit 0` badge means the script succeeded.

## Check yourself

1. What does exit code `0` mean?
2. What does a non-zero exit code tell the caller?
3. Why is `echo` useful in a first script?
