# Run Revyl Workflow Locally With act

- Use the existing workflow at `revyl-gh-action/.github/workflows/revyl-workflow-act.yml`.
- Provide `REVYL_API_KEY` as a secret and pass your workflow id.
- This path uses the action default `cli-version: latest`, so it validates the
  latest released Revyl CLI, not an unreleased local branch build.
- Keep `secrets.env` local-only. Never commit API keys.

```bash
# From the monorepo root
cd revyl-gh-action
# Create secrets.env file with your API key
echo "REVYL_API_KEY=YOUR_API_KEY" > secrets.env

# Run with act using the secret file
act workflow_dispatch -W .github/workflows/revyl-workflow-act.yml \
  --secret-file secrets.env \
  --input workflow_id=6e53b753-6031-4ce4-9ff1-88963c267329
```
