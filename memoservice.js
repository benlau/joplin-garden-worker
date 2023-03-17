async function sleep(ms) {
    await new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

class MemoService {
    constructor(dependencies) {
        const {
            joplinDataService, cryptoRepo,
            storageService,
        } = dependencies;

        this.joplinDataService = joplinDataService;
        this.cryptoRepo = cryptoRepo;
        this.storageService = storageService;
    }

    async requestAuthToken() {
        const {
            joplinDataService,
            storageService,
        } = this;
        const authToken = await joplinDataService.requestAuthToken();
        storageService.authToken = authToken;
        storageService.save();
    }

    async requestPermission() {
        const {
            joplinDataService,
            storageService,
        } = this;

        if (joplinDataService.apiToken !== undefined) {
            return;
        }

        if (joplinDataService.authToken === undefined) {
            await this.requestAuthToken();
        }

        while (storageService.apiToken === undefined) {
            const response = await joplinDataService.checkAuthToken(storageService.authToken);
            if (response.status === 500) {
                await this.requestAuthToken();
                continue;
            }

            const json = await response.json();
            const {
                status,
                token,
            } = json;
            if (status === "accepted") {
                storageService.apiToken = token;
                storageService.authToken = undefined;
            } else if (status === "rejected") {
                await this.requestAuthToken();
            }
            await sleep(500);
        }
    }

    async urlToId(url) {
        return (await this.cryptoRepo.sha256(url)).slice(0, 32);
    }

    async readNotebookId(notebookName) {
        const {
            joplinDataService,
        } = this;
        const notebooks = await joplinDataService.readNotebooks();
        const notebook = notebooks.find((item) => item.title === notebookName);
        return notebook?.id;
    }

    async prependMemo(fileUrl, prependText) {
        const {
            joplinDataService,
        } = this;

        const noteId = await this.urlToId(fileUrl);
        const note = await joplinDataService.getNote(noteId);

        if (note === undefined) {
            throw new Error("Memo not found");
        } else {
            const {
                body,
            } = note;
            const newBody = prependText + body;
            const response = await joplinDataService.putNoteBody(noteId, newBody);
            this.checkResponse(response);
        }
    }

    async updateMemo(fileUrl, newBody) {
        const {
            joplinDataService,
        } = this;
        const noteId = await this.urlToId(fileUrl);
        const response = await joplinDataService.putNoteBody(noteId, newBody);
        this.checkResponse(response);
    }

    async appendMemo(fileUrl, appendText) {
        const {
            joplinDataService,
        } = this;

        const noteId = await this.urlToId(fileUrl);
        const note = await joplinDataService.getNote(noteId);

        if (note === undefined) {
            throw new Error("Memo not found");
        } else {
            const {
                body,
            } = note;
            const newBody = body + appendText;
            const response = await joplinDataService.putNoteBody(noteId, newBody);
            this.checkResponse(response);
        }
    }

    checkResponse(response) {
        if (response.error !== undefined) {
            throw new Error(response.error);
        }
    }
}

if (typeof exports === "object" && typeof module === "object") module.exports = MemoService;
else if (typeof exports === "object") exports.MemoService = MemoService;
