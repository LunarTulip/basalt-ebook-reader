"use strict";

/////////////////
//   Globals   //
/////////////////

var book;
var currentLocation = 0;
var bookHtmlNode = document.getElementById("book");
var rendition;

/////////////////
//   Display   //
/////////////////

// toc_array: array of book TOC objects, either the top-level TOC or a descendant
// parent_count: number
function getTocItems(tocArray, parentCount) {
    let items = Array();
    tocArray.forEach(tocEntry => {
        let itemLabel = (String.fromCharCode(160).repeat(parentCount * 4)) + tocEntry.label.trim(); // The trim is to compensate for an epub.js bug at the cost of fidelity to sources whose TOCs *actually* have whitespace
        items.push({label: itemLabel, link: tocEntry.href});
        items = items.concat(getTocItems(tocEntry.subitems, parentCount + 1));
    });
    return items;
}

// toc: book table of contents array
async function setTocDropdowns(toc) {
    let tocDropdowns = Array.from(document.getElementsByClassName("tocDropdown"));

    // Clear any previously-set TOC
    tocDropdowns.forEach(dropdown => {
        while (dropdown.firstChild) {
            dropdown.removeChild(dropdown.firstChild);
        }
    });

    // Set new TOC
    let tocItems = getTocItems(toc, 0);

    await book.loaded.spine;
    let firstSpineHref = book.spine.items[0].href;
    let lastSpineHref = book.spine.items.at(-1).href;

    if (tocItems[0].link != firstSpineHref) {
        tocItems.unshift({label: "[Start]", link: firstSpineHref}); // Improve label?
    }
    if (tocItems.at(-1).link != lastSpineHref) {
        tocItems.push({label: "[End]", link: lastSpineHref}); // Improve label?
    }

    tocItems.forEach(item => {
        let entryElement = document.createElement("option");
        entryElement.setAttribute("value", item.link);
        entryElement.textContent = item.label;
        tocDropdowns.forEach(dropdown => dropdown.appendChild(entryElement.cloneNode(true)));
    });
}

// file: arrayBuffer containing an EPUB file
async function displayBook(file) {
    book = ePub(file);
    await book.opened;
    setTocDropdowns(book.navigation.toc);

    // currentLocation = 0;
    // displaySection(currentLocation);

    if(rendition) {
        rendition.destroy();
    }
    rendition = book.renderTo("book", {flow: "scrolled-doc"});
    rendition.display();
}

////////////////////
//   Navigation   //
////////////////////

function updateNavigation() {
    let spineEntry = book.spine.get(rendition.currentLocation().start.cfi);
    let tocEntry = book.navigation.get(spineEntry.href);

    // Set TOC dropdowns to current location
    if (tocEntry) {
        Array.from(document.getElementsByClassName("tocDropdown")).forEach(dropdown => {
            dropdown.value = tocEntry.href;
            console.info(tocEntry.href);
        });
    } else {
        let tocIndex = 0;
        // Build map from spine entries to TOC entries and use that?
    }
}

// href: href of section to go to
function goToSectionFromTocDropdown(href) {
    rendition.display(href).then(_ => updateNavigation());
}

function nextSection() {
    rendition.next().then(_ => updateNavigation());
}

function prevSection() {
    rendition.prev().then(_ => updateNavigation());
}

//////////////
//   Main   //
//////////////

// Temporary file-selector until I devise a more stable option
document.getElementById("choosefile").addEventListener("change", function() {
        this.files[0].arrayBuffer().then(displayBook)
});
