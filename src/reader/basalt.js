"use strict";

/////////////////
//   Globals   //
/////////////////

// epub.js objects

var book; // The currently-opened epub.js ePub object
var currentSection; // The currently-displayed epub.js Section object

// basalt.js internal logic

var sectionToTocMap; // Mapping from XHTML index in spine to section in TOC
// var readingHistory = []; // Traversal history through the book // TODO

// basalt.html elements

var bookIframe = document.getElementById("book"); // The iframe to which to render book

// for injection into book sections

var navigation = document.createElement("div"); // Navigation header/footer node

var previous = document.createElement("input");
previous.setAttribute("type", "button");
previous.setAttribute("value", "Previous");
previous.setAttribute("onclick", "parent.prevSection()");

var tocDropdown = document.createElement("select");
tocDropdown.setAttribute("onchange", "parent.displaySection(this.value)");

var next = document.createElement("input");
next.setAttribute("type", "button");
next.setAttribute("value", "Next");
next.setAttribute("onclick", "parent.nextSection()");

navigation.append(previous);
navigation.append(tocDropdown);
navigation.append(next);

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
async function setTocDropdown(toc) {
    // Clear any previously-set TOC
    while (tocDropdown.firstChild) {
        tocDropdown.removeChild(tocDropdown.firstChild);
    }

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
        tocDropdown.append(entryElement.cloneNode(true));
    });

    // Map TOC for use in future dropdown-updating
    book.spine.items.forEach(spineItem => {
        let firstMatchingTocItem = tocItems.find(tocItem => tocItem.link.split("#")[0] === spineItem.href);
        let lastMatchingTocItem = tocItems.findLast(tocItem => tocItem.link.split("#")[0] === spineItem.href);
        if (firstMatchingTocItem) {
            sectionToTocMap[spineItem.index] = {header: firstMatchingTocItem.link, footer: lastMatchingTocItem.link};
        } else {
            let lastItemHit = sectionToTocMap[spineItem.index - 1].footer;
            sectionToTocMap[spineItem.index] = {header: lastItemHit, footer: lastItemHit};
        }
    });
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
                link.setAttribute("onclick", 'parent.displaySection("' + encodeURI(linkHref) + '"); return false;');
                link.setAttribute("href", "#"); // Any better way to do the href to give useful previews? (If so, maybe do it on the navigation buttons too.)
            } else {
                link.setAttribute("onclick", 'parent.window.open("' + encodeURI(linkHref) + '", "_blank"); return false;');
            }
        }
    })
}

// sheet: string representation of CSS stylesheet
// bodyReplacement: string to replace body element selectors with
// htmlReplacement: string to replace html element selectors
// Returns sheet, except with any body or html element selectors replaced with their respective replacements
function replaceBodyAndHtmlStyles(sheet, bodyReplacement, htmlReplacement) {
    // This is crude and possibly missing edge cases; in the long run, use a proper CSS parser rather than regex hackery
    let styles = sheet.split("}");
    let after_final_style = styles.pop();
    styles = styles.map(style => style + "}");

    let updatedSheet = "";
    for (let style of styles) {
        let split_style = style.split("{");
        let selector = split_style.shift();
        let bodyReplaced = selector.replace(/(?<![\w\.\#\[\=\:-])body(?![\w-])/, bodyReplacement);
        let bothReplaced = bodyReplaced.replace(/(?<![\w\.\#\[\=\:-])html(?![\w-])/, htmlReplacement);
        updatedSheet += [bothReplaced].concat(split_style).join("{");
    }
    updatedSheet += after_final_style;

    return updatedSheet;
}

// doc: HTML doc into whose body the navigation header and footer should be injected
async function injectNavigationAndStyles(doc) {
    // Get non-colliding class/id names for the sections to be injected
    let navigationClassName = "basaltnav";
    while (doc.getElementsByClassName(navigationClassName).length > 0) {
        navigationClassName = "_" + navigationClassName;
    }
    let headerIdName = "basaltheader";
    while (doc.getElementById(headerIdName)) {
        headerIdName = "_" + headerIdName;
    }
    let htmlClassName = "basaltmainhtml";
    while (doc.getElementsByClassName(htmlClassName).length > 0) {
        htmlClassName = _ + htmlClassName;
    }
    let bodyClassName = "basaltmainbody";
    while (doc.getElementsByClassName(bodyClassName).length > 0) {
        bodyClassName = "_" + bodyClassName;
    }
    let footerIdName = "basaltfooter";
    while (doc.getElementById(footerIdName)) {
        footerIdName = "_" + footerIdName;
    }

    // Move pre-injection html styles and body content and styles into main
    let mainHtml = doc.createElement("main");
    mainHtml.classList.add(htmlClassName);

    if (doc.documentElement.id) {
        mainHtml.id = doc.documentElement.id;
        doc.documentElement.removeAttribute("id");
    }
    for (let listedClass of doc.documentElement.classList) {
        mainHtml.classList.add(listedClass);
    }
    doc.documentElement.removeAttribute("class");
    if (doc.documentElement.hasAttribute("style")) {
        mainHtml.setAttribute("style", doc.documentElement.getAttribute("style"));
        doc.documentElement.removeAttribute("style");
    }

    let mainBody = doc.createElement("div"); // Any more appropriate semantic tag to use here?
    mainBody.classList.add(bodyClassName);

    if (doc.body.id) {
        mainBody.id = doc.body.id;
        doc.body.removeAttribute("id");
    }
    for (let listedClass of doc.body.classList) {
        mainBody.classList.add(listedClass);
    }
    doc.body.removeAttribute("class");
    if (doc.body.hasAttribute("style")) {
        mainBody.setAttribute("style", doc.body.getAttribute("style"));
        doc.body.removeAttribute("style");
    }

    mainHtml.append(mainBody);

    while (doc.body.childNodes.length > 0) {
        mainBody.append(doc.body.firstChild);
    }

    let stylesheetBearingNodes = doc.querySelectorAll("style, link[rel=stylesheet]");
    for (let node of stylesheetBearingNodes) {
        // This text-retrieval step really doesn't seem like it should be necessary? But links' sheet attributes are null at this point in the program, for some reason, so the workaround is required.
        let nodeSheet;
        if (node.tagName == "style") {
            nodeSheet = node.innerHTML;
        } else if (node.tagName == "link") {
            nodeSheet = await fetch(node.href).then(async content => await content.text());
        }
        let sheetWithReplacements = replaceBodyAndHtmlStyles(nodeSheet, "." + bodyClassName, "." + htmlClassName);
        if (sheetWithReplacements !== nodeSheet) {
            let sheetStyleNode = doc.createElement("style");
            sheetStyleNode.innerHTML = sheetWithReplacements;
            node.parentNode.replaceChild(sheetStyleNode, node);
        }
        // Add some sort of handling for @import-derived stylesheets
    }

    doc.body.append(mainHtml);

    // Inject navigation sections
    let testCloseBookButton = doc.createElement("input"); // Temporary button for use while in development; find something neater long-term
    testCloseBookButton.setAttribute("type", "button");
    testCloseBookButton.setAttribute("value", "Close book");
    testCloseBookButton.setAttribute("onclick", "parent.closeBook()");

    let docNav = doc.importNode(navigation, true);
    docNav.classList.add(navigationClassName);

    let header = doc.createElement("header");
    header.id = headerIdName;
    header.append(testCloseBookButton);
    header.append(docNav.cloneNode(true));

    let footer = doc.createElement("footer");
    footer.id = footerIdName;
    footer.append(docNav);

    doc.body.prepend(header);
    doc.body.append(footer);

    // Set header and footer dropdown positions
    doc.querySelector("#" + headerIdName + ' select [value="' + sectionToTocMap[currentSection.index].header + '"]').setAttribute("selected", "selected");
    Array.from(doc.querySelectorAll("#" + footerIdName + ' select [value="' + sectionToTocMap[currentSection.index].footer + '"]')).at(-1).setAttribute("selected", "selected");

    let style = doc.createElement("style"); // In the long run, add more user influence over the stylesheet here, and also separate out prepended stylesheet (superseded by book styles) from appended stylesheet (supersedes them)
    style.innerHTML = "body {all: unset; background: darkslateblue; color: gold; margin: 0; padding: 0; display: flex; flex-direction: column; height: 100vh;} a {color:orangered;} #" + headerIdName + " {all: unset; background: slateblue; color: black; padding: 10px;} ." + bodyClassName + "{flex-grow: 1;} #" + footerIdName + " {all: unset; background: slateblue; color: black; padding: 10px; margin-top: auto;} ." + navigationClassName + " {all: unset; text-align: center;}";
    doc.head.append(style);
}

// html: string representationn of HTML doc to prepare
async function prepareHtmlForDisplay(html) {
    let parsedHtml = new DOMParser().parseFromString(html, "application/xhtml+xml");

    modifyLinks(parsedHtml);
    await injectNavigationAndStyles(parsedHtml);

    return new XMLSerializer().serializeToString(parsedHtml);
}

// item: numerical index into spine, or string href or idref of a spine item
async function displaySection(item) {
    let section = book.spine.get(item);
    if (section) {
        window.scrollTo(0, 0);
        currentSection = section;
        section.render(book.load.bind(book)).then(async html => {
            let htmlToDisplay = await prepareHtmlForDisplay(html);
            bookIframe.setAttribute("srcdoc", htmlToDisplay);
        });
    }
}

// file: arrayBuffer containing an EPUB file
async function openBook(file) {
    book = ePub(file);

    await book.loaded.navigation;
    setTocDropdown(book.navigation.toc);

    await book.loaded.metadata;
    document.title = "Basalt eBook Reader: " + book.packaging.metadata.title;

    await book.opened;
    bookIframe.removeAttribute("src");
    await displaySection(0);
}

function closeBook() {
    bookIframe.removeAttribute("srcdoc");
    bookIframe.setAttribute("src", "library.html");
}

// Save current srcdoc when closing and then have a resume function in the library?

////////////////////
//   Navigation   //
////////////////////

async function nextSection() {
    if (currentSection.index < book.spine.length - 1) {
        await displaySection(currentSection.index + 1);
    }
}

async function prevSection() {
    if (currentSection.index != 0) {
        await displaySection(currentSection.index - 1);
    }
}

//////////////
//   Main   //
//////////////

window.addEventListener("message", bookFileBuffer => {
    if (bookFileBuffer.origin === "null" && bookFileBuffer.data.messageType === "BasaltBookLoad") {
        openBook(bookFileBuffer.data.messageContent);
    }
});
