/**
 * 官网「在线体验」用的预设内容。
 * 官网不调用真实的 AI 接口，这里是写好的示例稿，按 类目 × 语气 组合展示生成效果。
 */

export type CategoryId = "outfit" | "food" | "home" | "skincare";
export type ToneId = "honest" | "list" | "promo";

export type DemoCategory = {
  id: CategoryId;
  name: string;
  topic: string;
  audience: string;
  /** 封面图（web/public/showcase/ 下的示例图） */
  cover: string;
  /** 示意面板的底色 */
  panel: string;
};

export type DemoNote = { title: string; body: string; tags: string[] };

export const DEMO_CATEGORIES: DemoCategory[] = [
  { id: "outfit", name: "穿搭", topic: "通勤托特包", audience: "早八打工人", cover: "/showcase/outfit-street-walk.jpg", panel: "bg-[#e9b9a6]" },
  { id: "food", name: "美食", topic: "15 分钟一人食", audience: "独居上班族", cover: "/showcase/food-salad.jpg", panel: "bg-[#e5cf95]" },
  { id: "home", name: "家居", topic: "12㎡ 出租屋改造", audience: "租房党", cover: "/showcase/home-dining.jpg", panel: "bg-[#b9ccb2]" },
  { id: "skincare", name: "护肤", topic: "换季敏感肌修护", audience: "学生党", cover: "/showcase/home-bed-mug.jpg", panel: "bg-[#cdc3dc]" },
];

export const DEMO_TONES: { id: ToneId; name: string }[] = [
  { id: "honest", name: "真诚分享" },
  { id: "list", name: "干货清单" },
  { id: "promo", name: "种草安利" },
];

export const DEMO_NOTES: Record<CategoryId, Record<ToneId, DemoNote>> = {
  outfit: {
    honest: {
      title: "背了三个月的通勤包，说点真实感受",
      body: "早八挤地铁三个月，这只托特包是我用下来最省心的一只。\n\n能装：14 寸电脑、水杯、午饭盒一起放进去，还有空间。\n轻：空包不到 500g，单肩背一天肩膀也不酸。\n小缺点：内袋偏少，零碎东西得自己配个收纳包。\n\n不算完美，但对每天通勤的人来说，够用又不累。",
      tags: ["通勤包", "打工人日常", "真实测评"],
    },
    list: {
      title: "早八人通勤包怎么选？看这 4 点就够了",
      body: "① 容量：至少放得下 14 寸电脑和水杯\n② 自重：空包 500g 以内，背一天不累\n③ 开口：拉链或磁扣，挤地铁更安心\n④ 材质：防泼水面料，下雨天不慌\n\n按这几条挑，基本不会踩雷。先收藏，换包的时候对照着看。",
      tags: ["通勤好物", "选包攻略", "早八穿搭"],
    },
    promo: {
      title: "这只通勤包，让我的早八从容了",
      body: "以前每天出门像搬家，换了这只托特包之后，终于不用纠结带什么了。\n\n电脑、水杯、饭盒全放进去，外观还是很利落，配西装配卫衣都不违和。\n\n最惊喜的是真的轻，挤地铁也不会被拽着走。",
      tags: ["通勤好物", "包包分享", "打工人日常"],
    },
  },
  food: {
    honest: {
      title: "独居第二年，我的 15 分钟晚饭",
      body: "下班回家只想快点吃上饭，所以我的晚餐原则就一个：15 分钟内搞定。\n\n今天是番茄鸡蛋拌面：煮面的同时炒番茄鸡蛋，面捞出来直接拌。\n\n一个锅、一个碗，吃完洗碗也只要两分钟。一个人吃饭，也想好好吃。",
      tags: ["一人食", "独居生活", "快手晚餐"],
    },
    list: {
      title: "上班族一人食：15 分钟晚餐公式",
      body: "① 主食选快熟的：挂面、乌冬、速冻饺子\n② 蛋白质备现成的：鸡蛋、豆腐、即食鸡胸\n③ 蔬菜买好处理的：番茄、生菜、西兰花\n④ 一锅出：主食和配菜同锅煮，省时又省碗\n\n周末备好食材，工作日照着公式随意组合。",
      tags: ["一人食", "上班族晚餐", "做饭公式"],
    },
    promo: {
      title: "这碗番茄拌面，我一周能吃三次",
      body: "酸甜的番茄裹着鸡蛋，拌上刚出锅的面，会一口接一口停不下来。\n\n关键是简单：番茄炒出汁、鸡蛋滑一下、面煮好一拌，15 分钟上桌。\n\n下班累到不想动的晚上，就靠它了。",
      tags: ["番茄拌面", "快手菜", "一人食"],
    },
  },
  home: {
    honest: {
      title: "12㎡ 出租屋，我是怎么塞下书桌的",
      body: "房间只有 12㎡，床一放就只剩一条过道。我做了三件事：\n\n把床换成带抽屉的款，衣服收进床底；\n书桌贴墙放在窗边，白天采光最好；\n墙上加了洞洞板，桌面上的东西全挂上去。\n\n不用动房东的东西，搬家也能全部带走。",
      tags: ["租房改造", "小户型", "出租屋"],
    },
    list: {
      title: "小房间收纳的 4 个思路，租房党收好",
      body: "① 向上要空间：墙面置物架、洞洞板\n② 向下要空间：床底抽屉、收纳箱\n③ 家具选多功能：带抽屉的床、可折叠桌\n④ 统一颜色：浅色系让房间看起来更大\n\n都是不用打孔的方案，退租也不心疼。",
      tags: ["收纳技巧", "租房改造", "小户型"],
    },
    promo: {
      title: "这块洞洞板，拯救了我的桌面",
      body: "以前桌上堆满耳机、数据线、便签，每次找东西都要翻半天。\n\n装了洞洞板之后，常用的全挂上墙，桌面一下子空出一半。\n\n免打孔，自己十分钟就装好，小房间很值得拥有。",
      tags: ["洞洞板", "桌面改造", "租房好物"],
    },
  },
  skincare: {
    honest: {
      title: "换季皮肤泛红，我的修护经验",
      body: "每到换季，脸颊就容易泛红、起皮。这次我试着给护肤做减法：\n\n洁面换成温和的氨基酸款；\n精华先停掉，只保留保湿；\n出门认真防晒。\n\n两三周后状态稳定多了。每个人肤质不同，情况严重还是建议看医生。",
      tags: ["敏感肌", "换季护肤", "护肤经验"],
    },
    list: {
      title: "敏感肌换季护肤，记住这 3 条",
      body: "① 精简步骤：洁面、保湿、防晒就够了\n② 温和清洁：避开磨砂和清洁力太强的产品\n③ 新品先试：耳后或下颌小范围试用，再上脸\n\n皮肤不舒服的时候，少即是多。",
      tags: ["敏感肌", "护肤干货", "学生党护肤"],
    },
    promo: {
      title: "敏感肌换季，终于找到不刺激的保湿",
      body: "换季那阵子脸又红又干，用什么都刺痛。\n\n后来换了一支成分简单的保湿乳，质地轻薄，上脸没有刺激感，第二天起床脸摸起来软软的。\n\n学生党价格也能接受，换季就靠它了。",
      tags: ["保湿", "敏感肌", "平价护肤"],
    },
  },
};
