-- CreateEnum
CREATE TYPE "SubjectKind" AS ENUM ('quantitative', 'verbal', 'reasoning', 'knowledge');

-- CreateEnum
CREATE TYPE "TopicStatus" AS ENUM ('not_started', 'learning', 'familiar', 'strong');

-- CreateEnum
CREATE TYPE "ErrorType" AS ENUM ('knowledge', 'concept_confusion', 'application', 'calculation', 'careless', 'time_management', 'question_selection', 'interpretation', 'guessing', 'unknown');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('concept_learning', 'revision', 'practice', 'timed_practice', 'sectional_test', 'mock_test', 'mock_analysis', 'error_log_review', 'reading', 'current_affairs', 'vocabulary', 'formula_revision', 'question_selection_practice', 'maintenance_practice');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('planned', 'in_progress', 'completed', 'partial', 'skipped');

-- CreateEnum
CREATE TYPE "SkipReason" AS ENUM ('too_tired', 'not_enough_time', 'difficult', 'lost_focus', 'commitment', 'other');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('easy', 'medium', 'hard');

-- CreateEnum
CREATE TYPE "RehabStatus" AS ENUM ('completed', 'partial', 'skipped');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "onboardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayStartMin" INTEGER NOT NULL DEFAULT 420,
    "dayEndMin" INTEGER NOT NULL DEFAULT 1380,
    "studyMinMin" INTEGER NOT NULL DEFAULT 300,
    "studyMaxMin" INTEGER NOT NULL DEFAULT 420,
    "rejuvenationMinMin" INTEGER NOT NULL DEFAULT 180,
    "rejuvenationMaxMin" INTEGER NOT NULL DEFAULT 240,
    "preferredBlockMin" INTEGER NOT NULL DEFAULT 60,
    "maxBlockMin" INTEGER NOT NULL DEFAULT 90,
    "breakMin" INTEGER NOT NULL DEFAULT 15,
    "notifyRehab" BOOLEAN NOT NULL DEFAULT false,
    "notifyWeeklyReview" BOOLEAN NOT NULL DEFAULT true,
    "notifyMocks" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "examDate" DATE NOT NULL,
    "userPriority" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SubjectKind" NOT NULL DEFAULT 'quantitative',
    "importance" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "userPriority" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "cadenceDays" INTEGER NOT NULL DEFAULT 3,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 3,
    "coverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "TopicStatus" NOT NULL DEFAULT 'not_started',
    "userPriority" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicPrerequisite" (
    "dependentId" TEXT NOT NULL,
    "prerequisiteId" TEXT NOT NULL,

    CONSTRAINT "TopicPrerequisite_pkey" PRIMARY KEY ("dependentId","prerequisiteId")
);

-- CreateTable
CREATE TABLE "Subtopic" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "coverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "TopicStatus" NOT NULL DEFAULT 'not_started',

    CONSTRAINT "Subtopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT,
    "location" TEXT,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "weekdays" INTEGER[],
    "date" DATE,
    "validFrom" DATE,
    "validTo" DATE,

    CONSTRAINT "ClassSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commitment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "weekdays" INTEGER[],
    "date" DATE,

    CONSTRAINT "Commitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sleepHours" DOUBLE PRECISION,
    "sleepQuality" INTEGER,
    "energy" INTEGER,
    "stress" INTEGER,
    "mentalFatigue" INTEGER,
    "physicalDiscomfort" INTEGER,
    "legDiscomfort" INTEGER,
    "wristDiscomfort" INTEGER,
    "availableStudyMin" INTEGER,
    "readiness" DOUBLE PRECISION,
    "readinessDetail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "readiness" DOUBLE PRECISION,
    "budget" JSONB NOT NULL,
    "warnings" TEXT[],
    "alternatives" JSONB NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "topicId" TEXT,
    "examId" TEXT NOT NULL,
    "subjectId" TEXT,
    "mockId" TEXT,
    "title" TEXT NOT NULL,
    "taskType" "TaskType" NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "plannedMin" INTEGER NOT NULL,
    "cognitiveLoad" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "priority" TEXT NOT NULL,
    "gap" TEXT NOT NULL,
    "reasons" TEXT[],
    "factors" JSONB NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "status" "TaskStatus" NOT NULL DEFAULT 'planned',
    "actualMin" INTEGER,
    "completionPct" INTEGER,
    "skipReason" "SkipReason",
    "skipNote" TEXT,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DailyPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudySession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT,
    "planItemId" TEXT,
    "taskType" "TaskType" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "activeMin" INTEGER NOT NULL,
    "plannedMin" INTEGER,

    CONSTRAINT "StudySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "takenOn" DATE NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION,
    "totalMin" INTEGER,
    "analysedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockSection" (
    "id" TEXT NOT NULL,
    "mockId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "attempted" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "incorrect" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "timeMin" INTEGER,

    CONSTRAINT "MockSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockQuestion" (
    "id" TEXT NOT NULL,
    "mockId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "topicId" TEXT,
    "subtopic" TEXT,
    "attempted" BOOLEAN NOT NULL,
    "correct" BOOLEAN,
    "timeSec" INTEGER,
    "expectedSec" INTEGER,
    "errorType" "ErrorType",
    "difficulty" "Difficulty",
    "confidence" INTEGER,
    "notes" TEXT,

    CONSTRAINT "MockQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "on" DATE NOT NULL,
    "sourceId" TEXT NOT NULL,
    "correct" BOOLEAN,
    "timeSec" INTEGER,
    "expectedSec" INTEGER,
    "errorType" "ErrorType",
    "difficulty" "Difficulty",

    CONSTRAINT "QuestionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RehabProgram" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dailyMin" INTEGER NOT NULL,
    "preferredStartMin" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RehabProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RehabExercise" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bodyArea" TEXT NOT NULL,
    "sets" INTEGER NOT NULL,
    "repsMin" INTEGER,
    "repsMax" INTEGER,
    "secMin" INTEGER,
    "secMax" INTEGER,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,

    CONSTRAINT "RehabExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RehabSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "RehabStatus" NOT NULL,
    "painBefore" INTEGER,
    "painAfter" INTEGER,
    "difficulty" INTEGER,
    "notes" TEXT,

    CONSTRAINT "RehabSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,

    CONSTRAINT "PerformanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE INDEX "Exam_userId_active_idx" ON "Exam"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_userId_name_key" ON "Exam"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_examId_name_key" ON "Subject"("examId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_subjectId_name_key" ON "Topic"("subjectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Subtopic_topicId_name_key" ON "Subtopic"("topicId", "name");

-- CreateIndex
CREATE INDEX "ClassSession_userId_idx" ON "ClassSession"("userId");

-- CreateIndex
CREATE INDEX "Commitment_userId_idx" ON "Commitment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCheckIn_userId_date_key" ON "DailyCheckIn"("userId", "date");

-- CreateIndex
CREATE INDEX "DailyPlan_userId_date_idx" ON "DailyPlan"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPlan_userId_date_version_key" ON "DailyPlan"("userId", "date", "version");

-- CreateIndex
CREATE INDEX "DailyPlanItem_planId_idx" ON "DailyPlanItem"("planId");

-- CreateIndex
CREATE INDEX "DailyPlanItem_topicId_status_idx" ON "DailyPlanItem"("topicId", "status");

-- CreateIndex
CREATE INDEX "StudySession_userId_startedAt_idx" ON "StudySession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "StudySession_topicId_idx" ON "StudySession"("topicId");

-- CreateIndex
CREATE INDEX "Mock_userId_takenOn_idx" ON "Mock"("userId", "takenOn");

-- CreateIndex
CREATE UNIQUE INDEX "MockSection_mockId_name_key" ON "MockSection"("mockId", "name");

-- CreateIndex
CREATE INDEX "MockQuestion_topicId_idx" ON "MockQuestion"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "MockQuestion_mockId_section_number_key" ON "MockQuestion"("mockId", "section", "number");

-- CreateIndex
CREATE INDEX "QuestionAttempt_userId_on_idx" ON "QuestionAttempt"("userId", "on");

-- CreateIndex
CREATE INDEX "QuestionAttempt_topicId_on_idx" ON "QuestionAttempt"("topicId", "on");

-- CreateIndex
CREATE UNIQUE INDEX "RehabProgram_userId_name_key" ON "RehabProgram"("userId", "name");

-- CreateIndex
CREATE INDEX "RehabSession_userId_date_idx" ON "RehabSession"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "RehabSession_programId_date_key" ON "RehabSession"("programId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReview_userId_weekStart_key" ON "WeeklyReview"("userId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceSnapshot_userId_date_scope_scopeId_key" ON "PerformanceSnapshot"("userId", "date", "scope", "scopeId");

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicPrerequisite" ADD CONSTRAINT "TopicPrerequisite_dependentId_fkey" FOREIGN KEY ("dependentId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicPrerequisite" ADD CONSTRAINT "TopicPrerequisite_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subtopic" ADD CONSTRAINT "Subtopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCheckIn" ADD CONSTRAINT "DailyCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPlan" ADD CONSTRAINT "DailyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPlanItem" ADD CONSTRAINT "DailyPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DailyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPlanItem" ADD CONSTRAINT "DailyPlanItem_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "DailyPlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mock" ADD CONSTRAINT "Mock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mock" ADD CONSTRAINT "Mock_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockSection" ADD CONSTRAINT "MockSection_mockId_fkey" FOREIGN KEY ("mockId") REFERENCES "Mock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockQuestion" ADD CONSTRAINT "MockQuestion_mockId_fkey" FOREIGN KEY ("mockId") REFERENCES "Mock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockQuestion" ADD CONSTRAINT "MockQuestion_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RehabProgram" ADD CONSTRAINT "RehabProgram_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RehabExercise" ADD CONSTRAINT "RehabExercise_programId_fkey" FOREIGN KEY ("programId") REFERENCES "RehabProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RehabSession" ADD CONSTRAINT "RehabSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RehabSession" ADD CONSTRAINT "RehabSession_programId_fkey" FOREIGN KEY ("programId") REFERENCES "RehabProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReview" ADD CONSTRAINT "WeeklyReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceSnapshot" ADD CONSTRAINT "PerformanceSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
