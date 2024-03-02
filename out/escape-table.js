"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pgCheckEscape = void 0;
const pgCheckEscape = (w) => /[^a-z0-9_]/.test(w.label || w)
    ? `"${w.label || w}"`
    : w.label || w;
exports.pgCheckEscape = pgCheckEscape;
function escapeTableName(table) {
    let items = [];
    let tableObj = typeof table === "string" ? { label: table } : table;
    tableObj.database && items.push((0, exports.pgCheckEscape)(tableObj.database));
    tableObj.schema && items.push((0, exports.pgCheckEscape)(tableObj.schema));
    items.push((0, exports.pgCheckEscape)(tableObj.label));
    return items.join(".");
}
exports.default = escapeTableName;
//# sourceMappingURL=escape-table.js.map