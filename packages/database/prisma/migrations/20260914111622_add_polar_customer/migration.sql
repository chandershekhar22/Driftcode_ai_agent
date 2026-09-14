-- AlterTable
ALTER TABLE "User" ADD COLUMN     "polarCustomerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_polarCustomerId_key" ON "User"("polarCustomerId");
