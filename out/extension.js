"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode_1 = require("vscode");
const constants_1 = require("./constants");
const { publisher, name } = require("../package.json");
const driverName = "Google Cloud SQL (PostgreSQL)";
const AUTHENTICATION_PROVIDER = "sqltools-driver-credentials";
async function activate(extContext) {
    const sqltools = vscode_1.extensions.getExtension("mtxr.sqltools");
    if (!sqltools) {
        throw new Error("SQLTools not installed");
    }
    await sqltools.activate();
    const api = sqltools.exports;
    const extensionId = `${publisher}.${name}`;
    const plugin = {
        extensionId,
        name: `${driverName} Plugin`,
        type: "driver",
        async register(extension) {
            extension.resourcesMap().set(`driver/${constants_1.DRIVER_ALIASES[0].value}/icons`, {
                active: extContext.asAbsolutePath("icons/pg/active.png"),
                default: extContext.asAbsolutePath("icons/pg/default.png"),
                inactive: extContext.asAbsolutePath("icons/pg/inactive.png"),
            });
            constants_1.DRIVER_ALIASES.forEach(({ value }) => {
                extension
                    .resourcesMap()
                    .set(`driver/${value}/extension-id`, extensionId);
                extension
                    .resourcesMap()
                    .set(`driver/${value}/connection-schema`, extContext.asAbsolutePath("connection.schema.json"));
                extension
                    .resourcesMap()
                    .set(`driver/${value}/ui-schema`, extContext.asAbsolutePath("ui.schema.json"));
            });
            await extension.client.sendRequest("ls/RegisterPlugin", {
                path: extContext.asAbsolutePath("out/ls/plugin.js"),
            });
        },
    };
    api.registerPlugin(plugin);
    return {
        driverName,
        parseBeforeSaveConnection: ({ connInfo }) => {
            const propsToRemove = ["id", "usePassword"];
            if (connInfo.usePassword) {
                if (connInfo.usePassword.toString().toLowerCase().includes("ask")) {
                    connInfo.askForPassword = true;
                    propsToRemove.push("password");
                }
                else if (connInfo.usePassword.toString().toLowerCase().includes("iam")) {
                    connInfo.iamAuthentication = true;
                    propsToRemove.push("password");
                    propsToRemove.push("askForPassword");
                }
                else if (connInfo.usePassword.toString().toLowerCase().includes("empty")) {
                    connInfo.password = "";
                    propsToRemove.push("askForPassword");
                }
                else if (connInfo.usePassword.toString().toLowerCase().includes("save")) {
                    propsToRemove.push("askForPassword");
                }
                else if (connInfo.usePassword.toString().toLowerCase().includes("secure")) {
                    propsToRemove.push("password");
                    propsToRemove.push("askForPassword");
                }
            }
            propsToRemove.forEach((p) => delete connInfo[p]);
            connInfo.pgOptions = connInfo.pgOptions || {};
            if (Object.keys(connInfo.pgOptions).length === 0) {
                delete connInfo.pgOptions;
            }
            return connInfo;
        },
        parseBeforeEditConnection: ({ connInfo }) => {
            const formData = {
                ...connInfo,
            };
            if (connInfo.askForPassword) {
                formData.usePassword = "Ask on connect";
                delete formData.password;
            }
            else if (typeof connInfo.password === "string") {
                delete formData.askForPassword;
                formData.usePassword = connInfo.password
                    ? "Save as plaintext in settings"
                    : "Use empty password";
            }
            else if (connInfo.iamAuthentication) {
                formData.usePassword = "IAM authentication";
                delete formData.iamAuthentication;
            }
            else {
                formData.usePassword = "SQLTools Driver Credentials";
            }
            formData.pgOptions = formData.pgOptions || {};
            return formData;
        },
        resolveConnection: async ({ connInfo }) => {
            if (connInfo.password === undefined &&
                !connInfo.askForPassword &&
                !connInfo.iamAuthentication) {
                const scopes = [connInfo.name, connInfo.username || ""];
                let session = await vscode_1.authentication.getSession(AUTHENTICATION_PROVIDER, scopes, { silent: true });
                if (!session) {
                    session = await vscode_1.authentication.getSession(AUTHENTICATION_PROVIDER, scopes, { createIfNone: true });
                }
                if (session) {
                    connInfo.password = session.accessToken;
                }
            }
            return connInfo;
        },
        driverAliases: constants_1.DRIVER_ALIASES,
    };
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map