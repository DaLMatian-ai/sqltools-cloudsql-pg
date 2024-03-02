"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parse = void 0;
const parse_1 = __importDefault(require("./parse"));
function parse(query, driver = "mysql") {
    return (0, parse_1.default)(query, driver);
}
exports.parse = parse;
//# sourceMappingURL=index.js.map