"use strict";

/////////////////
//   Globals   //
/////////////////

var bookIframe = document.getElementById("book"); // The iframe to which to render the book

var book; // The currently-opened epub.js ePub object
var currentSection; // The currently-displayed epub.js Section object

var testSheet = "body {color:gold;}" // Test stylesheet, to be replaced with a more complex system

/////////////////
//   Display   //
/////////////////

// tocArray: array of book TOC objects, either the top-level TOC or a descendant
// ancestorCount: number of ancestors above toc_array in the TOC's nesting structure (0 for the top-level TOC array)
// Returns array of items, where each item is an object mapping "label" to a string to be displayed and "link" to the TOC href associated with that label
function getTocItems(tocArray, ancestorCount) {
    let items = Array();
    tocArray.forEach(tocEntry => {
        let itemLabel = (String.fromCharCode(160).repeat(ancestorCount * 4)) + tocEntry.label.trim(); // The trim is to compensate for an epub.js bug, at the cost of fidelity to sources whose TOCs *actually* have whitespace
        items.push({label: itemLabel, link: tocEntry.href});
        items = items.concat(getTocItems(tocEntry.subitems, ancestorCount + 1));
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
        tocDropdowns.forEach(dropdown => dropdown.append(entryElement.cloneNode(true)));
    });
}

// html: string representation of HTML doc into which to inject sheet
// sheet: string representation of CSS stylesheet
// Returns html, but now with sheet injected in as the first element of its head
function injectStylesheet(html, sheet) {
    let parsedHtml = new DOMParser().parseFromString(html, "application/xhtml+xml");
    let style = parsedHtml.createElement("style");
    style.innerHTML = sheet;
    parsedHtml.getElementsByTagName("head")[0].prepend(style);
    return new XMLSerializer().serializeToString(parsedHtml);
}

// item: numerical index into spine, or string href or idref of a spine item
function displaySection(item) {
    let section = book.spine.get(item);
    if (section) {
        window.scrollTo(0, 0);
        currentSection = section;
        section.render(book.load.bind(book)).then(html => {
            let htmlToDisplay = injectStylesheet(html, testSheet);
            bookIframe.setAttribute("srcdoc", htmlToDisplay);
        });
    }
}

// file: arrayBuffer containing an EPUB file
async function displayBook(file) {
    book = ePub(file);

    await book.loaded.navigation;
    setTocDropdowns(book.navigation.toc);

    await book.opened;
    displaySection(0);
}

////////////////////
//   Navigation   //
////////////////////

function updateNavigation() {
    let tocEntry = book.navigation.get(currentSection.href);

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
    displaySection(href);
    updateNavigation();
}

function nextSection() {
    if (currentSection.index < book.spine.length - 1) {
        displaySection(currentSection.index + 1);
        updateNavigation();
    }
}

function prevSection() {
    if (currentSection.index != 0) {
        displaySection(currentSection.index - 1);
        updateNavigation();
    }
}

//////////////
//   Main   //
//////////////

// Temporary file-selector until I devise a more stable option
document.getElementById("choosefile").addEventListener("change", function() {
        this.files[0].arrayBuffer().then(displayBook)
});
