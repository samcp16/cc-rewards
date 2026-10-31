import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // 覆盖率只对领域层计账：UI 组件的渲染覆盖率由前端负责人单独设定，
      // 混在一起会让「引擎有没有测干净」这个信号被稀释。
      include: ['src/domain/**/*.ts', 'src/lib/**/*.ts'],
      exclude: [
        'src/domain/**/*.test.ts',
        'src/domain/types.ts',
        'src/domain/types.result.ts',
        'src/domain/data/cards-hk-mo.json',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
