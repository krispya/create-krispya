import * as p from '@clack/prompts';
import color from 'chalk';

import { getAiPlatforms } from '../resolve/user-config.js';
import {
  AI_PLATFORM_HINTS,
  AI_PLATFORM_LABELS,
  ALL_AI_PLATFORMS,
} from '../plan/renderers/ai-files.js';
import type { AiPlatform } from '../types.js';

export async function promptForAiAgentPlatforms(isNonInteractive: boolean): Promise<AiPlatform[]> {
  const savedPlatforms = getAiPlatforms();

  if (isNonInteractive) {
    return savedPlatforms ?? ALL_AI_PLATFORMS;
  }

  if (savedPlatforms && savedPlatforms.length > 0) {
    const savedLabels = savedPlatforms.map((platform) => AI_PLATFORM_LABELS[platform]).join(', ');
    const useDefault = await p.confirm({
      message: `Add AI rules? ${color.dim(`(${savedLabels})`)}`,
      initialValue: true,
    });
    if (p.isCancel(useDefault)) {
      return [];
    }
    if (useDefault) {
      return savedPlatforms;
    }
  }

  const selected = await p.multiselect({
    message: 'Add AI rules?',
    options: ALL_AI_PLATFORMS.map((platform) => ({
      value: platform,
      label: AI_PLATFORM_LABELS[platform],
      hint: AI_PLATFORM_HINTS[platform],
    })),
    initialValues: ['agents'],
    required: false,
  });

  if (p.isCancel(selected)) {
    return [];
  }

  return selected as AiPlatform[];
}
