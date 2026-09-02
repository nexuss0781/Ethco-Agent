import React from 'react';
import * as LucideIcons from 'lucide-react';
import { MessageSquare } from 'lucide-react';

export function getDynamicLucideIcon(iconName?: string): React.ComponentType<{ className?: string }> {
  if (!iconName || typeof iconName !== 'string') {
    return MessageSquare;
  }

  // Normalize name to PascalCase: e.g. "code" -> "Code", "git-branch" -> "GitBranch", "file_code" -> "FileCode"
  const cleaned = iconName
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');

  if (!cleaned) {
    return MessageSquare;
  }

  const iconsMap = LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>;

  // Direct check or PascalCase check
  if (iconsMap[cleaned]) {
    return iconsMap[cleaned];
  }

  // Check with "Icon" suffix
  if (iconsMap[`${cleaned}Icon`]) {
    return iconsMap[`${cleaned}Icon`];
  }

  // Case-insensitive lookup across Lucide icons
  const lowerCleaned = cleaned.toLowerCase();
  const foundKey = Object.keys(iconsMap).find(
    (key) => key.toLowerCase() === lowerCleaned || key.toLowerCase() === `${lowerCleaned}icon`
  );

  if (foundKey && iconsMap[foundKey]) {
    return iconsMap[foundKey];
  }

  return MessageSquare;
}
