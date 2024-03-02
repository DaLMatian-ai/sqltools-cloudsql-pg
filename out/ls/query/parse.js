"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class QueryParser {
    static parse(query, driver = "mysql") {
        if (driver === "mssql") {
            query = query.replace(/^[ \t]*GO;?[ \t]*$/gim, "");
        }
        const delimiter = ";";
        const queries = [];
        const flag = true;
        let restOfQuery;
        while (flag) {
            if (restOfQuery == null) {
                restOfQuery = query;
            }
            const statementAndRest = QueryParser.getStatements(restOfQuery, driver, delimiter);
            const statement = statementAndRest[0];
            if (statement != null && statement.trim() != "") {
                queries.push(statement);
            }
            restOfQuery = statementAndRest[1];
            if (restOfQuery == null || restOfQuery.trim() == "") {
                break;
            }
        }
        return queries;
    }
    static getStatements(query, driver, delimiter) {
        let previousChar = null;
        let isInComment = false;
        let isInString = false;
        let isInTag = false;
        let nextChar = null;
        let commentChar = null;
        let stringChar = null;
        let tagChar = null;
        const charArray = Array.from(query);
        let resultQueries = [];
        for (let index = 0; index < charArray.length; index++) {
            let char = charArray[index];
            if (index > 0) {
                previousChar = charArray[index - 1];
            }
            if (index < charArray.length) {
                nextChar = charArray[index + 1];
            }
            if (previousChar != "\\" &&
                (char == "'" || char == '"') &&
                isInString == false &&
                isInComment == false) {
                isInString = true;
                stringChar = char;
                continue;
            }
            if (((char == "#" && nextChar == " ") ||
                (char == "-" && nextChar == "-") ||
                (char == "/" && nextChar == "*")) &&
                isInString == false) {
                isInComment = true;
                commentChar = char;
                continue;
            }
            if (isInComment == true &&
                (((commentChar == "#" || commentChar == "-") && char == "\n") ||
                    (commentChar == "/" && char == "*" && nextChar == "/"))) {
                isInComment = false;
                commentChar = null;
                continue;
            }
            if (previousChar != "\\" && char == stringChar && isInString == true) {
                isInString = false;
                stringChar = null;
                continue;
            }
            if (char.toLowerCase() == "d" &&
                isInComment == false &&
                isInString == false) {
                const delimiterResult = QueryParser.getDelimiter(index, query, driver);
                if (delimiterResult != null) {
                    const delimiterSymbol = delimiterResult[0];
                    const delimiterEndIndex = delimiterResult[1];
                    query = query.substring(delimiterEndIndex);
                    resultQueries = QueryParser.getStatements(query, driver, delimiterSymbol);
                    break;
                }
            }
            if (char == "$" && isInComment == false && isInString == false) {
                const queryUntilTagSymbol = query.substring(index);
                if (isInTag == false) {
                    const tagSymbolResult = QueryParser.getTag(queryUntilTagSymbol, driver);
                    if (tagSymbolResult != null) {
                        isInTag = true;
                        tagChar = tagSymbolResult[0];
                    }
                }
                else {
                    const tagSymbolResult = QueryParser.getTag(queryUntilTagSymbol, driver);
                    if (tagSymbolResult != null) {
                        const tagSymbol = tagSymbolResult[0];
                        if (tagSymbol == tagChar) {
                            isInTag = false;
                        }
                    }
                }
            }
            if (driver === "mssql" &&
                char.toLowerCase() === "g" &&
                `${charArray[index + 1] || ""}`.toLowerCase() === "o" &&
                typeof charArray[index + 2] !== "undefined" &&
                /go\b/gi.test(`${char}${charArray[index + 1]}${charArray[index + 2]}`)) {
                char = `${char}${charArray[index + 1]}`;
            }
            if ((char.toLowerCase() === delimiter.toLowerCase() ||
                char.toLowerCase() === "go") &&
                isInString == false &&
                isInComment == false &&
                isInTag == false) {
                let splittingIndex = index + 1;
                if (driver === "mssql" && char.toLowerCase() === "go") {
                    splittingIndex = index;
                    resultQueries = QueryParser.getQueryParts(query, splittingIndex, 2);
                    break;
                }
                resultQueries = QueryParser.getQueryParts(query, splittingIndex, 0);
                break;
            }
        }
        if (resultQueries.length == 0) {
            if (query != null) {
                query = query.trim();
            }
            resultQueries.push(query, null);
        }
        return resultQueries;
    }
    static getQueryParts(query, splittingIndex, numChars = 1) {
        let statement = query.substring(0, splittingIndex);
        const restOfQuery = query.substring(splittingIndex + numChars);
        const result = [];
        if (statement != null) {
            statement = statement.trim();
        }
        result.push(statement);
        result.push(restOfQuery);
        return result;
    }
    static getDelimiter(index, query, driver) {
        if (driver == "mysql") {
            const delimiterKeyword = "delimiter ";
            const delimiterLength = delimiterKeyword.length;
            const parsedQueryAfterIndexOriginal = query.substring(index);
            const indexOfDelimiterKeyword = parsedQueryAfterIndexOriginal
                .toLowerCase()
                .indexOf(delimiterKeyword);
            if (indexOfDelimiterKeyword == 0) {
                let parsedQueryAfterIndex = query.substring(index);
                let indexOfNewLine = parsedQueryAfterIndex.indexOf("\n");
                if (indexOfNewLine == -1) {
                    indexOfNewLine = query.length;
                }
                parsedQueryAfterIndex = parsedQueryAfterIndex.substring(0, indexOfNewLine);
                parsedQueryAfterIndex =
                    parsedQueryAfterIndex.substring(delimiterLength);
                let delimiterSymbol = parsedQueryAfterIndex.trim();
                delimiterSymbol = QueryParser.clearTextUntilComment(delimiterSymbol);
                if (delimiterSymbol != null) {
                    delimiterSymbol = delimiterSymbol.trim();
                    const delimiterSymbolEndIndex = parsedQueryAfterIndexOriginal.indexOf(delimiterSymbol) +
                        index +
                        delimiterSymbol.length;
                    const result = [];
                    result.push(delimiterSymbol);
                    result.push(delimiterSymbolEndIndex);
                    return result;
                }
                else {
                    return null;
                }
            }
            else {
                return null;
            }
        }
    }
    static getTag(query, driver) {
        if (driver == "pg") {
            const matchTag = query.match(/^(\$[a-zA-Z]*\$)/i);
            if (matchTag != null && matchTag.length > 1) {
                const result = [];
                const tagSymbol = matchTag[1].trim();
                const indexOfCmd = query.indexOf(tagSymbol);
                result.push(tagSymbol);
                result.push(indexOfCmd);
                return result;
            }
            else {
                return null;
            }
        }
    }
    static isGoDelimiter(driver, query, index) {
        if (driver == "mssql") {
            const match = /(?:\bgo\b\s*)/i.exec(query);
            if (match != null && match.index == index) {
                return true;
            }
            else {
                return false;
            }
        }
    }
    static clearTextUntilComment(text) {
        let nextChar = null;
        let clearedText = null;
        const charArray = Array.from(text);
        for (let index = 0; index < charArray.length; index++) {
            const char = charArray[index];
            if (index < charArray.length) {
                nextChar = charArray[index + 1];
            }
            if ((char == "#" && nextChar == " ") ||
                (char == "-" && nextChar == "-") ||
                (char == "/" && nextChar == "*")) {
                break;
            }
            else {
                if (clearedText == null) {
                    clearedText = "";
                }
                clearedText += char;
            }
        }
        return clearedText;
    }
}
exports.default = QueryParser.parse;
//# sourceMappingURL=parse.js.map