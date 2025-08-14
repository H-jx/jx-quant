/**
 * 保留几位小数
 * @param value 待处理的数值
 * @param digits 保留位数
 */
declare const keepDecimalFixed: (value: number | string, digits?: number) => number;
/**
 * 根据小数有效值自动保留小数位数
 * @param value
 */
declare function autoToFixed(value: any): number;

export { autoToFixed, keepDecimalFixed };
