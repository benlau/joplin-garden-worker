const YAML = require("yaml");
const FileRepo = require("./filerepo");

class StorageService {
    static ApiToken = "apiToken";

    static AuthToken = "authToken";

    static Filename = ".auth";

    constructor(fileRepo = new FileRepo()) {
        this.fileRepo = fileRepo;
    }

    load() {
        try {
            this.data = YAML.parse(
                this.fileRepo.loadFile(StorageService.Filename),
            ) ?? {};
        } catch (e) {
            this.data = {};
        }
    }

    save() {
        this.fileRepo.writeFile(StorageService.Filename, YAML.stringify(this.data));
    }

    get(key) {
        return this.data[key];
    }

    set(key, value) {
        this.data[key] = value;
    }
}

module.exports = StorageService;
