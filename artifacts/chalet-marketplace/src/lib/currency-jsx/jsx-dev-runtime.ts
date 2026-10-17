import { jsxDEV as originalJsxDEV } from "react/jsx-dev-runtime";
import { currencyDisplayProps } from "./props";
export { Fragment } from "react/jsx-dev-runtime";
export const jsxDEV: typeof originalJsxDEV = (type, props, key, staticChildren, source, self) =>
  originalJsxDEV(type, currencyDisplayProps(type, props), key, staticChildren, source, self);
