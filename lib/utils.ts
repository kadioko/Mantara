import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names, letting later Tailwind utilities win over earlier conflicting ones.
 * This is the `cn` helper shadcn/ui components expect, so registry components drop in unchanged.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
