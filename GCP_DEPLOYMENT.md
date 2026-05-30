# Actual Budget GCP Deployment Guide

This document outlines the deployment configuration for hosting this custom version of Actual Budget on Google Cloud Platform (GCP).

## Infrastructure Overview

- **Google Cloud Project ID:** `budget-497306`
- **Region:** `us-central1`
- **Container Registry:** Artifact Registry Docker repository (`actual-server-repo`)
- **Compute Service:** Google Cloud Run (`actual-vanilla-service`)
- **Storage / Database Volume:** Google Cloud Storage bucket (`actual-vanilla-data-vault` mounted to `/data` in the container for SQLite database persistence)

---

## How the Custom Code is Built and Deployed

Because Actual Budget uses a Yarn monorepo structure, local Docker building is resource-intensive. Instead, we use **Google Cloud Build** to compile the container remotely on GCP, and then update Google Cloud Run.

### Step 1: Ignore File Optimization

To ensure the build context uploaded to GCP is minimal (and doesn't include local `node_modules` or local build artifacts), we use `.gcloudignore`:

```
.gcloudignore
.git
.gitignore
**/node_modules/
.lage/
.yarn/cache/
```

### Step 2: Build and Deploy the Container

We run a remote Docker build and deployment using Cloud Build config (`cloudbuild.yaml`). This config uses a high-performance build machine (`E2_HIGHCPU_8`) for fast compilation, builds the image, tags it, and updates Cloud Run.

We use a custom substitution variable `_TAG` which defaults to `latest` (allowing manual builds to run without parameters) but can be set to the Git commit SHA when triggered:

```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args:
      [
        'build',
        '--network=cloudbuild',
        '-t',
        'us-central1-docker.pkg.dev/budget-497306/actual-server-repo/actual-server:${_TAG}',
        '-t',
        'us-central1-docker.pkg.dev/budget-497306/actual-server-repo/actual-server:latest',
        '-f',
        'sync-server.Dockerfile',
        '.',
      ]

  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: 'gcloud'
    args:
      [
        'run',
        'deploy',
        'actual-vanilla-service',
        '--image',
        'us-central1-docker.pkg.dev/budget-497306/actual-server-repo/actual-server:${_TAG}',
        '--region',
        'us-central1',
      ]

images:
  - 'us-central1-docker.pkg.dev/budget-497306/actual-server-repo/actual-server:${_TAG}'
  - 'us-central1-docker.pkg.dev/budget-497306/actual-server-repo/actual-server:latest'

substitutions:
  _TAG: 'latest'

options:
  machineType: 'E2_HIGHCPU_8'
```

Run manual build & deploy command:

```bash
gcloud builds submit --config cloudbuild.yaml .
```

> [!NOTE]
> **Important Build Fix implemented in `bin/package-browser`:**
> When packaging the browser, Actual Budget pulls translations into `packages/desktop-client/locale` via git. This nested `.git` repository causes the `lage` task runner/hasher to crash inside Cloud Build. We resolved this by cloning with `--depth=1` and immediately stripping the `.git` folder from the locale directory in `bin/package-browser` before `lage` executes.

---

## Automatically Deploying on Git Uploads (Pushes)

Adding automatic deployment is highly recommended and straightforward. Below are the two primary approaches:

### Option A: GCP Cloud Build Triggers (Recommended)

This approach connects your GitHub/GitLab repository directly to Google Cloud Build. It requires no credential management (passwords/keys) in Github.

1. **Trigger Configuration:**
   - Go to **Cloud Build > Triggers** in GCP Console.
   - Click **Create Trigger**.
   - Connect your GitHub Repository.
   - Set **Event** to `Push to a branch` and specify `^master$`.
   - Set **Configuration** to `Cloud Build configuration file (yaml or json)` and path to `cloudbuild.yaml`.
   - Under **Advanced > Substitution variables**, click **Add Variable**:
     - **Variable**: `_TAG`
     - **Value**: `$(COMMIT_SHA)` (This overrides the default `latest` with the actual git commit SHA on each trigger execution).
   - Click **Create**.

2. **Grant IAM Permissions:**
   The Cloud Build service account (`864094563036@cloudbuild.gserviceaccount.com`) needs the following IAM roles:
   - **Cloud Run Admin** (`roles/run.admin`) on the project.
   - **Service Account User** (`roles/iam.serviceAccountUser`) on the project (or on the Cloud Run runtime service account `864094563036-compute@developer.gserviceaccount.com`) to deploy to Cloud Run.

---

### Option B: GitHub Actions Workflow

If you prefer to manage the pipeline within GitHub Actions, you can create a workflow in `.github/workflows/gcp-deploy.yml`:

```yaml
name: Deploy to Google Cloud Run

on:
  push:
    branches:
      - master

env:
  PROJECT_ID: budget-497306
  REGION: us-central1
  SERVICE_NAME: actual-vanilla-service
  REPO_NAME: actual-server-repo
  IMAGE_NAME: actual-server

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }} # Set up a Service Account key secret in GitHub

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Trigger Cloud Build & Deploy
        run: |
          gcloud builds submit --config cloudbuild.yaml .
          gcloud run deploy ${{ env.SERVICE_NAME }} \
            --image ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPO_NAME }}/${{ env.IMAGE_NAME }}:latest \
            --region ${{ env.REGION }}
```
