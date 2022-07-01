"use strict";

document
    .getElementById("choosefile")
    .addEventListener("change", function() {
        this.files[0].arrayBuffer().then(function(file) {
            var book = ePub(file);
            var rendition = book.renderTo("test", {
                flow: "scrolled-doc"
            });
            var displayed = rendition.display();
        })
    });
