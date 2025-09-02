### Run Revyl workflow locally with act

- Use the existing workflow at `./.github/workflows/revyl-workflow-act.yml`.
- Provide `REVYL_API_KEY` as a secret and pass your workflow id.

```bash
# From repo root
# Create secrets.env file with your API key
echo "REVYL_API_KEY=YOUR_API_KEY" > secrets.env

# Run with act using the secret file
act workflow_dispatch -W .github/workflows/revyl-workflow-act.yml \
  --secret-file secrets.env \
  --input workflow_id=6e53b753-6031-4ce4-9ff1-88963c267329
```

#### Reference workflow (already added)

```yaml
name: Revyl Workflow (act)

on:
  workflow_dispatch:
    inputs:
      workflow_id:
        description: 'Revyl workflow id'
        required: true
        default: '6e53b753-6031-4ce4-9ff1-88963c267329'

jobs:
  run:
    runs-on: ubuntu-latest
    env:
      REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Build run-test action (ensure up-to-date dist)
        run: |
          cd run-test
          npm ci
          npm run package

      - name: Execute Revyl workflow
        id: revyl
        uses: ./run-workflow
        with:
          workflow-id: ${{ inputs.workflow_id }}
          timeout: '3600'

      - name: Output results
        run: |
          echo "Task ID: ${{ steps.revyl.outputs.task_id }}"
          echo "Success: ${{ steps.revyl.outputs.success }}"
          echo "Totals: ${{ steps.revyl.outputs.completed_tests }}/${{ steps.revyl.outputs.total_tests }}"
```


