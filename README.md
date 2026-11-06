# AWS Three-Tier Job Application Tracker

**Author:** Kelechi Ogboi, BSc Computer Science, MSc Applied Data Science<br>
**Stack:** React · Express/Node.js · PostgreSQL · Docker · Terraform · GitHub Actions<br>
**AWS:** CloudFront · S3 · Application Load Balancer · ECS Fargate · ECR · RDS · Secrets Manager · CloudWatch

[![Deploy job tracker](https://github.com/kelechiogboi2018/aws-three-tier-job-tracker/actions/workflows/deploy.yml/badge.svg)](https://github.com/kelechiogboi2018/aws-three-tier-job-tracker/actions)

[Source repository](https://github.com/kelechiogboi2018/aws-three-tier-job-tracker) · [Pipeline](https://github.com/kelechiogboi2018/aws-three-tier-job-tracker/actions) · [Recorded demo endpoint](https://d2b63iw46aiv4u.cloudfront.net)

> **Portfolio lab:** deployment and read/write tests were verified from the project screenshots. The demo may be removed to save costs. This is a shared demonstration without user accounts; use fictional data. The documentation records the implemented architecture, not a claim of production readiness.

## Explore the project

- [Architecture](#architecture) and [SQL query flow](#sql-query-flow)
- [SDLC and tools](#sdlc-and-tools)
- [Implementation steps and reasons](#implementation-journey-what-we-did-and-why)
- [OIDC troubleshooting](#oidc-troubleshooting-root-cause-and-correction) and [YAML recovery](#yaml-and-workflow-recovery-what-failed-and-why)
- [Testing evidence](#testing-evidence)

## Problem and objective

Job applications are easy to lose track of across notes and spreadsheets. This application stores company names, job titles, application status, and dates in one interface. The engineering objective was to take a working local three-tier application through repeatable AWS provisioning and automated delivery, while preserving database records during backend replacement.

The implemented features are **create and list applications**. The interface defaults new records to `Applied`; editing, deleting, authentication, and per-user ownership are not implemented.

## Verified outcome

- Built and ran frontend, API, and PostgreSQL with Docker Compose locally.
- Provisioned the network, backend, private database, and frontend hosting with Terraform.
- Ran a one-off Fargate task to initialise the RDS schema; it stopped with exit code `0`.
- Verified `/ready` returned `status: ok` and `database: connected` through the ALB.
- Verified API writes and reads against RDS.
- Deployed both tiers using GitHub Actions with short-lived AWS credentials obtained through OIDC.
- Confirmed the CloudFront website displayed the original three AWS records plus a newly saved fourth record after automated deployment.

Source reviewed at commit **`6538abb`** (`Restore working workflow and add frontend deployment`). AWS account state was not re-queried while preparing this document.

## Architecture

![AWS architecture](docs/aws-architecture.png)

[Open the scalable SVG](docs/aws-architecture.svg)

### How a browser request travels

1. The browser connects to CloudFront using HTTPS.
2. CloudFront's default behaviour reads static React build files from a private S3 bucket using Origin Access Control (OAC). HTTP viewers are redirected to HTTPS.
3. Requests matching `/api/*` go to the ALB. This behaviour requires HTTPS from the viewer, disables API caching, and forwards request information using `Managed-AllViewerExceptHostHeader`.
4. CloudFront connects to the ALB over **HTTP port 80** in this lab. The ALB forwards to the backend task over **HTTP port 3000**.
5. The backend connects to private RDS PostgreSQL over **TLS on port 5432**. Certificate verification stays enabled, with the AWS RDS CA bundle loaded by Node.js.
6. The API returns records to the browser through the same CloudFront hostname. Relative `/api/applications` requests avoid a separate browser API origin.

S3, ECR, Secrets Manager, and CloudWatch are AWS regional services, not resources placed inside the application's VPC subnets. CloudFront is a global edge service.

### Network and capacity

| Component | Configuration | Reason |
|---|---|---|
| Region | `eu-west-2` (London) | Consistent region for deployment and ECR authentication |
| VPC | `10.30.0.0/16` | Isolated address space for the project |
| Public subnet A | `10.30.1.0/24`, `eu-west-2a` | ALB and eligible Fargate placement |
| Public subnet B | `10.30.2.0/24`, `eu-west-2b` | ALB and alternate Fargate placement |
| Database subnet A | `10.30.11.0/24`, `eu-west-2a` | Private RDS subnet group member |
| Database subnet B | `10.30.12.0/24`, `eu-west-2b` | Second subnet group member |
| Public routing | `0.0.0.0/0` through the Internet Gateway | Enables internet access for public-subnet resources |
| Database routing | VPC-local connectivity; no explicit internet default route in Terraform | Keeps database connectivity private |
| ECS service | One Linux/X86_64 Fargate task; 0.25 vCPU and 512 MiB memory | Small lab footprint without managing EC2 hosts |
| Fargate networking | Public IP, inbound traffic restricted by security group | Avoids a NAT Gateway in this lab |
| RDS | PostgreSQL `17.11`, `db.t3.micro`, encrypted 20 GiB gp3, Single-AZ | Persistent managed database with a small lab footprint |

**Availability boundary:** the ALB and subnet design span two AZs, but there is only one steady-state backend task and one Single-AZ RDS instance. The task can run in either public subnet; neither the source nor the screenshots establish a permanent task AZ or the selected RDS AZ. This is not a fully highly available deployment.

### SQL query flow

The backend initiates a private PostgreSQL connection over TLS on port 5432. Query results return over the same connection before Express sends JSON to the browser.

![SQL query and response flow](docs/sql-query-flow.png)

[Editable SQL flow diagram](docs/sql-query-flow.svg)

### SDLC and tools

This diagram maps planning, development, validation, provisioning, OIDC authentication, delivery, operation and maintenance to the tools used. Teardown was planned; its completion is not established by the captured evidence.

![Project SDLC and tools](docs/project-sdlc.png)

[Editable SDLC diagram](docs/project-sdlc.svg) · [SDLC PDF](docs/project-sdlc.pdf)

## Implementation journey: what we did and why

| Step | Action taken | Why it mattered | Verification or result |
|---|---|---|---|
| 1 | Checked `docker --version`, `docker compose version`, and `docker ps` | Distinguished installed CLI tools from a running Docker engine | Docker eventually listed containers successfully after the initial engine connection issue |
| 2 | Created `backend`, `frontend`, and `database` folders | Separated application tiers and their build contexts | Independent Dockerfiles and database SQL |
| 3 | Built the Express API and `/health` route | Established a small, testable application process | Local `/health` returned `{"status":"ok"}` |
| 4 | Added the backend Dockerfile and built a container | Packaged runtime and application together | Missing-Dockerfile error corrected; backend became reachable locally |
| 5 | Created `.env` and expanded `.gitignore` | Kept local credentials and generated state out of source control | `git check-ignore .env` returned `.env` |
| 6 | Added PostgreSQL to Compose with a named volume and health check | Preserved records independently of the container; gated backend startup on database readiness | Database reported healthy |
| 7 | Mounted `database/init.sql` read-only for first database initialisation | Made the initial local schema repeatable | Interactive `psql` and `\dt` showed `applications` |
| 8 | Added a PostgreSQL connection pool, `/ready`, and create/list API routes | Checked database reachability and supplied application behaviour | `/ready` reported connected; GET and POST returned application data |
| 9 | Added input checks and parameterised inserts | Rejected missing/oversized company/title input and separated SQL values from SQL syntax | Implemented in source; negative-input test evidence was not captured |
| 10 | Built React and served it through Nginx | Created a browser interface and a local `/api/` proxy | Local UI saved and displayed records |
| 11 | Recreated the local database container | Tested whether the named volume retained data | Records remained available |
| 12 | Initialised Git and created a working local checkpoint | Preserved a known working version before AWS changes | Initial commit `7a33d49`; clean working tree |
| 13 | Checked Terraform, AWS CLI, caller identity, and region | Confirmed the tools and AWS identity before provisioning | CLI authentication worked in `eu-west-2` |
| 14 | Defined VPC, four subnets, public routes, and security groups | Built explicit connectivity between the tiers | Terraform formatted and validated successfully |
| 15 | Defined ECR and private RDS with an AWS-managed password | Stored images centrally and kept the password out of Terraform configuration | Checked orderable PostgreSQL versions; selected `17.11` |
| 16 | Added ALB, IP target group, `/ready` health check, execution role, logs, task definition, and ECS service | Provided task routing, deployment plumbing, secret injection, and operational visibility | Saved plan showed 32 resources to add |
| 17 | Initially held the ECS desired count at zero | Avoided attempting to start a task before its image existed | Saved plan inspection confirmed `desired_count = 0` |
| 18 | Downloaded the RDS CA bundle and copied it into the backend image | Allowed verified TLS to RDS instead of disabling certificate checks | Later `/ready` connected successfully on AWS |
| 19 | Saved and applied the initial Terraform plan | Reviewed concrete changes before provisioning | Apply completed: 32 added, 0 changed, 0 destroyed |
| 20 | Logged Docker in to ECR, built Linux/AMD64 image `v1`, and pushed it | Matched the Fargate X86_64 task architecture | Login retry through `cmd /c` resolved the observed login failure |
| 21 | Changed the ECS desired count from zero to one | Started the backend after its image was available | Counts progressed from pending to running; ALB `/ready` returned connected |
| 22 | Executed a temporary Fargate migration task using the service task definition and network settings | Created the RDS table without exposing PostgreSQL publicly | Task stopped with exit code `0` |
| 23 | Posted and retrieved an example application through the ALB | Tested actual database writes and reads, beyond connectivity alone | API returned record ID 1 |
| 24 | Added private S3 hosting, CloudFront, OAC, and an API cache behaviour | Served HTTPS static content and API calls through one hostname | Frontend plan/apply added five resources |
| 25 | Extracted built files from the frontend Docker image and uploaded them to S3 | Reused the tested frontend build without requiring local Node installation | CloudFront displayed the application and RDS-backed records |
| 26 | Saved the AWS configuration in Git and pushed to a new GitHub repository | Created a remote portfolio and collaboration history | Commit `1df81b8`, then repository files visible on GitHub |
| 27 | Reused the existing GitHub OIDC provider and checked its audience | Avoided duplicating an account-level provider | Audience contained `sts.amazonaws.com` |
| 28 | Created a dedicated GitHub deployment role with repository/main-branch trust and deployment permissions | Allowed short-lived role-based deployments without stored AWS keys | Role and inline policy added with Terraform |
| 29 | Tested OIDC and inspected only `sub` and `aud` after access was denied | Compared emitted claims against the actual trust conditions | Corrected immutable subject; authentication and caller identity passed |
| 30 | Set `ignore_changes = [task_definition]` on the ECS service and default task count to one | Let Actions own the deployed task revision while Terraform owns infrastructure | Validation passed after moving `lifecycle` to resource scope; plan showed no changes |
| 31 | Added automated backend build, ECR push, task registration, service update, and verification | Made each push produce a traceable release | Backend pipeline passed; checked active task revision after stability wait |
| 32 | Added frontend build, S3 upload, and CloudFront invalidation after the backend job | Automated the full application delivery path | Both jobs passed in workflow run #9 |
| 33 | Restored the working workflow and re-added the frontend job after YAML corruption | Recovered a known-good baseline without resetting repository history | Commit `6538abb`; both deployment jobs green |
| 34 | Opened the CloudFront site, checked earlier records, added another record, and refreshed | Confirmed browser/API/database operation and persistence across backend replacement | Four AWS records displayed; localhost was explicitly excluded as AWS evidence |

## Application and local development

### API contract

| Method | Path | Behaviour |
|---|---|---|
| GET | `/health` | Process health response |
| GET | `/ready` | Executes `SELECT 1`; returns 200 when connected and 503 on connection failure |
| GET | `/api/applications` | Lists records newest first |
| POST | `/api/applications` | Creates a record from `company` and `job_title`; returns 201 on success |

`/ready` checks connectivity, **not whether the schema exists**. Successful create/list calls were required to verify the table.

The `applications` table has an identity primary key, company/title length limits, default status/date/timestamp values, and a database check allowing `Applied`, `Interview`, `Offer`, `Rejected`, or `Withdrawn`.

### Run locally (PowerShell)

Prerequisites: Git, Docker Desktop with its Linux engine running, and Docker Compose. Terraform and AWS CLI are additionally needed for AWS provisioning. Run commands separately.

```powershell
git clone https://github.com/kelechiogboi2018/aws-three-tier-job-tracker.git
cd aws-three-tier-job-tracker
notepad .env
```

Put local-only values in `.env`, replacing the password placeholder:

```dotenv
POSTGRES_DB=jobtracker
POSTGRES_USER=jobtracker
POSTGRES_PASSWORD=REPLACE_WITH_A_LOCAL_PASSWORD
```

```powershell
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

Open `http://localhost:8080`. API checks use `http://localhost:3000/health` and `/ready`.

The local frontend is Nginx on port 80 mapped to loopback 8080; the API maps to loopback 3000. PostgreSQL is not published to a host port. The named `postgres_data` volume retains local records. The init script runs on a fresh PostgreSQL data directory, not every container restart.

```powershell
docker compose up -d --force-recreate database
docker compose down
```

The second command stops/removes the Compose containers and network while retaining the named volume. `docker compose down -v` deletes the volume and its local data.

## Terraform deployment and ownership

From the cloned repository root:

```powershell
cd infrastructure
terraform init
terraform fmt
terraform validate
aws sts get-caller-identity
aws configure get region
terraform plan "-var=backend_desired_count=0" "-out=deployment.tfplan"
terraform apply "deployment.tfplan"
```

**Fresh deployment sequencing:** the current source defaults to one task, so override the count to zero on a new environment until image `v1` is pushed. The commands above use the current full configuration, not the historical 32-resource snapshot. Then push the bootstrap image, start one task, initialise RDS, and upload/build the frontend. Existing global IAM role names and the reused OIDC provider must be checked before creating another copy in the same account.

Saved-plan apply executes the reviewed plan without another approval prompt. In this PowerShell session the whole `-out=...` argument was quoted to avoid the observed command-line parsing failure. Never commit plan files or state.

Terraform maintains infrastructure. Actions creates subsequent application task-definition revisions. The ECS service uses:

```hcl
lifecycle {
  ignore_changes = [task_definition]
}
```

This block is directly inside `aws_ecs_service.backend`. Terraform still defines the bootstrap task and its environment/secret settings; **changes to that bootstrap definition will not automatically move the service after `task_definition` is ignored**. The pipeline copies the current service task definition and replaces the image, so environment/secret/network changes need a deliberate coordinated rollout.

The final source filenames include `fronend.tf`, `github-action.tf`, and `github-permisions.tf`. Their spelling does not affect Terraform's loading of `.tf` files, but commands and links must use the actual filenames. Network security rules are in `network.tf`.

## RDS schema initialisation

Local Compose initialisation is not transferred to RDS. We ran SQL from `database/init.sql` in a **one-off Fargate task**, reusing the service's task definition, execution role, injected password, CA bundle, subnets, and security group.

The migration override ran `node -e` with `pg.Client`, verified TLS, decoded the SQL from a base64 environment variable, executed it, printed success, and closed the connection. The schema uses `CREATE TABLE IF NOT EXISTS`; that makes this initial create repeatable but does not provide versioned schema migrations.

The session-generated `migration-network.json` and `migration-overrides.json` are ignored by Git. They are not part of the published repository. A fresh deployment must regenerate them; the current CI/CD workflow does not initialise or migrate a new database.

```powershell
Get-Content ..\database\init.sql
```

After launching the task, we captured its ARN and checked:

```powershell
$migrationTaskArn = $migrationResult.tasks[0].taskArn
aws ecs describe-tasks --cluster job-tracker-cluster --tasks $migrationTaskArn --region eu-west-2 --query "tasks[0].{Status:lastStatus,Reason:stoppedReason,Containers:containers[].{Name:name,ExitCode:exitCode,Reason:reason}}" --output json --no-cli-pager
```

**Expected:** `STOPPED` and container exit code `0`. For this finite job, `Essential container in task exited` is normal when accompanied by exit code zero.

## CI/CD: delivery flow and reasons

Workflow: [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). It triggers on pushes to `main` or manual dispatch.

### Backend job

1. Check out the commit and assume `job-tracker-github-deploy` using OIDC.
2. Authenticate Docker to regional ECR using a short-lived login password.
3. Build `linux/amd64`; tag with `${GITHUB_SHA}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}`. Unique tags work with ECR tag immutability and identify the source and execution attempt.
4. Read the current ECS service task definition; preserve settings and change the `backend` image.
5. Remove API read-only metadata, register the new revision, and update the service.
6. Wait for stability and check that the service retained the newly deployed task ARN. Stability alone could otherwise hide a rollback to an older working revision.

The ECS deployment circuit breaker and rollback are configured. A successful deployment was observed; a deliberately broken deployment/rollback drill was not performed.

### Frontend job

1. Wait for `deploy-backend` using `needs`.
2. Check out the same source and obtain its own OIDC session.
3. Build the multi-stage frontend Docker image and extract `/usr/share/nginx/html`.
4. Upload files other than `index.html` with a one-year immutable cache policy; then upload `index.html` with `no-cache`.
5. Request a CloudFront invalidation for `/*`.

Uploading assets before HTML reduces missing-asset windows. Old files are retained because the workflow does not use `--delete`. Vite's hashed assets fit the immutable policy; the current copy also includes Nginx's default `50x.html`, which is not required for S3 hosting. The workflow requests invalidation but does not wait for completion or run a browser smoke test. Manual browser verification followed the green run.

Concurrency group `job-tracker-deployment` with `cancel-in-progress: false` prevents simultaneous deployments in the same group from interfering.

### Repository variables (not access keys)

Set under **Settings → Secrets and variables → Actions → Variables**.

| Variable | Value/source |
|---|---|
| `AWS_ROLE_ARN` | `terraform output -raw github_deploy_role_arn` |
| `AWS_REGION` | `eu-west-2` |
| `ECR_REPOSITORY` | `job-tracker-backend` |
| `FRONTEND_BUCKET` | `terraform output -raw frontend_bucket_name` |
| `CLOUDFRONT_DISTRIBUTION_ID` | `id` from `terraform state show aws_cloudfront_distribution.frontend` |

Account IDs, role ARNs, bucket names, and distribution IDs identify resources; they are not authentication secrets. No long-lived AWS access keys were added to GitHub for this workflow. Existing locally configured AWS CLI credentials were used to bootstrap Terraform.

## OIDC troubleshooting: root cause and correction

**Symptom:** `Not authorized to perform sts:AssumeRoleWithWebIdentity`.

We first confirmed the existing provider URL `token.actions.githubusercontent.com`, audience `sts.amazonaws.com`, and intended role ARN. The remaining issue was the exact subject condition.

The original policy expected the legacy name-only subject:

```text
repo:kelechiogboi2018/aws-three-tier-job-tracker:ref:refs/heads/main
```

The workflow actually emitted:

```text
repo:kelechiogboi2018@273621534/aws-three-tier-job-tracker@1436508377:ref:refs/heads/main
```

The repository uses immutable owner and repository IDs in its subject. We added a temporary diagnostic before AWS authentication which requested an OIDC token and printed only decoded `sub` and `aud` values. **The raw token and bearer credential were not printed.**

We updated the Terraform trust policy to use `StringEquals` for the exact subject and audience:

```hcl
Condition = {
  StringEquals = {
    "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
    "token.actions.githubusercontent.com:sub" = "repo:kelechiogboi2018@273621534/aws-three-tier-job-tracker@1436508377:ref:refs/heads/main"
  }
}
```

```powershell
terraform plan "-out=fix-oidc.tfplan"
terraform apply "fix-oidc.tfplan"
```

The observed plan changed one IAM role, then authentication and `aws sts get-caller-identity` passed. We retained the exact branch restriction rather than adding a broad subject wildcard. The workflow requires `id-token: write`; no GitHub deployment `environment` is set, because using one can change the subject format. Changes to repository identity or OIDC configuration must be checked against actual claims.

## YAML and workflow recovery: what failed and why

| Failure | Diagnosis | Correction and lesson |
|---|---|---|
| Invalid workflow near line 17 | Diagnostic step was incorrectly indented | Replaced the workflow with consistently indented YAML; an invalid workflow never starts a job |
| Invalid workflow near lines 148 and 115 | Frontend step/job indentation differed from adjacent blocks | Kept both jobs under `jobs`, with `env` and `steps` at the same job-child level |
| Invalid workflow near line 6 | A PowerShell repair script was pasted into the YAML file | Removed shell-script content by restoring the known-good backend file |
| Diagnostic missing while viewing logs | An earlier run was being examined while a newer commit had invalid YAML | Checked newest run's Summary/Annotations first; older run logs do not prove the current file executed |
| `invalid object name '4309f98'` | Incorrect commit ID was supplied during recovery | Used `git log --oneline --all -15`; identified actual working commit `4309198` |
| `git add` pathspec failures | Filenames differed from the typed command | Listed real filenames and staged `.tf` files explicitly |

Recovery used **PowerShell commands in PowerShell**, not in Notepad:

```powershell
git log --oneline --all -15
git restore --source=4309198 -- .github/workflows/deploy.yml
Get-Content .github\workflows\deploy.yml -TotalCount 10
```

We then appended the frontend YAML through a single-quoted PowerShell here-string, preserving literal `${{ ... }}` expressions, dollar signs, and leading spaces. The working backend content and Git history were retained. Commit `6538abb` produced a green backend job followed by a green frontend job.

Correct nesting:

```yaml
jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - name: Example backend step
        run: echo backend

  deploy-frontend:
    needs: deploy-backend
    runs-on: ubuntu-latest
    steps:
      - name: Example frontend step
        run: echo frontend
```

Use spaces rather than tabs. Commands within `run: |` must be indented farther than `run`. The examples above illustrate nesting, not the complete deployment workflow. A reported line can be where parsing stopped rather than where the first mistake occurred.

## Other practical troubleshooting

| Symptom | What we established | Resolution |
|---|---|---|
| Docker named-pipe/engine connection failure | CLI installation alone did not mean the Linux engine was ready | Ensured Docker Desktop was running; retested `docker ps` |
| `cd backend notepad package.json` positional-parameter error | Two commands were entered as one | Ran `cd backend`, then `notepad package.json` separately |
| Dockerfile missing during build | Docker could not find the expected exact filename in its context | Used `backend/Dockerfile`; excluded leftover root `Dockerfile.txt` |
| `syntax error at or near "dt"` | Nested shell/PowerShell quoting lost the intended psql meta-command | Opened interactive `psql`, then entered `\dt` |
| RDS engine version `17` not a valid full version | Orderable-options API required a full version when filtering by version | Queried orderable PostgreSQL 17.x gp3 options for `db.t3.micro` in London, then selected `17.11` |
| Terraform `Too many command line arguments` | Unquoted `-out=...` failed in the observed Windows command invocation | Used `terraform plan "-out=deployment.tfplan"` |
| ECR login returned 400 | Direct PowerShell piping and trimming retries failed | Used `cmd /c` for the AWS-to-Docker pipe; success followed. The exact underlying encoding/pipeline cause was not independently proven |
| ECS showed desired 1, pending 1, running 0 | Task was still starting | Rechecked until running 1/pending 0; verified `/ready` rather than assuming running meant healthy |
| `Tasks cannot be empty` | Migration task launch/ARN assignment had been skipped | Launched with `run-task`, inspected failures/tasks, then assigned its ARN before `describe-tasks` |
| Unsupported `lifecycle` block | Block was nested at the wrong level | Moved it directly under `aws_ecs_service.backend`; validation and no-change plan passed |
| Git LF/CRLF warnings | Windows line-ending conversion notices, not a failed staging operation | Reviewed staged files and committed successfully |
| Website worked at `localhost:8080` | That was local Compose, not AWS | Repeated browser verification on the CloudFront domain |

Example ECR login workaround used in the same PowerShell session:

```powershell
$repositoryUrl = (terraform output -raw backend_repository_url).Trim()
$registry = $repositoryUrl.Split('/')[0]
cmd /c "aws ecr get-login-password --region eu-west-2 | docker login --username AWS --password-stdin $registry"
```

Run from `infrastructure` so Terraform can access its local state. Authentication passwords should not be echoed or committed.

## Security decisions and boundaries

| Implemented control | Purpose | Boundary/limitation |
|---|---|---|
| Private S3 bucket with public access blocked and OAC-scoped read policy | CloudFront can read frontend files without a publicly readable bucket | Authenticated deployment role can still manage objects |
| Backend SG accepts 3000 only from ALB SG | Prevents direct public access to the task's API port | Fargate task still has a public IP for outbound access |
| Database SG accepts 5432 only from backend SG | Restricts database connection sources | Application currently uses the master database user |
| RDS storage encryption and verified client TLS | Protects stored data and backend-to-database transport | CloudFront→ALB and ALB→backend remain HTTP |
| RDS-managed Secrets Manager password | Avoids hardcoded database passwords in app/IaC | Secret is injected at task start; rotation requires new tasks to consume the new value |
| Scoped execution-role secret permission | Allows ECS startup to retrieve this database password | No separate application task role is configured |
| Repository/main-branch OIDC trust | Restricts which workflow identity can assume deployment role | Push permission to main is effectively deployment authority |
| Scoped deployment permissions and conditional `iam:PassRole` | Limits deployments to project resources where supported | ECR login and task-definition APIs use `Resource = "*"` in the current policy |
| `.gitignore` for local secrets, Terraform state, plans, and migration JSON | Avoids accidental publication of generated sensitive material | State remains local and needs secure backup/remote-state design |
| Non-root backend container user and parameterised SQL | Reduces container privileges and SQL injection exposure | No authentication, user isolation, rate limit, or WAF |

The ALB accepts HTTP from `0.0.0.0/0`; it is **not restricted to CloudFront**. HTTPS at CloudFront does not make origin HTTP encrypted. Public API endpoints are a deliberate demo limitation, not production access control.

## Testing evidence

| Check | Evidence observed | Status |
|---|---|---|
| Local services | Compose frontend/backend running; PostgreSQL healthy | Passed |
| Local persistence | Database container recreation retained records | Passed |
| Terraform validation | Successful after configuration corrections | Passed |
| Terraform ownership plan | `No changes` after lifecycle/default adjustment | Passed before CI deployments |
| Initial RDS migration | Temporary task `STOPPED`, exit code `0` | Passed |
| Database readiness | ALB `/ready`: `ok`, `connected` | Passed |
| API create/list | POST returned ID 1; GET returned saved record | Passed |
| OIDC authentication | Green authentication and identity steps after exact-sub correction | Passed |
| Backend release | New task revision retained after service stability wait | Passed |
| Full workflow | Run #9: backend ~3m33s, frontend ~25s; total ~4m05s | Passed |
| AWS browser/data persistence | CloudFront showed four records, including new entry and prior three | Passed |
| Negative input, forced rollback, load testing, AZ failure, restore drill | No captured execution evidence | Not claimed |

Original screenshot evidence was shared during the build. Suggested filenames when adding selected screenshots to this repository are `docs/evidence/pipeline-success.png`, `docs/evidence/cloudfront-four-records.png`, and `docs/evidence/migration-exit-zero.png`. These are suggestions only; this package does not include those screenshot files or broken image references.

Useful read-only checks (from `infrastructure`, unless otherwise stated):

```powershell
$backendDns = (terraform output -raw backend_load_balancer_dns).Trim()
Invoke-RestMethod -Uri "http://$backendDns/ready"
aws ecs describe-services --cluster job-tracker-cluster --services job-tracker-backend --region eu-west-2 --query "services[0].{Desired:desiredCount,Running:runningCount,Pending:pendingCount}" --output table --no-cli-pager
aws logs tail /ecs/job-tracker-backend --since 10m --region eu-west-2
```

CloudFront routes `/api/*`, not `/ready`, to the ALB, so use the ALB endpoint for the readiness command above. The CloudFront API read check is `https://d2b63iw46aiv4u.cloudfront.net/api/applications`.

## Costs, teardown, and recreation

The design avoided a NAT Gateway, used one backend task, a small Single-AZ database, CloudFront PriceClass_100, and seven-day application log retention. These choices reduce the lab footprint but do not make it free. RDS, ALB, task runtime, public IPv4, storage, logs, secrets, and traffic may continue generating charges. Scaling ECS to zero does not remove the database or ALB.

After preserving the required evidence and any data, disable the deployment workflow to prevent a new push from attempting deployment during teardown. From `infrastructure`, review a destroy plan:

```powershell
terraform plan -destroy "-out=cleanup.tfplan"
```

**Destructive next step:** only after reviewing the plan and deciding that the lab data can be deleted:

```powershell
terraform apply "cleanup.tfplan"
```

Current source sets RDS `skip_final_snapshot = true` and `deletion_protection = false`; ECR and S3 also permit forced deletion. Destroying the lab can delete records, images, and hosted files. Export data or take an appropriate snapshot first if retention is required. The reused OIDC provider is a Terraform data source, so destroying this stack does not delete it. Other unmanaged/shared account resources are not covered by this stack's cleanup.

Recreation needs a new image/bootstrap, schema initialisation, frontend upload, and updated GitHub variables for any regenerated resource IDs. This README is a deployment record and guide, not a claim that the current repository is a fully unattended fresh-account bootstrap.

## Skills demonstrated

- Three-tier application design and API/database integration.
- Docker build contexts, multi-stage frontend builds, non-root runtime, Compose health checks and persistent volumes.
- AWS networking, security-group source references, public/private routing, ALB target health, and Fargate task networking.
- Terraform dependency management, validation, saved plans, lifecycle rules, and state hygiene.
- Private RDS, encrypted storage, verified TLS, Secrets Manager injection, and one-off schema jobs.
- Git version control, safe file-level recovery, remote repositories, commits, and deployment history.
- GitHub Actions OIDC, exact trust conditions, scoped IAM permissions, image tagging, ECS revisions, sequential deployment, and cache refresh.
- Troubleshooting PowerShell, psql quoting, AWS API parameters, YAML parsing, and local-versus-cloud verification.

## Production improvements not implemented

Add user accounts and record ownership; a least-privilege application DB user; HTTPS to the ALB with a domain/certificate; restricted origin ingress; stronger branch/environment approvals; pinned action SHAs and reproducible dependency locks; image scanning gates; automatic smoke/negative-input tests; versioned migrations; remote Terraform state with locking; monitoring/alerts; Multi-AZ RDS and multiple backend tasks where availability warrants the cost; data backup/restore drills; and documented application/configuration rollback procedures.

## References

- [GitHub OIDC subject claims and immutable IDs](https://docs.github.com/en/actions/reference/security/oidc)
- [AWS credentials action: OIDC and trust-policy guidance](https://github.com/aws-actions/configure-aws-credentials)
- [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [CloudFront access to private S3 origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
- [CloudFront managed origin request policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html)
- [RDS PostgreSQL TLS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html)
- [Terraform lifecycle reference](https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle)

Diagram icons use AWS service artwork distributed through the [Diagrams project](https://github.com/mingrammer/diagrams/tree/master/resources/aws). AWS service names and marks belong to Amazon Web Services. Diagram topology is specific to this lab.
