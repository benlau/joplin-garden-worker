const YAML = require("yaml");

class GithubWiki {
    constructor(engineService) {
        const {
            gardenService,
        } = engineService.services;
        this.gardenService = gardenService;
        this.engineService = engineService;
        this.defaultFolder = gardenService.config?.defaultFolder;
        this.services = {
            gardenService,
            noteParserService: gardenService.noteParserService,
            linkService: gardenService.linkService,
            engineService,
        };
    }

    async prepare() {
        try {
            // eslint-disable-next-line
            this.hooks = require(`${process.cwd()}/hooks.js`);
        } catch (e) {
            // ignore error
        }
    }

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

        const path = [folder, filename];
        const file = await gardenService.saveFile(path, body);

        await this.hooks?.postExportNote?.(metadata.id, {
            file,
            body,
            originalBody,
            metadata,
        }, this);
    }

    async processNoteMetadata(noteInfo) {
        const {
            id,
        } = noteInfo;
        const {
            gardenService,
        } = this;

        let metadata = gardenService.getNoteMetadata(id);

        const filename = metadata?.filename ?? this.genFilename(noteInfo);
        const folder = metadata?.folder ?? this.defaultFolder;

        metadata = {
            link: this.genLink(noteInfo),
            filename,
            folder,
            ...metadata,
        };

        const note = {
            info: noteInfo,
            metadata,
        };

        this.hooks?.postProcessNoteMetadata?.(id, note, this);

        return metadata;
    }

    // eslint-disable-next-line
    async processAllMetadata() {
    }

    async processNoteBody(noteInfo, body) {
        const {
            gardenService,
            engineService,
        } = this;

        const {
            linkService,
        } = gardenService;

        const {
            id,
        } = noteInfo;

        const metadata = gardenService.getNoteMetadata(id);

        let newBody = body;

        newBody = await engineService.transclude(newBody);

        newBody = await gardenService.noteParserService.stripHtmlCommentIfEnabled(
            newBody,
            metadata,
        );

        newBody = await engineService.removeBrokenNoteLinks(
            newBody,
            gardenService.getAllNoteInfo(),
        );

        newBody = await gardenService.noteParserService.updateLinks(
            newBody,
            async (link, linkId, title) => {
                if (linkService.isResourceLink(link)) {
                    const resource = await gardenService.queryResourceInfo(linkId);
                    if (resource !== undefined && resource.error === undefined) {
                        const resourceLink = this.genResourceLink(resource);
                        return `[[${resourceLink}]]`;
                    }
                }
                const target = gardenService.getNoteInfo(linkId);
                if (target === undefined) {
                    return link;
                }

                const normalizedTitle = linkService.replaceSpecialChar(title, "");
                const newLink = `[${normalizedTitle}](${this.genLink(target)})`;
                return newLink;
            },
        );

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

        const filename = metadata?.filename ?? this.genFilename(noteInfo);

        const note = {
            info: noteInfo,
            body: newBody,
            metadata: {
                link: this.genLink(noteInfo),
                filename,
                ...metadata,
            },
        };

        await this.hooks?.postProcessNoteBody?.(id, note, this);

        return note;
    }

    genFilename(note) {
        // Preserve the title
        const normalized = note.title.replaceAll("/", "-");
        return `${normalized}.md`;
    }

    genLink(note) {
        const {
            id,
        } = note;

        const { gardenService } = this;

        const targetMetadata = gardenService.getNoteMetadata(id);

        if (targetMetadata?.link !== undefined) {
            return targetMetadata.link;
        }

        let normalized = note.title.replaceAll("/", "-");
        normalized = note.title.replaceAll(" ", "-");
        normalized = normalized.toLowerCase();
        return `${normalized}`;
    }

    processGardenBlock(block, id, metadata) {
        const {
            gardenService,
        } = this;

        const lines = block.split("\n");
        const content = lines.slice(1, lines.length - 1).join("\n");
        const fields = YAML.parse(content);

        const { title } = fields;

        const copyFields = {
            title,
        };

        Object.entries(copyFields).forEach(([key, value]) => {
            if (value !== undefined) {
                metadata[key] = value;
            }
        });

        if (gardenService.isNewNote(id)) {
            const { folder } = fields;
            if (folder !== undefined) {
                metadata.folder = folder;
            }
            const { slug } = fields;
            if (slug !== undefined) {
                metadata.filename = `${slug}.md`;
                metadata.link = slug;
            }
        }
    }

    async exportResource(blob, resourceInfo) {
        const {
            gardenService,
        } = this;

        const resPath = this.genResourcePath(resourceInfo);
        const path = [resPath];
        let buffer = await blob.arrayBuffer();
        buffer = Buffer.from(buffer);

        await gardenService.saveFile(path, buffer);
    }

    genResourceLink(resource) {
        const title = encodeURIComponent(resource.title);
        return `/res/${resource.id}/${title}`;
    }

    genResourcePath(resource) {
        return `/res/${resource.id}/${resource.title}`;
    }
}

module.exports = GithubWiki;
