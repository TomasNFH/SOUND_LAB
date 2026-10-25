import { useSyncExternalStore } from 'react';
import { live } from './LiveEngine';

export const useLive = () => useSyncExternalStore(live.subscribe, live.getState);
