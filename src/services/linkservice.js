/// For handling links

class LinkService {
    isResourceLink(link) {
        return link[0] === "!";
    }

    replaceSpecialChar(input, replaceChar) {
        return input.replaceAll("/", replaceChar).replaceAll(":", replaceChar);
    }

    createGithubWikiLink(title) {
        return this.replaceSpecialChar(title)
            .replaceAll(" ", "-")
            .toLowerCase();
    }
}

module.exports = LinkService;
