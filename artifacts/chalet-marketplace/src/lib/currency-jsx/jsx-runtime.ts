import { jsx as originalJsx, jsxs as originalJsxs } from "react/jsx-runtime";
import { currencyDisplayProps } from "./props";
export { Fragment } from "react/jsx-runtime";
export const jsx: typeof originalJsx = (type, props, key) => originalJsx(type, currencyDisplayProps(type, props), key);
export const jsxs: typeof originalJsxs = (type, props, key) => originalJsxs(type, currencyDisplayProps(type, props), key);
