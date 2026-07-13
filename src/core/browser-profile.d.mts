import type { chromium } from '@playwright/test';

export function fixedProfileLaunchOptions(
  headless?: boolean
): Parameters<typeof chromium.launchPersistentContext>[1];
