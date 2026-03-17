-- CreateEnum
CREATE TYPE "CertificationTrack" AS ENUM ('RN', 'LPN', 'FNP', 'AGPCNP', 'PMHNP', 'PNP', 'WHNP', 'NNP', 'AGACNP', 'CRNA', 'CNM', 'CNS', 'ANP', 'MD', 'DO', 'PA', 'PHARMD', 'DDS', 'RDH', 'PSYCHD', 'LCSW', 'LPC', 'LMFT', 'BCBA', 'SAC', 'DPT', 'OT', 'PTA', 'RRT', 'RADTECH', 'MLS', 'SLP', 'RD', 'CCRN', 'CEN', 'OCN', 'FACHE', 'CPH', 'CPC');

-- CreateEnum
CREATE TYPE "BundleType" AS ENUM ('TEXTBOOK', 'REVIEW', 'MNEMONIC', 'PICTURE', 'STUDYSHEET', 'QBANK');

-- CreateEnum
CREATE TYPE "BookStatus" AS ENUM ('DRAFT', 'GENERATING', 'QA_PENDING', 'QA_IN_PROGRESS', 'QA_PASSED', 'DESIGN_PENDING', 'DESIGN_READY', 'KDP_READY', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ChapterStatus" AS ENUM ('PENDING', 'GENERATING', 'GENERATED', 'QA_PENDING', 'QA_PASSED', 'QA_FAILED', 'DESIGN_READY');

-- CreateEnum
CREATE TYPE "PromptType" AS ENUM ('TOC', 'TERMINOLOGY', 'CHAPTER', 'PEARL', 'REFERENCE', 'QA');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CONTENT_MANAGER', 'QA_REVIEWER', 'DESIGNER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('WAITING', 'ACTIVE', 'COMPLETED', 'FAILED', 'DELAYED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CONTENT_MANAGER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "books" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "certificationTrack" "CertificationTrack" NOT NULL,
    "trackNumber" INTEGER NOT NULL,
    "bundleType" "BundleType" NOT NULL DEFAULT 'TEXTBOOK',
    "country" TEXT NOT NULL DEFAULT 'USA',
    "boardExam" TEXT,
    "status" "BookStatus" NOT NULL DEFAULT 'DRAFT',
    "githubBranch" TEXT,
    "s3Folder" TEXT,
    "airtableRecordId" TEXT,
    "totalChapters" INTEGER NOT NULL DEFAULT 0,
    "completedChapters" INTEGER NOT NULL DEFAULT 0,
    "overallQaScore" DECIMAL(5,2),
    "kdpTitle" TEXT,
    "kdpSubtitle" TEXT,
    "kdpDescription" TEXT,
    "kdpKeywords" TEXT[],
    "kdpBisacCodes" TEXT[],
    "kdpMetadata" TEXT,
    "seoTitle" TEXT,
    "brandingColor" TEXT,
    "lastReviewedAt" TIMESTAMP(3),
    "needsUpdate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapters" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "chapterNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ChapterStatus" NOT NULL DEFAULT 'PENDING',
    "contentS3Key" TEXT,
    "githubCommitSha" TEXT,
    "qaScore" DECIMAL(5,2),
    "promptVersion" INTEGER NOT NULL DEFAULT 1,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "reviewContent" TEXT,
    "editorFlags" TEXT,
    "hasEditorIssues" BOOLEAN NOT NULL DEFAULT false,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qa_reports" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "apaViolations" JSONB NOT NULL DEFAULT '[]',
    "boldGovernanceIssues" JSONB NOT NULL DEFAULT '[]',
    "redundancyFlags" JSONB NOT NULL DEFAULT '[]',
    "medicationErrors" JSONB NOT NULL DEFAULT '[]',
    "structureIssues" JSONB NOT NULL DEFAULT '[]',
    "depthScore" DECIMAL(5,2),
    "citationCount" INTEGER NOT NULL DEFAULT 0,
    "recentCitations" INTEGER NOT NULL DEFAULT 0,
    "overallScore" DECIMAL(5,2),
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "rawQaResponse" TEXT,
    "strictMode" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qa_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PromptType" NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "bookId" TEXT,
    "chapterId" TEXT,
    "bullJobId" TEXT,
    "type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'WAITING',
    "result" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "bookId" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_banks" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "chapterNumber" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "optionA" TEXT NOT NULL,
    "optionB" TEXT NOT NULL,
    "optionC" TEXT NOT NULL,
    "optionD" TEXT NOT NULL,
    "correctOption" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "boardDomain" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mnemonic_entries" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "mnemonic" TEXT NOT NULL,
    "expansion" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "bodySystem" TEXT NOT NULL,
    "boardDomain" TEXT NOT NULL,
    "clinicalNote" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mnemonic_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_exam_mappings" (
    "id" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "providerLabel" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "boardExam" TEXT NOT NULL,
    "boardFullName" TEXT NOT NULL,
    "examUrl" TEXT,
    "coreClasses" TEXT NOT NULL,
    "contentNotes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_exam_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branding_configs" (
    "id" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "primaryColor" TEXT NOT NULL,
    "secondaryColor" TEXT NOT NULL,
    "accentColor" TEXT NOT NULL,
    "fontPairing" TEXT NOT NULL,
    "coverStyle" TEXT NOT NULL,
    "seriesName" TEXT NOT NULL,
    "aiReasoning" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branding_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_alerts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "affectedTracks" TEXT[],
    "affectedBookIds" TEXT[],
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "evidence_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "books_status_idx" ON "books"("status");

-- CreateIndex
CREATE INDEX "books_certificationTrack_idx" ON "books"("certificationTrack");

-- CreateIndex
CREATE INDEX "books_bundleType_idx" ON "books"("bundleType");

-- CreateIndex
CREATE INDEX "books_country_idx" ON "books"("country");

-- CreateIndex
CREATE INDEX "chapters_bookId_idx" ON "chapters"("bookId");

-- CreateIndex
CREATE INDEX "chapters_status_idx" ON "chapters"("status");

-- CreateIndex
CREATE UNIQUE INDEX "chapters_bookId_chapterNumber_key" ON "chapters"("bookId", "chapterNumber");

-- CreateIndex
CREATE INDEX "qa_reports_chapterId_idx" ON "qa_reports"("chapterId");

-- CreateIndex
CREATE INDEX "qa_reports_passed_idx" ON "qa_reports"("passed");

-- CreateIndex
CREATE INDEX "prompts_type_idx" ON "prompts"("type");

-- CreateIndex
CREATE INDEX "prompts_isActive_idx" ON "prompts"("isActive");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_bookId_idx" ON "jobs"("bookId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_bookId_idx" ON "audit_logs"("bookId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "question_banks_bookId_idx" ON "question_banks"("bookId");

-- CreateIndex
CREATE INDEX "mnemonic_entries_bookId_idx" ON "mnemonic_entries"("bookId");

-- CreateIndex
CREATE INDEX "board_exam_mappings_providerType_idx" ON "board_exam_mappings"("providerType");

-- CreateIndex
CREATE INDEX "board_exam_mappings_country_idx" ON "board_exam_mappings"("country");

-- CreateIndex
CREATE UNIQUE INDEX "board_exam_mappings_providerType_country_key" ON "board_exam_mappings"("providerType", "country");

-- CreateIndex
CREATE UNIQUE INDEX "branding_configs_providerType_key" ON "branding_configs"("providerType");

-- CreateIndex
CREATE INDEX "evidence_alerts_status_idx" ON "evidence_alerts"("status");

-- CreateIndex
CREATE INDEX "evidence_alerts_severity_idx" ON "evidence_alerts"("severity");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_reports" ADD CONSTRAINT "qa_reports_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mnemonic_entries" ADD CONSTRAINT "mnemonic_entries_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
