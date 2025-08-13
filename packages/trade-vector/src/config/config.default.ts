import { MidwayConfig } from '@midwayjs/core';

export default {
  // use for cookie sign key, should change to your own and keep security
  keys: '1755017459463_3109',
  koa: {
    port: 7001,
  },
  qdrant: {
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    apiKey: process.env.QDRANT_API_KEY || 'xxoo',
  },
} as MidwayConfig;
