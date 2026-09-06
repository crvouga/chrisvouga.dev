import { Assert } from './assert';
import { DefaultCrashHandler } from './crash/default-crash-handler';

export const assert: Assert = Assert.crash();

assert.registerCrashHandler(new DefaultCrashHandler());
