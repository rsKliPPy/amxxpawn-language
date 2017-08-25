'use strict';

export function isAlpha(character: string) {
    return /[A-Za-z_@]/.test(character);
}
export function isAlphaNum(character: string) {
    return /[\w_@]/.test(character);
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