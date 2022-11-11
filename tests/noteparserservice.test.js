const assert = require("assert");
const sinon = require("sinon");
const NoteParserService = require("../src/services/noteparserservice");

const SAMPLE_ID = "3f192676bf364a868e4add88d97ffcd1";
const SAMPLE_ID2 = "c6eeaf0040d14b2db34f905505da89d5";

describe("NoteParserService", () => {
    const service = new NoteParserService();

    describe("updateLinks()", () => {
        it("It should able to handle full link path", () => {
            const body = `[Test](:/${SAMPLE_ID})`;
            const spy = sinon.spy();
            service.updateLinks(body, spy);
            assert(spy.calledOnce);
            assert.equal(spy.args[0][0], body);
        });

        it("It should able to split id and title", () => {
            const body = `[Test](:/${SAMPLE_ID})`;
            const spy = sinon.spy();
            service.updateLinks(body, spy);
            assert.equal(spy.args[0][1], SAMPLE_ID);
            assert.equal(spy.args[0][2], "Test");
        });

        it("It should able to handle multi links", async () => {
            const body = `[Link1](:/${SAMPLE_ID}) [Link2](:/${SAMPLE_ID}) [Link3 Space\\[1](:/${SAMPLE_ID})`;
            const spy = sinon.spy();
            await service.updateLinks(body, spy);
            const capturedLinks = spy.args.map((args) => args[0]);
            assert.equal(capturedLinks.join(" "), body);
        });

        it("It should able to handle image link", async () => {
            const body = `![Link1](:/${SAMPLE_ID})`;
            const spy = sinon.spy();
            await service.updateLinks(body, spy);
            const capturedLinks = spy.args.map((args) => args[0]);
            assert.equal(capturedLinks.join(" "), body);
        });

        it("Bug Fix: It can not extract id if title is also a hex string", async () => {
            const body = `![${SAMPLE_ID2}](:/${SAMPLE_ID})`;
            const spy = sinon.spy();
            await service.updateLinks(body, spy);
            const ids = spy.args.map((args) => args[1]);
            assert.deepEqual(ids, [SAMPLE_ID]);
        });
    });

    describe("updateBlocks", () => {
        it("It should able to extract by using regexp", async () => {
            const body = `Begin
\`\`\`mermaid
A->B
\`\`\`
End`;
            const spy = sinon.spy();
            await service.updateBlocks(body, "```mermaid", "```", spy);
            const capturedBlocks = spy.args.map((args) => args[0]);
            assert.deepEqual(capturedBlocks, ["```mermaid\nA->B\n```"]);
        });

        it("It should able to handle unterminated content", async () => {
            const body = `Begin
\`\`\`mermaid
A->B`;
            const spy = sinon.spy();
            await service.updateBlocks(body, "```mermaid", "```", spy);
            const capturedBlocks = spy.args.map((args) => args[0]);
            assert.deepEqual(capturedBlocks, ["```mermaid\nA->B"]);
        });
    });
});
