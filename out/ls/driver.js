"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const queries_1 = __importDefault(require("./queries"));
const cloud_sql_connector_1 = require("@google-cloud/cloud-sql-connector");
const types_1 = require("./../types");
const base_driver_1 = __importDefault(require("./../base-driver"));
const google_auth_library_1 = require("google-auth-library");
const zipObject_1 = __importDefault(require("lodash/zipObject"));
const uuid_1 = require("uuid");
const query_1 = require("./query");
const rawValue = (v) => v;
pg_1.types.setTypeParser(pg_1.types.builtins.TIMESTAMP || 1114, rawValue);
pg_1.types.setTypeParser(pg_1.types.builtins.TIMESTAMPTZ || 1184, rawValue);
pg_1.types.setTypeParser(pg_1.types.builtins.DATE || 1082, rawValue);
class PostgreSQL extends base_driver_1.default {
    queries = queries_1.default;
    async open() {
        if (this.connection) {
            return this.connection;
        }
        try {
            const { ssl, ...pgOptions } = this.credentials.pgOptions || {};
            let auth;
            if (this.credentials.credentialsFile ||
                this.credentials.impersonatedServiceAccount) {
                const scopes = ["https://www.googleapis.com/auth/sqlservice.admin"];
                if (this.credentials.iamAuthentication) {
                    scopes.push("https://www.googleapis.com/auth/sqlservice.login");
                }
                if (this.credentials.impersonatedServiceAccount) {
                    const sourceAuth = new google_auth_library_1.GoogleAuth({
                        keyFile: this.credentials.credentialsFile,
                        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
                    });
                    auth = new google_auth_library_1.Impersonated({
                        sourceClient: await sourceAuth.getClient(),
                        targetPrincipal: this.credentials.impersonatedServiceAccount,
                        targetScopes: scopes,
                    });
                }
                else {
                    auth = new google_auth_library_1.GoogleAuth({
                        keyFile: this.credentials.credentialsFile,
                        scopes,
                    });
                }
            }
            const connector = new cloud_sql_connector_1.Connector({
                auth,
            });
            const clientOpts = await connector.getOptions({
                instanceConnectionName: this.credentials.instanceConnectionName,
                ipType: cloud_sql_connector_1.IpAddressTypes.PUBLIC,
                authType: this.credentials.iamAuthentication
                    ? cloud_sql_connector_1.AuthTypes.IAM
                    : cloud_sql_connector_1.AuthTypes.PASSWORD,
            });
            let poolConfig = {
                ...clientOpts,
                connectionTimeoutMillis: Number(`${this.credentials.connectionTimeout || 0}`) * 1000,
                ...pgOptions,
                database: this.credentials.database,
                password: this.credentials.password,
                user: this.credentials.username,
            };
            const pool = new pg_1.Pool(poolConfig);
            const cli = await pool.connect();
            cli.release();
            this.connection = Promise.resolve(pool);
            return this.connection;
        }
        catch (error) {
            return Promise.reject(error);
        }
    }
    async close() {
        if (!this.connection)
            return Promise.resolve();
        const pool = await this.connection;
        this.connection = null;
        pool.end();
    }
    query = (query, opt = {}) => {
        const messages = [];
        let cli;
        const { requestId } = opt;
        return this.open()
            .then(async (pool) => {
            cli = await pool.connect();
            cli.on("notice", (notice) => messages.push(this.prepareMessage(`${notice.name.toUpperCase()}: ${notice.message}`)));
            const results = await cli.query({
                text: query.toString(),
                rowMode: "array",
            });
            cli.release();
            return results;
        })
            .then((results) => {
            const queries = (0, query_1.parse)(query.toString(), "pg");
            if (!Array.isArray(results)) {
                results = [results];
            }
            return results.map((r, i) => {
                const cols = this.getColumnNames(r.fields || []);
                return {
                    requestId,
                    resultId: (0, uuid_1.v4)(),
                    connId: this.getId(),
                    cols,
                    messages: messages.concat([
                        this.prepareMessage(`${r.command} successfully executed.${r.command.toLowerCase() !== "select" &&
                            typeof r.rowCount === "number"
                            ? ` ${r.rowCount} rows were affected.`
                            : ""}`),
                    ]),
                    query: queries[i],
                    results: this.mapRows(r.rows, cols),
                };
            });
        })
            .catch((err) => {
            cli && cli.release();
            return [
                {
                    connId: this.getId(),
                    requestId,
                    resultId: (0, uuid_1.v4)(),
                    cols: [],
                    messages: messages.concat([
                        this.prepareMessage([
                            (err && err.message) || err,
                            err && err.routine === "scanner_yyerror" && err.position
                                ? `at character ${err.position}`
                                : undefined,
                        ]
                            .filter(Boolean)
                            .join(" ")),
                    ]),
                    error: true,
                    rawError: err,
                    query,
                    results: [],
                },
            ];
        });
    };
    getColumnNames(fields) {
        return fields.reduce((names, { name }) => {
            const count = names.filter((n) => n === name).length;
            return names.concat(count > 0 ? `${name} (${count})` : name);
        }, []);
    }
    mapRows(rows, columns) {
        return rows.map((r) => (0, zipObject_1.default)(columns, r));
    }
    async getColumns(parent) {
        const results = await this.queryResults(this.queries.fetchColumns(parent));
        return results.map((col) => ({
            ...col,
            iconName: col.isPk ? "pk" : col.isFk ? "fk" : null,
            childType: types_1.ContextValue.NO_CHILD,
            table: parent,
        }));
    }
    async testConnection() {
        const pool = await this.open();
        const cli = await pool.connect();
        await cli.query("SELECT 1");
        cli.release();
    }
    async getChildrenForItem({ item, parent, }) {
        switch (item.type) {
            case types_1.ContextValue.CONNECTION:
            case types_1.ContextValue.CONNECTED_CONNECTION:
                return this.queryResults(this.queries.fetchDatabases());
            case types_1.ContextValue.TABLE:
            case types_1.ContextValue.VIEW:
            case types_1.ContextValue.MATERIALIZED_VIEW:
                return this.getColumns(item);
            case types_1.ContextValue.DATABASE:
                return [
                    {
                        label: "Schemas",
                        type: types_1.ContextValue.RESOURCE_GROUP,
                        iconId: "folder",
                        childType: types_1.ContextValue.SCHEMA,
                    },
                ];
            case types_1.ContextValue.RESOURCE_GROUP:
                return this.getChildrenForGroup({ item, parent });
            case types_1.ContextValue.SCHEMA:
                return [
                    {
                        label: "Tables",
                        type: types_1.ContextValue.RESOURCE_GROUP,
                        iconId: "folder",
                        childType: types_1.ContextValue.TABLE,
                    },
                    {
                        label: "Views",
                        type: types_1.ContextValue.RESOURCE_GROUP,
                        iconId: "folder",
                        childType: types_1.ContextValue.VIEW,
                    },
                    {
                        label: "Materialized Views",
                        type: types_1.ContextValue.RESOURCE_GROUP,
                        iconId: "folder",
                        childType: types_1.ContextValue.MATERIALIZED_VIEW,
                    },
                    {
                        label: "Functions",
                        type: types_1.ContextValue.RESOURCE_GROUP,
                        iconId: "folder",
                        childType: types_1.ContextValue.FUNCTION,
                    },
                ];
            case types_1.ContextValue.DATABASE_MAP:
                return this.getDatabaseMap(item);
        }
        return [];
    }
    async getChildrenForGroup({ parent, item, }) {
        switch (item.childType) {
            case types_1.ContextValue.SCHEMA:
                return this.queryResults(this.queries.fetchSchemas(parent));
            case types_1.ContextValue.TABLE:
                return this.queryResults(this.queries.fetchTables(parent));
            case types_1.ContextValue.VIEW:
                return this.queryResults(this.queries.fetchViews(parent));
            case types_1.ContextValue.MATERIALIZED_VIEW:
                return this.queryResults(this.queries.fetchMaterializedViews(parent));
            case types_1.ContextValue.FUNCTION:
                return this.queryResults(this.queries.fetchFunctions(parent));
        }
        return [];
    }
    searchItems(itemType, search, extraParams = {}) {
        switch (itemType) {
            case types_1.ContextValue.TABLE:
                return this.queryResults(this.queries.searchTables({ search }));
            case types_1.ContextValue.COLUMN:
                return this.queryResults(this.queries.searchColumns({ search, ...extraParams }));
        }
    }
    completionsCache = null;
    getStaticCompletions = async () => {
        if (this.completionsCache)
            return this.completionsCache;
        this.completionsCache = {};
        const items = await this.queryResults("SELECT UPPER(word) AS label, UPPER(catdesc) AS desc FROM pg_get_keywords();");
        items.forEach((item) => {
            this.completionsCache[item.label] = {
                label: item.label,
                detail: item.label,
                filterText: item.label,
                sortText: (["SELECT", "CREATE", "UPDATE", "DELETE"].includes(item.label)
                    ? "2:"
                    : "") + item.label,
                documentation: {
                    value: `\`\`\`yaml\nWORD: ${item.label}\nTYPE: ${item.desc}\n\`\`\``,
                    kind: "markdown",
                },
            };
        });
        return this.completionsCache;
    };
    async getDatabaseMap(parent) {
        return await this.queryResults(this.queries.fetchDatabaseMap(parent));
    }
}
exports.default = PostgreSQL;
//# sourceMappingURL=driver.js.map