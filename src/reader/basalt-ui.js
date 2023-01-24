"use strict";

function enableNavigation() {
    let navClassName = document.querySelector("nav").classList[0];
    document.querySelectorAll(`.${navClassName} input[value=Previous]`).forEach(button => {
        button.addEventListener("click", _ => parent.postMessage({messageType: "BasaltPrevSection"}, parent.document.documentURI));
    });
    document.querySelectorAll(`.${navClassName} input[value=Next]`).forEach(button => {
        button.addEventListener("click", _ => parent.postMessage({messageType: "BasaltNextSection"}, parent.document.documentURI));
    });
    document.querySelectorAll(`.${navClassName} select`).forEach(select => {
        select.addEventListener("change", event => {
            let tocTarget = JSON.parse(event.target.value);
            parent.postMessage({messageType: "BasaltDisplaySection", index: tocTarget.index, fragment: tocTarget.fragment}, parent.document.documentURI);
        });
    });
    document.querySelector('header input[value="Close book"]').addEventListener("click", _ => parent.postMessage({messageType: "BasaltCloseBook"}, parent.document.documentURI));
    document.querySelector('footer input[value="Return to top"]').addEventListener("click", _ => window.scrollTo(0, 0));
}

function rewriteLinks() {
    for (let link of document.getElementsByTagName("a")) {
        let linkHref = link.getAttribute("href");
        if (linkHref) {
            let parsedHref = parent.parseHref(linkHref, browser.runtime.getURL(parent.currentDirectory));
            if (parsedHref.internal) {
                let spineItem = parent.book.spine.items.find(section => (section.canonical === parsedHref.uri) || (section.canonical === decodeURI(parsedHref.uri)));
                if (spineItem) {
                    link.addEventListener("click", event => {
                        parent.postMessage({messageType: "BasaltDisplaySection", index: spineItem.index, fragment: parsedHref.fragment}, parent.document.documentURI);
                        event.preventDefault();
                    });
                } else {
                    link.addEventListener("click", event => {
                        alert(`Invalid link ${linkHref } (${parsedHref.uri}) pointing to nonexistent section in EPUB.`);
                        event.preventDefault();
                    });
                }
                let virtualBookUrl = `reader/book${parsedHref.uri}`; // Replace with something containing the filename explicitly
                if (parsedHref.fragment) {
                    virtualBookUrl += parsedHref.fragment;
                }
                link.setAttribute("href", browser.runtime.getURL(virtualBookUrl));
            } else {
                link.addEventListener("click", event => {
                    parent.window.open(encodeURI(linkHref), "_blank");
                    event.preventDefault();
                });
            }
        }
    }
}

enableNavigation();
rewriteLinks();
