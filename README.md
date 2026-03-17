# ZLM Textbook Automation — Backend API

**Zarwango–Lubega–Muyizzi Publishing | NP/DNP Textbook System**

Node.js + TypeScript + PostgreSQL + Prisma + Bull/Redis | Deploy → Railway

---

## Quick Start (Local Dev)

```bash
# 1. Install
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your values (at minimum: DATABASE_URL, OPENAI_API_KEY, JWT_SECRET)

# 3. Start local PostgreSQL and Redis (or use Docker)
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
docker run -d -p 6379:6379 redis:7

# 4. Run migrations + seed
npx prisma migrate dev
npm run db:seed

# 5. Start dev server
npm run dev
# API running at http://localhost:3001
# Health check: http://localhost:3001/health
```

---

## Deploy to Railway

### Step 1 — Create Railway project

1. Go to [railway.app](https://railway.app) → New Project
2. Add **PostgreSQL** service → copy `DATABASE_URL`
3. Add **Redis** service → copy `REDIS_URL`
4. Add **GitHub repo** service (push your code first)

### Step 2 — Push code to GitHub

```bash
git init
git add .
git commit -m "ZLM Backend v2.0"
git remote add origin https://github.com/YOUR_USERNAME/zlm-backend.git
git push -u origin main
```

### Step 3 — Set environment variables in Railway

In Railway dashboard → your service → Variables tab, add ALL of these:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | *(from Railway PostgreSQL)* |
| `REDIS_URL` | *(from Railway Redis)* |
| `JWT_SECRET` | *(generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`)* |
| `JWT_REFRESH_SECRET` | *(generate another one)* |
| `OPENAI_API_KEY` | *(your rotated key — NOT the one in spec doc)* |
| `AWS_S3_BUCKET_NAME` | *(your S3 bucket)* |
| `AWS_REGION` | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | *(IAM key)* |
| `AWS_SECRET_ACCESS_KEY` | *(IAM secret)* |
| `GITHUB_TOKEN` | *(GitHub PAT with repo:write)* |
| `GITHUB_REPO_OWNER` | *(your GitHub username)* |
| `GITHUB_REPO_NAME` | `zlm-manuscripts` |
| `FRONTEND_URL` | *(your Vercel frontend URL)* |
| `ADMIN_EMAIL` | `admin@zlm.com` |
| `ADMIN_PASSWORD` | *(strong password)* |

### Step 4 — Deploy

Railway auto-deploys when you push to main. The `railway.json` configures:
- Build: Docker
- Start: `npx prisma migrate deploy && node dist/server.js`
- Health check: `/health`

### Step 5 — Connect frontend

In your Vercel frontend → Environment Variables:
```
REACT_APP_API_URL = https://your-backend.railway.app
```

---

## API Reference

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Login → returns JWT tokens |
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/refresh` | Rotate refresh token |
| POST | `/api/auth/logout` | Invalidate refresh token |
| GET | `/api/auth/me` | Get current user |

### Books
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/books` | List all books (filter: track, status, country, bundleType) |
| POST | `/api/books` | Create book |
| GET | `/api/books/:id` | Get book + chapters |
| PUT | `/api/books/:id` | Update book |
| DELETE | `/api/books/:id` | Delete book |
| POST | `/api/books/:id/generate-toc` | Generate TOC via GPT-4 |
| POST | `/api/books/:id/generate-all` | Queue all chapters |
| POST | `/api/books/:id/generate-review` | Generate Review bundle |
| POST | `/api/books/:id/generate-questions` | Generate Q-Bank |
| POST | `/api/books/:id/generate-mnemonics` | Generate Mnemonics |
| POST | `/api/books/:id/kdp-metadata` | Generate KDP metadata |
| GET | `/api/books/bundle/:id` | Get bundle status |

### Chapters
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/chapters` | List chapters |
| GET | `/api/chapters/:id` | Get chapter |
| POST | `/api/chapters/:id/generate` | Queue chapter generation |
| POST | `/api/chapters/:id/qa` | Queue QA audit |
| GET | `/api/chapters/:id/qa-report` | Get QA report |
| GET | `/api/chapters/:id/download` | Download chapter file |
| GET | `/api/chapters/:id/editor-flags` | Get editor checklist flags |
| POST | `/api/chapters/:id/clear` | Reset chapter to pending |
| DELETE | `/api/chapters/:id` | Delete chapter |

### Dashboard
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/dashboard/stats` | KPI stats |
| GET | `/api/dashboard/health` | System health (admin only) |
| GET | `/api/dashboard/activity` | Live activity feed |
| GET | `/api/dashboard/editor-flags` | All book editor flags |

### Exam Matching (Phase 3)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/providers` | List provider types |
| GET | `/api/countries` | List supported countries |
| POST | `/api/match-exam` | Match provider+country → board exam |

### Evidence Alerts (Phase 7)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/evidence-alerts` | List alerts |
| POST | `/api/evidence-alerts/:id/approve` | Approve → queue regeneration |
| POST | `/api/evidence-alerts/:id/dismiss` | Dismiss alert |
| POST | `/api/evidence-alerts/trigger-check` | Manual check |

---

## Database Migrations

Run in this exact order:

```bash
npx prisma migrate dev --name "add_bundle_type_and_kdp_fields"
npx prisma migrate dev --name "add_bundle_tables"
npx prisma migrate dev --name "add_board_exam_mappings"
npx prisma migrate dev --name "expand_certification_track_enum"
npx prisma migrate dev --name "add_branding_configs"
npx prisma migrate dev --name "add_editor_checklist_fields"
npx prisma generate
npm run db:seed
```

---

## Security Checklist

- [ ] Rotate the exposed OpenAI key (`sk-proj-UaAta...`) — do this FIRST
- [ ] Set strong `JWT_SECRET` and `JWT_REFRESH_SECRET` (64+ chars)
- [ ] Store OpenAI key in AWS Secrets Manager (set `USE_AWS_SECRETS_MANAGER=true`)
- [ ] Never commit `.env` to git
- [ ] Change default admin password after first login
- [ ] S3 bucket: private ACL only
- [ ] GitHub token: scoped to `repo:write` only

---

## Architecture

```
Frontend (Vercel)  →  Railway Backend  →  PostgreSQL (Railway)
                                       →  Redis / Bull (Railway)
                                       →  OpenAI GPT-4 Turbo
                                       →  AWS S3 (manuscripts)
                                       →  GitHub (version control)
```

**Queue flow:** HTTP request → Bull queue → processor → OpenAI → S3 → DB update → frontend polls

**Evidence monitor:** Runs daily at 2AM UTC via node-cron → GPT-4 checks board exam changes → creates EvidenceAlert records → admin approves → chapters regenerate
