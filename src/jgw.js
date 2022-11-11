#! /usr/bin/env node --harmony --experimental-fetch --experimental-modules --no-warnings
const { program } = require("commander");
const YAML = require("yaml");
const JoplinDataService = require("./lib/joplinapi/joplindataservice");
const StorageService = require("./services/storageservice");
const GardenService = require("./services/gardenservice");
const NoteParserService = require("./services/noteparserservice");
const FileRepo = require("./services/filerepo");
const LinkService = require("./services/linkservice");
const EngineService = require("./services/engineservice");

const storageService = new StorageService();
const joplinDataService = new JoplinDataService(storageService);
const linkService = new LinkService();
const fileRepo = new FileRepo();

async function auth() {
    storageService.load();
    await joplinDataService.load();

    if (!joplinDataService.isAuthorized()) {
        // eslint-disable-next-line
        console.info("Please open Joplin to grant permission to access the data.");
        await joplinDataService.requestPermission();
        storageService.save();
        // eslint-disable-next-line
        console.info("Authorization successful.");
    }
}

async function run(outputDir, exportNote) {
    const configFile = "config.yaml";
    let config;
    try {
        config = YAML.parse(fileRepo.loadFile(configFile));
    } catch (e) {
        // eslint-disable-next-line
        console.error(`Error: ${configFile} not found.`);
        process.exit(-1);
        return;
    }
    const noteParserService = new NoteParserService(config);
    const gardenService = new GardenService(config, outputDir, {
        joplinDataService,
        noteParserService,
        linkService,
    });

    const engineService = new EngineService({
        gardenService,
        noteParserService,
        linkService,
        joplinDataService,
    });

    await auth();

    gardenService.loadNoteMetadata();
    const notes = [...await gardenService.loadNoteInfo()];

    // eslint-disable-next-line
    const Engine = require(`${__dirname}/engines/${gardenService.config.engine}`);
    const engine = new Engine(engineService);
    let exportedNote = 0;
    let exportedResource = 0;

    await engine.prepare();

    // Process note metadata
    for (const note of notes) {
        const response = await joplinDataService.getNote(note.id);
        const { created_time, updated_time } = response;
        const metadata = await engine.processNoteMetadata(
            { ...note, created_time, updated_time },
        );

        gardenService.setNoteMetadata(note.id, {
            ...metadata,
            id: note.id,
            title: note.title,
        });
    }

    // Process all noet meatdata. It could find something like backlinks between exported notes.
    await engine.processAllMetadata();

    // Process note body
    for (const note of notes) {
        const response = await joplinDataService.getNote(note.id);

        const { created_time, updated_time } = response;

        const {
            body, metadata,
            originalBody,
        } = await engine.processNoteBody(
            { ...note, created_time, updated_time },
            noteParserService.stripHtmlCommentIfEnabled(
                response.body,
                gardenService.getNoteMetadata(note.id),
            ),
        );

        gardenService.setNoteMetadata(note.id, metadata);

        if (exportNote) {
            await engine.exportNote({
                body,
                metadata,
                originalBody,
            });
            exportedNote++;
        }
    }

    if (exportNote) {
        const resources = Array.from(
            gardenService.resources,
            ([_key, value]) => value,
        );

        await Promise.all(resources.map(async (resource) => {
            const blob = await joplinDataService.queryResourceFile(resource.id);
            return engine.exportResource(blob, resource);
        }));
        exportedResource += resources.length;
    }

    gardenService.saveNoteMetadata();

    // eslint-disable-next-line no-console
    console.info(`${exportedNote} notes exported`);
    // eslint-disable-next-line no-console
    console.info(`${exportedResource} resources exported`);
}

program
    .name("jgw")
    .description("Joplin Garden Worker - Export Joplin notes to a static site")
    .version("0.0.1");

program
    .command("auth")
    .description("Ask Joplin to grant authorization")
    .action(async () => {
        await auth();
    });

program
    .command("export")
    .argument("<output_dir>", "output directory")
    .description("Export the notes to the output directory")
    .action(async (outputDir, options) => run(outputDir, true, options));

program
    .command("update")
    .description("Update metadata.yaml without exporting notes")
    .action(async (options) => run("", false, options));

program.parse();
