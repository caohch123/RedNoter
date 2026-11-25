ALTER TABLE "Draft"
    ADD COLUMN "name" TEXT,
    ADD COLUMN "savedData" JSONB,
    ADD COLUMN "savedName" TEXT,
    ADD COLUMN "savedTitle" TEXT,
    ADD COLUMN "savedAt" TIMESTAMP(3),
    ADD COLUMN "pinnedAt" TIMESTAMP(3),
    ADD COLUMN "deletedAt" TIMESTAMP(3),
    ADD COLUMN "restoredRevision" INTEGER NOT NULL DEFAULT 0;

WITH meaningful AS (
    SELECT "id", COALESCE(NULLIF(btrim("data"->>'title'), ''),
        '旧笔记 ' || to_char("createdAt" + interval '8 hours', 'YYYY-MM-DD HH24:MI')) AS "legacyName"
    FROM "Draft"
    WHERE (
        NULLIF(btrim("data"->>'title'), '') IS NOT NULL
        OR NULLIF(btrim("data"->>'body'), '') IS NOT NULL
        OR "data"->>'coverId' IS NOT NULL
        OR "data"->>'videoId' IS NOT NULL
        OR COALESCE("data"->'imageIds', '[]'::jsonb) <> '[]'::jsonb
    )
    AND NOT (
        COALESCE("data"->>'example', 'false') = 'true'
        AND COALESCE("data"->>'title', '') = '早八人请进｜这只通勤包真的能装'
        AND COALESCE("data"->>'body', '') = '✨ 先说结论：轻量通勤托特包是我最近使用频率最高的一只包。

👜 ① 容量比看上去更能装
13 寸电脑、折叠伞、水杯和化妆包都能放下，内袋分区也很清楚。

🪶 ② 自重控制得不错
装满之后肩带压力可以接受，通勤 40 分钟没有明显勒肩。

🔍 ③ 细节决定使用频率
拉链顺滑、底部有支撑，放在地铁座位上不会软塌。

以上是原型示例内容，请按自己的情况修改。'
        AND COALESCE("data"->'tags', '[]'::jsonb) = '["通勤穿搭","包包分享","打工人日常","通勤好物","一包多背","轻量出行"]'::jsonb
        AND "data"->>'coverId' IS NULL
        AND "data"->>'videoId' IS NULL
        AND COALESCE("data"->'imageIds', '[]'::jsonb) = '[]'::jsonb
    )
)
UPDATE "Draft" AS d SET
    "name" = m."legacyName",
    "savedName" = m."legacyName",
    "savedData" = d."data",
    "savedTitle" = COALESCE(d."data"->>'title', ''),
    "savedAt" = d."updatedAt"
FROM meaningful AS m
WHERE d."id" = m."id";

CREATE INDEX "Draft_ownerId_deletedAt_pinnedAt_savedAt_id_idx"
    ON "Draft"("ownerId", "deletedAt", "pinnedAt", "savedAt", "id");
