/** 报错与提示文案的语言。默认中文（服务端、测试都走默认）；前端切换语言时调 setLocale。 */
export type Locale = 'zh' | 'en';

let locale: Locale = 'zh';

export const setLocale = (l: Locale) => { locale = l; };
export const getLocale = (): Locale => locale;

/** 按当前语言二选一。要在用到的那一刻调用，别在模块顶层求值，否则切换语言后不会变。 */
export const L = (zh: string, en: string): string => (locale === 'en' ? en : zh);
