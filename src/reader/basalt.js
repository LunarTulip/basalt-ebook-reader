"use strict";

/////////////////
//   Globals   //
/////////////////

// epub.js objects

var book; // The currently-opened epub.js ePub object
var currentSection; // The currently-displayed epub.js Section object
var currentDirectory; // Path to the directory housing currentSection

// basalt.js internal logic

var sectionToTocMap; // Mapping from XHTML index in spine to section in TOC

// basalt.html elements

var bookIframe = document.getElementById("book"); // The iframe to which to render book

// for injection into book sections

var navigation = document.getElementById("navtemplate").content.firstElementChild; // Navigation node for insertion into header/footer

/////////////////
//   Helpers   //
/////////////////

// href: string representation of URI-encoded href
// base: string representation of URI-encoded directory name from which href is reffing
// Returns object with properties "internal" (bool, true if internal href, false if external), "uri" (string, path to linked target from epub root if internal, untouched input href if external), and "fragment" (string | undefined, fragment identifier if present on internal href)
function parseHref(href, base) {
    let linkUrl = new URL(href, base);
    if (linkUrl.href.startsWith(browser.runtime.getURL(""))) { // Internal href
        if (linkUrl.hash) {
            return {internal: true, uri: linkUrl.pathname, fragment: linkUrl.hash};
        } else {
            return {internal: true, uri: linkUrl.pathname};
        }
    } else { // External href
        return {internal: false, uri: linkUrl.href};
    }
}

///////////////////
//   Rendering   //
///////////////////

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
    let tocDropdown = navigation.getElementsByTagName("select")[0];

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

// doc: HTML doc to inject script into
function injectUiScript(doc) {
    let scriptUri = browser.runtime.getURL("reader/basalt-ui.js");
    let scriptElement = doc.createElement("script");
    scriptElement.setAttribute("src", scriptUri);
    doc.head.append(scriptElement);
}

// doc: HTML doc to check uniqueness against
// baseName: name to use if possible, or use in modified form otherwise
// Returns basename with as many underscores prepended as necessary to make sure nothing in doc has that class name
function getUniqueClassName(doc, baseName) {
    let className = baseName;
    while (doc.getElementsByClassName(className).length > 0) {
        className = "_" + className;
    }
    return className;
}

// doc: HTML doc to check uniqueness against
// baseName: name to use if possible, or use in modified form otherwise
// Returns basename with as many underscores prepended as necessary to make sure nothing in doc has that id name
function getUniqueIdName(doc, baseName) {
    let idName = baseName;
    while (doc.getElementById(idName)) {
        idName = "_" + idName;
    }
    return idName;
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
    let ignoreStylesClassName = getUniqueClassName(doc, "basaltignorestyles");
    let headerIdName = getUniqueIdName(doc, "basaltheader");
    let footerIdName = getUniqueIdName(doc, "basaltfooter");
    let closeButtonIdName = getUniqueIdName(doc, "basaltclosebook");
    let navigationClassName = getUniqueClassName(doc, "basaltnav");
    let htmlClassName = getUniqueClassName(doc, "basaltmainhtml");
    let bodyClassName = getUniqueClassName(doc, "basaltmainbody");

    // Move html element styles and body element content and styles into main
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

    let mainBody = doc.createElement("section");
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
        // This text-retrieval step really doesn't seem like it should be necessary? But document.styleSheets is empty at this point in the program, and the individual styles and links' sheet attributes are null, so the workaround is required.
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
        // It'd be nice to handle @import-derived stylesheets, too. However, they're unhandled by epub.js, so that'll be hard.
    }

    doc.body.append(mainHtml);

    // Inject navigation sections
    let closeBookButton = doc.importNode(document.getElementById("closebuttontemplate").content.firstElementChild);
    closeBookButton.id = closeButtonIdName;
    closeBookButton.classList.add(ignoreStylesClassName);

    let docNav = doc.importNode(navigation, true);
    docNav.classList.add(navigationClassName);
    docNav.classList.add(ignoreStylesClassName);
    for (let child of docNav.children) {
        child.classList.add(ignoreStylesClassName);
    }
    for (let child of docNav.getElementsByTagName("select")[0].children) {
        child.classList.add(ignoreStylesClassName);
    }

    let header = doc.createElement("header");
    header.id = headerIdName;
    header.classList.add(ignoreStylesClassName);
    header.append(closeBookButton);
    header.append(docNav.cloneNode(true));

    let footer = doc.createElement("footer");
    footer.id = footerIdName;
    footer.classList.add(ignoreStylesClassName);
    footer.append(docNav);

    doc.body.prepend(header);
    doc.body.append(footer);

    // Set header and footer dropdown positions
    doc.querySelector("#" + headerIdName + ' select [value="' + sectionToTocMap[currentSection.index].header + '"]').setAttribute("selected", "selected");
    Array.from(doc.querySelectorAll("#" + footerIdName + ' select [value="' + sectionToTocMap[currentSection.index].footer + '"]')).at(-1).setAttribute("selected", "selected");

    let style = doc.createElement("style"); // In the long run, add more user influence over the stylesheet here, and also separate out prepended stylesheet (superseded by book styles) from appended stylesheet (supersedes them)
    style.innerHTML = "body {all: revert; background: darkslateblue; color: gold; margin: 0; padding: 0; display: flex; flex-direction: column; min-height: 100vh;} a {color:orangered;} ." + ignoreStylesClassName + "{all: revert;} #" + headerIdName + " {background: slateblue; padding: 10px;} #" + footerIdName + " {background: slateblue; padding: 10px; margin-top: auto;} #" + closeButtonIdName + " {float: left;} ." + navigationClassName + " {text-align: center;}";
    doc.head.append(style);
}

// html: string representationn of HTML doc to prepare
async function prepareHtmlForDisplay(html) {
    let parsedHtml = new DOMParser().parseFromString(html, "application/xhtml+xml");

    injectUiScript(parsedHtml);
    // modifyLinks(parsedHtml);
    await injectNavigationAndStyles(parsedHtml);

    return new XMLSerializer().serializeToString(parsedHtml);
}

// index: numerical index into spine
// fragment: string | undefined, fragment to jump to in section if applicable
async function displaySection(index, fragment) {
    if (!currentSection || (index !== currentSection.index)) {
        let section = book.spine.get(index);
        if (section) {
            window.scrollTo(0, 0);
            currentSection = section;
            currentDirectory = section.canonical.split("/").slice(undefined, -1).join("/") + "/";
            section.render(book.load.bind(book)).then(async html => {
                let htmlToDisplay = await prepareHtmlForDisplay(html);
                bookIframe.setAttribute("srcdoc", htmlToDisplay);
            });
        }
    }
    if (fragment) {
        bookIframe.contentWindow.location.hash = fragment;
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
    let firstLinearSectionIndex = 0;
    while (firstLinearSectionIndex < book.spine.length) {
        if (book.spine.get(firstLinearSectionIndex).linear) {
            await displaySection(firstLinearSectionIndex);
            bookIframe.removeAttribute("src");
            return;
        } else {
            firstLinearSectionIndex += 1;
        }
    }

    alert("Error: can't open book due to ill-formed spine. (All spine sections are nonlinear.)");
}

function closeBook() {
    document.title = "Basalt eBook Reader: Library";
    bookIframe.setAttribute("src", "library.html");
    bookIframe.removeAttribute("srcdoc");
}

// Save current srcdoc when closing and then have a resume function in the library?

////////////////////
//   Navigation   //
////////////////////

async function nextSection() {
    let nextLinearSectionIndex = currentSection.index + 1;
    while (nextLinearSectionIndex < book.spine.length) {
        if (book.spine.get(nextLinearSectionIndex).linear) {
            await displaySection(nextLinearSectionIndex);
            return;
        } else {
            nextLinearSectionIndex += 1;
        }
    }
}

async function prevSection() {
    let prevLinearSectionIndex = currentSection.index - 1;
    while (prevLinearSectionIndex >= 0) {
        if (book.spine.get(prevLinearSectionIndex).linear) {
            await displaySection(prevLinearSectionIndex);
            return;
        } else {
            prevLinearSectionIndex -= 1;
        }
    }
}

//////////////
//   Main   //
//////////////

window.addEventListener("message", basaltMessage => {
    if (basaltMessage.origin === browser.runtime.getURL("").slice(undefined, -1)) {
        if (basaltMessage.data.messageType === "BasaltOpenBook") {
            openBook(basaltMessage.data.book);
        } else if (basaltMessage.data.messageType === "BasaltCloseBook") {
            closeBook();
        } else if (basaltMessage.data.messageType === "BasaltNextSection") {
            nextSection();
        } else if (basaltMessage.data.messageType === "BasaltPrevSection") {
            prevSection();
        } else if (basaltMessage.data.messageType === "BasaltDisplaySection") {
            displaySection(basaltMessage.data.index, basaltMessage.data.fragment);
        }
    }
});
