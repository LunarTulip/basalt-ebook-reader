"use strict";

let lightningCss = import("./libraries/lightningcss/lightningcss-wasm/index.js");

/////////////////
//   Globals   //
/////////////////

// LightningCSS-relevant information

let lightningCssImportFinished = lightningCss.then(lcss => lcss.default()); // If fulfilled, LightningCSS is usable
let browserVersion = browser.runtime.getBrowserInfo().then(info => info.version.split(".")[0] << 16); // Firefox major version, formatted in LightningCSS-comprehensible format

// epub.js objects

var book; // The currently-opened epub.js ePub object
var currentSection; // The currently-displayed epub.js Section object
var currentBookId; // The unique ID of the book from which the current section is sourced
var currentDirectory; // Path to the directory housing currentSection

// basalt.js internal logic

var sectionToTocMap; // Mapping from XHTML index in spine to section in TOC

// basalt.html elements

var bookIframe = document.getElementById("book"); // The iframe to which to render book

// for injection into book sections

var navigation = document.getElementById("navtemplate").content.firstElementChild; // Navigation node for insertion into header/footer

///////////////////
//   Rendering   //
///////////////////

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

// doc: HTML doc to retrieve stylesheets from
// Returns array of objects, each mapping "node" to the node a stylesheet was retrieved from and "sheet" to the text of said stylesheet
async function getStylesheets(doc) {
    let sheets = [];

    let stylesheetBearingNodes = doc.querySelectorAll("style, link[rel=stylesheet]");

    for (let node of stylesheetBearingNodes) {
        if (node.tagName == "style") {
            sheets.push({node: node, sheet: node.innerHTML});
        } else if (node.tagName == "link") {
            sheets.push({node: node, sheet: await fetch(node.href).then(async content => await content.text())});
        } else {
            alert("Error: misidentified non-stylesheet-bearing node as stylesheet-bearing. (This should never happen; please report if it does.)");
            throw "BasaltLogicError";
        }
    }

    return sheets;
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

// element: HTML element to get a list of applicable rules for
// sheets: array of CSSStyleSheet elements
function getApplicableRules(element, sheets) {
    let rules = [];

    for (let sheet of sheets) {
        for (let rule of sheet.cssRules) {
            if (element.matches(rule.selectorText)) {
                rules.push(rule.cssText);
            }
        }
    }

    return rules;
}

// doc: HTML doc to check for whether it's made up of vertical text
// docSheets: array of stylesheets in doc
// htmlClassName: class name, unique within the doc, whose element's writing mode needs to be checked
// returns "vertical-rl" or "vertical-lr" if that writing mode applies to all bottom-level leaves of the tree of htmlClassName's associated element's descendants; else returns "horizontal-tb"
function getMainWritingMode(doc, docSheets, htmlClassName) {
    let hydratedSheets = docSheets.map(sheetInfo => {
        let hydratedSheet = new CSSStyleSheet();
        hydratedSheet.replaceSync(sheetInfo.sheet);
        return hydratedSheet;
    });

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

// doc: HTML doc whose html and body elements should be refactored into divs
// htmlClassName: class name, unique within doc, to place on the html div
// bodyClassName: class name, unique within doc, to place on the body div
function refactorHtmlAndBody(doc, htmlClassName, bodyClassName) {
    let mainHtml = doc.createElement("main");
    mainHtml.classList.add(htmlClassName);

    let mainBody = doc.createElement("section");
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

    doc.body.append(mainHtml);
}

// doc: HTML doc into whose body the navigation header and footer should be injected
// ignoreStylesClassName: class name, unused elsewhere in doc, to indicate that the header and footer should be unaffected by all doc styles
// headerIdName: ID name for header
// footerIdName: ID name for footer
// closeButtonIdName: ID name for "Close book" button in header
// returnToTopButtonIdName: ID name for "Return to top" button in footer
// navigationClassName: class name for the header and footer's nav elements
function injectNavigation(doc, ignoreStylesClassName, headerIdName, footerIdName, closeButtonIdName, returnToTopButtonIdName, navigationClassName) {
    let closeBookButton = doc.importNode(document.getElementById("closebuttontemplate").content.firstElementChild);
    closeBookButton.id = closeButtonIdName;
    closeBookButton.classList.add(ignoreStylesClassName);

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
        let [selector, declarations] = style.split("{");

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
    let { code, _map } = (await lightningCss).transform({
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

// doc: HTML doc whose head's style elements and links should be modified
// docSheets: array of stylesheets in doc
// htmlClassName: class name to reaim head-element-targeted styles towards
// bodyClassName: class name to reaim body-element-targeted styles towards
async function reaimStylesheets(doc, docSheets, htmlClassName, bodyClassName) {
    for (let sheetInfo of docSheets) {
        let reaimedSheet = await reaimStylesheet(sheetInfo.sheet, htmlClassName, bodyClassName);
        let reaimedNode = doc.createElement("style");

        reaimedNode.innerHTML = reaimedSheet;
        sheetInfo.node.parentNode.replaceChild(reaimedNode, sheetInfo.node)

        sheetInfo.sheet = reaimedSheet;
        sheetInfo.node = reaimedNode;
    }
    // It'd be nice to handle @import-derived stylesheets, too. However, they're unhandled by epub.js, so that'll be hard absent a functioning VFS. Doable via sufficiently smart relative-path-tracking maybe?
}

// sheet: CSSStyleSheet element
// Returns string representation of sheet
function serializeStylesheet(sheet) {
    return Array.from(sheet.cssRules).reverse().map(rule => rule.cssText).join("\n");
}

// doc: HTML doc into which Basalt's stylesheets will be injected
// writingMode: writing mode in which doc is set to be displayed
// ignoreStylesClassName: class name indicating that its elements should be unaffected by all doc styles
// headerIdName: ID name for header
// footerIdName: ID name for footer
// closeButtonIdName: ID name for "Close book" button in header
// returnToTopButtonIdName: ID name for "Return to top" button in footer
// navigationClassName: class name for the header and footer's nav elements
// htmlClassName: class name for the html element of the opened book section
// bodyClassName: class name for the body element of the opened book section
function injectStylesheets(doc, writingMode, ignoreStylesClassName, headerIdName, footerIdName, closeButtonIdName, returnToTopButtonIdName, navigationClassName, htmlClassName, bodyClassName) {
    // Low-priority style (will be overridden by the book's stylesheets)
    let lowPriorityStyle = new CSSStyleSheet();

    lowPriorityStyle.insertRule(`.${htmlClassName} {all: revert;}`);
    lowPriorityStyle.insertRule(`.${bodyClassName} {background: darkslateblue; color: gold;}`);
    lowPriorityStyle.insertRule("a {color: orangered;}");

    let lowPriorityStyleElement = doc.createElement("style");
    lowPriorityStyleElement.innerHTML = serializeStylesheet(lowPriorityStyle);
    doc.head.prepend(lowPriorityStyleElement);

    // High-priority style (will override the book's stylesheets)
    // Currently undefined, pending work on the style editor

    // Basalt style (will apply to the Basalt UI and override even highPriorityStyle)
    let basaltStyle = new CSSStyleSheet();

    basaltStyle.insertRule(`.${ignoreStylesClassName} {all: revert;}`);

    if (writingMode === "horizontal-tb") {
        basaltStyle.insertRule("body {margin: 0; padding: 0; display: flex; flex-direction: column; min-height: 100vh;}");
        basaltStyle.insertRule(`#${headerIdName} {background: slateblue; padding: 10px;}`);
        basaltStyle.insertRule(`#${footerIdName} {background: slateblue; padding: 10px; margin-top: auto;}`);
    } else {
        basaltStyle.insertRule(`html {writing-mode: ${writingMode};}`);
        basaltStyle.insertRule("body {margin: 0; padding: 0; display: flex; flex-direction: column; min-width: 100vw;}");
        basaltStyle.insertRule(`#${headerIdName} {background: slateblue; padding: 10px; min-height: calc(100% - 20px);}`);
        basaltStyle.insertRule(`#${footerIdName} {background: slateblue; padding: 10px; min-height: calc(100% - 20px); margin-top: auto;}`);
    }

    basaltStyle.insertRule(`#${closeButtonIdName}, #${returnToTopButtonIdName} {float: left;}`);
    basaltStyle.insertRule(`.${navigationClassName} {text-align: center;}`);

    let basaltStyleElement = doc.createElement("style");
    basaltStyleElement.innerHTML = serializeStylesheet(basaltStyle);
    doc.head.append(basaltStyleElement);
}

// doc: HTML doc to inject script into
function injectUiScript(doc) {
    let scriptUri = browser.runtime.getURL("reader/basalt-ui.js");
    let scriptElement = doc.createElement("script");
    scriptElement.setAttribute("src", scriptUri);
    doc.body.append(scriptElement);
}

// html: string representationn of HTML doc to prepare
async function prepareHtmlForDisplay(html) {
    let parsedHtml = new DOMParser().parseFromString(html, "application/xhtml+xml");

    let stylesheets = getStylesheets(parsedHtml);

    let ignoreStylesClassName = getUniqueClassName(parsedHtml, "basaltignorestyles");
    let headerIdName = getUniqueIdName(parsedHtml, "basaltheader");
    let footerIdName = getUniqueIdName(parsedHtml, "basaltfooter");
    let closeButtonIdName = getUniqueIdName(parsedHtml, "basaltclosebook");
    let returnToTopButtonIdName = getUniqueIdName(parsedHtml, "basaltreturntotop");
    let navigationClassName = getUniqueClassName(parsedHtml, "basaltnav");
    let htmlClassName = getUniqueClassName(parsedHtml, "basaltmainhtml");
    let bodyClassName = getUniqueClassName(parsedHtml, "basaltmainbody");

    refactorHtmlAndBody(parsedHtml, htmlClassName, bodyClassName);
    injectNavigation(parsedHtml, ignoreStylesClassName, headerIdName, footerIdName, closeButtonIdName, returnToTopButtonIdName, navigationClassName);
    await reaimStylesheets(parsedHtml, await stylesheets, htmlClassName, bodyClassName);
    let writingMode = getMainWritingMode(parsedHtml, await stylesheets, htmlClassName);
    injectStylesheets(parsedHtml, writingMode, ignoreStylesClassName, headerIdName, footerIdName, closeButtonIdName, returnToTopButtonIdName, navigationClassName, htmlClassName, bodyClassName);
    injectUiScript(parsedHtml);

    return new XMLSerializer().serializeToString(parsedHtml);
}

// index: numerical index into spine
// fragment: string | undefined, fragment to jump to in section if applicable
async function displaySection(index, fragment) {
    let newSection = false;
    if ((!currentSection) || (index !== currentSection.index) || (currentBookId !== book.package.uniqueIdentifier)) {
        let section = book.spine.get(index);
        if (section) {
            newSection = true;
            if (fragment) {
                bookIframe.addEventListener("load", _ => bookIframe.contentWindow.location.hash = fragment, {once: true});
            }
            window.scrollTo(0, 0);
            currentSection = section;
            currentDirectory = section.canonical.split("/").slice(undefined, -1).join("/") + "/";
            section.render(book.load.bind(book)).then(async html => {
                let htmlToDisplay = await prepareHtmlForDisplay(html);
                bookIframe.setAttribute("srcdoc", htmlToDisplay);
            });
        }
    }
    if (fragment && !newSection) {
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
            currentBookId = book.package.uniqueIdentifier;
            return;
        } else {
            firstLinearSectionIndex += 1;
        }
    }
    console.warn("Book spine is ill-formed. (All spine sections are nonlinear.) Opening into first section as fallback.");
    await displaySection(0);
    currentBookId = book.package.uniqueIdentifier;
}

function closeBook() {
    document.title = "Basalt eBook Reader: Library";
    currentBookId = undefined;
    bookIframe.removeAttribute("srcdoc");
}

// Save current srcdoc when closing and then have a resume function in the library? (Book stays in memory until a new book is opened, so it'd be cheap.)

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
    // This leads to potential collisions if someone else is passing messages of coincidentally-identical structure; can it be done better?
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
