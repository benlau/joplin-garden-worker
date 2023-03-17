const crypto = require("crypto");

class CryptoRepo {
    sha256(message) {
        return crypto.createHash("sha256").update(message).digest("hex");
    }
}

module.exports = CryptoRepo;
