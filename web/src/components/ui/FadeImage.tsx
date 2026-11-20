"use client";

import { useState } from "react";
import Image, { type ImageProps } from "next/image";

/**
 * 加载完成后再淡入的图片，避免照片「啪」地一下出现。
 * 用法和 next/image 一样；容器最好有底色（如 bg-sand-100），加载时不会是空白。
 */
export function FadeImage({ className = "", onLoad, alt, ...props }: ImageProps) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Image
      {...props}
      alt={alt}
      className={`transition-[opacity,transform] duration-700 ease-out ${loaded ? "opacity-100" : "opacity-0"} ${className}`}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
    />
  );
}
