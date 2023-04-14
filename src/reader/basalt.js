"use strict";

var lightningCss = import("./libraries/lightningcss/lightningcss-wasm/index.js");

/////////////////
//   Globals   //
/////////////////

// LightningCSS-relevant information

var lightningCssImportFinished = lightningCss.then(lcss => lcss.default()); // Promise such that, if it's fulfilled, LightningCSS is usable
var browserVersion = browser.runtime.getBrowserInfo().then(info => info.version.split(".")[0] << 16); // Promise wrapping the Firefox major version, formatted in LightningCSS-comprehensible format

// epub.js objects

var book; // The currently-opened epub.js ePub object
var currentSection; // The currently-displayed epub.js Section object
var currentBookId; // The unique ID of the book from which the current section is sourced

// basalt.js internal logic

var nextUniqueId = new Uint32Array(new ArrayBuffer(4)); // For manipulation via Atomics as a source of UIDs

var globalStyle; // Global style info
var libraryStyle; // Style info for library
var libraryStyleMerged; // Style info for library, with global style info merged in where appropriate
var currentBookStyle; // Book-specific style info for current book
var currentBookStyleMerged; // Style info for current book, with global style info merged in where appropriate

var currentDirectory; // Path to the directory housing currentSection
var sectionToTocMap; // Mapping from XHTML index in spine to section in TOC
var currentSectionStyleInfo; // Classes, IDs, and miscellaneous stylesheet-relevant info for currentSection
var currentSectionSource; // XHTML source of the last opened book section
var currentSectionSourceId; // Unique ID of currentSectionSource; will change if currentSectionSource does
var sectionIdToBlobsMap = {}; // Map from section UIDs to objects with two properties, "doneDisplaying" (true if the section has been or won't ever be displayed) and "blobs" (list of blobs associated with the section)

var libraryReopenAllowed = false; // Whether the "Reopen book" button in the library is enabled
var librarySource; // Promise wrapping the HTML source of the library
var librarySourceId; // Unique ID of librarySource; will change if librarySource does
var libraryIdToBlobsMap = {}; // Map from library UIDs to objects as in sectionIdToBlobsMap

var styleEditorOpen = false; // Whether the style editor is open for display
var styleEditorLibrarySource; // Promise wrapping the HTML source of the style editor for display in the library
var styleEditorLibrarySourceId; // Unique ID of styleEditorLibrarySource; will change if styleEditorLibrarySource does
var styleEditorBookSource; // Promise wrapping the HTML source of the style editor for display in the currently-opened book
var styleEditorBookSourceId; // Unique ID of styleEditorBookSource; will change if styleEditorBookSource does
var styleEditorIdToBlobsMap = {}; // Map from style editor UIDs to objects as in sectionIdToBlobsMap

// basalt.html elements

var bookIframe = document.getElementById("book"); // The iframe to which to render book

// for injection into book sections

var navigation = document.getElementById("navtemplate").content.firstElementChild; // Navigation node for insertion into header/footer

/////////////////
//   Helpers   //
/////////////////

// Returns an ID not used previously within this run of the basalt.js script (barring overflow)
function getUniqueId() {
    return Atomics.add(nextUniqueId, 0, 1);
}

// sheet: CSSStyleSheet element
// reverse: bool, whether or not to reverse the order of rules in the sheet
// Returns string representation of sheet
function serializeStylesheet(sheet, reverse) {
    let sheetRules = Array.from(sheet.cssRules);
    if (reverse) {
        return sheetRules.reverse().map(rule => rule.cssText).join("\n");
    } else {
        return sheetRules.map(rule => rule.cssText).join("\n");
    }
}

// doc: document in which to create the link
// docId: UID associated with doc
// map: sectionIdToBlobsMap or libraryIdToBlobsMap
// sheet: string representation of sheet to place at the link
// Returns a link element pointing at sheet
function stylesheetToBlobLink(doc, docId, map, sheet) {
    let sheetBlob = new Blob([sheet], {
        type: "text/css",
    });
    let sheetUrl = URL.createObjectURL(sheetBlob);

    map[docId].blobs.push(sheetUrl);

    let link = doc.createElement("link");
    link.setAttribute("rel", "stylesheet");
    link.setAttribute("href", sheetUrl);
    return link;
}

// map: sectionIdToBlobsMap or libraryIdToBlobsMap
function revokeFinishedBlobs(map) {
    for (let uid in map) {
        if (map[uid].doneDisplaying) {
            for (let blobUrl of map[uid].blobs) {
                URL.revokeObjectURL(blobUrl);
            }
            delete map[uid];
        }
    }
}

////////////////////////
//   Render Library   //
////////////////////////

// doc: HTML doc representing library.html, to have styles inserted
// docId: UID associated with doc
function injectLibraryStylesheets(doc, docId) {
    // Figure out what rules are going to need pushing where

    let nonBookOverwritingBodyStyleRules = [];
    let bookOverwritingBodyStyleRules = [];

    if (!libraryStyleMerged.font.override) {
        nonBookOverwritingBodyStyleRules.push(`font-family: ${libraryStyleMerged.font.value}`);
    } else {
        bookOverwritingBodyStyleRules.push(`font-family: ${libraryStyleMerged.font.value}`);
    }
    // More options go here, once more options exist

    // Push all rules to appropriate places, as well as building the core library UI style

    let nonBookOverwritingStyle = new CSSStyleSheet();

    if (nonBookOverwritingBodyStyleRules.length > 0) {
        nonBookOverwritingStyle.insertRule(`body {${nonBookOverwritingBodyStyleRules.join(" ")}}`);
    }

    let nonBookOverwritingStyleLink = stylesheetToBlobLink(doc, docId, libraryIdToBlobsMap, serializeStylesheet(nonBookOverwritingStyle, true));
    doc.head.append(nonBookOverwritingStyleLink);

    let nonBookOverwritingCustomCss = new CSSStyleSheet();
    nonBookOverwritingCustomCss.replaceSync(libraryStyleMerged.customCssNoOverride.value);
    let nonBookOverwritingCustomCssLink = stylesheetToBlobLink(doc, docId, libraryIdToBlobsMap, serializeStylesheet(nonBookOverwritingCustomCss, false));
    doc.head.append(nonBookOverwritingCustomCssLink);

    let libraryUiStyle = new CSSStyleSheet();

    libraryUiStyle.insertRule("body {background: darkslateblue; color: gold; margin: 0; padding: 0;}");
    libraryUiStyle.insertRule("#library {display: flex; flex-direction: row; flex-wrap: wrap;");
    libraryUiStyle.insertRule("#library section {margin: min(1em, 2.25vw); width: min(20em, 45vw); text-align: center;}");
    libraryUiStyle.insertRule("#library button {all: unset; width: min(20em, 45vw); height: min(20em, 45vw); outline: 0.2em solid black; display: flex; justify-content: center; align-items: center; cursor: pointer;}");
    libraryUiStyle.insertRule("#openfile p {font-size: min(15em, 33.75vw); opacity: 50%;}");
    libraryUiStyle.insertRule("#openfileinput {display: none;}");

    let libraryUiStyleLink = stylesheetToBlobLink(doc, docId, libraryIdToBlobsMap, serializeStylesheet(libraryUiStyle, true));
    doc.head.append(libraryUiStyleLink);

    // THINGS BELOW HERE MIGHT NEED MODIFICATION AND CLEVERNESS TO DO THEIR OVERRIDES CORRECTLY

    let bookOverwritingStyle = new CSSStyleSheet();

    if (bookOverwritingBodyStyleRules.length > 0) {
        bookOverwritingStyle.insertRule(`#library * {${bookOverwritingBodyStyleRules.join(" ")}}`);
    }

    let bookOverwritingStyleLink = stylesheetToBlobLink(doc, docId, libraryIdToBlobsMap, serializeStylesheet(bookOverwritingStyle, true));
    doc.head.append(bookOverwritingStyleLink);

    // let bookOverwritingCustomCss = new CSSStyleSheet();
    // bookOverwritingCustomCss.replaceSync(libraryStyleMerged.customCssOverrideBook.value);
    // let bookOverwritingCustomCssLink = stylesheetToBlobLink(doc, docId, libraryIdToBlobsMap, serializeStylesheet(bookOverwritingCustomCss, false));
    // doc.head.append(bookOverwritingCustomCssLink);

    let basaltUiStyle = new CSSStyleSheet();

    basaltUiStyle.insertRule("body {display: flex; flex-direction: column; min-height: 100vh;");
    basaltUiStyle.insertRule("header, footer {background: slateblue; padding: 10px; z-index: 1;");
    basaltUiStyle.insertRule("main {flex: 1; display: flex; flex-direction: row;");
    basaltUiStyle.insertRule("#library {flex: 1;}");
    basaltUiStyle.insertRule("#styleeditor iframe {border: none; border-left: 0.2em solid slateblue; width: min(22.2em, 49.95vw); height: 100%; max-height:100vh; position: sticky; top: 0;}");
    basaltUiStyle.insertRule("#reopenbook, #returntotop {float: left;}");
    basaltUiStyle.insertRule("#styleeditorbutton {float: right;}");

    let basaltUiStyleLink = stylesheetToBlobLink(doc, docId, libraryIdToBlobsMap, serializeStylesheet(basaltUiStyle, true));
    doc.head.append(basaltUiStyleLink);

    // let uiOverwritingCustomCss = new CSSStyleSheet();
    // uiOverwritingCustomCss.replaceSync(libraryStyleMerged.customCssOverrideUi.value);
    // let uiOverwritingCustomCssLink = stylesheetToBlobLink(doc, docId, libraryIdToBlobsMap, serializeStylesheet(uiOverwritingCustomCss, false));
    // doc.head.append(uiOverwritingCustomCssLink)
}

// doc: HTML doc representing library.html, to be prepared for display
// docId: UID associated with doc
// reopenAllowed: bool, if false then the "Reopen book" button gets disabled
// Returns string representation of doc, now customized for display to the user
async function prepareLibraryDocForDisplay(doc, docId, reopenAllowed) {
    if (!reopenAllowed) {
        doc.getElementById("reopenbook").setAttribute("disabled", "disabled");
    }

    injectLibraryStylesheets(doc, docId);
    if (styleEditorOpen) {
        if (!styleEditorLibrarySource) {
            let styleEditorInfo = generateStyleEditor("library");
            styleEditorLibrarySource = styleEditorInfo.source;
            styleEditorLibrarySourceId = styleEditorInfo.id;
        }
        injectStyleEditorIntoDocument(doc, await styleEditorLibrarySource, "styleeditor", "styleeditorbutton");
    }

    return new XMLSerializer().serializeToString(doc);
}

// reopenAllowed: bool, if false then the "Reopen book" button gets disabled
// Returns promise wrapping the output library HTML
function generateLibrary(reopenAllowed) {
    if (librarySourceId) {
        libraryIdToBlobsMap[librarySourceId].doneDisplaying = true;
    }

    let libraryId = getUniqueId();
    libraryIdToBlobsMap[libraryId] = {doneDisplaying: false, blobs: []};

    return {
        id: libraryId,
        source: new Promise((resolve, _reject) => {
            let libraryRequest = new XMLHttpRequest();
            libraryRequest.open("GET", "library.html");
            libraryRequest.responseType = "document";
            libraryRequest.onload = _ => {
                resolve(prepareLibraryDocForDisplay(libraryRequest.responseXML, libraryId, reopenAllowed));
            };
            libraryRequest.send();
        }),
    }
}

/////////////////////
//   Render Book   //
/////////////////////

// tocArray: array of book TOC objects, either the top-level TOC or a descendant
// ancestorCount: number of ancestors above toc_array in the TOC's nesting structure (0 for the top-level TOC array)
// Returns array of items, where each item is an object mapping "label" to a string to be displayed and "href" to the TOC href associated with that label
function getTocItems(tocArray, ancestorCount) {
    let items = [];
    tocArray.forEach(tocEntry => {
        let itemLabel = (String.fromCharCode(160).repeat(ancestorCount * 4)) + tocEntry.label.trim(); // The trim is to compensate for an epub.js bug, at the cost of fidelity to sources whose TOCs *actually* have whitespace
        items.push({label: itemLabel, href: tocEntry.href});
        items = items.concat(getTocItems(tocEntry.subitems, ancestorCount + 1));
    });
    return items;
}

// href: string representation of URI-encoded href
// base: string representation of URI-encoded directory name from which href is reffing
// Returns object with properties "internal" (bool, true if internal href, false if external), "uri" (string, path to linked target from epub root if internal, untouched input href if external), and "fragment" (string | undefined, fragment identifier if present on internal href)
function parseHref(href, base) {
    let linkUrl = new URL(href, base);
    if (linkUrl.href.startsWith(browser.runtime.getURL(""))) { // Internal href
        if (linkUrl.hash) {
            return { internal: true, uri: linkUrl.pathname, fragment: linkUrl.hash };
        } else {
            return { internal: true, uri: linkUrl.pathname };
        }
    } else { // External href
        return { internal: false, uri: linkUrl.href };
    }
}

// toc: book table of contents array
async function setTocDropdown(toc) {
    let tocDropdown = navigation.getElementsByTagName("select")[0];
    let opfPath = browser.runtime.getURL(book.path.path);

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

    if (tocItems[0].href != firstSpineHref) {
        tocItems.unshift({label: "[Start]", href: firstSpineHref}); // Improve label?
    }
    if (tocItems.at(-1).href != lastSpineHref) {
        tocItems.push({label: "[End]", href: lastSpineHref}); // Improve label?
    }

    // Write TOC to TOC dropdowns
    tocItems.forEach(item => {
        let parsedHref = parseHref(item.href, opfPath);
        let spineItem = book.spine.items.find(section => (section.canonical === parsedHref.uri) || (section.canonical === decodeURI(parsedHref.uri)));
        if (spineItem) {
            item.tocInfo = {index: spineItem.index, fragment: parsedHref.fragment};

            let entryElement = document.createElement("option");
            entryElement.setAttribute("value", JSON.stringify(item.tocInfo));
            entryElement.textContent = item.label;
            tocDropdown.append(entryElement.cloneNode(true));
        } else {
            item.tocInfo = {index: null, fragment: null};
            console.warn(`TOC item with label "${item.label}" and href "${item.href}" points outside of the book spine and was thus not included in the displayed table of contents.`);
        }
    });

    // Map TOC for use in future dropdown-updating
    book.spine.items.forEach(spineItem => {
        let firstMatchingTocItem = tocItems.find(tocItem => tocItem.tocInfo.index === spineItem.index);
        let lastMatchingTocItem = tocItems.findLast(tocItem => tocItem.tocInfo.index === spineItem.index);
        if (firstMatchingTocItem) {
            sectionToTocMap[spineItem.index] = {header: JSON.stringify(firstMatchingTocItem.tocInfo), footer: JSON.stringify(lastMatchingTocItem.tocInfo)};
        } else {
            let lastItemHit = sectionToTocMap[spineItem.index - 1].footer;
            sectionToTocMap[spineItem.index] = {header: lastItemHit, footer: lastItemHit};
        }
    });
}

// doc: XHTML doc to retrieve stylesheets from
// Returns array of objects, each mapping "node" to the node a stylesheet was retrieved from, "sheetText" to a text representation of the sheet, and "hydratedSheet" to an initially-null CSSStyleSheet representation of said stylesheet
async function getStylesheets(doc) {
    let sheets = [];

    let stylesheetBearingNodes = doc.querySelectorAll("style, link[rel=stylesheet]");

    let sheetText;
    for (let node of stylesheetBearingNodes) {
        if (node.tagName === "style") {
            sheetText = node.innerHTML;
        } else if (node.tagName === "link") {
            // Update to make sure the link is internal and toss an error if not
            sheetText = await fetch(node.href).then(async content => await content.text());
        } else {
            let errorMessage = "Error: misidentified non-stylesheet-bearing node as stylesheet-bearing. To fix reader functionality, please refresh the page. (This should never happen; please report if it does.)";
            console.error(errorMessage);
            alert(errorMessage);
            throw "BasaltInternalError";
        }

        sheets.push({node: node, sheetText: sheetText, hydratedSheet: null});
    }

    return sheets;
}

// doc: XHTML doc to check uniqueness against
// baseName: name to use if possible, or use in modified form otherwise
// Returns basename with as many underscores prepended as necessary to make sure nothing in doc has that class name
function getUniqueClassName(doc, baseName) {
    let className = baseName;
    while (doc.getElementsByClassName(className).length > 0) {
        className = "_" + className;
    }
    return className;
}

// doc: XHTML doc to check uniqueness against
// baseName: name to use if possible, or use in modified form otherwise
// Returns basename with as many underscores prepended as necessary to make sure nothing in doc has that id name
function getUniqueIdName(doc, baseName) {
    let idName = baseName;
    while (doc.getElementById(idName)) {
        idName = "_" + idName;
    }
    return idName;
}

// doc: XHTML doc whose html and body elements should be refactored into divs
// sectionIdName: ID name for the section element containing the html div
// htmlClassName: class name, unique within doc, to place on the html div
// bodyClassName: class name, unique within doc, to place on the body div
function refactorHtmlAndBody(doc, sectionIdName, htmlClassName, bodyClassName) {
    let main = doc.createElement("main");

    let mainSection = doc.createElement("section");
    mainSection.id = sectionIdName;

    let mainHtml = doc.createElement("div");
    mainHtml.classList.add(htmlClassName);

    let mainBody = doc.createElement("div");
    mainBody.classList.add(bodyClassName);

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

    mainSection.append(mainHtml);
    main.append(mainSection);
    doc.body.append(main);
}

// doc: XHTML doc into whose body the navigation header and footer should be injected
// ignoreStylesClassName: class name, unused elsewhere in doc, to indicate that the header and footer should be unaffected by all doc styles
// headerIdName: ID name for header
// footerIdName: ID name for footer
// closeButtonIdName: ID name for "Close book" button in header
// styleEditorButtonIdName: ID name for "Style editor" button in header
// returnToTopButtonIdName: ID name for "Return to top" button in footer
// navigationClassName: class name for the header and footer's nav elements
function injectNavigation(doc, ignoreStylesClassName, headerIdName, footerIdName, closeButtonIdName, styleEditorButtonIdName, returnToTopButtonIdName, navigationClassName) {
    let closeBookButton = doc.importNode(document.getElementById("closebuttontemplate").content.firstElementChild);
    closeBookButton.id = closeButtonIdName;
    closeBookButton.classList.add(ignoreStylesClassName);

    let styleEditorButton = doc.importNode(document.getElementById("styleeditorbuttontemplate").content.firstElementChild);
    styleEditorButton.id = styleEditorButtonIdName;
    styleEditorButton.classList.add(ignoreStylesClassName);

    let returnToTopButton = doc.importNode(document.getElementById("returntotoptemplate").content.firstElementChild);
    returnToTopButton.id = returnToTopButtonIdName;
    returnToTopButton.classList.add(ignoreStylesClassName);

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
    header.append(styleEditorButton);
    header.append(docNav.cloneNode(true));

    let footer = doc.createElement("footer");
    footer.id = footerIdName;
    footer.classList.add(ignoreStylesClassName);
    footer.append(returnToTopButton);
    footer.append(docNav);

    doc.body.prepend(header);
    doc.body.append(footer);

    // Set header and footer dropdown positions
    doc.querySelector(`#${headerIdName} select [value='${sectionToTocMap[currentSection.index].header}']`).setAttribute("selected", "selected");
    Array.from(doc.querySelectorAll(`#${footerIdName} select [value='${sectionToTocMap[currentSection.index].footer}']`)).at(-1).setAttribute("selected", "selected");
}

// sheet: string representation of stylesheet
// Returns sheet, but with its import statements turned into inline CSS
async function inlineStylesheetImports(sheet) {
    // LightningCSS might be able to do this better once its visitor API is working, I don't know.
    let updatedSheet = sheet;

    for (let match of sheet.matchAll(/@import\s*("(?<dqurl>.*?)"|'(?<squrl>.*?)'|url\s*\(\s*("(?<fdqurl>.*?)"|'(?<fsqurl>.*?)')\s*\))\s*(?<layer>layer\s*(\(\s*("(?<dqlayername>.*?)"|'(?<sqlayername>.*?)')\s*\))?)?\s*(?<queries>.*?)\s*;/g)) {
        let fullMatch = match[0];
        let url = match.groups.dqurl || match.groups.squrl || match.groups.fdqurl || match.groups.fsqurl;
        let layer = match.groups.layer;
        let layerName = match.groups.dqlayername || match.groups.sqlayername || "";
        let queries = match.groups.queries;

        // Update to make sure the import path is internal and toss an error if not
        let sheetAtUrl = await fetch(url).then(async content => await content.text());
        let sheetAtUrlAfterRecursion = await inlineStylesheetImports(sheetAtUrl);

        let matchReplacement = sheetAtUrlAfterRecursion;
        if (queries) {
            matchReplacement = `@media ${queries} {${matchReplacement}}`;
        }
        if (layer) {
            matchReplacement = `@layer ${layerName} {${matchReplacement}}`;
        }

        updatedSheet = updatedSheet.replace(fullMatch, matchReplacement);
    }

    return updatedSheet;
}

// sheet: string representation of CSS stylesheet
// htmlClassName: class name to replace html element selectors with
// bodyClassName: class name to replace body element selectors with
// Returns sheet, transpiled for maximum compatibility with whatever major Firefox version is being run, with any body or html element selectors replaced with their respective replacement classes
async function reaimStylesheet(sheet, htmlClassName, bodyClassName) {
    // Legacy regex-based replacement code, broken in edge cases but currently necessary since lightningcss-wasm's visitor API is broken

    let styles = sheet.split("}");
    let after_final_style = styles.pop();
    styles = styles.map(style => style + "}");

    let updatedSheet = "";
    for (let style of styles) {
        let splitStyle = style.split("{");
        let selector = splitStyle[0];
        let declarations = splitStyle.slice(1).join("{");

        let selectorWithHtmlReplaced = selector.replaceAll(/(?<![\w\.#[=:_-])html(?![\w_-])/g, "." + htmlClassName);
        let selectorWithHtmlAndBodyReplaced = selectorWithHtmlReplaced.replaceAll(/(?<![\w\.#[=:_-])body(?![\w_-])/g, "." + bodyClassName);

        if (declarations) {
            let declarationsMinusPrefixes = declarations.replaceAll(/(^|(?<=[:\s]))-(webkit|moz|o|ms)-(?=\w)/g, "");
            updatedSheet += [selectorWithHtmlAndBodyReplaced].concat([declarationsMinusPrefixes]).join("{");
        } else {
            updatedSheet += selectorWithHtmlAndBodyReplaced;
        }
    }
    updatedSheet += after_final_style;

    // Non-legacy LightningCSS-based replacement code, currently partly broken

    await lightningCssImportFinished;
    let {code, _map} = (await lightningCss).transform({
        code: new TextEncoder().encode(updatedSheet),
        errorRecovery: true,
        targets: {
            firefox: await browserVersion,
        },
        // visitor: { // lightningcss-wasm's visitor API is currently nonfunctional, so this does nothing
        //     Rule: {
        //         style(rule) {
        //             for (let selector of rule.value.selectors) {
        //                 for (let [i, component] of selector.entries()) {
        //                     if (component.type === "type") {
        //                         if (component.name === "body") {
        //                             selector[i] = {type: "class", name: bodyReplacement};
        //                         } else if (component.name === "html") {
        //                             selector[i] = {type: "class", name: htmlReplacement};
        //                         }
        //                     }
        //                 }
        //             }
        //             for (let declaration of rule.value.declarations.declarations) {
        //                 if (declaration.vendorPrefix) {
        //                     delete declaration.vendorPrefix;
        //                 }
        //             }
        //             return rule;
        //         }
        //     }
        // }
    });

    return new TextDecoder().decode(code);
}

// doc: XHTML doc whose head's style elements and links should be modified
// docId: UID associated with doc
// docSheets: array of stylesheets in doc
// htmlClassName: class name to reaim head-element-targeted styles towards
// bodyClassName: class name to reaim body-element-targeted styles towards
async function reaimAndHydrateStylesheets(doc, docId, docSheets, htmlClassName, bodyClassName) {
    for (let sheetInfo of docSheets) {
        // Inline imports so they get properly reaimed too
        let sheetWithImportsInlined = await inlineStylesheetImports(sheetInfo.sheetText);
        // (Possibly replace this with recursive reaiming of imports, instead? Plausibly more elegant / less error-prone)

        // Reaim and hydrate
        let firstPassReaimedSheetText = await reaimStylesheet(sheetWithImportsInlined, htmlClassName, bodyClassName);
        let hydratedSheet = new CSSStyleSheet();
        hydratedSheet.replaceSync(firstPassReaimedSheetText);
        // Doing two passes avoids redundant console-spam about any invalid styles that remain
        let secondPassReaimedSheetText = serializeStylesheet(hydratedSheet, false);
        let reaimedSheetNode = stylesheetToBlobLink(doc, docId, sectionIdToBlobsMap, secondPassReaimedSheetText);

        sheetInfo.node.parentNode.replaceChild(reaimedSheetNode, sheetInfo.node);

        sheetInfo.node = reaimedSheetNode;
        sheetInfo.sheetText = secondPassReaimedSheetText;
        sheetInfo.hydratedSheet = hydratedSheet;
    }
}

// element: Element to get a list of applicable rules for
// sheets: array of CSSStyleSheet elements
function getApplicableRules(element, sheets) {
    let rules = [];

    for (let sheet of sheets) {
        for (let rule of sheet.cssRules) {
            try {
                if (element.matches(rule.selectorText)) {
                    rules.push(rule.cssText);
                }
            } catch (error) {
                console.warn(`Encountered error while checking document writing mode: ${error}`);
            }
        }
    }

    return rules;
}

// doc: XHTML doc to check for whether it's made up of vertical text
// docSheets: array of stylesheets in doc
// htmlClassName: class name, unique within the doc, whose element's writing mode needs to be checked
// returns "vertical-rl" or "vertical-lr" if that writing mode applies to all bottom-level leaves of the tree of htmlClassName's associated element's descendants; else returns "horizontal-tb"
function getMainWritingMode(doc, docSheets, htmlClassName) {
    let hydratedSheets = docSheets.map(sheetInfo => sheetInfo.hydratedSheet);

    let currentlyCheckedElement = doc.getElementsByClassName(htmlClassName)[0];
    let writingMode = "horizontal-tb";

    while (true) {
        let currentElementRules = getApplicableRules(currentlyCheckedElement, hydratedSheets);
        for (let rule of currentElementRules) {
            if (rule.includes("writing-mode:")) {
                let mode = rule.split("writing-mode:").at(-1);
                if (mode.includes("horizontal-tb") || mode.includes("initial")) {
                    writingMode = ("horizontal-tb");
                } else if (mode.includes("vertical-rl")) {
                    writingMode = ("vertical-rl");
                } else if (mode.includes("vertical-lr")) {
                    writingMode = ("vertical-lr");
                }
            }
        }

        if (currentlyCheckedElement.children.length === 1) {
            currentlyCheckedElement = currentlyCheckedElement.children[0];
        } else {
            break;
        }
    }

    return writingMode;
}

// doc: XHTML doc into which Basalt's stylesheets will be injected
// docId: UID associated with doc
// writingMode: writing mode in which doc is set to be displayed
// ignoreStylesClassName: class name indicating that its elements should be unaffected by all doc styles
// headerIdName: ID name for header
// footerIdName: ID name for footer
// closeButtonIdName: ID name for "Close book" button in header
// styleEditorButtonIdName: ID name for "Style editor" button in header
// returnToTopButtonIdName: ID name for "Return to top" button in footer
// navigationClassName: class name for the header and footer's nav elements
// htmlClassName: class name for the html element of the opened book section
// styleEditorIdName: ID name for the style editor section
function injectBookSectionStylesheets(doc, docId, writingMode, ignoreStylesClassName, headerIdName, footerIdName, closeButtonIdName, styleEditorButtonIdName, returnToTopButtonIdName, navigationClassName, sectionIdName, htmlClassName, styleEditorIdName) {
    // Low-priority style (will be overridden by the book's stylesheets)
    let lowPriorityStyle = new CSSStyleSheet();

    lowPriorityStyle.insertRule(`.${htmlClassName} {all: revert; min-height:100%; min-width:100%; background: darkslateblue; color: gold;}`);
    lowPriorityStyle.insertRule("a {color: orangered;}");

    let lowPriorityStyleLink = stylesheetToBlobLink(doc, docId, sectionIdToBlobsMap, serializeStylesheet(lowPriorityStyle, true));
    doc.head.prepend(lowPriorityStyleLink);

    // High-priority style (will override the book's stylesheets)
    let highPriorityStyle = new CSSStyleSheet();

    // Currently undefined, pending work on the style editor

    let highPriorityStyleLink = stylesheetToBlobLink(doc, docId, sectionIdToBlobsMap, serializeStylesheet(highPriorityStyle, true));
    doc.head.append(highPriorityStyleLink);

    // Basalt style (will apply to the Basalt UI and override even highPriorityStyle)
    let basaltStyle = new CSSStyleSheet();

    basaltStyle.insertRule(`.${ignoreStylesClassName} {all: revert;}`);

    if (writingMode === "horizontal-tb") {
        basaltStyle.insertRule("body {margin: 0; padding: 0; display: flex; flex-direction: column; min-height: 100vh;}");
        basaltStyle.insertRule(`#${sectionIdName} {flex: 1; display: flex; max-width: 100%;}`)
    } else {
        basaltStyle.insertRule(`html {writing-mode: ${writingMode};}`);
        basaltStyle.insertRule("body {margin: 0; padding: 0; display: flex; flex-direction: column; min-width: 100vw;}");
        basaltStyle.insertRule(`#${sectionIdName} {flex: 1; display: flex; max-height:100%;}`)
    }

    basaltStyle.insertRule(`#${headerIdName}, #${footerIdName} {background: slateblue; padding: 10px; z-index: 2147483647;}`);
    basaltStyle.insertRule("main {flex: 1; display: flex; flex-direction: row;}");
    basaltStyle.insertRule(`#${styleEditorIdName} iframe {border: none; border-left: 0.2em solid slateblue; width: min(22.2em, 49.95vw); height: 100%; max-height:100vh; position: sticky; top: 0;}`);
    basaltStyle.insertRule(`#${closeButtonIdName}, #${returnToTopButtonIdName} {float: left;}`);
    basaltStyle.insertRule(`#${styleEditorButtonIdName} {float: right;}`);
    basaltStyle.insertRule(`.${navigationClassName} {text-align: center;}`);

    let basaltStyleLink = stylesheetToBlobLink(doc, docId, sectionIdToBlobsMap, serializeStylesheet(basaltStyle, true));
    doc.head.append(basaltStyleLink);
}

// doc: XHTML doc to inject script into
function injectUiScript(doc) {
    let scriptUri = browser.runtime.getURL("reader/basalt-ui.js");
    let scriptElement = doc.createElement("script");
    scriptElement.setAttribute("src", scriptUri);
    doc.body.append(scriptElement);
}

// xhtml: string representationn of XHTML doc to prepare
// Returns the input XHTML doc, morphed from its book-native form for effective rendering in the book iframe
async function prepareBookXhtmlForDisplay(xhtml) {
    let parsedXhtml = new DOMParser().parseFromString(xhtml, "application/xhtml+xml");

    let stylesheets = getStylesheets(parsedXhtml);

    let sectionId = getUniqueId();
    sectionIdToBlobsMap[sectionId] = {doneDisplaying: false, blobs: []};

    let ignoreStylesClassName = getUniqueClassName(parsedXhtml, "basaltignorestyles");
    let headerIdName = getUniqueIdName(parsedXhtml, "basaltheader");
    let footerIdName = getUniqueIdName(parsedXhtml, "basaltfooter");
    let closeButtonIdName = getUniqueIdName(parsedXhtml, "basaltclosebook");
    let styleEditorButtonIdName = getUniqueIdName(parsedXhtml, "basaltstyleeditorbutton");
    let returnToTopButtonIdName = getUniqueIdName(parsedXhtml, "basaltreturntotop");
    let navigationClassName = getUniqueClassName(parsedXhtml, "basaltnav");
    let sectionIdName = getUniqueIdName(parsedXhtml, "basaltsection");
    let htmlClassName = getUniqueClassName(parsedXhtml, "basaltmainhtml");
    let bodyClassName = getUniqueClassName(parsedXhtml, "basaltmainbody");
    let styleEditorIdName = getUniqueIdName(parsedXhtml, "basaltstyleeditor");

    refactorHtmlAndBody(parsedXhtml, sectionIdName, htmlClassName, bodyClassName);
    injectNavigation(parsedXhtml, ignoreStylesClassName, headerIdName, footerIdName, closeButtonIdName, styleEditorButtonIdName, returnToTopButtonIdName, navigationClassName);
    await reaimAndHydrateStylesheets(parsedXhtml, sectionId, await stylesheets, htmlClassName, bodyClassName);
    let writingMode = getMainWritingMode(parsedXhtml, await stylesheets, htmlClassName);
    injectBookSectionStylesheets(parsedXhtml, sectionId, writingMode, ignoreStylesClassName, headerIdName, footerIdName, closeButtonIdName, styleEditorButtonIdName, returnToTopButtonIdName, navigationClassName, sectionIdName, htmlClassName, styleEditorIdName);
    injectUiScript(parsedXhtml);
    if (styleEditorOpen) {
        if (!styleEditorBookSource) {
            let styleEditorInfo = generateStyleEditor("section");
            styleEditorBookSource = styleEditorInfo.source;
            styleEditorBookSourceId = styleEditorInfo.id;
        }
        injectStyleEditorIntoDocument(parsedXhtml, await styleEditorBookSource, styleEditorIdName, styleEditorButtonIdName);
    }

    return {
        id: sectionId,
        styleInfo: {
            classes: {
                ignoreStyles: ignoreStylesClassName,
                navigation: navigationClassName,
                html: htmlClassName,
                body: bodyClassName,
            },
            ids: {
                header: headerIdName,
                footer: footerIdName,
                closeButton: closeButtonIdName,
                styleEditorButton: styleEditorButtonIdName,
                returnToTopButton: returnToTopButtonIdName,
                section: sectionIdName,
                styleEditor: styleEditorIdName,
            },
            misc: {
                writingMode: writingMode,
            },
        },
        // styleEditorId: styleEditorIdName,
        source: new XMLSerializer().serializeToString(parsedXhtml),
    };
}

/////////////////////////////
//   Render Style Editor   //
/////////////////////////////

// doc: style editor HTML doc to set the tab name in
// type: string, "library" or "section"
function adjustIfInLibrary(doc, type) {
    if (type === "library") {
        let tabNameLabel = doc.getElementById("bookstyle").labels[0];
        tabNameLabel.innerText = "Library Style";

        let overrideColumnLabels = doc.querySelectorAll("table > tbody > tr:first-child > td:nth-child(2)"); // Replace with a class for increased change-resistance?
        for (let overrideLabel of overrideColumnLabels) {
            overrideLabel.innerText = "Override library stylesheets";
        }

        doc.getElementById("typemeta").setAttribute("content", "library");
    }
}

// doc: HTML doc to inject stylesheet into
// docId: UID associated with doc
function injectStyleEditorStylesheet(doc, docId) {
    let style = new CSSStyleSheet();

    // Basic layout
    style.insertRule("html {scrollbar-width: thin; min-height: calc(100% - 0.4em); border-right: 0.2em solid slateblue; border-top: 0.2em solid slateblue; border-bottom: 0.2em solid slateblue}");
    style.insertRule("body {color: gold; margin: 0; display: flex; flex-direction: row; flex-wrap: wrap;}");

    // Tabs
    style.insertRule(".tab {display: none;}");
    style.insertRule(".tablabel {box-sizing: border-box; width: 50%; border-bottom: 0.2em solid slateblue;}");
    style.insertRule(".tablabel:not(.tablabel:first-of-type) {border-left: 0.2em solid slateblue;}");
    style.insertRule(".tabcontent {display: none; order: 1; width: 100%;}");
    style.insertRule(".tab:checked + .tablabel {border-bottom: none;}");
    style.insertRule(".tab:checked + .tablabel + .tabcontent {display: block;}");

    // Editor
    style.insertRule(".styleeditor {border: 0.2em solid slateblue; margin: 0.2em; padding: 0.2em;}");
    style.insertRule(".presetselector {display: inline;}");
    style.insertRule(".options {border-collapse: collapse;}");
    style.insertRule(".option {border: 0.2em solid slateblue;}");
    style.insertRule(".optiondescription {text-align: center; margin: 0;}");
    style.insertRule(".optionselector, .presetselector {color: inherit; border-color: slateblue; background: darkslateblue;}"); // It's unclear why inherit fails for border-color and background; work that out maybe
    style.insertRule(".cssbox {box-sizing: border-box; width: 100%;}");
    style.insertRule("#booksavechanges, #globalsavechanges {width: 100%;}")

    let styleLink = stylesheetToBlobLink(doc, docId, styleEditorIdToBlobsMap, serializeStylesheet(style, true));
    doc.head.append(styleLink);
}

// doc: HTML doc to inject script into
function injectStyleEditorUiScript(doc) {
    let scriptUri = browser.runtime.getURL("reader/style-editor.js");
    let scriptElement = doc.createElement("script");
    scriptElement.setAttribute("src", scriptUri);
    doc.body.append(scriptElement);
}

// doc: HTML doc representing style-editor.html, to be prepared for display
// docId: UID associated with doc
// type: string, "library" or "section"
// bookId: string | undefined, unique ID of book if type is "section"
// Returns string representation of doc, now customized for display to the user
function prepareStyleEditorDocForDisplay(doc, docId, type) {
    adjustIfInLibrary(doc, type);
    injectStyleEditorStylesheet(doc, docId);
    injectStyleEditorUiScript(doc);
    return new XMLSerializer().serializeToString(doc);
}

// type: string, "library" or "section"
// Returns promise wrapping the output style editor HTML
function generateStyleEditor(type) {
    let styleEditorId = getUniqueId();
    styleEditorIdToBlobsMap[styleEditorId] = {doneDisplaying: false, blobs: []};

    return {
        id: styleEditorId,
        source: new Promise((resolve, _reject) => {
            let styleEditorRequest = new XMLHttpRequest();
            styleEditorRequest.open("GET", "style-editor.html");
            styleEditorRequest.responseType = "document";
            styleEditorRequest.onload = _ => {
                resolve(prepareStyleEditorDocForDisplay(styleEditorRequest.responseXML, styleEditorId, type));
            };
            styleEditorRequest.send();
        }),
    }
}

// doc: library or section document into which to inject the editor
// editorSource: HTML source of editor to inject
// editorId: ID name for editor
// editorButtonId: ID of editor toggle button in doc
function injectStyleEditorIntoDocument(doc, editorSource, editorId, editorButtonId) {
    let editor = doc.createElement("section");
    editor.id = editorId;

    let editorFrame = doc.createElement("iframe");
    editor.append(editorFrame);
    editorFrame.setAttribute("srcdoc", editorSource);

    doc.getElementsByTagName("main")[0].append(editor);
    doc.getElementById(editorButtonId).setAttribute("value", "Close style editor");
}

// doc: library or section document form which to remove the editor
// editorId: ID of editor in doc
// editorButtonId: ID of editor toggle button in doc
function removeStyleEditorFromDocument(doc, editorId, editorButtonId) {
    doc.getElementById(editorId).remove();
    doc.getElementById(editorButtonId).setAttribute("value", "Open style editor");
}

////////////////////////
//   Style-Updating   //
////////////////////////

// nonGlobalStyle: libraryStyle or currentBookStyle
// Returns nonGlobalStyle except with all values which are set to use the global value replaced with the appropriate global value
function getMergedStyle(nonGlobalStyle) {
    let mergedStyle = {};
    for (let styleName in nonGlobalStyle) {
        if (nonGlobalStyle[styleName].useGlobal) {
            mergedStyle[styleName] = globalStyle[styleName];
        } else {
            mergedStyle[styleName] = nonGlobalStyle[styleName];
            delete mergedStyle[styleName]["useGlobal"];
        }
    }
    return mergedStyle;
}

// newStyle: information on the values being pushed from the style editor to the document (see style-editor.js for structure)
// newStyleType: string, "book" or "global"
// editorType: string, "library" or "section"
function saveStyle(newStyle, newStyleType, editorType) {
    if (newStyleType === "global") {
        globalStyle = newStyle;
        libraryStyleMerged = getMergedStyle(libraryStyle);
        currentBookStyleMerged = getMergedStyle(currentBookStyle);
        browser.storage.local.set({"global": globalStyle});
    } else if (newStyleType === "book" && editorType === "library") {
        libraryStyle = newStyle;
        libraryStyleMerged = getMergedStyle(libraryStyle);
        browser.storage.local.set({"library": libraryStyle});
    } else if (newStyleType === "book" && editorType === "section") {
        currentBookStyle = newStyle;
        currentBookStyleMerged = getMergedStyle(currentBookStyle);
        browser.storage.local.get({"book": {}}).then(bookStylesObject => browser.storage.local.set(Object.assign(bookStylesObject.book, {currentBookId: currentBookStyle})));
    } else {
        let errorMessage = `Error: received style-save command of style type '${newStyleType}' and editor type '${editorType}'. To fix reader functionality, please refresh the page. (This should never happen; please report it if it does.)`;
        console.error(errorMessage);
        alert(errorMessage);
        throw "BasaltInternalError";
    }
}

// doc: HTML or XHTML doc for the page to update style in
// pageType: string, "library" or "section"
// liveDisplay: bool, true if doc is currently being shown in-browser, else false
function updatePageStyle(doc, pageType, liveDisplay) {
    let mainFramePreexistingStyles = Array.from(doc.querySelectorAll("link[rel=stylesheet]"));

    if (pageType === "library") {
        injectLibraryStylesheets(doc, librarySourceId);
        mainFramePreexistingStyles.forEach(styleLink => styleLink.remove());
        let styleEditorFrame = doc.querySelector("#styleeditor iframe");
        if (styleEditorFrame) {
            let styleEditorDoc;
            if (liveDisplay) {
                styleEditorDoc = styleEditorFrame.contentWindow.document;
            } else {
                styleEditorDoc = new DOMParser().parseFromString(styleEditorFrame.getAttribute("srcdoc"), "text/html");
            }
            let styleEditorFramePreexistingStyles = Array.from(styleEditorDoc.querySelectorAll("link[rel=stylesheet]"));
            injectStyleEditorStylesheet(styleEditorDoc, styleEditorLibrarySourceId);
            styleEditorFramePreexistingStyles.at(-1).remove();
            if (!liveDisplay) {
                styleEditorFrame.setAttribute("srcdoc", new XMLSerializer().serializeToString(styleEditorDoc));
            }
            // This should also update the inputs' values to MergedStyle
        }
    } else if (pageType === "section") {
        injectBookSectionStylesheets(doc, currentSectionSourceId, currentSectionStyleInfo.misc.writingMode, currentSectionStyleInfo.classes.ignoreStyles, currentSectionStyleInfo.ids.header, currentSectionStyleInfo.ids.footer, currentSectionStyleInfo.ids.closeButton, currentSectionStyleInfo.ids.styleEditorButton, currentSectionStyleInfo.ids.returnToTopButton, currentSectionStyleInfo.classes.navigation, currentSectionStyleInfo.ids.section, currentSectionStyleInfo.classes.html, currentSectionStyleInfo.ids.styleEditor);
        [mainFramePreexistingStyles[0], mainFramePreexistingStyles.at(-2), mainFramePreexistingStyles.at(-1)].forEach(styleLink => styleLink.remove());
        let styleEditorFrame = doc.querySelector(`#${currentSectionStyleInfo.ids.styleEditor} iframe`);
        if (styleEditorFrame) {
            let styleEditorDoc;
            if (liveDisplay) {
                styleEditorDoc = styleEditorFrame.contentWindow.document;
            } else {
                styleEditorDoc = new DOMParser().parseFromString(styleEditorFrame.getAttribute("srcdoc"), "text/html");
            }
            let styleEditorFramePreexistingStyles = Array.from(styleEditorDoc.querySelectorAll("link[rel=stylesheet]"));
            injectStyleEditorStylesheet(styleEditorDoc, styleEditorBookSourceId);
            styleEditorFramePreexistingStyles.at(-1).remove();
            if (!liveDisplay) {
                styleEditorFrame.setAttribute("srcdoc", new XMLSerializer().serializeToString(styleEditorDoc));
            }
            // This should also update the inputs' values to MergedStyle
        }
    } else {
        let errorMessage = `Error: received style-update command of page type '${pageType}'. To fix reader functionality, please refresh the page. (This should never happen; please report if it does.)`;
        console.error(errorMessage);
        alert(errorMessage);
        throw "BasaltInternalError";
    }
}

async function regenerateStylesInPageSources() {
    let parser = new DOMParser();
    let serializer = new XMLSerializer();

    let libraryDoc = parser.parseFromString(await librarySource, "text/html");
    updatePageStyle(libraryDoc, "library");
    librarySource = new Promise((resolve, _reject) => resolve(serializer.serializeToString(libraryDoc)));

    if (currentSectionSource) {
        let sectionDoc = parser.parseFromString(currentSectionSource, "application/xhtml+xml");
        updatePageStyle(sectionDoc, "section");
        currentSectionSource = serializer.serializeToString(sectionDoc);
    }
}

// newStyle: information on the values being pushed from the style editor to the document (see style-editor.js for structure)
// newStyleType: string, "book" or "global"
// editorType: string, "library" or "section"
function updateStyles(newStyle, newStyleType, editorType) {
    saveStyle(newStyle, newStyleType, editorType);
    updatePageStyle(bookIframe.contentWindow.document, editorType);
    regenerateStylesInPageSources();
}

////////////////////
//   Navigation   //
////////////////////

async function displayLibrary() {
    bookIframe.setAttribute("srcdoc", await librarySource);
    revokeFinishedBlobs(libraryIdToBlobsMap);
}

// index: numerical index into spine
// opening: bool, whether the book is being opened for the first time
// fragment: string | undefined, fragment to jump to in section if applicable
async function displaySection(index, opening, fragment) {
    // There exist race conditions here. (currentDirectory, for instance, might be changed again here before being used in basalt-ui.js.) Figure out a more elegant solution.
    let newSection = false;
    if (!(currentSection) || (index !== currentSection.index) || opening) {
        let section = book.spine.get(index);
        if (section) {
            newSection = true;
            if (fragment) {
                bookIframe.addEventListener("load", _ => bookIframe.contentWindow.location.hash = fragment, {once: true});
            }
            window.scrollTo(0, 0);
            currentSection = section;
            currentDirectory = section.canonical.split("/").slice(0, -1).join("/") + "/";
            section.render(book.load.bind(book)).then(async xhtml => {
                let xhtmlToDisplay = await prepareBookXhtmlForDisplay(xhtml);
                currentSectionSource = xhtmlToDisplay.source;
                currentSectionStyleInfo = xhtmlToDisplay.styleInfo;
                currentSectionSourceId = xhtmlToDisplay.id;
                bookIframe.setAttribute("srcdoc", xhtmlToDisplay.source);
                revokeFinishedBlobs(sectionIdToBlobsMap);
                sectionIdToBlobsMap[xhtmlToDisplay.id].doneDisplaying = true;
            });
        }
    }
    if (fragment && !newSection) {
        bookIframe.contentWindow.location.hash = fragment;
    }
}

// liveType: string, "library" or "section" depending on whether the toggle command was sent from the library or from an open book section
async function openStyleEditor(liveType) {
    if (styleEditorBookSourceId) {
        styleEditorIdToBlobsMap[styleEditorBookSourceId].doneDisplaying = true;
    }
    if (styleEditorLibrarySourceId) {
        styleEditorIdToBlobsMap[styleEditorLibrarySourceId].doneDisplaying = true;
    }

    // Open style editor in live doc
    let liveTypeEditorInfo = generateStyleEditor(liveType);
    let liveDoc = bookIframe.contentWindow.document;

    let liveEditorId, liveEditorButtonId, unliveType;
    if (liveType === "library") {
        styleEditorLibrarySource = liveTypeEditorInfo.source;
        styleEditorLibrarySourceId = liveTypeEditorInfo.id;
        liveEditorId = "styleeditor";
        liveEditorButtonId = "styleeditorbutton";
        unliveType = "section";
    } else if (liveType === "section") {
        styleEditorBookSource = liveTypeEditorInfo.source;
        styleEditorBookSourceId = liveTypeEditorInfo.id;
        liveEditorId = currentSectionStyleInfo.ids.styleEditor
        liveEditorButtonId = liveDoc.querySelector('header input[value$=" style editor"]').id;
        unliveType = "library"
    } else {
        let errorMessage = `Error: received style editor open command of type '${liveType}'. To fix reader functionality, please refresh the page. (This should never happen; please report if it does.)`;
        console.error(errorMessage);
        alert(errorMessage);
        throw "BasaltInternalError";
    }

    injectStyleEditorIntoDocument(liveDoc, await liveTypeEditorInfo.source, liveEditorId, liveEditorButtonId);
    styleEditorOpen = true;

    // Open style editor in docs' source code
    let parser = new DOMParser();
    let serializer = new XMLSerializer();

    if (currentSection) {
        let unliveTypeEditorInfo = generateStyleEditor(unliveType);

        let sectionDoc = parser.parseFromString(currentSectionSource, "application/xhtml+xml");

        let libraryDoc = parser.parseFromString(await librarySource, "text/html");

        if (liveType === "section") {
            styleEditorLibrarySource = unliveTypeEditorInfo.source;
            styleEditorLibrarySourceId = unliveTypeEditorInfo.id;
            injectStyleEditorIntoDocument(libraryDoc, await unliveTypeEditorInfo.source, "styleeditor", "styleeditorbutton");
            injectStyleEditorIntoDocument(sectionDoc, await liveTypeEditorInfo.source, currentSectionStyleInfo.ids.styleEditor, currentSectionStyleInfo.ids.styleEditorButton);
        } else {
            styleEditorBookSource = unliveTypeEditorInfo.source;
            styleEditorBookSourceId = unliveTypeEditorInfo.id;
            injectStyleEditorIntoDocument(sectionDoc, await unliveTypeEditorInfo.source, currentSectionStyleInfo.ids.styleEditor, currentSectionStyleInfo.ids.styleEditorButton);
            injectStyleEditorIntoDocument(libraryDoc, await liveTypeEditorInfo.source, "styleeditor", "styleeditorbutton");
        }

        currentSectionSource = serializer.serializeToString(sectionDoc);
        librarySource = new Promise((resolve, _reject) => resolve(serializer.serializeToString(libraryDoc)));
    } else {
        // No book has been opened; therefore there's just the library, and liveType is "library"
        let libraryDoc = parser.parseFromString(await librarySource, "text/html");
        injectStyleEditorIntoDocument(libraryDoc, await liveTypeEditorInfo.source, "styleeditor", "styleeditorbutton");
        librarySource = new Promise((resolve, _reject) => resolve(serializer.serializeToString(libraryDoc)));
    }

    revokeFinishedBlobs(styleEditorIdToBlobsMap);
}

// liveType: string, "library" or "section" depending on whether the toggle command was sent from the library or from an open book section
async function closeStyleEditor(liveType) {
    // Close style editor in live doc
    let liveDoc = bookIframe.contentWindow.document;

    let liveEditorId, liveEditorButtonId, unliveType;
    if (liveType === "library") {
        liveEditorId = "styleeditor";
        liveEditorButtonId = "styleeditorbutton";
        unliveType = "section";
    } else if (liveType === "section") {
        liveEditorId = currentSectionStyleInfo.ids.styleEditor;
        liveEditorButtonId = liveDoc.querySelector('header input[value$=" style editor"]').id;
        unliveType = "library"
    } else {
        let errorMessage = `Error: received style editor close command of type '${liveType}'. To fix reader functionality, please refresh the page. (This should never happen; please report if it does.)`;
        console.error(errorMessage);
        alert(errorMessage);
        throw "BasaltInternalError";
    }

    removeStyleEditorFromDocument(liveDoc, liveEditorId, liveEditorButtonId);
    styleEditorOpen = false;

    // Close style editor in docs' source code
    let parser = new DOMParser();
    let serializer = new XMLSerializer();

    if (currentSection) {
        let sectionDoc = parser.parseFromString(currentSectionSource, "application/xhtml+xml");
        let sectionEditorId = currentSectionStyleInfo.ids.styleEditor;
        let sectionEditorButtonId = sectionDoc.querySelector('header input[value$=" style editor"]').id;
        removeStyleEditorFromDocument(sectionDoc, sectionEditorId, sectionEditorButtonId);
        currentSectionSource = serializer.serializeToString(sectionDoc);
    }

    let libraryDoc = parser.parseFromString(await librarySource, "text/html");
    removeStyleEditorFromDocument(libraryDoc, "styleeditor", "styleeditorbutton");
    librarySource = new Promise((resolve, _reject) => resolve(serializer.serializeToString(libraryDoc)));
}

// liveType: string, "library" or "section" depending on whether the toggle command was sent from the library or from an open book section
async function toggleStyleEditor(liveType) {
    if (styleEditorOpen) {
        closeStyleEditor(liveType);
    } else {
        openStyleEditor(liveType);
    }
}

// file: arrayBuffer containing an EPUB file
async function openBook(file) {
    if (book) {
        book.destroy();
        if (styleEditorBookSource) {
            styleEditorBookSource = null;
        }
    }
    book = ePub(file);

    book.loaded.metadata.then(metadata => {
        document.title = `Basalt eBook Reader: ${metadata.title}`;
    });

    let tocSet = book.loaded.navigation.then(navigation => setTocDropdown(navigation.toc));

    await book.opened;
    let firstLinearSectionIndex = 0;
    let displayed = false;
    currentBookId = book.package.uniqueIdentifier;

    let bookStorage = await browser.storage.local.get("book");
    if (bookStorage[currentBookId]) {
        currentBookStyle = bookStorage[currentBookId];
    } else {
        currentBookStyle = {
            "font": {"useGlobal": true},
            "customCssNoOverride": {"useGlobal": true},
        };
    }
    currentBookStyleMerged = getMergedStyle(currentBookStyle);

    await tocSet;
    while ((firstLinearSectionIndex < book.spine.length) && !displayed) {
        if (book.spine.get(firstLinearSectionIndex).linear) {
            await displaySection(firstLinearSectionIndex);
            displayed = true;
        } else {
            firstLinearSectionIndex += 1;
        }
    }
    if (!displayed) {
        console.warn("Book spine is ill-formed. (All spine sections are nonlinear.) Opening into first section as fallback.");
        await displaySection(0);
    }

    if (!libraryReopenAllowed) {
        libraryReopenAllowed = true;
        let newLibrary = generateLibrary(true);
        librarySource = newLibrary.source;
        librarySourceId = newLibrary.id;
    }
}

function closeBook() {
    document.title = "Basalt eBook Reader: Library";
    currentBookId = undefined;
    displayLibrary();
}

function resumeBook() {
    document.title = `Basalt eBook Reader: ${book.packaging.metadata.title}`;
    currentBookId = book.package.uniqueIdentifier;
    bookIframe.setAttribute("srcdoc", currentSectionSource);
}

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

window.addEventListener("message", message => { // Catch messages from descendant iframes
    // This leads to potential collisions if someone else is passing messages of coincidentally-identical structure; can it be done better?
    // Also, there be race conditions aplenty here. Figure out a way to mitigate those, ideally.
    if (message.origin === browser.runtime.getURL("").slice(0, -1)) {
        if (message.data.messageType === "BasaltDisplaySection") {
            displaySection(message.data.index, message.data.fragment);
        } else if (message.data.messageType === "BasaltNextSection") {
            nextSection();
        } else if (message.data.messageType === "BasaltPrevSection") {
            prevSection();
        } else if (message.data.messageType === "BasaltOpenBook") {
            openBook(message.data.book);
        } else if (message.data.messageType === "BasaltCloseBook") {
            closeBook();
        } else if (message.data.messageType === "BasaltResumeBook") {
            resumeBook();
        } else if (message.data.messageType === "BasaltToggleStyleEditor") {
            toggleStyleEditor(message.data.type);
        } else if (message.data.messageType === "BasaltUpdateStyle") {
            updateStyles(message.data.newStyle, message.data.newStyleType, message.data.editorType);
        }
    }
});

browser.storage.local.get({
    "global": {
        "font": {
            "value": "initial",
            "override": false,
        },
        "customCssNoOverride": {
            "value": "",
        },
    },
    "library": {
        "font": {"useGlobal": true},
        "customCssNoOverride": {"useGlobal": true},
    },
}).then(stylesObject => {
    globalStyle = stylesObject.global;
    libraryStyle = stylesObject.library;
    libraryStyleMerged = getMergedStyle(libraryStyle);

    let library = generateLibrary(false);
    librarySource = library.source;
    librarySourceId = library.id;
    displayLibrary();
});
