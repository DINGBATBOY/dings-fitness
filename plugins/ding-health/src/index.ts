import { registerPlugin } from '@capacitor/core';

import type { DingHealthPlugin } from './definitions';

const DingHealth = registerPlugin<DingHealthPlugin>('DingHealth', {
  web: () => import('./web').then((m) => new m.DingHealthWeb()),
});

export * from './definitions';
export { DingHealth };
