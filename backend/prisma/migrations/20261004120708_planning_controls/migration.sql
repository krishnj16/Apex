-- AlterEnum
ALTER TYPE "TaskStatus" ADD VALUE 'removed';

-- CreateTable
CREATE TABLE "ClassCancellation" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "date" DATE NOT NULL,

    CONSTRAINT "ClassCancellation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassCancellation_classId_date_key" ON "ClassCancellation"("classId", "date");

-- AddForeignKey
ALTER TABLE "ClassCancellation" ADD CONSTRAINT "ClassCancellation_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
