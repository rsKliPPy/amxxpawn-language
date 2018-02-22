'use strict';

export function isAlpha(character: string) {
    return /[A-Za-z_@]/.test(character);
}
export function isAlphaNum(character: string) {
    return /[\w@]/.test(character);
}
export function isDigit(character: string) {
    return /\d/.test(character);
}
export function isWhitespace(character: string) {
    return /\s/.test(character);
}
export function reverse(text: string) {
    return [...text].reverse().join('');
}

export function fuzzy(text: string, search: string) {
    search = search.toLowerCase();
    text = text.toLowerCase();

    for (let i = 0, j = -1; i < search.length; i++) {
        const l = search[i];
        if (l == ' ') continue;

        j = text.indexOf(l, j + 1);
        if (j == -1) return false;
    }
    return true;
}