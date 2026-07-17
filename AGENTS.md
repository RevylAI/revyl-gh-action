> **`AGENTS.md` Instruction Precedence (DO NOT EDIT)**
>
> Hierarchical and additive - apply this file plus all parent `AGENTS.md` files up to repo root. Most specific wins on conflict.
>
> **Chain:** `revyl-gh-action/AGENTS.md` _(this file)_ > `AGENTS.md` _(root)_

---

# `revyl-gh-action/` Guide For AI Contributors

`revyl-gh-action/` owns GitHub Actions for running Revyl tests/workflows and uploading builds.

---

# `revyl-gh-action/` Guidance & Rules

The rules below are binding for this directory and every subdirectory beneath it. All agents operating in this scope must follow them, subject to the instruction precedence above.

## GitHub Action Rules

### Action Contracts

- **[STRICT]** Action contract changes must update source, metadata, tests, and docs/examples. The owning sync workflow builds the distribution bundles and commits them to the standalone action repository; do not hand-edit generated bundles.
- **[STRICT]** Preserve deprecated aliases and output fields until intentionally removed with a migration plan.
- **[GUIDELINE]** Keep execution CLI-first and preserve output parsing tests for action entrypoints.

### Validation

- **[GUIDELINE]** Validate the touched metadata, runtime, sync/build, output, and documentation contract surfaces.
