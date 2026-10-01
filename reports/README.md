# Generated reports

Run `npm run security:report` to generate a normalized JSON report and a
human-readable Markdown report under `reports/generated/`. Static scanner
reports are read from `reports/raw/`. Both generated directories are ignored
by Git and should be retained as CI artifacts rather than committed.

The report masks secret values and distinguishes missing scan evidence from
zero findings. The Task #11 dependency counts are historical advisory matches,
not verified exploitable vulnerabilities; they stay visible until a current,
advisory-specific re-audit closes them.
