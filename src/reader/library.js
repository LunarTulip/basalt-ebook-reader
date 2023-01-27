"use strict";

let dropZone = document.getElementById("dropzone");
let reopenBookButton = document.getElementById("reopenbook")
let styleEditorButton = document.getElementById("styleeditorbutton");
let openFile = document.getElementById("openfile");
let openFileInput = document.getElementById("openfileinput");
let returnToTopButton = document.getElementById("returntotop");

dropZone.addEventListener("dragenter", event => {
    event.stopPropagation();
    event.preventDefault();
});
dropZone.addEventListener("dragover", event => {
    event.stopPropagation();
    event.preventDefault();
});
dropZone.addEventListener("drop", event => {
    event.stopPropagation();
    event.preventDefault();
    event.dataTransfer.files[0].arrayBuffer().then(bookBuffer => parent.postMessage({messageType: "BasaltOpenBook", book: bookBuffer}, parent.document.documentURI, [bookBuffer]));
});

reopenBookButton.addEventListener("click", _ => {
    parent.postMessage({messageType: "BasaltResumeBook"}, parent.document.documentURI);
});

styleEditorButton.addEventListener("click", _ => {
    parent.postMessage({messageType: "BasaltToggleStyleEditor", buttonId: "styleeditorbutton", type: "library"});
});

openFile.addEventListener("click", _ => {
    openFileInput.click();
});

openFileInput.addEventListener("change", _ => {
    openFileInput.files[0].arrayBuffer().then(bookBuffer => parent.postMessage({messageType: "BasaltOpenBook", book: bookBuffer}, parent.document.documentURI, [bookBuffer]));
});

returnToTopButton.addEventListener("click", _ => window.scrollTo(0, 0));
