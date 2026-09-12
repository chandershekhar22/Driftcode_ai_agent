-- AlterEnum
ALTER TYPE "MessageRole" ADD VALUE 'tool';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "toolCallId" TEXT,
ADD COLUMN     "toolCalls" JSONB,
ADD COLUMN     "toolName" TEXT;
