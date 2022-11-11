class EngineService {
    constructor(services) {
        this.services = services;
    }

    async removeBrokenNoteLinks(body) {
        const {
            gardenService,
            noteParserService,
        } = this.services;

        const notes = gardenService.getAllNoteInfo();

        return noteParserService.updateLinks(body, async (link, id, title) => {
            if (link[0] === "!") {
                return link;
            }

            const hasNote = notes.findIndex((note) => note.id === id) >= 0;

            return hasNote ? link : title;
        });
    }

    // Resolve ![](://ID) link
    async transclude(body) {
        const {
            gardenService,
            noteParserService,
        } = this.services;

        const {
            joplinDataService,
        } = gardenService;

        return noteParserService.updateLinks(body, async (link, linkId) => {
            if (link[0] !== "!") {
                return link;
            }

            const targetNote = await joplinDataService.getNote(linkId);
            if (targetNote === undefined || targetNote.error !== undefined) {
                return link;
            }

            return targetNote.body;
        });
    }
}

module.exports = EngineService;
