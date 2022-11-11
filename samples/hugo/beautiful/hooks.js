
async function postProcessNoteMetadata(id, noteInfo, engine) {
}

async function postProcessNoteBody(id, note, engine) {   
    const {
        noteParserService
    } = engine.services;

    /*  Remove ```private ``` block from the body so that the content 
        will not be exported
     */

    note.body = await noteParserService.updateBlocks(
        note.body,
        /^```private$/,
        /^```$/,
        () => "",
    );
}

async function postExportNote(_id, note, service) {
}

module.exports = {
    postProcessNoteMetadata,
    postProcessNoteBody,
    postExportNote,
};
