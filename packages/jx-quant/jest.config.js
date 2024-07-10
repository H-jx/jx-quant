
const tsConfig = require('./tsconfig.json');

tsConfig.compilerOptions.types = ["jest"];
module.exports = {
    globals: {
        'ts-jest': {
            tsconfig: tsConfig.compilerOptions
        }
    },
    moduleFileExtensions: ['js', 'ts'],
    moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1",
    },
    transform: {
        '^.+\\.(js|mjs)$': '<rootDir>/node_modules/babel-jest',
    },
    testRegex: '^.+\\.test\\.(js|ts)$',
    testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'], //转换时需忽略的文件
    testURL: 'http://localhost/', // 运行环境下的URl
};
