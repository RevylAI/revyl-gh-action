# Create a JavaScript Action

[![GitHub Super-Linter](https://github.com/actions/javascript-action/actions/workflows/linter.yml/badge.svg)](https://github.com/super-linter/super-linter)
![CI](https://github.com/actions/javascript-action/actions/workflows/ci.yml/badge.svg)

Use this template to bootstrap the creation of a JavaScript action. :rocket:

This template includes compilation support, tests, a validation workflow,
publishing, and versioning guidance.

If you are new, there's also a simpler introduction in the
[Hello world JavaScript action repository](https://github.com/actions/hello-world-javascript-action).

## Create Your Own Action

To create your own action, you can use this repository as a template! Just
follow the below instructions:

1. Click the **Use this template** button at the top of the repository
1. Select **Create a new repository**
1. Select an owner and name for your new repository
1. Click **Create repository**
1. Clone your new repository

> [!IMPORTANT]
>
> Make sure to remove or update the [`CODEOWNERS`](./CODEOWNERS) file! For
> details on how to use this file, see
> [About code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners).

## Initial Setup

After you've cloned the repository to your local machine or codespace, you'll
need to perform some initial setup steps before you can develop your action.

> [!NOTE]
>
> You'll need to have a reasonably modern version of
> [Node.js](https://nodejs.org) handy. If you are using a version manager like
> [`nodenv`](https://github.com/nodenv/nodenv) or
> [`nvm`](https://github.com/nvm-sh/nvm), you can run `nodenv install` in the
> root of your repository to install the version specified in
> [`package.json`](./package.json). Otherwise, 20.x or later should work!

1. :hammer_and_wrench: Install the dependencies

   ```bash
   npm install
   ```

1. :building_construction: Package the JavaScript for distribution

   ```bash
   npm run bundle
   ```

1. :white_check_mark: Run the tests

   ```bash
   $ npm test

   PASS  ./index.test.js
     ✓ throws invalid number (3ms)
     ✓ wait 500 ms (504ms)
     ✓ test runs (95ms)

   ...
   ```

## Update the Action Metadata

The [`action.yml`](action.yml) file defines metadata about your action, such as
input(s) and output(s). For details about this file, see
[Metadata syntax for GitHub Actions](https://docs.github.com/en/actions/creating-actions/metadata-syntax-for-github-actions).

When you copy this repository, update `action.yml` with the name, description,
inputs, and outputs for your action.

## Update the Action Code

The [`src/`](./src/) directory is the heart of your action! This contains the
source code that will be run when your action is invoked. You can replace the
contents of this directory with your own code.

There are a few things to keep in mind when writing your action code:

- Most GitHub Actions toolkit and CI/CD operations are processed asynchronously.
  In `main.js`, you will see that the action is run in an `async` function.

  ```javascript
  const core = require('@actions/core')
  //...

  async function run() {
    try {
      //...
    } catch (error) {
      core.setFailed(error.message)
    }
  }
  ```

  For more information about the GitHub Actions toolkit, see the
  [documentation](https://github.com/actions/toolkit/blob/master/README.md).

So, what are you waiting for? Go ahead and start customizing your action!

1. Create a new branch

   ```bash
   git checkout -b releases/v1
   ```

1. Replace the contents of `src/` with your action code
1. Add tests to `__tests__/` for your source code
1. Format, test, and build the action

   ```bash
   npm run all
   ```

   > [!WARNING]
   >
   > This step is important! It will run [`ncc`](https://github.com/vercel/ncc)
   > to build the final JavaScript action code with all dependencies included.
   > If you do not run this step, your action will not work correctly when it is
   > used in a workflow. This step also includes the `--license` option for
   > `ncc`, which will create a license file for all of the production node
   > modules used in your project.

1. Commit your changes

   ```bash
   git add .
   git commit -m "My first action is ready!"
   ```

1. Push them to your repository

   ```bash
   git push -u origin releases/v1
   ```

1. Create a pull request and get feedback on your action
1. Merge the pull request into the `main` branch

Your action is now published! :rocket:

For information about versioning your action, see
[Versioning](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md)
in the GitHub Actions toolkit.

## Validate the Action

You can now validate the action by referencing it in a workflow file. For
example, [`ci.yml`](./.github/workflows/ci.yml) demonstrates how to reference an
action in the same repository.

```yaml
steps:
  - name: Checkout
    id: checkout
    uses: actions/checkout@v3

  - name: Test Local Action
    id: test-action
    uses: ./
    with:
      milliseconds: 1000

  - name: Print Output
    id: output
    run: echo "${{ steps.test-action.outputs.time }}"
```

For example workflow runs, check out the
[Actions tab](https://github.com/actions/javascript-action/actions)! :rocket:

# CogniSim GitHub Actions

This repository contains GitHub Actions for integrating with the CogniSim
platform.

## Available Actions

### 1. Run Test Action (`actions/run-test`)

Run CogniSim tests or workflows from your GitHub workflows.

**Setup:**

1. Create a Revyl API key on the settings page
2. Add the following to your workflow file:

```yaml
- uses: actions/checkout@v3
  with:
    fetch-depth: 0

- name: Run tests using CogniSim
  uses: RevylAI/revyl-gh-action/actions/run-test@v1
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
  with:
    test-id: <test-id>
```

### 2. Upload Build Action (`actions/upload-build`)

Upload build artifacts to the CogniSim build system. Supports both direct file
uploads and Expo URL ingestion.

**Features:**

- Upload APK, IPA, ZIP files directly from CI/CD
- Download and upload builds from Expo URLs
- Automatic package ID extraction
- Custom metadata support

**Example Usage:**

```yaml
# Upload from file
- name: Upload Build
  uses: RevylAI/revyl-gh-action/actions/upload-build@v1
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
  with:
    build-var-id: 'your-build-variable-id'
    version: '1.0.0'
    file-path: './dist/app.apk'
    metadata: '{"build_number": "123"}'

# Upload from Expo URL
- name: Upload Expo Build
  uses: RevylAI/revyl-gh-action/actions/upload-build@v1
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
  with:
    build-var-id: 'your-build-variable-id'
    version: '1.0.0'
    expo-url: 'https://expo.dev/artifacts/eas/...'
    expo-headers: '{"Authorization": "Bearer ${{ secrets.EXPO_TOKEN }}"}'
```

For detailed documentation, see the individual action README files:

- [Run Test Action README](./actions/run-test/README.md)
- [Upload Build Action README](./actions/upload-build/README.md)

## Getting Started

1. Get your Revyl API key from the CogniSim settings page
2. Add it as a secret named `REVYL_API_KEY` in your GitHub repository
3. Use the actions in your workflows as shown in the examples above

## Development

Each action is self-contained with its own dependencies and build process. To
develop or modify an action:

```bash
cd actions/[action-name]
npm install
npm test
npm run package
```
