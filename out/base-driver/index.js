"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_not_supported_1 = __importDefault(require("./lib/exception/electron-not-supported"));
const missing_module_1 = __importDefault(require("./lib/exception/missing-module"));
const require_1 = __importStar(require("./lib/require"));
const log_1 = require("@sqltools/log");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const vscode_uri_1 = require("vscode-uri");
class AbstractDriver {
    credentials;
    getWorkspaceFolders;
    log;
    deps = [];
    getId() {
        return this.credentials.id;
    }
    connection;
    constructor(credentials, getWorkspaceFolders) {
        this.credentials = credentials;
        this.getWorkspaceFolders = getWorkspaceFolders;
        this.log = (0, log_1.createLogger)(credentials.driver.toLowerCase());
    }
    singleQuery(query, opt) {
        return this.query(query, opt).then(([res]) => res);
    }
    queryResults = async (query, opt) => {
        const result = await this.singleQuery(query, opt);
        if (result.error)
            throw result.rawError;
        return result.results;
    };
    async describeTable(metadata, opt) {
        const result = await this.singleQuery(this.queries.describeTable(metadata), opt);
        result.baseQuery = this.queries.describeTable.raw;
        return [result];
    }
    async showRecords(table, opt) {
        const { limit, page = 0 } = opt;
        const params = { ...opt, limit, table, offset: page * limit };
        if (typeof this.queries.fetchRecords === 'function' && typeof this.queries.countRecords === 'function') {
            const [records, totalResult] = await (Promise.all([
                this.singleQuery(this.queries.fetchRecords(params), opt),
                this.singleQuery(this.queries.countRecords(params), opt),
            ]));
            records.baseQuery = this.queries.fetchRecords.raw;
            records.pageSize = limit;
            records.page = page;
            records.total = Number(totalResult.results[0].total);
            records.queryType = 'showRecords';
            records.queryParams = table;
            return [records];
        }
        return this.query(this.queries.fetchRecords(params), opt);
    }
    async checkDependencies() {
        if (!this.deps || this.deps.length === 0)
            return;
        if (Number(process.env.IS_NODE_RUNTIME || '0') !== 1) {
            throw new electron_not_supported_1.default();
        }
        this.deps.forEach(dep => {
            let mustUpgrade = false;
            switch (dep.type) {
                case AbstractDriver.CONSTANTS.DEPENDENCY_PACKAGE:
                    try {
                        const { version } = JSON.parse(fs_1.default.readFileSync(this.resolveDep(dep.name + '/package.json')).toString());
                        if (dep.version && version !== dep.version) {
                            mustUpgrade = true;
                            throw new Error(`Version not matching. We need to upgrade ${dep.name}`);
                        }
                        this.requireDep(dep.name);
                    }
                    catch (e) {
                        throw new missing_module_1.default(this.deps, this.credentials, mustUpgrade);
                    }
                    break;
            }
        });
    }
    requireDep = (name) => {
        return (0, require_1.default)(name);
    };
    resolveDep = (name) => {
        return (0, require_1.sqltoolsResolve)(name);
    };
    getChildrenForItem(_params) {
        this.log.error(`###### Attention ######\getChildrenForItem not implemented for ${this.credentials.driver}\n####################`);
        return Promise.resolve([]);
    }
    searchItems(_itemType, _search, _extraParams) {
        this.log.error(`###### Attention ######\searchItems not implemented for ${this.credentials.driver}\n####################`);
        return Promise.resolve([]);
    }
    async toAbsolutePath(fsPath) {
        if (!path_1.default.isAbsolute(fsPath) && /\$\{workspaceFolder:(.+)}/g.test(fsPath)) {
            const workspaceName = fsPath.match(/\$\{workspaceFolder:(.+)}/)[1];
            if (workspaceName) {
                const workspaceFolders = await this.getWorkspaceFolders();
                const dbWorkspace = workspaceFolders.find(w => w.name === workspaceName);
                fsPath = path_1.default.resolve(vscode_uri_1.URI.parse(dbWorkspace.uri, true).fsPath, fsPath.replace(/\$\{workspaceFolder:(.+)}/g, './'));
            }
        }
        return fsPath;
    }
    prepareMessage(message) {
        return { message: message.toString(), date: new Date() };
    }
    static CONSTANTS = {
        DEPENDENCY_PACKAGE: 'package',
        DEPENDENCY_NPM_SCRIPT: 'npmscript',
    };
}
exports.default = AbstractDriver;
//# sourceMappingURL=index.js.map