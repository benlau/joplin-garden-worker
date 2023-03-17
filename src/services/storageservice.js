const YAML = require("yaml");
const FileRepo = require("./filerepo");
const path = require("path");
const { mkdir } = require("shelljs");

const AUTH_TOKEN = "auth-token";
const API_TOKEN = "api-token";
const AUTH_FILE = ".auth";

class StorageService {

    constructor(fileRepo = new FileRepo()) {
        this.fileRepo = fileRepo;
    }

    load() {
        try {
            this.data = YAML.parse(
                this.fileRepo.loadFile(AUTH_FILE),
            ) ?? {};
        } catch (e) {
            this.data = {};
        }
    }

    save() {
        const dirname = path.dirname(AUTH_FILE);
        mkdir("-p", dirname);
        this.fileRepo.writeFile(AUTH_FILE, YAML.stringify(this.data));
    }

    get(key, defaults) {
        const value = this.data[key];
        return value === undefined ? defaults : value;
    }

    set(key, value) {
        this.data[key] = value;
    }

    get keys() {
        return Object.keys(this.data);
    }

    get authToken() {
        return this.get(AUTH_TOKEN);
    }

    set authToken(value) {
        this.set(AUTH_TOKEN, value);
    }

    get apiToken() {
        return this.get(API_TOKEN);
    }

    set apiToken(value) {
        this.set(API_TOKEN, value);
    }
}

module.exports = StorageService;
