
/**
 * 保留几位小数
 * @param value 待处理的数值
 * @param digits 保留位数
 */
 export const keepDecimalFixed = (value: number | string, digits = 2) => {
    const unit = Math.pow(10, digits);
    const val = typeof value === 'number' ? value : Number(value);
    return Math.trunc(val * unit) / unit;
};


function numlen(num: number) {
    let len = 0;
    let value = num;
    while (value >= 10) {
        len++;
        value /= 10;
    }
    return len;
}

const decimalZeroDigitsReg = /^-?(\d+)\.?([0]*)/;
/**
 * 根据小数有效值自动保留小数位数
 * @param value
 */
export function autoToFixed(value) {
    value = typeof value === 'string' ? value : String(value);
    const match = value.match(decimalZeroDigitsReg);
    const recommendDigit = 5 - (match ? match[1].length : 0);
    return keepDecimalFixed(value, recommendDigit < 2 ? 1 : recommendDigit);
}
