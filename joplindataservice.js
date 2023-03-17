function hasNoValue(value) {
    if (typeof value === "string" || value instanceof String) {
        return value.trim() === "";
    }
    return value === undefined || value === null || value === "";
}

function hasValue(value) {
    return !hasNoValue(value);
}

/* The JoplinDataService provides an CRUD interface
   to access the Joplin Restul API Service */

class JoplinDataService {
    static ApiToken = "apiToken";

    static AuthToken = "authToken";

    static SelectedNotebookId = "SelectedNotebookId";

    constructor(storageService) {
        this.apiToken = undefined;
        this.apiUrl = "http://localhost:41184";
        this.storageService = storageService;
    }

    async load() {
        this.apiToken = await this.storageService.apiToken;
    }

    // wrapper of fetch() with exception handling
    async fetchData(url, options, body) {
        try {
            return await fetch(url, options, body);
        } catch (e) {
            // eslint-disable-next-line
            console.error(e);
            e.type = "ConnectionFailed";
            throw e;
        }
    }

    async requestAuthToken() {
        const url = `${this.apiUrl}/auth`;
        const response = await this.fetchData(url, {
            method: "POST",
        });
        const json = await response.json();
        return json.auth_token;
    }

    async checkAuthToken(authToken) {
        const url = `${this.apiUrl}/auth/check?auth_token=${authToken}`;
        const response = await this.fetchData(url, {
            method: "GET",
        });
        return response;
    }

    isAuthorized() {
        return hasValue(this.apiToken);
    }

    async getNote(id) {
        // eslint-disable-next-line
        const url = `${this.apiUrl}/notes/${id}?token=${this.apiToken}&fields=id,body,title,parent_id,created_time,updated_time`;
        const response = await this.fetchData(url, {
            method: "GET",
        });
        if (!response.ok) {
            return undefined;
        }
        return response.json();
    }

    async getNoteTags(id) {
        // eslint-disable-next-line
        const url = `${this.apiUrl}/notes/${id}/tags?token=${this.apiToken}`;
        const response = await this.fetchData(url, {
            method: "GET",
        });
        if (!response.ok) {
            return undefined;
        }
        return response.json();
    }

    async createNote(id, parentId, title, body, options = {}) {
        const url = `${this.apiUrl}/notes?token=${this.apiToken}`;
        const data = {
            id,
            title,
            body,
            parent_id: parentId,
            ...options,
        };

        const response = await this.fetchData(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
        });

        return response.json();
    }

    async putNoteTitle(id, title) {
        const data = {
            title,
        };
        return this.putNote(id, data);
    }

    async putNoteBody(id, body) {
        const data = {
            body,
        };
        return this.putNote(id, data);
    }

    async putNoteTitleBody(id, title, body) {
        const data = {
            title,
            body,
        };
        return this.putNote(id, data);
    }

    async putNoteParentId(id, parentId) {
        const data = {
            parent_id: parentId,
        };
        return this.putNote(id, data);
    }

    async putNote(id, data) {
        const url = `${this.apiUrl}/notes/${id}?token=${this.apiToken}`;
        const response = await this.fetchData(url, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
        });

        return response.json();
    }

    /* Deprecated API. Use readTags instead */
    async getTags() {
        const url = `${this.apiUrl}/tags/?token=${this.apiToken}`;
        const response = await this.fetchData(url, {
            method: "GET",
        });
        if (!response.ok) {
            return [];
        }
        const json = await response.json();
        return json.items;
    }

    async readTags() {
        const query = this.readAll(async (page) => {
            const url = `${this.apiUrl}/tags?token=${this.apiToken}&page=${page}`;
            const response = await this.fetchData(url, {
                method: "GET",
            });
            return response.json();
        });

        let items = [];
        for await (const result of query) {
            items = items.concat(result.items);
        }
        return items;
    }

    async getTagId(input) {
        const tag = input.trim().toLowerCase();
        const tags = await this.getTags();
        const item = tags.find((value) => value.title === tag);
        return item?.id;
    }

    async getOrCreateTag(input) {
        const tag = input.trim().toLowerCase();
        const tags = await this.getTags();
        const item = tags.find((value) => value.title.toLowerCase() === tag);
        if (item !== undefined) {
            return item.id;
        }

        const url = `${this.apiUrl}/tags?token=${this.apiToken}`;
        const data = {
            title: tag.trim(),
        };

        const response = await this.fetchData(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
        });

        const json = await response.json();
        return json.id;
    }

    async setNoteTagId(noteId, tagId) {
        const url = `${this.apiUrl}/tags/${tagId}/notes?token=${this.apiToken}`;
        const data = {
            id: noteId,
        };
        await this.fetchData(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
        });

        /* Bug:
            1) Create the note by MemoInjo
            2) Delete the note in Joplin
            3) Create the note by MemoInjo again.

            The response.text() will become "" and
            response.json() will throw exception.

            If a tag is already set, the behaviour will be the same.

            Ignore the result to get rid of this problem
         */
    }

    /* Read notebooks in an unsorted array */
    async readNotebooks() {
        const query = this.readAll(async (page) => {
            const url = `${this.apiUrl}/folders?token=${this.apiToken}&page=${page}`;
            const response = await this.fetchData(url, {
                method: "GET",
            });
            return response.json();
        });

        let items = [];
        for await (const result of query) {
            items = items.concat(result.items);
        }
        return items;
    }

    /* Get all notebooks sorted accroding to its
       folder structure.

       @deprecated
     */

    async getNotebooks() {
        const url = `${this.apiUrl}/folders?token=${this.apiToken}`;
        const response = await this.fetchData(url, {
            method: "GET",
        });
        if (!response.ok) {
            return [];
        }
        const json = await response.json();
        const { items: notebooks } = json;
        const createTree = (parentId) => {
            const items = notebooks.filter(
                (item) => item.parent_id === parentId,
            ).map((item) => {
                const subNotebooks = createTree(item.id);
                return {
                    id: item.id,
                    title: item.title,
                    subNotebooks,
                };
            }).sort((a, b) => (a.title < b.title ? -1 : 1));
            return items;
        };

        const tree = createTree("");
        const sortedNotebooks = [];
        const travel = (list, level = 0) => {
            list.forEach((item) => {
                sortedNotebooks.push({
                    id: item.id,
                    title: item.title,
                    level,
                });
                travel(item.subNotebooks, level + 1);
            });
        };
        travel(tree);

        // #FIXME
        const storedNotebookId = await this.storageService.get(
            JoplinDataService.SelectedNotebookId,
        );
        const selectedNotebookId = hasValue(storedNotebookId) ? storedNotebookId : [...sortedNotebooks].shift()?.id ?? "";

        return {
            notebooks: sortedNotebooks,
            selectedNotebookId,
        };
    }

    async searchNotes(keyword) {
        let hasMore = true;
        let page = 1;
        let items = [];
        while (hasMore) {
            // eslint-disable-next-line
            const url = `${this.apiUrl}/search?token=${this.apiToken}&query=${encodeURIComponent(keyword)}&page=${page}`;

            const response = await this.fetchData(url, {
                method: "GET",
            });
            if (!response.ok) {
                break;
            }
            const json = await response.json();

            items = items.concat(json.items);
            if (json.has_more) { page += 1; } else { hasMore = false; }
        }
        return items;
    }

    async* readAll(callback) {
        let hasMore = true;
        let page = 1;

        while (hasMore) {
            const result = await callback(page);
            yield result;
            if (result.has_more) {
                page += 1;
            } else {
                hasMore = false;
            }
        }
    }

    async getNotesByTag(tagName) {
        const tagInfoList = await this.getTags();
        const tagInfo = tagInfoList.find((tag) => tag.title === tagName);
        if (tagInfo === undefined) {
            return [];
        }
        return this.getNotesByTagId(tagInfo.id);
    }

    async getNotesByTagId(tagId) {
        const query = this.readAll(async (page) => {
            const url = `${this.apiUrl}/tags/${tagId}/notes?token=${this.apiToken}&page=${page}`;
            const response = await this.fetchData(url, {
                method: "GET",
            });
            return response.json();
        });

        let items = [];
        for await (const result of query) {
            items = items.concat(result.items);
        }
        return items;
    }

    async readResourceInfo(id) {
        const url = `${this.apiUrl}/resources/${id}?token=${this.apiToken}`;
        const response = await this.fetchData(url, {
            method: "GET",
        });
        return response.json();
    }

    async readResourceFile(id) {
        const url = `${this.apiUrl}/resources/${id}/file/?token=${this.apiToken}`;
        const response = await this.fetchData(url, {
            method: "GET",
        });

        return response.blob();
    }

    async readAllNotes(fields = ["id", "title"]) {
        const fieldsArg = fields.join(",");
        return this.readAll(async (page) => {
            const url = `${this.apiUrl}/notes?token=${this.apiToken}&page=${page}&fields=${fieldsArg}`;
            const response = await this.fetchData(url, {
                method: "GET",
            });
            return response.json();
        });
    }
}

if (typeof exports === "object" && typeof module === "object") module.exports = JoplinDataService;
else if (typeof exports === "object") exports.JoplinDataService = JoplinDataService;
