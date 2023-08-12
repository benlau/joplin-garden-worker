const { ShellString, mkdir } = require("shelljs");
const YAML = require("yaml");
const fs = require("fs");
const path = require("path");
const FileRepo = require("./filerepo");
const LinkService = require("./linkservice");

class GardenService {
    constructor(config, outputDir, services = {}) {
        this.joplinDataService = services.joplinDataService;
        this.noteParserService = services.noteParserService;
        this.linkService = services.linkService ?? new LinkService();
        this.fileRepo = services.fileRepo ?? new FileRepo();
        this.config = config;
        this.joplin = {
            notes: [],
            notesIndex: new Map(),
        };
        this.outputDir = outputDir;

        this.garden = {
            notes: new Map(),
        };
        this.storedGarden = {
            notes: new Map(),
        };
        this.resources = new Map();
    }

    get defaultFolder() {
        return this.config?.defaultFolder ?? "";
    }

    async queryResourceInfo(id) {
        const {
            joplinDataService,
        } = this;

        if (!this.resources.has(id)) {
            try {
                const resource = await joplinDataService.readResourceInfo(id);
                if (resource !== undefined && resource.error === undefined) {
                    this.resources.set(id, resource);
                }
            } catch (e) {
                // ignore exception
            }
        }
        return this.resources.get(id);
    }

    setNoteMetadata(id, metadata) {
        this.garden.notes.set(id, metadata);
    }

    getNoteMetadata(id) {
        return this.garden.notes.get(id);
    }

    getNoteInfo(id) {
        return this.joplin.notesIndex.get(id);
    }

    getAllNoteInfo() {
        return this.joplin.notes;
    }

    loadNoteMetadata() {
        // @FIXME - load metadata
        try {
            const garden = YAML.parse(this.fileRepo.loadFile("metadata.yaml"));
            garden?.notes.forEach((item) => {
                this.setNoteMetadata(item.id, item);
            });
            this.storedGarden.notes = new Map(JSON.parse(JSON.stringify([...this.garden.notes])));
        } catch (e) {
            // ignore exception
        }
    }

    async loadNoteInfo() {
        const {
            config,
            joplinDataService,
        } = this;

        const includeTags = config.includeTags ?? [];

        const notes = (await Promise.all(
            includeTags.map(async (tag) => joplinDataService.getNotesByTag(tag)),
        )
        ).flat();

        this.joplin.notes = notes;
        this.joplin.notesIndex = new Map(notes.map((note) => [note.id, note]));
        return notes;
    }

    saveNoteMetadata() {
        const notes = Array.from(this.garden.notes.entries()).map(
            ([_id, item]) => item,
        );
        ShellString(YAML.stringify({
            notes,
        })).to("metadata.yaml");
    }

    readFile(pathToken) {
        const file = [this.outputDir].concat(
            pathToken.filter((p) => p !== undefined && p !== ""),
        ).join("/");
        return this.fileRepo.loadFile(file);
    }

    saveFile(pathToken, content) {
        const file = [this.outputDir].concat(
            pathToken.filter((p) => p !== undefined && p !== ""),
        ).join("/");

        mkdir("-p", path.dirname(file));
        fs.writeFileSync(file, content);
        return file;
    }

    isNewNote(id) {
        return !this.storedGarden.notes.has(id);
    }
}

module.exports = GardenService;
