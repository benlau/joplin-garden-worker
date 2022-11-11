const stripHtmlComments = require("strip-html-comments");

class NoteParserService {
    constructor(config) {
        this.config = config;
    }

    async updateLinks(body, callback) {
        const lines = body.split("\n");

        for (const [index, line] of lines.entries()) {
            const regexp = /!{0,1}\[([^\]]+)\]\(:\/([a-fA-F0-9]{32})\)/g;
            const matches = line.matchAll(regexp);

            for (const match of matches) {
                const [link, title, id] = match;
                const newLink = await callback(link, id, title);
                lines[index] = lines[index].replace(link, newLink);
            }
        }
        return lines.join("\n");
    }

    async updateBlocks(body, start, end, callback) {
        const lines = body.split("\n");
        const retLines = [];
        let i = 0;
        while (i < lines.length) {
            let line = lines[i++];
            if (line.match(start)) {
                const block = [];
                block.push(line);
                while (i < lines.length) {
                    line = lines[i++];
                    block.push(line);
                    if (line.match(end)) {
                        break;
                    }
                }
                const newBlock = await callback(block.join("\n"));
                retLines.push(newBlock);
            } else {
                retLines.push(line);
            }
        }
        return retLines.join("\n");
    }

    stripHtmlCommentIfEnabled(body, metadata) {
        const shouldStripHtmlComments = metadata?.stripHtmlComments
            ?? this.config.stripHtmlComments ?? false;
        return shouldStripHtmlComments ? stripHtmlComments(body) : body;
    }
}

module.exports = NoteParserService;
