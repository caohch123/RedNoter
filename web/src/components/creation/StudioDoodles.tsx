import type { CSSProperties } from "react";

type DoodleProps = {
  className?: string;
};

const NON_INTERACTIVE: CSSProperties = { pointerEvents: "none" };

/** 顶栏手绘氛围点缀：云朵、暖金弧线与小星芒（随浅/暗主题变量自适应） */
export function HeaderDoodles({ className }: DoodleProps) {
  return (
    <div
      className={className}
      aria-hidden="true"
      data-sketch-doodle=""
      style={NON_INTERACTIVE}
    >
      {/* 左上暖金彩铅弧线与小星芒 */}
      <svg
        viewBox="0 0 112 44"
        fill="none"
        aria-hidden="true"
        data-sketch-doodle=""
        focusable="false"
        style={{
          ...NON_INTERACTIVE,
          position: "absolute",
          left: "clamp(150px, 16vw, 240px)",
          top: "4px",
          width: "108px",
          height: "42px",
          opacity: 0.82,
        }}
      >
        <path
          d="M12 24C29 11 54 9 76 17"
          stroke="var(--doodle-gold, #f3ba48)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeDasharray="1 0"
          opacity="0.72"
        />
        <path
          d="M19 29C34 21 52 19 67 23"
          stroke="var(--doodle-gold, #f3ba48)"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.48"
        />
        <path
          d="M90 12L92.5 17.5L98 20L92.5 22.5L90 28L87.5 22.5L82 20L87.5 17.5Z"
          fill="var(--doodle-gold-soft, rgba(247, 205, 114, 0.45))"
          stroke="var(--doodle-gold, #f3ba48)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>

      {/* 中左粉紫小花星 */}
      <svg
        viewBox="0 0 44 36"
        fill="none"
        aria-hidden="true"
        data-sketch-doodle=""
        focusable="false"
        style={{
          ...NON_INTERACTIVE,
          position: "absolute",
          left: "clamp(260px, 26vw, 370px)",
          bottom: "5px",
          width: "40px",
          height: "32px",
          opacity: 0.78,
        }}
      >
        <path
          d="M18 7L20 13L26 15L20 17L18 23L16 17L10 15L16 13Z"
          fill="var(--doodle-pink-soft, rgba(244, 152, 198, 0.34))"
          stroke="var(--doodle-pink, #eb74ad)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="31" cy="24" r="2.2" fill="var(--doodle-lavender, #9b74ef)" opacity="0.6" />
        <path
          d="M32 9L34 12.5"
          stroke="var(--doodle-pink, #eb74ad)"
          strokeWidth="1.7"
          strokeLinecap="round"
          opacity="0.65"
        />
      </svg>

      {/* 右侧轻云朵与星点 */}
      <svg
        viewBox="0 0 132 48"
        fill="none"
        aria-hidden="true"
        data-sketch-doodle=""
        focusable="false"
        style={{
          ...NON_INTERACTIVE,
          position: "absolute",
          right: "clamp(245px, 22vw, 340px)",
          top: "3px",
          width: "126px",
          height: "46px",
          opacity: 0.85,
        }}
      >
        <path
          d="M31 35C22.5 35 17 30.2 17 24.4C17 19.6 21 15.8 26.2 15.2C28.4 9.6 34.4 6 41.2 6C49 6 55.2 10.6 56.8 16.5C58 16.1 59.4 15.9 60.8 15.9C66.6 15.9 71 19.8 71 25C71 30.6 66 35 59.4 35H31Z"
          fill="var(--doodle-cloud, rgba(214, 224, 255, 0.52))"
          stroke="var(--doodle-cloud-stroke, #a4b4f0)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M28 29L36 22M37 31L46 21M47 31L55 23"
          stroke="var(--doodle-cloud-stroke, #a4b4f0)"
          strokeWidth="1.3"
          strokeLinecap="round"
          opacity="0.45"
        />
        <path
          d="M89 14L91 18.5L95.5 20.5L91 22.5L89 27L87 22.5L82.5 20.5L87 18.5Z"
          fill="var(--doodle-gold-soft, rgba(247, 205, 114, 0.45))"
          stroke="var(--doodle-gold, #f3ba48)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <circle cx="107" cy="30" r="2.2" fill="var(--doodle-pink, #eb74ad)" opacity="0.68" />
        <path
          d="M113 18C117 16 121 17 124 20"
          stroke="var(--doodle-lavender, #9b74ef)"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.65"
        />
      </svg>
    </div>
  );
}

/** 欢迎主视觉右下角的淡蓝紫彩铅云朵 */
export function HeroCloudDoodle({ className }: DoodleProps) {
  return (
    <svg
      viewBox="0 0 88 52"
      fill="none"
      className={className}
      aria-hidden="true"
      data-sketch-doodle=""
      focusable="false"
      style={NON_INTERACTIVE}
    >
      <path
        d="M21 44C12.2 44 6 38.4 6 31.4C6 25.4 10.6 20.6 17 19.8C19.6 11.4 27.6 6 36.8 6C47.2 6 55.6 12.2 57.6 20.4C59.2 19.9 61 19.6 62.8 19.6C71.4 19.6 78 24.8 78 31.8C78 38.8 71.8 44 63.2 44H21Z"
        fill="var(--doodle-cloud, rgba(214, 224, 255, 0.65))"
        stroke="var(--doodle-cloud-stroke, #9fb1f0)"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 37L29 27M29 39L41 25M41 39L52 27M53 39L62 30"
        stroke="var(--doodle-cloud-stroke, #9fb1f0)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.48"
      />
      <path
        d="M22 44.5C34 45.2 52 44.8 62 44.3"
        stroke="var(--doodle-lavender, #a27cf2)"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.38"
      />
    </svg>
  );
}

/** 欢迎主图标周围的金色射线、粉紫四角星与小星点 */
export function HeroOrbitSparkles({ className }: DoodleProps) {
  return (
    <svg
      viewBox="0 0 210 176"
      fill="none"
      className={className}
      aria-hidden="true"
      data-sketch-doodle=""
      focusable="false"
      style={NON_INTERACTIVE}
    >
      {/* 左上三道暖金手绘光芒 */}
      <path
        d="M22 36L35 45M30 22L41 35M46 15L50 30"
        stroke="var(--doodle-gold, #f3ba48)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* 左侧小星星与星点 */}
      <path
        d="M17 92L19.5 97.5L25 100L19.5 102.5L17 108L14.5 102.5L9 100L14.5 97.5Z"
        fill="var(--doodle-gold-soft, rgba(247, 205, 114, 0.48))"
        stroke="var(--doodle-gold, #f3ba48)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="30" cy="126" r="2.6" fill="var(--doodle-pink, #eb74ad)" opacity="0.65" />
      <circle cx="42" cy="144" r="1.8" fill="var(--doodle-lavender, #9b74ef)" opacity="0.58" />

      {/* 右上粉色手绘四角星 */}
      <path
        d="M176 26L180 37L191 41L180 45L176 56L172 45L161 41L172 37Z"
        fill="var(--doodle-pink-soft, rgba(244, 152, 198, 0.36))"
        stroke="var(--doodle-pink, #eb74ad)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="195" cy="58" r="2.4" fill="var(--doodle-gold, #f3ba48)" opacity="0.72" />
      <path
        d="M158 18L161 23"
        stroke="var(--doodle-pink, #eb74ad)"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}

/** 欢迎主标题下的有机粉红彩铅高亮笔刷下划线 */
export function HeroTitleUnderline({ className }: DoodleProps) {
  return (
    <svg
      viewBox="0 0 280 18"
      fill="none"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
      data-sketch-doodle=""
      focusable="false"
      style={NON_INTERACTIVE}
    >
      <path
        d="M6 12.5C68 8.2 184 6.5 274 9.8"
        stroke="var(--doodle-pink-soft, rgba(244, 152, 198, 0.45))"
        strokeWidth="8.5"
        strokeLinecap="round"
      />
      <path
        d="M14 11.2C84 8.6 196 7.8 266 10.6"
        stroke="var(--doodle-pink, #eb74ad)"
        strokeWidth="3.2"
        strokeLinecap="round"
        opacity="0.72"
      />
    </svg>
  );
}

/** 标题右侧三条俏皮粉色手绘强调线 */
export function TitleEmphasisStrokes({ className }: DoodleProps) {
  return (
    <svg
      viewBox="0 0 26 24"
      fill="none"
      className={className}
      aria-hidden="true"
      data-sketch-doodle=""
      focusable="false"
      style={NON_INTERACTIVE}
    >
      <path
        d="M5 7L15 3M6 13L21 10.5M6 19L16 20.5"
        stroke="var(--doodle-pink, #eb74ad)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 手绘暖金四芒星（用于主题输入框、欢迎标题左翼、定稿按钮装饰） */
export function SparkleFourPoint({ className }: DoodleProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      data-sketch-doodle=""
      focusable="false"
      style={NON_INTERACTIVE}
    >
      <path
        d="M12 2.8L14.4 9.6L21.2 12L14.4 14.4L12 21.2L9.6 14.4L2.8 12L9.6 9.6Z"
        fill="var(--doodle-gold-soft, rgba(247, 205, 114, 0.45))"
        stroke="var(--doodle-gold, #f3ba48)"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="19" cy="5.2" r="1.4" fill="var(--doodle-gold, #f3ba48)" opacity="0.78" />
    </svg>
  );
}

/** 左栏底部空白处的温柔手绘粉郁金香 */
export function TulipDoodle({ className }: DoodleProps) {
  return (
    <svg
      viewBox="0 0 86 76"
      fill="none"
      className={className}
      aria-hidden="true"
      data-sketch-doodle=""
      focusable="false"
      style={NON_INTERACTIVE}
    >
      {/* 花茎与叶子 */}
      <path
        d="M43 37C42.5 47 43 57 43.2 66"
        stroke="var(--doodle-stem, #79b879)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M42.5 64C31 61 21 53 16 44C25 45 34 51 42.5 61Z"
        fill="var(--doodle-stem-soft, rgba(145, 206, 142, 0.36))"
        stroke="var(--doodle-stem, #79b879)"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M43.5 64C55 61 65 53 70 43C61 44.5 52 50.5 43.5 61Z"
        fill="var(--doodle-stem-soft, rgba(145, 206, 142, 0.36))"
        stroke="var(--doodle-stem, #79b879)"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 左右外侧花瓣 */}
      <path
        d="M32 34C25 27 24 15 31 11C34 14 37 21 38 29"
        fill="var(--doodle-petal-hi, rgba(255, 198, 224, 0.72))"
        stroke="var(--doodle-pink, #e66da7)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M54 34C61 27 62 15 55 11C52 14 49 21 48 29"
        fill="var(--doodle-petal-hi, rgba(255, 198, 224, 0.72))"
        stroke="var(--doodle-pink, #e66da7)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 中间郁金香主花苞与彩铅质感线 */}
      <path
        d="M30 22C30 13 36.5 7.5 43 7.5C49.5 7.5 56 13 56 22C56 31.5 50 38 43 38C36 38 30 31.5 30 22Z"
        fill="var(--doodle-petal, rgba(250, 152, 198, 0.65))"
        stroke="var(--doodle-pink, #e66da7)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M35 20C36 25 38 30 41 34M43 13C43.2 21 43.2 28 43 35M51 20C50 25 48 30 45 34"
        stroke="var(--doodle-pink, #e66da7)"
        strokeWidth="1.35"
        strokeLinecap="round"
        opacity="0.52"
      />

      {/* 底部轻草地弧线 */}
      <path
        d="M12 68C28 65.5 58 65.5 74 68"
        stroke="var(--doodle-stem, #79b879)"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.48"
      />
    </svg>
  );
}

/** 中栏输入框右上角趴着打盹的薰衣草紫小猫（Zzz） */
export function SleepingCatDoodle({ className }: DoodleProps) {
  return (
    <svg
      viewBox="0 0 124 72"
      fill="none"
      className={className}
      aria-hidden="true"
      data-sketch-doodle=""
      focusable="false"
      style={NON_INTERACTIVE}
    >
      {/* 底部温和丘陵弧线 */}
      <path
        d="M4 65C32 58.5 84 58 118 65"
        stroke="var(--doodle-cat-stroke, #8f72cf)"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.55"
      />

      {/* 小猫身子与耳朵 */}
      <path
        d="M27 60C25 48 29 36 34 31L31 15L45 24C50 22.2 58 22.2 63 24L77 15L74 31C79 36 83 48 81 60"
        fill="var(--doodle-cat-fill, rgba(226, 211, 255, 0.84))"
        stroke="var(--doodle-cat-stroke, #8f72cf)"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 内耳粉色 */}
      <path
        d="M35.5 20.5L37 26.5L42.5 24Z"
        fill="var(--doodle-pink-soft, rgba(244, 152, 198, 0.52))"
      />
      <path
        d="M72.5 20.5L71 26.5L65.5 24Z"
        fill="var(--doodle-pink-soft, rgba(244, 152, 198, 0.52))"
      />

      {/* 淡淡彩铅纹理 */}
      <path
        d="M38 40L44 35M64 35L70 40"
        stroke="var(--doodle-cat-shade, rgba(162, 134, 224, 0.35))"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* 闭合的睡眼与腮红、小鼻嘴 */}
      <path
        d="M40 41C42.5 43.8 46.5 43.8 48.5 41"
        stroke="var(--doodle-cat-stroke, #8f72cf)"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M59.5 41C61.5 43.8 65.5 43.8 68 41"
        stroke="var(--doodle-cat-stroke, #8f72cf)"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <ellipse cx="38.5" cy="45.5" rx="3.4" ry="1.8" fill="var(--doodle-pink-soft, rgba(244, 152, 198, 0.55))" />
      <ellipse cx="69.5" cy="45.5" rx="3.4" ry="1.8" fill="var(--doodle-pink-soft, rgba(244, 152, 198, 0.55))" />
      <path
        d="M52 45.2H56L54 47.4Z"
        fill="var(--doodle-pink, #e66da7)"
      />
      <path
        d="M50.5 49C52 50.6 53.5 50 54 48.2C54.5 50 56 50.6 57.5 49"
        stroke="var(--doodle-cat-stroke, #8f72cf)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 胡须 */}
      <path
        d="M28 42L20 40M27 46.5L19 47.5M80 42L88 40M81 46.5L89 47.5"
        stroke="var(--doodle-cat-stroke, #8f72cf)"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.72"
      />

      {/* 搭在边沿的两只软乎乎小爪爪 */}
      <ellipse
        cx="41"
        cy="60.5"
        rx="7.5"
        ry="4.2"
        fill="var(--doodle-cat-fill, #efe7ff)"
        stroke="var(--doodle-cat-stroke, #8f72cf)"
        strokeWidth="1.9"
      />
      <ellipse
        cx="67"
        cy="60.5"
        rx="7.5"
        ry="4.2"
        fill="var(--doodle-cat-fill, #efe7ff)"
        stroke="var(--doodle-cat-stroke, #8f72cf)"
        strokeWidth="1.9"
      />

      {/* 飘起的三个打盹 Zzz */}
      <path
        d="M87 28H94L87 34.5H94"
        stroke="var(--doodle-lavender, #9b74ef)"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M96 17H104.5L96 25H104.5"
        stroke="var(--doodle-pink, #e66da7)"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M107 6H117L107 15.5H117"
        stroke="var(--doodle-lavender, #9b74ef)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 中栏输入框左上角的粉色一笔画小爱心波浪线 */
export function HeartWaveDoodle({ className }: DoodleProps) {
  return (
    <svg
      viewBox="0 0 132 28"
      fill="none"
      className={className}
      aria-hidden="true"
      data-sketch-doodle=""
      focusable="false"
      style={NON_INTERACTIVE}
    >
      <path
        d="M4 22C18 19.5 31 20.5 41 21.2C43 16 40 9.5 44 7.5C47.5 5.8 50.2 8.8 50.8 11.4C51.6 8.8 54.5 6 57.8 7.8C61.5 9.8 58.2 16.5 52 21.4C72 22.2 102 20.5 126 22.5"
        stroke="var(--doodle-pink, #ec7cb2)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.72"
      />
      <path
        d="M50.8 11.4C50 8.8 47.4 6 44 7.5C40.4 9.2 42.8 16 51.4 21.2C58 16.5 61.3 9.8 57.8 7.8C54.6 6 51.6 8.8 50.8 11.4Z"
        fill="var(--doodle-pink-soft, rgba(244, 152, 198, 0.32))"
      />
    </svg>
  );
}
