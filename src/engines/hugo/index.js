const process = require("process");
const YAML = require("yaml");

class Hugo {
    constructor(engineService) {
        const {
            gardenService,
        } = engineService.services;

        this.engineService = engineService;
        this.gardenService = gardenService;
        this.defaultFolder = gardenService.config?.defaultFolder;
        this.backlinks = new Map();

        this.services = {
            gardenService,
            noteParserService: gardenService.noteParserService,
            linkService: gardenService.linkService,
            engineService,
        };
    }

    async prepare() {
        const {
            gardenService,
        } = this;
        const { notes } = gardenService.joplin;

        try {
            // eslint-disable-next-line
            this.hooks = require(`${process.cwd()}/hooks.js`);
        } catch (e) {
            // ignore error
        }

        // process back links
        for (const note of notes) {
            const items = (await gardenService.joplinDataService.searchNotes(note.id))
                .filter((item) => gardenService.getNoteInfo(item.id) !== undefined)
                .map((item) => ({
                    id: item.id,
                    text: item.title,
                    icon: "fas",
                    href: "#",
                }))
                .sort((a, b) => {
                    if (a.text > b.text) {
                        return 1;
                    }
                    if (b.text > a.text) {
                        return -1;
                    }
                    return 0;
                });
            this.backlinks.set(note.id, items);
        }
    }

    // Export a note
    async exportNote(note) {
        const {
            body, metadata,
            originalBody,
        } = note;
        const {
            gardenService,
        } = this;

        const {
            folder,
            filename,
        } = metadata;

        const path = ["content", folder, filename];
        const file = await gardenService.saveFile(path, body);

        await this.hooks?.postExportNote(metadata.id, {
            file,
            body,
            originalBody,
            metadata,
        }, this);
    }

    async processAllMetadata() {
        const {
            gardenService,
        } = this;

        for (const note of gardenService.getAllNoteInfo()) {
            const {
                id,
            } = note;
            const metadata = gardenService.getNoteMetadata(id);

            metadata.headers?.backlinks?.forEach((link) => {
                const target = gardenService.getNoteMetadata(link.id) ?? {};
                const {
                    folder,
                    link: targetLink,
                } = target;
                const normalizedLink = targetLink.replaceAll(" ", "-").toLowerCase();
                link.href = `/${folder}/${normalizedLink}`;
            });
        }
    }

    async exportResource(blob, resource) {
        const {
            gardenService,
        } = this;

        const resPath = this.genResourcePath(resource);
        const path = ["static", resPath];
        let buffer = await blob.arrayBuffer();
        buffer = Buffer.from(buffer);

        await gardenService.saveFile(path, buffer);
    }

    // Process a single note and return the metadata
    async processNoteMetadata(info) {
        const {
            gardenService,
        } = this;

        const {
            id,
        } = info;

        let metadata = gardenService.getNoteMetadata(id);
        const filename = metadata?.filename ?? this.genFilename(info);
        const folder = metadata?.folder ?? this.defaultFolder;
        const savedHeaders = metadata?.headers ?? {};
        const backlinks = this.backlinks.get(id) ?? [];

        savedHeaders.title = info.title;

        const headers = {
            title: metadata?.title ?? info.title,
            draft: metadata?.draft ?? false,
            date: new Date(info.created_time).toISOString(),
            summary: " ",
            ...savedHeaders,
            joplinId: id,
            backlinks,
        };

        metadata = {
            ...metadata,
            link: this.genLink(info),
            filename,
            folder,
            headers,
        };

        const note = {
            info,
            metadata,
        };

        this.hooks?.postProcessNoteMetadata(id, note, this);

        return note.metadata;
    }

    async processNoteBody(noteInfo, body) {
        const {
            gardenService,
            engineService,
        } = this;

        const {
            id,
        } = noteInfo;

        let note = {
            info: noteInfo,
            body,
            originalBody: body,
        };

        const metadata = gardenService.getNoteMetadata(id);

        let newBody = body;

        newBody = await engineService.transclude(newBody);

        try {
            newBody = await gardenService.noteParserService.updateBlocks(
                newBody,
                /^```garden$/,
                /^```$/,
                async (block) => this.processGardenBlock(block, id, metadata),
            );
        } catch (e) {
            // eslint-disable-next-line
            console.error(`Unable to process note: ${noteInfo.title} (${id}) \n\n`);
            throw (e);
        }

        newBody = await engineService.removeBrokenNoteLinks(
            newBody,
        );

        newBody = await gardenService.noteParserService.updateLinks(
            newBody,
            async (link, linkId, title) => {
                if (link[0] === "!") { // a image/file link
                    const resource = await gardenService.queryResourceInfo(linkId);
                    if (resource !== undefined && resource.error === undefined) {
                        const resourceLink = this.genResourceLink(resource);
                        return `![${title}](${resourceLink})`;
                    }
                }

                const target = gardenService.getNoteInfo(linkId);
                if (target === undefined) {
                    return title;
                }
                const newLink = `[${title}]({{< ref "${this.genLink(target)}" >}})`;
                return newLink;
            },
        );

        /// Handle mermaid block
        newBody = await gardenService.noteParserService.updateBlocks(
            newBody,
            /^```mermaid$/,
            /^```$/,
            async (block) => {
                const lines = block.split("\n");
                const content = lines.slice(1, lines.length - 1).join("\n");
                return `{{< mermaid >}}\n${content}\n{{< /mermaid >}}`;
            },
        );

        note = {
            ...note,
            body: newBody,
            metadata,
        };

        // Before writing the file, we can run a hook to modify the state
        await this.hooks?.postProcessNoteBody(id, note, this);

        const divider = "---";

        const header = [divider, YAML.stringify(note.metadata.headers), divider].flat().join("\n");

        return {
            originalBody: note.originalBody,
            metadata,
            body: [header, note.body].join("\n"),
        };
    }

    normalizeText(text) {
        // Normalize title and filename
        return text.replaceAll("/", "-")
            .replaceAll(":", " ")
            .replaceAll(",", " ");
    }

    genFilename(note) {
        // Preserve the title
        const normalized = this.normalizeText(note.title);
        const outputAsFolder = this.gardenService.config?.hugoOptions?.outputAsFolder ?? false;

        return outputAsFolder ? `${normalized}/index.md` : `${normalized}.md`;
    }

    genLink(note) {
        const {
            id,
        } = note;

        const { gardenService } = this;

        const link = gardenService.garden.notes.has(id)
            ? gardenService.getNoteMetadata(id).link : undefined;
        if (link !== undefined) {
            return link;
        }

        const normalized = this.normalizeText(note.title);
        return `${normalized}`;
    }

    genResourcePath(resource) {
        return `/res/${resource.id}/${resource.title}`;
    }

    genResourceLink(resource) {
        const title = encodeURIComponent(resource.title);
        return `/res/${resource.id}/${title}`;
    }

    async processGardenBlock(block, id, metadata) {
        const {
            gardenService,
        } = this;

        const lines = block.split("\n");
        const content = lines.slice(1, lines.length - 1).join("\n");
        const fields = YAML.parse(content);
        const { summary, headers } = fields;

        if (summary !== undefined) {
            metadata.headers.summary = summary;
        }

        if (headers !== undefined) {
            metadata.headers = {
                ...metadata.headers,
                ...headers,
            };
        }

        if (gardenService.isNewNote(id)) {
            const { folder } = fields;
            if (folder !== undefined) {
                metadata.folder = folder;
            }
            const { slug } = fields;
            if (slug !== undefined) {
                metadata.filename = `${slug}/index.md`;
                metadata.link = slug;
            }
        }
        return "";
    }
}

module.exports = Hugo;
