import { cleanPostContent, isImagePath } from "@/lib/post-content";
// 独立定义帖子结构，采集和收藏不再依赖示例数据。
export type Post = {
  id: string;
  title: string;
  author: string;
  content: string;
  likes: number;
  images?: string[];
  tags?: string[];
};

const STORAGE_KEY = "rednoter:saved-posts";

// 检查读取的数据是否具有完整的帖子字段。
function isPost(value: unknown): value is Post {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const post = value as Record<string, unknown>;

  return (
    typeof post.id === "string" &&
    typeof post.title === "string" &&
    typeof post.author === "string" &&
    typeof post.content === "string" &&
    typeof post.likes === "number" &&
    (post.images === undefined || (Array.isArray(post.images) && post.images.every(isImagePath))) &&
    (post.tags === undefined || (Array.isArray(post.tags) && post.tags.every(tag => typeof tag === "string")))
  );
}

export function saveSavedPosts(posts: Post[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
}

export function readSavedPosts(): Post[] {
  const text = localStorage.getItem(STORAGE_KEY);

  // 优先读取新版的完整收藏。
  if (text !== null) {
    const parsed: unknown = JSON.parse(text);

    if (!Array.isArray(parsed) || !parsed.every(isPost)) {
      throw new Error("收藏数据格式不正确");
    }

    return parsed.map(post => ({ ...post, content: cleanPostContent(post.content) }));
  }

  // 第一次使用新版时，把旧收藏 ID 转换为完整帖子。
  const oldText = localStorage.getItem("rednoter:saved-post-ids");

  if (oldText === null) return [];

  const oldIds: unknown = JSON.parse(oldText);

  if (
    !Array.isArray(oldIds) ||
    !oldIds.every((id) => typeof id === "string")
  ) {
    throw new Error("旧收藏数据格式不正确");
  }

  // 仅恢复早期只保存 ID 的历史收藏；这些内容不再加入话题追踪列表。
  const legacyPosts: Post[] = [
    {
      id: "demo-001",
      title: "下班后的333小时，我用这三个方法给自己充电",
      author: "生活记录员",
      content: "下班后先散步二十分钟，再给自己做一顿简单的晚餐，最后留半小时读书。把时间留给自己，普通的一天也可以很充实。",
      likes: 128,
    },
    {
      id: "demo-002",
      title: "周末不用远行，也能拥有一次小旅行",
      author: "城市漫游者",
      content: "挑一条没走过的小路，逛一家街角书店，再找个公园坐一会儿。熟悉的城市也藏着新的风景。",
      likes: 256,
    },
    {
      id: "demo-003",
      title: "我的极简书桌整理方法",
      author: "整理日记",
      content: "桌面只留下每天使用的物品，小东西放进收纳盒，睡前花三分钟归位。第二天坐下来时，心情也清爽了。",
      likes: 96,
    },
  ];
  const migratedPosts = legacyPosts.filter((post) =>
    oldIds.includes(post.id)
  );

  saveSavedPosts(migratedPosts);

  return migratedPosts;
}
