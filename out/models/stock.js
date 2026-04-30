"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Market = void 0;
exports.detectMarket = detectMarket;
var Market;
(function (Market) {
    Market["SH"] = "SH";
    Market["SZ"] = "SZ";
    Market["BJ"] = "BJ";
    Market["HK"] = "HK";
    Market["US"] = "US";
})(Market || (exports.Market = Market = {}));
function detectMarket(code) {
    const p = code.substring(0, 2);
    if (/^(60|68|51|50|52|56|58|11)$/.test(p))
        return Market.SH;
    if (/^(00|30|12|15|16|18)$/.test(p))
        return Market.SZ;
    if (/^(43|83|87|88|82|4|8)$/.test(p))
        return Market.BJ;
    if (/^[a-zA-Z]/.test(code.charAt(0)))
        return Market.US;
    return Market.SH;
}
//# sourceMappingURL=stock.js.map