/**
 * 官网上展示的「示例笔记」：首屏照片墙和「作品展示」瀑布流都从这里取。
 *
 * 图片来自 Unsplash 免费图库（可商用、无需署名），作者清单见 web/public/showcase/CREDITS.md。
 * 标题、正文、昵称和点赞数都是团队编写的示例，页面上会标明「示例作品」。
 *
 * 以后想换成真实作品：
 *   1. 先拿到作者授权（图片和文字都有著作权，不要直接抓取或搬运别人的小红书笔记）；
 *   2. 图片放到 web/public/showcase/，改对应条目的 image；
 *   3. author 换成作者同意公开的昵称，sample 改成 false。
 */

const img = (name: string) => `/showcase/${name}.jpg`;

export type Post = {
  id: string;
  image: string;
  title: string;
  /** 主题词，用来生成「换个写法」 */
  topic: string;
  author: string;
  /** 头像图片 */
  avatar: string;
  likes: string;
};

export type ShowcaseNote = Post & {
  category: string;
  body: string;
  tags: string[];
  mode: "原创" | "仿写";
  /** 瀑布流里的封面比例 */
  ratio: "3/4" | "4/5" | "1/1";
  /** true 表示团队编写的示例，不是真实用户发布的内容 */
  sample: boolean;
};

/** 首屏照片墙额外用到的 16 篇（照片墙 = 这些 + 作品展示里的 12 篇） */
export const HERO_POSTS: Post[] = [
  { id: "o1", image: img("outfit-camera"), title: "新入手的胶片机，第一卷拍了这些", topic: "胶片机", author: "是阿柚呀", avatar: img("portrait-golden-hair"), likes: "1.2w" },
  { id: "o2", image: img("travel-blue-lagoon"), title: "冰岛蓝湖，泡着温泉看雪", topic: "冰岛蓝湖", author: "一只山野人", avatar: img("travel-skate-sunset"), likes: "8,406" },
  { id: "o3", image: img("food-pour-over"), title: "手冲咖啡入门，三件套就够", topic: "手冲咖啡", author: "咖啡续命中", avatar: img("food-latte"), likes: "3,951" },
  { id: "o4", image: img("travel-balloons"), title: "卡帕多奇亚的热气球清晨", topic: "热气球", author: "周末去海边", avatar: img("travel-heart-sunset"), likes: "2.6w" },
  { id: "o5", image: img("pet-bulldog"), title: "法斗的一百种委屈表情", topic: "养法斗", author: "小狗也想出门", avatar: img("pet-pug"), likes: "1.8w" },
  { id: "o6", image: img("city-street-cafe"), title: "街角的红伞咖啡馆", topic: "街角咖啡馆", author: "城市漫游者", avatar: img("city-yellow-cafe"), likes: "5,210" },
  { id: "o7", image: img("food-cookies"), title: "周末烤了一盘黄油曲奇", topic: "黄油曲奇", author: "爱吃番茄面", avatar: img("food-salad"), likes: "4,377" },
  { id: "o8", image: img("travel-canyon"), title: "羚羊峡谷里的光", topic: "羚羊峡谷", author: "一只山野人", avatar: img("travel-skate-sunset"), likes: "9,812" },
  { id: "o9", image: img("travel-blue-van"), title: "开着小蓝车去海边", topic: "自驾去海边", author: "周末去海边", avatar: img("travel-heart-sunset"), likes: "6,045" },
  { id: "o10", image: img("home-bed-mug"), title: "周末早晨，再赖床十分钟", topic: "周末赖床", author: "今天也要早睡", avatar: img("home-blue-vase"), likes: "2,318" },
  { id: "o11", image: img("food-salad"), title: "减脂餐也可以很好吃", topic: "减脂餐", author: "爱吃番茄面", avatar: img("food-salad"), likes: "7,640" },
  { id: "o12", image: img("outfit-street-walk"), title: "通勤穿搭｜九分裤配乐福鞋", topic: "通勤穿搭", author: "早八不迟到", avatar: img("outfit-yellow-coat"), likes: "3,102" },
  { id: "o13", image: img("travel-snow-camp"), title: "雪山脚下露营一晚", topic: "雪山露营", author: "一只山野人", avatar: img("travel-skate-sunset"), likes: "1.1w" },
  { id: "o14", image: img("study-book"), title: "今年读完的第 20 本书", topic: "读书", author: "慢慢生活家", avatar: img("home-balcony-plant"), likes: "1,876" },
  { id: "o15", image: img("city-cliff-town"), title: "五渔村，彩色房子挂在悬崖上", topic: "五渔村", author: "城市漫游者", avatar: img("city-yellow-cafe"), likes: "2.0w" },
  { id: "o16", image: img("portrait-golden-hair"), title: "傍晚六点的阳光刚刚好", topic: "傍晚拍照", author: "是阿柚呀", avatar: img("portrait-golden-hair"), likes: "1.5w" },
];

/** 「作品展示」瀑布流 */
export const SHOWCASE_NOTES: ShowcaseNote[] = [
  {
    id: "fjord",
    category: "旅行",
    image: img("travel-fjord"),
    title: "挪威峡湾｜在悬崖边看了一下午的云",
    topic: "峡湾徒步",
    body: "徒步两个多小时才到布道石，风很大，但看到峡湾的那一刻觉得一切都值了。\n\n建议早上出发，避开中午的人流；鞋一定要选防滑的，最后一段都是石头路。",
    tags: ["挪威旅行", "徒步", "峡湾"],
    mode: "原创",
    ratio: "3/4",
    author: "一只山野人",
    avatar: img("travel-skate-sunset"),
    likes: "2.1w",
    sample: true,
  },
  {
    id: "white-dress",
    category: "穿搭",
    image: img("outfit-white-dress"),
    title: "森林系白裙，随手一拍都出片",
    topic: "白裙穿搭",
    body: "一条棉麻白裙配草编包，去公园、去郊外都很合适。\n\n拍照小技巧：背光站在树荫边缘，让阳光从背后打过来，整个人会很柔和。",
    tags: ["白裙", "森林系穿搭", "拍照姿势"],
    mode: "仿写",
    ratio: "4/5",
    author: "是阿柚呀",
    avatar: img("portrait-golden-hair"),
    likes: "9,832",
    sample: true,
  },
  {
    id: "latte",
    category: "美食",
    image: img("food-latte"),
    title: "老城区的咖啡馆，拉花好看到舍不得喝",
    topic: "咖啡探店",
    body: "藏在巷子二楼，木桌子、老唱片，下午的光正好照在吧台上。\n\n招牌是燕麦拿铁，不会太甜；周末人多，建议工作日下午来。",
    tags: ["咖啡探店", "拿铁", "城市角落"],
    mode: "原创",
    ratio: "1/1",
    author: "咖啡续命中",
    avatar: img("food-latte"),
    likes: "6,214",
    sample: true,
  },
  {
    id: "pug",
    category: "萌宠",
    image: img("pet-pug"),
    title: "降温了，给狗子裹上小毯子",
    topic: "狗狗穿衣",
    body: "出门前裹好，它就乖乖坐着不动了，像个小老头。\n\n巴哥怕冷又怕热，秋冬散步记得缩短时间，回家擦干爪子。",
    tags: ["巴哥", "狗狗日常", "萌宠"],
    mode: "原创",
    ratio: "3/4",
    author: "小狗也想出门",
    avatar: img("pet-pug"),
    likes: "3.4w",
    sample: true,
  },
  {
    id: "santorini",
    category: "旅行",
    image: img("travel-santorini"),
    title: "蓝白小镇的日落，比照片里还好看",
    topic: "看日落",
    body: "伊亚的日落要提前一个小时去占位置，或者干脆找一家能看海的餐厅，边吃边等。\n\n白房子在傍晚会变成粉橘色，怎么拍都好看。",
    tags: ["圣托里尼", "海岛旅行", "日落"],
    mode: "仿写",
    ratio: "4/5",
    author: "周末去海边",
    avatar: img("travel-heart-sunset"),
    likes: "1.6w",
    sample: true,
  },
  {
    id: "balcony",
    category: "家居",
    image: img("home-balcony-plant"),
    title: "租房阳台改造，一瓶绿植就够了",
    topic: "阳台改造",
    body: "不用大改，一张小桌子、一瓶插枝的绿植，阳台就有了生活感。\n\n尤加利和龙柳都很好养，换水就能活很久。",
    tags: ["租房改造", "阳台", "绿植"],
    mode: "原创",
    ratio: "3/4",
    author: "慢慢生活家",
    avatar: img("home-balcony-plant"),
    likes: "4,580",
    sample: true,
  },
  {
    id: "yellow-coat",
    category: "穿搭",
    image: img("outfit-yellow-coat"),
    title: "冬天就要穿得亮一点｜姜黄色外套",
    topic: "冬季穿搭",
    body: "灰扑扑的冬天，一件姜黄色外套能把整个人提亮。\n\n内搭选灰色卫衣，下身牛仔裤，再配一顶针织帽，简单又不单调。",
    tags: ["冬季穿搭", "外套", "早八穿搭"],
    mode: "仿写",
    ratio: "1/1",
    author: "早八不迟到",
    avatar: img("outfit-yellow-coat"),
    likes: "7,903",
    sample: true,
  },
  {
    id: "yogurt",
    category: "美食",
    image: img("food-yogurt"),
    title: "5 分钟早餐：酸奶草莓燕麦杯",
    topic: "快手早餐",
    body: "前一晚把燕麦泡进酸奶里，早上切几颗草莓铺上去，就是一份不用开火的早餐。\n\n喜欢甜一点的可以加一勺蜂蜜。",
    tags: ["快手早餐", "燕麦杯", "一人食"],
    mode: "原创",
    ratio: "4/5",
    author: "爱吃番茄面",
    avatar: img("food-salad"),
    likes: "5,127",
    sample: true,
  },
  {
    id: "canoe",
    category: "旅行",
    image: img("travel-canoe"),
    title: "划船去湖中心，世界一下子安静了",
    topic: "湖上划船",
    body: "租一条小船，划到湖中间停下来，四周只有水声和风声。\n\n记得穿防水的鞋，带一件薄外套，湖上会比岸边冷。",
    tags: ["湖边", "户外", "治愈系"],
    mode: "原创",
    ratio: "3/4",
    author: "一只山野人",
    avatar: img("travel-skate-sunset"),
    likes: "1.3w",
    sample: true,
  },
  {
    id: "yellow-cafe",
    category: "城市",
    image: img("city-yellow-cafe"),
    title: "City walk｜黄墙咖啡店和门口的自行车",
    topic: "city walk",
    body: "这条街从头走到尾大概四十分钟，黄墙这家是中间的休息点。\n\n门口那辆自行车好像一直停在那里，成了大家拍照的道具。",
    tags: ["citywalk", "城市漫游", "拍照打卡"],
    mode: "仿写",
    ratio: "1/1",
    author: "城市漫游者",
    avatar: img("city-yellow-cafe"),
    likes: "8,846",
    sample: true,
  },
  {
    id: "dining",
    category: "家居",
    image: img("home-dining"),
    title: "极简餐厅，白色椅子永远不会错",
    topic: "极简餐厅",
    body: "原木桌配白色餐椅，再挂一盏简单的吊灯，小餐厅也能很通透。\n\n颜色控制在三种以内，房间会显得更干净。",
    tags: ["极简风", "餐厅布置", "家居"],
    mode: "原创",
    ratio: "4/5",
    author: "慢慢生活家",
    avatar: img("home-balcony-plant"),
    likes: "3,269",
    sample: true,
  },
  {
    id: "husky",
    category: "萌宠",
    image: img("pet-husky"),
    title: "带二哈去露营，它比我还兴奋",
    topic: "带狗露营",
    body: "第一次带它去营地，一下车就开始到处闻，晚上还守在帐篷门口不睡觉。\n\n带狗露营记得备好牵引绳、饮水碗和驱虫用品。",
    tags: ["哈士奇", "带狗露营", "狗狗日常"],
    mode: "仿写",
    ratio: "3/4",
    author: "小狗也想出门",
    avatar: img("pet-pug"),
    likes: "2.7w",
    sample: true,
  },
];
