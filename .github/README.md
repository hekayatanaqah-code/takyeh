# GitHub repository settings

## Required iPhone calendar check

The `main` branch protection rule must require this exact status check:

```text
WebKit iPhone calendar
```

The check is produced by the `webkit-iphone-calendar` job in
`workflows/iphone-calendar-release-gate.yml`. Keep the job's `name` unchanged
unless the required status check in GitHub branch protection is updated in the
same change.

Configure the `main` branch rule with:

- Require status checks to pass before merging.
- Require branches to be up to date before merging.
- Add `WebKit iPhone calendar` as a required status check.

With required status checks enabled, GitHub blocks merging while this check is
failed, pending, or missing.