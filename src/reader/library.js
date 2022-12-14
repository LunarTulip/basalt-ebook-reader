"use strict";

let choosefile = document.getElementById("choosefile");
choosefile.addEventListener("change", _ => {
    choosefile.files[0].arrayBuffer().then(bookBuffer => parent.postMessage({messageType: "BasaltBookLoad", messageContent: bookBuffer}, "*", [bookBuffer]))
});
