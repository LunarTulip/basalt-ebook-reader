"use strict";

window.addEventListener("DOMContentLoaded", _ => {
    // Enable navigation functionality
    let navClassName = document.querySelector("nav").classList[0];
    document.querySelectorAll("." + navClassName + " input[value=Previous]").forEach(button => {
        button.addEventListener("click", _ => parent.postMessage({messageType: "BasaltPrevSection"}, parent.document.documentURI));
    });
    document.querySelectorAll("." + navClassName + " input[value=Next]").forEach(button => {
        button.addEventListener("click", _ => parent.postMessage({messageType: "BasaltNextSection"}, parent.document.documentURI));
    });
    document.querySelectorAll("." + navClassName + " select").forEach(select => {
        select.addEventListener("change", event => parent.postMessage({messageType: "BasaltDisplaySection", index: event.target.value}, parent.document.documentURI));
    });
    document.querySelector('header input[value="Close book"]').addEventListener("click", _ => parent.postMessage({messageType: "BasaltCloseBook"}, parent.document.documentURI));

    // Rewrite links
    for (let link of document.getElementsByTagName("a")) {
        let linkHref = link.getAttribute("href");
        if (linkHref) {
            let parsedHref = parent.parseHref(linkHref, browser.runtime.getURL(parent.currentDirectory));
            if (parsedHref.internal) {
                let spineItem = parent.book.spine.items.find(section => section.canonical === encodeURI(parsedHref.uri));
                if (spineItem) {
                    link.addEventListener("click", event => {
                        parent.postMessage({messageType: "BasaltDisplaySection", index: spineItem.index, fragment: parsedHref.fragment}, parent.document.documentURI);
                        event.preventDefault();
                    });
                } else {
                    link.addEventListener("click", event => {
                        alert("Invalid link " + linkHref + " (" + parsedHref.uri + ") pointing to nonexistent section in EPUB.");
                        event.preventDefault();
                    });
                }
                link.setAttribute("href", "#");
            } else {
                link.addEventListener("click", event => {
                    parent.window.open(encodeURI(linkHref), "_blank");
                    event.preventDefault();
                });
            }
        }
    }
});
