-- 工作区各模块个人设置与自定义模板、快捷指令、画布片段
CREATE TABLE "UserPreferences" (
    "ownerId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("ownerId")
);
