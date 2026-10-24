# Aggregating beta reports

## Run it

From the repository root, with the folder that holds the exports:

```
node scripts/beta-aggregate.mjs <reports-dir>
```

For a machine-readable document instead of a table:

```
node scripts/beta-aggregate.mjs <reports-dir> --json > summary.json
```

To list everyone who was recruited, including people who never exported:

```
node scripts/beta-aggregate.mjs <reports-dir> --roster roster.json
```

## Inputs

Exports are named `professor-beta-report-<participantId>-d<day>.json`; the name is a convenience, the
participant id inside the file is what identifies the row. Put the exports directly in the folder:
subfolders are ignored. Every candidate file is validated against the frozen report schema, and an
invalid file is listed with a reason instead of stopping the run.

The roster is optional. It may be a JSON array of participant ids, or a plain newline or comma list
of ids. A participant with no export is shown as `unknown` rather than dropped; if the roster file
sits inside the reports folder it is not scanned as a report. When the same participant exported
twice, the export with the later day offset is kept and the dropped file is named in a warning.

## Columns

| Column | Meaning |
|---|---|
| participant | Participant id from the report, or from the roster for a missing export |
| day | `generatedAtDayOffset` of the kept export |
| activated | Whether the participant activated |
| activeDays | Number of distinct local days with activity in the window |
| loops | Total practice loops across all kinds |
| revisions | Revision links as `quiz/tutor/ws/cap` |
| w1 | Week-1 active flag |
| w2 | Week-2 return flag |
| w2Days | Number of week-2 days with a meaningful action |
| capSub | Capstone submissions |
| capEvidence | Pieces of capstone external evidence |
| verdict | Capstone verdict |

Any cell the report cannot supply is printed as `unknown`.

## Exit codes

- `0` — every discovered report is valid.
- `1` — an invalid report was found, the directory is missing or empty, or the command was used wrongly.

## Doing the arithmetic

The output is raw counts only — no percentages and no rates. Do the arithmetic against
[THRESHOLDS.md](THRESHOLDS.md).
