import { randomBytes } from "node:crypto";

export function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export function makePseudoHash(prefix) {
  return `${prefix}${randomBytes(12).toString("hex")}`;
}
