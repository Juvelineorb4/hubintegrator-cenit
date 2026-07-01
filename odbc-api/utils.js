import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

export const readJSON = (path) => require(path)

export const toPHDDateTime = (dateTimeStr) => {
    // Pasar valores relativos de PHD tal cual (ej. NOW, NOW-1h, NOW-30m)
    if (/^NOW/i.test(dateTimeStr)) return dateTimeStr;

    const date = new Date(dateTimeStr.replace(' ', 'T')); // soporta 'YYYY-MM-DD HH:mm:ss'

    const months = [
        'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
        'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
    ];

    const DD = String(date.getDate()).padStart(2, '0');
    const MMM = months[date.getMonth()];
    const YYYY = date.getFullYear();

    const HH = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');

    return `${DD}-${MMM}-${YYYY} ${HH}:${mm}:${ss}`;
}