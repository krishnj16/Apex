-- AlterTable
ALTER TABLE "RehabProgram" ADD COLUMN     "weekdays" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[];

-- CreateTable
CREATE TABLE "RehabDayOverride" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startMin" INTEGER,
    "durationMin" INTEGER,
    "skip" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RehabDayOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RehabDayOverride_programId_date_key" ON "RehabDayOverride"("programId", "date");

-- AddForeignKey
ALTER TABLE "RehabDayOverride" ADD CONSTRAINT "RehabDayOverride_programId_fkey" FOREIGN KEY ("programId") REFERENCES "RehabProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
