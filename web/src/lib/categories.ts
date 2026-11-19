// 一个分类需要包含哪些数据。
export type Category = {
  id: string;
  name: string;
  keywords: string[];
};

// 首次使用时提供的默认分类。
export const defaultCategories: Category[] = [
  {
    id: "commute",
    name: "通勤穿搭",
    keywords: ["通勤穿搭", "上班穿搭", "职场穿搭"],
  },
  {
    id: "home",
    name: "家居改造",
    keywords: ["家居改造", "租房改造", "卧室改造", "装修"],
  },
  {
    id: "budget",
    name: "平价好物",
    keywords: ["平价", "性价比", "百元好物", "便宜好用"],
  },
  {
    id: "skincare",
    name: "护肤成分",
    keywords: ["护肤", "烟酰胺", "视黄醇", "水杨酸", "神经酰胺"],
  },
  {
    id: "meal",
    name: "一人食",
    keywords: ["一人食", "独食", "一个人吃饭", "单人餐"],
  },
  {
    id: "desk",
    name: "桌面好物",
    keywords: ["桌面", "书桌", "键盘", "显示器", "台灯"],
  },
  {
    id: "city",
    name: "城市漫游",
    keywords: ["城市漫游", "citywalk", "城市散步", "街角", "小旅行"],
  },
];

// 判断一条帖子是否符合某个分类。
export function matchesCategory(
  post: { title: string; content: string; tags?: string[] },
  category: Category
): boolean {
  const text = `${post.title}\n${post.content}`.concat(" ", (post.tags ?? []).join(" ")).toLowerCase();

  return category.keywords.some((keyword) => {
    const word = keyword.trim().toLowerCase();

    return word.length > 0 && text.includes(word);
  });
}

const CATEGORY_STORAGE_KEY = "rednoter:categories";

function isCategory(value: unknown): value is Category {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const category = value as Record<string, unknown>;

  return (
    typeof category.id === "string" &&
    category.id.trim().length > 0 &&
    typeof category.name === "string" &&
    category.name.trim().length > 0 &&
    Array.isArray(category.keywords) &&
    category.keywords.length > 0 &&
    category.keywords.every(
      (keyword) =>
        typeof keyword === "string" && keyword.trim().length > 0
    )
  );
}

export function readCategories(): Category[] {
  const text = localStorage.getItem(CATEGORY_STORAGE_KEY);

  if (text === null) {
    // 返回独立副本，避免修改默认配置本身。
    return defaultCategories.map((category) => ({
      ...category,
      keywords: [...category.keywords],
    }));
  }

  const parsed: unknown = JSON.parse(text);

  if (!Array.isArray(parsed) || !parsed.every(isCategory)) {
    throw new Error("分类数据格式不正确");
  }

  const uniqueIds = new Set(parsed.map((category) => category.id));

  if (uniqueIds.size !== parsed.length) {
    throw new Error("分类 ID 不能重复");
  }

  return parsed;
}

export function saveCategories(categories: Category[]) {
  if (!categories.every(isCategory)) {
    throw new Error("请填写分类名称和至少一个关键词");
  }

  const uniqueIds = new Set(categories.map((category) => category.id));

  if (uniqueIds.size !== categories.length) {
    throw new Error("分类 ID 不能重复");
  }

  localStorage.setItem(
    CATEGORY_STORAGE_KEY,
    JSON.stringify(categories)
  );
}