"use strict";

let dropZone = document.getElementById("dropzone");
let reopenBook = document.getElementById("reopenbook")
let openFile = document.getElementById("openfile");
let openFileInput = document.getElementById("openfileinput");
let returnToTop = document.getElementById("returntotop");

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

reopenBook.addEventListener("click", _ => {
    parent.postMessage({messageType: "BasaltResumeBook"}, parent.document.documentURI);
});

openFile.addEventListener("click", _ => {
    openFileInput.click();
});

openFileInput.addEventListener("change", _ => {
    openFileInput.files[0].arrayBuffer().then(bookBuffer => parent.postMessage({messageType: "BasaltOpenBook", book: bookBuffer}, parent.document.documentURI, [bookBuffer]));
});

returnToTop.addEventListener("click", _ => window.scrollTo(0, 0));
