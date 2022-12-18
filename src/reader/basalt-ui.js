"use strict";

window.addEventListener("load", _ => {
    // Enable navigation functionality
    let navClassName = document.querySelector("nav").classList[0];
    document.querySelectorAll("." + navClassName + " input[value=Previous]").forEach(button => {
        button.addEventListener("click", _ => parent.postMessage({messageType: "BasaltPrevSection"}, parent.document.documentURI));
    });
    document.querySelectorAll("." + navClassName + " input[value=Next]").forEach(button => {
        button.addEventListener("click", _ => parent.postMessage({messageType: "BasaltNextSection"}, parent.document.documentURI));
    });
    document.querySelectorAll("." + navClassName + " select").forEach(select => {
        select.addEventListener("change", event => parent.postMessage({messageType: "BasaltDisplaySection", item: event.target.value}, parent.document.documentURI));
    });
    document.querySelector('header input[value="Close book"]').addEventListener("click", _ => parent.postMessage({messageType: "BasaltCloseBook"}, parent.document.documentURI));

    // Rewrite links
    for (let link of document.getElementsByTagName("a")) {
        let linkHref = link.getAttribute("href");
        if (linkHref) {
            let parsedHref = parent.parseLink(linkHref);
            if (parsedHref.uri === null) {
                link.addEventListener("click", event => {
                    alert("Invalid link " + linkHref + " pointing outside of the EPUB container.");
                    event.preventDefault();
                });
                link.setAttribute("href", "#");
            } else if (parsedHref.internal) {
                let spineItem = parent.book.spine.items.find(section => section.canonical === encodeURI(parsedHref.uri));
                if (spineItem) {
                    link.addEventListener("click", event => {
                        parent.postMessage({messageType: "BasaltDisplaySection", item: spineItem.index}, parent.document.documentURI);
                        event.preventDefault();
                    });
                    link.setAttribute("href", "#");
                } else {
                    link.addEventListener("click", event => {
                        alert("Invalid link " + linkHref + " (" + parsedHref.uri + ") pointing to nonexistent section in EPUB.");
                        event.preventDefault();
                    });
                    link.setAttribute("href", "#");
                }
            } else {
                link.addEventListener("click", event => {
                    parent.window.open(encodeURI(linkHref), "_blank");
                    event.preventDefault();
                });
            }
        }
    }
});
