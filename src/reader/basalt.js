"use strict";

/////////////////
//   Globals   //
/////////////////

var book; // The currently-opened epub.js ePub object

var currentSection; // The currently-displayed epub.js Section object

var bookIframe = document.getElementById("book"); // The iframe to which to render book
var tocDropdowns = Array.from(document.getElementsByClassName("tocDropdown")); // The dropdown TOC-navigation menus

var sectionToTocMap; // Mapping from XHTML index in spine to section in TOC
// var readingHistory = []; // Traversal history through the book // TODO

var testSheet = "body {color:gold;} a {color:orangered;}"; // Test stylesheet, to be replaced with a more complex system

/////////////////
//   Display   //
/////////////////

// tocArray: array of book TOC objects, either the top-level TOC or a descendant
// ancestorCount: number of ancestors above toc_array in the TOC's nesting structure (0 for the top-level TOC array)
// Returns array of items, where each item is an object mapping "label" to a string to be displayed and "link" to the TOC href associated with that label
function getTocItems(tocArray, ancestorCount) {
    let items = [];
    tocArray.forEach(tocEntry => {
        let itemLabel = (String.fromCharCode(160).repeat(ancestorCount * 4)) + tocEntry.label.trim(); // The trim is to compensate for an epub.js bug, at the cost of fidelity to sources whose TOCs *actually* have whitespace
        items.push({label: itemLabel, link: tocEntry.href});
        items = items.concat(getTocItems(tocEntry.subitems, ancestorCount + 1));
    });
    return items;
}

// toc: book table of contents array
async function setTocDropdowns(toc) {
    // Clear any previously-set TOC
    tocDropdowns.forEach(dropdown => {
        while (dropdown.firstChild) {
            dropdown.removeChild(dropdown.firstChild);
        }
    });

    sectionToTocMap = {};

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

    // Write TOC to TOC dropdowns
    tocItems.forEach(item => {
        let entryElement = document.createElement("option");
        entryElement.setAttribute("value", item.link);
        entryElement.textContent = item.label;
        tocDropdowns.forEach(dropdown => dropdown.append(entryElement.cloneNode(true)));
    });

    // Map TOC for use in future dropdown-updating
    book.spine.items.forEach(spineItem => {
        let firstMatchingTocItem = tocItems.find(tocItem => tocItem.link.split("#")[0] === spineItem.href);
        let lastMatchingTocItem = tocItems.findLast(tocItem => tocItem.link.split("#")[0] === spineItem.href);
        if (firstMatchingTocItem) {
            sectionToTocMap[spineItem.index] = {"header": firstMatchingTocItem.link, "footer": lastMatchingTocItem.link};
        } else {
            let lastItemHit = sectionToTocMap[spineItem.index - 1]["footer"];
            sectionToTocMap[spineItem.index] = {"header": lastItemHit, "footer": lastItemHit};
        }
    });
}

// doc: HTML doc into whose head sheet should be prepended
// sheet: string representation of CSS stylesheet
function injectStylesheet(doc, sheet) {
    let style = doc.createElement("style");
    style.innerHTML = sheet;
    doc.getElementsByTagName("head")[0].prepend(style);
}

// doc: HTML doc to modify links within
function modifyLinks(doc) {
    let links = doc.getElementsByTagName("a");
    // let linkHref;
    Array.from(links).forEach(link => {
        let linkHref = link.getAttribute("href");
        if (linkHref) {
            // Still need
            if (book.spine.get(linkHref)) {
                link.setAttribute("onclick", 'parent.openSection("' + encodeURI(linkHref) + '"); return false;');
                link.setAttribute("href", "#"); // Any better way to do the href to give useful previews? (If so, maybe do it on the navigation buttons too.)
            } else {
                link.setAttribute("onclick", 'parent.window.open("' + encodeURI(linkHref) + '", "_blank"); return false;');
            }
        }
    })
}

// html: string representationn of HTML doc to prepare
function prepareHtmlForDisplay(html) {
    let parsedHtml = new DOMParser().parseFromString(html, "application/xhtml+xml");

    injectStylesheet(parsedHtml, testSheet);
    modifyLinks(parsedHtml);

    return new XMLSerializer().serializeToString(parsedHtml);
}

// item: numerical index into spine, or string href or idref of a spine item
function displaySection(item) {
    let section = book.spine.get(item);
    if (section) {
        window.scrollTo(0, 0);
        currentSection = section;
        section.render(book.load.bind(book)).then(html => {
            let htmlToDisplay = prepareHtmlForDisplay(html);
            bookIframe.setAttribute("srcdoc", htmlToDisplay);
        });
    }
}

// file: arrayBuffer containing an EPUB file
async function displayBook(file) {
    book = ePub(file);

    await book.loaded.navigation;
    setTocDropdowns(book.navigation.toc);

    await book.loaded.metadata;
    document.title = "Basalt eBook Reader: " + book.packaging.metadata.title;

    await book.opened;
    displaySection(0);
}

////////////////////
//   Navigation   //
////////////////////

function updateNavigation() {
    let headerDropdown = tocDropdowns[0];
    headerDropdown.value = sectionToTocMap[currentSection.index]["header"];
    let footerDropdown = tocDropdowns[1];
    footerDropdown.value = sectionToTocMap[currentSection.index]["footer"];
}

// item: numerical index into spine, or string href or idref of spine item
function openSection(item) {
    displaySection(item);
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
