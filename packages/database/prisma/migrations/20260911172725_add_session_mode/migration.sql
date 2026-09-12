-- CreateEnum
CREATE TYPE "AgentMode" AS ENUM ('plan', 'build');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "mode" "AgentMode" NOT NULL DEFAULT 'plan';
